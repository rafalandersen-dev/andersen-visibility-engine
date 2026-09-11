import { describe, it, expect, vi, afterEach } from "vitest";
import { deliverOneTeamDigest, runTeamNotificationWorker } from "./project-team-delivery.server";
const owner = "00000000-0000-4000-8000-000000000001",
  recipient = "00000000-0000-4000-8000-000000000002",
  id = "00000000-0000-4000-8000-000000000003";
const claim = { id, owner_id: owner, recipient_id: recipient, project_id: "p", lease_token: id };
const body = {
  locale: "en",
  items: [
    {
      id,
      projectId: "p",
      targetId: "a",
      title: "Draft",
      kind: "approval_due",
      dueAt: null,
      detail: { timeZone: "UTC" },
    },
  ],
};
function deps(data: unknown = body) {
  return {
    rpc: vi.fn(async (name: string) => ({
      data:
        name === "claim_project_team_notification_digest"
          ? [claim]
          : name === "begin_project_team_notification_delivery"
            ? data
            : true,
      error: null,
    })),
    refresh: vi.fn(async () => true),
    recipient: vi.fn(async () => ({ email: "member@example.test", unsubscribeToken: "test-only" })),
    send: vi.fn(async () => ({ success: true })),
  };
}
afterEach(() => vi.unstubAllEnvs());
describe("team notification delivery", () => {
  it("is disabled by default", async () => {
    vi.stubEnv("TEAM_NOTIFICATION_EMAIL_ENABLED", "false");
    expect(await runTeamNotificationWorker()).toEqual({
      enabled: false,
      queued: 0,
      processed: 0,
      failed: 0,
    });
  });
  it("refreshes the owner source but delivers only to the verified recipient", async () => {
    const d = deps();
    expect(await deliverOneTeamDigest(d)).toBe("accepted");
    expect(d.refresh).toHaveBeenCalledWith(owner);
    expect(d.recipient).toHaveBeenCalledWith(recipient);
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "member@example.test",
        text: expect.stringContaining("https://milogrowth.com/app/collaborators"),
      }),
    );
    expect(d.rpc).toHaveBeenLastCalledWith("finish_project_team_notification_delivery", {
      p_id: id,
      p_lease: id,
      p_outcome: "accepted",
    });
  });
  it("never sends when final admission cancels", async () => {
    const d = deps(null);
    expect(await deliverOneTeamDigest(d)).toBe("cancelled");
    expect(d.send).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, items: [{ ...body.items[0], projectId: "other" }] },
    { ...body, items: [{ ...body.items[0], kind: "generation_capacity_low" }] },
    { ...body, items: [{ ...body.items[0], detail: { timeZone: "UTC", secret: "private" } }] },
  ])("rejects out-of-scope or extra payload fields", async (data) => {
    const d = deps(data);
    expect(await deliverOneTeamDigest(d)).toBe("unknown");
    expect(d.send).not.toHaveBeenCalled();
  });
  it("defers failed recipient preflight without entering transport", async () => {
    const d = deps();
    d.recipient.mockRejectedValue(new Error("unverified"));
    expect(await deliverOneTeamDigest(d)).toBe("deferred");
    expect(d.send).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalledWith(
      "begin_project_team_notification_delivery",
      expect.anything(),
    );
  });
  it("records ambiguous transport once without retry", async () => {
    const d = deps();
    d.send.mockRejectedValue(new Error("timeout"));
    expect(await deliverOneTeamDigest(d)).toBe("unknown");
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("does not resend after a lost success-record response", async () => {
    const d = deps();
    const original = d.rpc.getMockImplementation()!;
    d.rpc.mockImplementation(async (name) => {
      if (name === "finish_project_team_notification_delivery") throw new Error("lost reply");
      return original(name);
    });
    await expect(deliverOneTeamDigest(d)).rejects.toThrow();
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});
