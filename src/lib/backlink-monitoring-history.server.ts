import { z } from "zod";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import {
  backlinkMonitoringHistoryInput,
  backlinkMonitoringRecoveryInput,
  projectBacklinkHistory,
} from "./backlink-monitoring-history";
export async function readBacklinkMonitoringHistory(
  userId: string,
  raw: z.infer<typeof backlinkMonitoringHistoryInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const user = z.string().uuid().parse(userId),
    input = backlinkMonitoringHistoryInput.parse(raw);
  return projectBacklinkHistory(
    await teamCall(
      "list_backlink_monitoring_with_origin",
      { p_user: user, p_project: input.projectId },
      rpc,
    ),
    user,
    input.projectId,
  );
}
export async function recoverBacklinkMonitoringAccounting(
  userId: string,
  raw: z.infer<typeof backlinkMonitoringRecoveryInput>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const user = z.string().uuid().parse(userId),
    input = backlinkMonitoringRecoveryInput.parse(raw);
  return {
    recovered: z
      .boolean()
      .parse(
        await teamCall(
          "reconcile_backlink_monitoring",
          { p_user: user, p_project: input.projectId, p_request: input.requestId },
          rpc,
        ),
      ),
  };
}
