import { z } from "zod";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import {
  backlinkDetailsHistoryInput,
  backlinkDetailsRecoveryInput,
  projectBacklinkDetailsHistory,
} from "./backlink-details-history";
export async function readBacklinkDetailsHistory(
  userId: string,
  raw: z.infer<typeof backlinkDetailsHistoryInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const user = z.string().uuid().parse(userId),
    input = backlinkDetailsHistoryInput.parse(raw);
  return projectBacklinkDetailsHistory(
    await teamCall("list_backlink_pages", { p_user: user, p_project: input.projectId }, rpc),
    user,
    input.projectId,
  );
}
export async function recoverBacklinkDetailsAccounting(
  userId: string,
  raw: z.infer<typeof backlinkDetailsRecoveryInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const user = z.string().uuid().parse(userId),
    input = backlinkDetailsRecoveryInput.parse(raw);
  return {
    recovered: z
      .boolean()
      .parse(
        await teamCall(
          "reconcile_backlink_details",
          { p_user: user, p_project: input.projectId, p_request: input.requestId },
          rpc,
        ),
      ),
  };
}
