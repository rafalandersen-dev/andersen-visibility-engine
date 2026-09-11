import { z } from "zod";
import { projectTeamRpc } from "./project-team-membership.server";
import { TeamAdmissionBusyError, assertTeamAdmission } from "./project-team-admission";
import type { TeamReadRpc } from "./project-team-read.server";
export async function acquireTeamPreview(
  actor: string,
  owner: string,
  project: string,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const result = await rpc("acquire_project_team_preview", {
    p_actor: z.string().uuid().parse(actor),
    p_owner: z.string().uuid().parse(owner),
    p_project: project,
  });
  assertTeamAdmission(result.error);
  if (result.error) {
    if (
      typeof result.error === "object" &&
      "message" in result.error &&
      result.error.message === "team_preview_capacity"
    )
      throw new TeamAdmissionBusyError();
    throw new Error("Project preview access could not be confirmed.");
  }
  return z.string().uuid().parse(result.data);
}
export async function releaseTeamPreview(
  actor: string,
  owner: string,
  lease: string,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const result = await rpc("release_project_team_preview", {
    p_actor: actor,
    p_owner: owner,
    p_lease: lease,
  });
  if (result.error) throw new Error("preview_release_unavailable");
}
