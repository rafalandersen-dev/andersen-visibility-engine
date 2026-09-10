import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  rpc: vi.fn(),
  history: vi.fn(),
  from: vi.fn(),
}));
vi.mock("./workspace.server", () => ({
  readWorkspaceRow: mocks.read,
  mutateWorkspace: mocks.mutate,
}));
vi.mock("./outreach-receipts.server", () => ({
  outreachRpc: mocks.rpc,
  readOutreachDeliveries: mocks.history,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
import {
  outreachVersion,
  resolveOutreachMessage,
  sendOutreachEmail,
} from "./outreach-delivery.server";
import type { OutreachDraft } from "./types";
const user = "00000000-0000-4000-8000-000000000001";
const draft: OutreachDraft = {
  id: "a",
  projectId: "p",
  targetDomain: "publisher.example",
  contactName: "Editor",
  contactEmail: "editor@publisher.example",
  source: "manual",
  subject: "Resource",
  body: "Reviewed body",
  suggestedAsset: "Guide",
  rationale: "Relevant",
  status: "Approved",
  followUps: [],
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
let hash: string;
beforeEach(async () => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    RESEND_API_KEY: "fake-offline-key",
    OUTREACH_FROM_EMAIL: "sender@example.com",
    OUTREACH_REPLY_TO_EMAIL: "reply@example.com",
    OUTREACH_EMAIL_SENDING_ENABLED: "true",
    SITE_URL: "https://example.com",
  }))
    vi.stubEnv(key, value);
  mocks.read.mockResolvedValue({ rev: 1, data: { outreachDrafts: [draft] } });
  mocks.history.mockResolvedValue([]);
  mocks.rpc.mockResolvedValue(true);
  mocks.mutate.mockResolvedValue({ result: null });
  mocks.from.mockImplementation((table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue({
      data: table === "suppressed_emails" ? null : { token: "offline-fixture", used_at: null },
      error: null,
    });
    chain.insert.mockResolvedValue({ error: null });
    return chain;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "message-1" }))),
  );
  hash = await outreachVersion(draft, resolveOutreachMessage(draft, { kind: "initial" }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const send = (expectedHash = hash) =>
  sendOutreachEmail({
    userId: user,
    draftId: "a",
    step: { kind: "initial" },
    expectedHash,
    acknowledgedRecipient: true,
    acknowledgedContent: true,
  });
describe("integrated outreach reservation and I/O boundary", () => {
  it("rejects stale exact review without reservation or provider I/O", async () => {
    await expect(send("f".repeat(64))).rejects.toThrow("outreach_version_changed");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never calls provider when admission is unknown or final suppression/revision gate blocks", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("outreach_storage_unavailable"));
    await expect(send()).rejects.toThrow("outreach_storage_unavailable");
    expect(fetch).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(send()).rejects.toThrow("outreach_dispatch_blocked");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reserves then dispatches then records acceptance before workspace mirrors", async () => {
    await expect(send()).resolves.toMatchObject({ status: "Sent", providerMessageId: "message-1" });
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual([
      "reserve_outreach_delivery",
      "dispatch_outreach_delivery",
      "finish_outreach_delivery",
    ]);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_hash: hash,
      p_expected: 1,
      p_recipient: "editor@publisher.example",
    });
    expect(mocks.rpc.mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0],
    );
    expect(mocks.rpc.mock.invocationCallOrder[2]).toBeLessThan(
      mocks.mutate.mock.invocationCallOrder[0],
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains an unknown outcome and never retries when the response is lost", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private network details"));
    await expect(send()).rejects.toThrow(/^outreach_provider_unknown$/);
    expect(mocks.rpc.mock.lastCall).toEqual([
      "finish_outreach_delivery",
      expect.objectContaining({ p_state: "unknown", p_message: null }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("does not turn an uncertain acceptance write into success or permit replay", async () => {
    mocks.rpc
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("outreach_storage_unavailable"));
    await expect(send()).rejects.toThrow("outreach_storage_unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("retains accepted results if workspace mirroring fails and preserves concurrent edits", async () => {
    mocks.mutate.mockRejectedValueOnce(new Error("workspace_conflict"));
    await expect(send()).resolves.toMatchObject({ status: "Sent" });
    const mirror = mocks.mutate.mock.calls[0][1];
    const changed = { outreachDrafts: [{ ...draft, body: "Owner changed after review" }] };
    expect(mirror(changed).data).toBe(changed);
    const paused = { outreachDrafts: [{ ...draft, status: "Paused" }] };
    expect(mirror(paused).data).toBe(paused);
  });
});
