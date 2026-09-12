import { describe, it, expect, vi, afterEach } from "vitest";
import { EMAIL_LANGUAGE_CODES } from "./email-languages";
import {
  deliverOneTeamInvitation,
  renderTeamInvitation,
  runTeamInvitationWorker,
  requestTeamInvitationDelivery,
  readTeamInvitationDelivery,
} from "./project-team-invitation-delivery.server";
const owner = "00000000-0000-4000-8000-000000000001",
  id = "00000000-0000-4000-8000-000000000003";
const claim = {
  id,
  owner_id: owner,
  project_id: "p",
  invite_id: id,
  lease_token: id,
  email: "member@example.test",
  role: "editor",
  locale: "en",
};
function deps() {
  return {
    rpc: vi.fn(async (name: string) => ({
      data: name === "claim_project_team_invitation_delivery" ? [claim] : true,
      error: null,
    })),
    recipient: vi.fn(async (email: string) => ({ email, unsubscribeToken: "test-only" })),
    send: vi.fn(async () => ({ success: true })),
  };
}
afterEach(() => vi.unstubAllEnvs());
it.each(EMAIL_LANGUAGE_CODES)(
  "accepts a saved %s invitation preference without changing recipient or retry behavior",
  async (locale) => {
    const d = deps();
    d.rpc.mockImplementation(async (name) => ({
      data: name === "claim_project_team_invitation_delivery" ? [{ ...claim, locale }] : true,
      error: null,
    }));
    expect(await deliverOneTeamInvitation(d)).toBe("accepted");
    expect(d.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        email: claim.email,
        html: expect.stringContaining(`lang="${locale}"`),
      }),
    );
  },
);
describe("saved invitation delivery", () => {
  it("is disabled without the independent release gate", async () => {
    vi.stubEnv("TEAM_INVITATION_EMAIL_ENABLED", "false");
    expect(await runTeamInvitationWorker()).toEqual({ enabled: false, processed: 0 });
  });
  it("sends only to the saved recipient after final admission", async () => {
    const d = deps();
    expect(await deliverOneTeamInvitation(d)).toBe("accepted");
    expect(d.recipient).toHaveBeenCalledWith(claim.email);
    expect(d.rpc).toHaveBeenCalledWith("begin_project_team_invitation_delivery", {
      p_id: id,
      p_lease: id,
      p_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_role: "editor",
    });
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({
        email: claim.email,
        text: expect.stringContaining("/app/collaborators"),
      }),
    );
  });
  it("does not send after cancellation", async () => {
    const d = deps();
    const original = d.rpc.getMockImplementation()!;
    d.rpc.mockImplementation(async (name) =>
      name === "begin_project_team_invitation_delivery"
        ? { data: false, error: null }
        : original(name),
    );
    expect(await deliverOneTeamInvitation(d)).toBe("cancelled");
    expect(d.send).not.toHaveBeenCalled();
  });
  it("defers a suppressed or substituted recipient before delivery admission", async () => {
    const d = deps();
    d.recipient.mockResolvedValue({ email: "other@example.test", unsubscribeToken: "test-only" });
    expect(await deliverOneTeamInvitation(d)).toBe("deferred");
    expect(d.send).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalledWith(
      "begin_project_team_invitation_delivery",
      expect.anything(),
    );
  });
  it("does not retry an uncertain transport", async () => {
    const d = deps();
    d.send.mockRejectedValue(new Error("timeout"));
    expect(await deliverOneTeamInvitation(d)).toBe("unknown");
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it.each(["en", "pl", "sv", "da"] as const)(
    "renders a read-only, non-bearer invitation in %s",
    (locale) => {
      const body = renderTeamInvitation("reviewer", locale);
      expect(body.subject.length).toBeGreaterThan(10);
      expect(body.html).toContain('href="https://milogrowth.com/app/collaborators"');
      expect(body.html).not.toMatch(/token=|inviteId=|<form|<script/);
    },
  );
  it("binds owner requests and validates history scope", async () => {
    const rpc = vi.fn(async () => ({ data: id as unknown, error: null }));
    const target = { projectId: "p", inviteId: id };
    await requestTeamInvitationDelivery(
      owner,
      { ...target, email: claim.email, role: "editor" },
      rpc,
    );
    expect(rpc).toHaveBeenCalledWith("request_project_team_invitation_delivery", {
      p_actor: owner,
      p_project: "p",
      p_invite: id,
      p_email: claim.email,
      p_role: "editor",
    });
    rpc.mockResolvedValue({ data: { ...target, ownerId: id, delivery: null }, error: null });
    await expect(readTeamInvitationDelivery(owner, target, rpc)).rejects.toThrow(
      "could not be confirmed",
    );
  });
});
