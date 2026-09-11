import { z } from "zod";
import {
  myProjectTeams,
  teamAcceptInput,
  teamOwnerAction,
  teamRoster,
  teamRosterInput,
} from "./project-team";
import type { TeamReadRpc } from "./project-team-read.server";
export const projectTeamRpc: TeamReadRpc = async (method, params) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as { rpc: TeamReadRpc }).rpc(method, params);
};
export async function teamCall(method: string, params: Record<string, unknown>, rpc: TeamReadRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      rpc(method, params),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 10000);
      }),
    ]);
    if (!result || result.error) throw new Error("unavailable");
    return result.data;
  } catch {
    throw new Error("Team access could not be updated or confirmed. Refresh before trying again.");
  } finally {
    clearTimeout(timer);
  }
}
export async function updateProjectTeam(
  actorId: string,
  raw: z.infer<typeof teamOwnerAction>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamOwnerAction.parse(raw);
  const params: Record<string, unknown> = {
    p_actor: actor,
    p_owner: actor,
    p_project: input.projectId,
  };
  let method: string;
  switch (input.action) {
    case "invite":
      method = "create_project_team_invitation";
      Object.assign(params, { p_invite: input.inviteId, p_email: input.email, p_role: input.role });
      break;
    case "revoke":
      method = "revoke_project_team_invitation";
      params.p_invite = input.inviteId;
      break;
    case "role":
    case "remove":
      method = "change_project_team_member";
      Object.assign(params, {
        p_member: input.memberId,
        p_expected: input.expectedRevision,
        p_role: input.action === "role" ? input.role : null,
        p_remove: input.action === "remove",
      });
      break;
  }
  const result = await teamCall(method, params, rpc);
  if (input.action === "invite" || input.action === "revoke") z.literal(true).parse(result);
  else z.number().int().min(2).max(Number.MAX_SAFE_INTEGER).parse(result);
  return { saved: true as const };
}
export async function acceptProjectTeam(
  actorId: string,
  raw: z.infer<typeof teamAcceptInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamAcceptInput.parse(raw);
  const result = await teamCall(
    "accept_project_team_invitation",
    {
      p_actor: actor,
      p_owner: input.ownerId,
      p_project: input.projectId,
      p_invite: input.inviteId,
    },
    rpc,
  );
  return { revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).parse(result) };
}
export async function readProjectTeamRoster(
  actorId: string,
  raw: z.infer<typeof teamRosterInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId);
  const input = teamRosterInput.parse(raw);
  const result = teamRoster.parse(
    await teamCall(
      "read_project_team_roster",
      { p_actor: actor, p_owner: actor, p_project: input.projectId },
      rpc,
    ),
  );
  if (result.ownerId !== actor || result.projectId !== input.projectId)
    throw new Error("Team access could not be confirmed.");
  return result;
}
export async function listMyProjectTeams(actorId: string, rpc: TeamReadRpc = projectTeamRpc) {
  const actor = z.string().uuid().parse(actorId);
  const result = myProjectTeams.parse(
    await teamCall("list_my_project_teams", { p_actor: actor }, rpc),
  );
  if (result.actorId !== actor) throw new Error("Team access could not be confirmed.");
  return result;
}
