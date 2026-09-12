import { z } from "zod";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import {
  backlinkRecurringRead,
  backlinkRecurringSave,
  projectBacklinkMonitorConfig,
} from "./backlink-recurring-config";
export async function readBacklinkMonitorConfig(
  userId: string,
  raw: z.infer<typeof backlinkRecurringRead>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const user = z.string().uuid().parse(userId),
    input = backlinkRecurringRead.parse(raw);
  return projectBacklinkMonitorConfig(
    await teamCall(
      "read_backlink_recurring_monitor",
      { p_user: user, p_project: input.projectId },
      rpc,
    ),
    user,
    input.projectId,
  );
}
export async function saveBacklinkMonitorConfig(
  userId: string,
  raw: z.infer<typeof backlinkRecurringSave>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const user = z.string().uuid().parse(userId),
    input = backlinkRecurringSave.parse(raw);
  const target = { p_user: user, p_project: input.projectId };
  const context = z
    .object({ website: z.string().min(1).max(8192) })
    .parse(await teamCall("read_backlink_monitoring_context", target, rpc));
  if (context.website.trim() !== input.expectedWebsite)
    return { state: "website_changed" as const };
  const saved = projectBacklinkMonitorConfig(
    await teamCall(
      "save_backlink_recurring_monitor",
      {
        ...target,
        p_change: input.changeId,
        p_revision: input.expectedRevision,
        p_website: context.website,
        p_settings: input.settings,
      },
      rpc,
    ),
    user,
    input.projectId,
  );
  if (
    !saved ||
    saved.website !== context.website ||
    saved.revision !== input.expectedRevision + 1 ||
    JSON.stringify(saved.settings) !== JSON.stringify(input.settings)
  )
    throw Error("backlink_monitor_unconfirmed");
  return { state: "saved" as const, monitor: saved };
}
