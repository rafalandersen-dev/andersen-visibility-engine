import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOutreachEmailContent,
  buildOutreachUnsubscribeUrls,
  getOutreachDailyLimit,
  isEmailAddress,
  isHttpsUrl,
  resolveOutreachMessage,
  outreachVersion,
  readOutreachResponse,
  sendWithResend,
} from "./outreach-delivery.server";
import { getOutreachFollowUpDueAt } from "./outreach";
import type { OutreachDraft } from "./types";

import type { OutreachReceipt } from "./outreach-receipts";
const receipt = (patch: Partial<OutreachReceipt> = {}): OutreachReceipt => ({
  draft_id: "draft-1",
  project_id: "project-1",
  step: "initial",
  version_hash: "a".repeat(64),
  recipient: "editor@publisher.example",
  state: "accepted",
  reserved_at: "2026-07-10T10:00:00.000Z",
  updated_at: "2026-07-10T10:00:00.000Z",
  provider_message_id: "message-1",
  ...patch,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const now = Date.parse("2026-07-16T10:00:00.000Z");

function draft(patch: Partial<OutreachDraft> = {}): OutreachDraft {
  return {
    id: "draft-1",
    projectId: "project-1",
    targetDomain: "publisher.example",
    contactName: "Editor",
    contactEmail: "editor@publisher.example",
    source: "manual",
    subject: "Useful resource",
    body: "Hello Editor,\n\nHere is a useful resource.",
    suggestedAsset: "Guide",
    rationale: "Relevant audience",
    status: "Approved",
    followUps: [
      { delayDays: 4, subject: "Following up", body: "A polite follow-up." },
      { delayDays: 8, subject: "Final follow-up", body: "Closing the loop." },
    ],
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    ...patch,
  };
}

describe("outreach delivery safety", () => {
  it("validates sender and recipient email addresses", () => {
    expect(isEmailAddress("editor@example.com")).toBe(true);
    expect(isEmailAddress("not-an-email")).toBe(false);
    expect(isHttpsUrl("https://milogrowth.com")).toBe(true);
    expect(isHttpsUrl("http://milogrowth.com")).toBe(false);
  });

  it("clamps the daily send limit", () => {
    expect(getOutreachDailyLimit("0")).toBe(1);
    expect(getOutreachDailyLimit("999")).toBe(20);
    expect(getOutreachDailyLimit("invalid")).toBe(5);
  });

  it("requires human approval before the initial send", () => {
    expect(() =>
      resolveOutreachMessage(draft({ status: "Draft" }), { kind: "initial" }, now),
    ).toThrow("outreach_approval_required");
  });

  it("loads the exact approved message from the draft", () => {
    expect(resolveOutreachMessage(draft(), { kind: "initial" }, now)).toMatchObject({
      recipient: "editor@publisher.example",
      subject: "Useful resource",
      body: "Hello Editor,\n\nHere is a useful resource.",
    });
  });

  it("blocks a follow-up until its delay has elapsed", () => {
    const sent = draft({
      status: "Sent",
      sentAt: "2026-07-14T10:00:00.000Z",
      deliveryEvents: [
        {
          kind: "initial",
          status: "accepted",
          at: "2026-07-14T10:00:00.000Z",
          provider: "resend",
          providerMessageId: "message-1",
          note: "accepted",
        },
      ],
    });
    expect(() =>
      resolveOutreachMessage(sent, { kind: "followUp", followUpIndex: 0 }, now, [
        receipt({ updated_at: "2026-07-14T10:00:00.000Z" }),
      ]),
    ).toThrow("outreach_followup_not_due");
    expect(getOutreachFollowUpDueAt(sent, sent.followUps[0])).toBe("2026-07-18T10:00:00.000Z");
  });

  it("permits a due follow-up and blocks sending it twice", () => {
    const initialEvent = {
      kind: "initial" as const,
      status: "accepted" as const,
      at: "2026-07-10T10:00:00.000Z",
      provider: "resend" as const,
      providerMessageId: "message-1",
      note: "accepted",
    };
    const sent = draft({ status: "Sent", deliveryEvents: [initialEvent] });
    expect(
      resolveOutreachMessage(sent, { kind: "followUp", followUpIndex: 0 }, now, [receipt()]),
    ).toMatchObject({ subject: "Following up" });
    expect(() =>
      resolveOutreachMessage(
        {
          ...sent,
          deliveryEvents: [
            initialEvent,
            {
              kind: "followUp",
              followUpIndex: 0,
              status: "accepted",
              at: "2026-07-15T10:00:00.000Z",
              provider: "resend",
              providerMessageId: "message-2",
              note: "accepted",
            },
          ],
        },
        { kind: "followUp", followUpIndex: 0 },
        now,
        [receipt(), receipt({ step: "followup-0" })],
      ),
    ).toThrow("outreach_step_reserved");
  });

  it("never authorizes a follow-up from browser timestamps or events", () => {
    expect(() =>
      resolveOutreachMessage(
        draft({ status: "Sent", sentAt: "2020-01-01T00:00:00Z" }),
        { kind: "followUp", followUpIndex: 0 },
        now,
      ),
    ).toThrow("outreach_initial_not_sent");
    expect(() =>
      resolveOutreachMessage(
        draft({ status: "Sent", contactEmail: "different@example.com" }),
        { kind: "followUp", followUpIndex: 0 },
        now,
        [receipt()],
      ),
    ).toThrow("outreach_initial_not_sent");
    expect(() =>
      resolveOutreachMessage(
        draft({ status: "Paused" }),
        { kind: "followUp", followUpIndex: 0 },
        now,
        [receipt()],
      ),
    ).toThrow("outreach_approval_required");
  });
  it("holds failed/legacy/unknown attempts", () => {
    expect(() => resolveOutreachMessage(draft({ status: "Failed" }), { kind: "initial" })).toThrow(
      "outreach_approval_required",
    );
    expect(() =>
      resolveOutreachMessage(draft({ sentAt: "2020-01-01T00:00:00Z" }), { kind: "initial" }),
    ).toThrow("outreach_legacy_attempt_held");
    for (const state of ["reserved", "dispatching", "unknown", "blocked"] as const)
      expect(() =>
        resolveOutreachMessage(draft(), { kind: "initial" }, now, [receipt({ state })]),
      ).toThrow("outreach_step_reserved");
  });
  it("pins recipient, content, project, step and delay in the reviewed version", async () => {
    const d = draft(),
      m = resolveOutreachMessage(d, { kind: "initial" }),
      h = await outreachVersion(d, m);
    for (const patch of [
      { recipient: "other@example.com" },
      { subject: "Changed" },
      { body: "Changed" },
      { step: { kind: "followUp" as const, followUpIndex: 0 } },
    ])
      expect(await outreachVersion(d, { ...m, ...patch })).not.toBe(h);
    expect(await outreachVersion({ ...d, projectId: "other" }, m)).not.toBe(h);
  });
  it("bounds response bytes, JSON, encoding and body deadline", async () => {
    const controller = new AbortController();
    await expect(
      readOutreachResponse(new Response("x".repeat(16385)), controller.signal),
    ).rejects.toThrow("outreach_provider_unknown");
    await expect(readOutreachResponse(new Response("{broken"), controller.signal)).rejects.toThrow(
      "outreach_provider_unknown",
    );
    await expect(
      readOutreachResponse(new Response(new Uint8Array([255])), controller.signal),
    ).rejects.toThrow("outreach_provider_unknown");
    const stalled = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("{"));
        },
      }),
    );
    const pending = readOutreachResponse(stalled, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("outreach_provider_unknown");
  });
  it("returns only a valid provider receipt and sanitizes failures without retry", async () => {
    const args = {
      config: {
        apiKey: "test",
        fromEmail: "sender@example.com",
        fromName: "Sender",
        replyToEmail: "reply@example.com",
        sendingEnabled: true,
        siteUrl: "https://example.com",
        dailyLimit: 5,
      },
      message: resolveOutreachMessage(draft(), { kind: "initial" }),
      unsubscribePageUrl: "https://example.com/u",
      oneClickUnsubscribeUrl: "https://example.com/u",
      idempotencyKey: "test-only",
      draftId: "draft-1",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-1" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendWithResend(args)).resolves.toBe("message-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new Error("private body secret"));
    await expect(sendWithResend(args)).rejects.toThrow(/^outreach_provider_unknown$/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "message-1" }), { status: 500 }),
    );
    await expect(sendWithResend(args)).rejects.toThrow("outreach_provider_unknown");
  });

  it("adds plain-text and escaped HTML unsubscribe content", () => {
    const content = buildOutreachEmailContent(
      "Hello <Editor>\n\nUseful & honest.",
      "https://milogrowth.com/unsubscribe?token=abc",
    );
    expect(content.text).toContain("opt out of future outreach");
    expect(content.html).toContain("&lt;Editor&gt;");
    expect(content.html).toContain("Useful &amp; honest.");
  });

  it("separates the human unsubscribe page from the one-click endpoint", () => {
    expect(buildOutreachUnsubscribeUrls("https://milogrowth.com", "a+b")).toEqual({
      pageUrl: "https://milogrowth.com/unsubscribe?token=a%2Bb",
      oneClickUrl: "https://milogrowth.com/email/unsubscribe?token=a%2Bb",
    });
  });
});
