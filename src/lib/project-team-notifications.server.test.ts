import { describe, it, expect, vi } from "vitest";
import {
  readTeamNotificationSettings,
  changeTeamNotificationSettings,
} from "./project-team-notifications.server";
const owner = "00000000-0000-4000-8000-000000000001",
  recipient = "00000000-0000-4000-8000-000000000002";
const target = { ownerId: owner, projectId: "p", recipientId: recipient };
const settings = { ...target, revision: 1, membershipRevision: 2, assigned: true, optedIn: false };
describe("notification setting boundaries", () => {
  it("validates the complete returned owner/project/recipient scope", async () => {
    const rpc = vi.fn(async () => ({ data: settings, error: null }));
    expect(await readTeamNotificationSettings(recipient, target, rpc)).toEqual(settings);
    for (const change of [{ ownerId: recipient }, { projectId: "other" }, { recipientId: owner }]) {
      rpc.mockResolvedValue({ data: { ...settings, ...change }, error: null });
      await expect(readTeamNotificationSettings(recipient, target, rpc)).rejects.toThrow(
        "could not be confirmed",
      );
    }
  });
  it("allows only the owner to assign and only the recipient to consent", async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    const change = {
      ...target,
      action: "assign" as const,
      enabled: true,
      expectedRevision: 1,
      expectedMembershipRevision: 2,
    };
    await expect(changeTeamNotificationSettings(recipient, change, rpc)).rejects.toThrow();
    await expect(
      changeTeamNotificationSettings(owner, { ...change, action: "opt_in" }, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect(await changeTeamNotificationSettings(owner, change, rpc)).toEqual({ revision: 2 });
    expect(rpc).toHaveBeenCalledWith("set_project_team_notification_recipient", {
      p_actor: owner,
      p_owner: owner,
      p_project: "p",
      p_recipient: recipient,
      p_action: "assign",
      p_enabled: true,
      p_expected: 1,
      p_membership: 2,
    });
  });
  it.each(["assign", "opt_in"] as const)(
    "accepts the existing revision only for a coalesced disabled %s",
    async (action) => {
      const actor = action === "assign" ? owner : recipient;
      const rpc = vi.fn(async () => ({ data: 2, error: null }));
      const change = {
        ...target,
        action,
        enabled: false,
        expectedRevision: 2,
        expectedMembershipRevision: 2,
      };
      expect(await changeTeamNotificationSettings(actor, change, rpc)).toEqual({ revision: 2 });
      await expect(
        changeTeamNotificationSettings(actor, { ...change, enabled: true }, rpc),
      ).rejects.toThrow("could not be confirmed");
      rpc.mockResolvedValue({ data: 1, error: null });
      await expect(changeTeamNotificationSettings(actor, change, rpc)).rejects.toThrow(
        "could not be confirmed",
      );
      rpc.mockResolvedValue({ data: 4, error: null });
      await expect(changeTeamNotificationSettings(actor, change, rpc)).rejects.toThrow(
        "could not be confirmed",
      );
      rpc.mockResolvedValue({ data: 3, error: null });
      expect(await changeTeamNotificationSettings(actor, change, rpc)).toEqual({ revision: 3 });
    },
  );
  it("rejects unexpected revisions and forged fields", async () => {
    const rpc = vi.fn(async () => ({ data: 3, error: null }));
    const change = {
      ...target,
      action: "opt_in" as const,
      enabled: true,
      expectedRevision: 1,
      expectedMembershipRevision: 2,
    };
    await expect(changeTeamNotificationSettings(recipient, change, rpc)).rejects.toThrow(
      "could not be confirmed",
    );
    rpc.mockClear();
    await expect(
      changeTeamNotificationSettings(
        recipient,
        { ...change, actorId: owner } as typeof change,
        rpc,
      ),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
