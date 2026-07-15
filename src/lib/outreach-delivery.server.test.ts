import { describe, expect, it } from "vitest";
import {
  buildOutreachEmailContent,
  buildOutreachUnsubscribeUrls,
  enforceOutreachRateLimits,
  getOutreachDailyLimit,
  isEmailAddress,
  isHttpsUrl,
  resolveOutreachMessage,
} from "./outreach-delivery.server";
import { getOutreachFollowUpDueAt } from "./outreach";
import type { OutreachDraft } from "./types";

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
    expect(() => resolveOutreachMessage(sent, { kind: "followUp", followUpIndex: 0 }, now)).toThrow(
      "outreach_followup_not_due",
    );
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
    expect(resolveOutreachMessage(sent, { kind: "followUp", followUpIndex: 0 }, now)).toMatchObject(
      { subject: "Following up" },
    );
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
      ),
    ).toThrow("outreach_step_already_sent");
  });

  it("enforces daily and per-recipient cooldowns", () => {
    const existing = draft({
      id: "draft-existing",
      deliveryEvents: [
        {
          kind: "initial",
          status: "accepted",
          at: "2026-07-16T09:00:00.000Z",
          provider: "resend",
          providerMessageId: "message-existing",
          note: "accepted",
        },
      ],
    });
    const next = draft({ id: "draft-next" });
    const message = resolveOutreachMessage(next, { kind: "initial" }, now);
    expect(() => enforceOutreachRateLimits([existing, next], next, message, 1, now)).toThrow(
      "outreach_daily_limit_reached",
    );
    expect(() => enforceOutreachRateLimits([existing, next], next, message, 5, now)).toThrow(
      "outreach_recipient_cooldown",
    );
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
