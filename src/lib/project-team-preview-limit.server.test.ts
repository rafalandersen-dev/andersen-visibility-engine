import { expect, it, vi } from "vitest";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
const actor = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const lease = "00000000-0000-4000-8000-000000000003";
it("keeps preview admission scoped and does not expose raw error details", async () => {
  const rpc = vi.fn(async () => ({ data: lease, error: null as unknown }));
  expect(await acquireTeamPreview(actor, owner, "p", rpc)).toBe(lease);
  expect(rpc).toHaveBeenCalledWith("acquire_project_team_preview", {
    p_actor: actor,
    p_owner: owner,
    p_project: "p",
  });
  for (const error of [
    { message: "team_preview_capacity" },
    { code: "55P03", message: "private" },
  ]) {
    rpc.mockResolvedValue({ data: lease, error });
    await expect(acquireTeamPreview(actor, owner, "p", rpc)).rejects.toBeInstanceOf(
      TeamAdmissionBusyError,
    );
  }
  rpc.mockResolvedValue({ data: lease, error: { code: "42501", message: "private" } });
  await expect(acquireTeamPreview(actor, owner, "p", rpc)).rejects.toThrow(
    "could not be confirmed",
  );
  await expect(acquireTeamPreview(actor, owner, "p", rpc)).rejects.not.toBeInstanceOf(
    TeamAdmissionBusyError,
  );
});
it("releases only the acquired actor/owner token", async () => {
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  await releaseTeamPreview(actor, owner, lease, rpc);
  expect(rpc).toHaveBeenCalledWith("release_project_team_preview", {
    p_actor: actor,
    p_owner: owner,
    p_lease: lease,
  });
});
