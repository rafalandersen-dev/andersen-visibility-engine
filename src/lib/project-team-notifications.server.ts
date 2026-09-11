import { z } from "zod";
import {
  teamNotificationTarget,
  teamNotificationSettings,
  teamNotificationChange,
} from "./project-team-notifications";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function readTeamNotificationSettings(
  actorId: string,
  raw: z.infer<typeof teamNotificationTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    input = teamNotificationTarget.parse(raw);
  const result = teamNotificationSettings.parse(
    await teamCall(
      "read_project_team_notification_recipient",
      {
        p_actor: actor,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_recipient: input.recipientId,
      },
      rpc,
    ),
  );
  if (
    result.ownerId !== input.ownerId ||
    result.projectId !== input.projectId ||
    result.recipientId !== input.recipientId
  )
    throw new Error("Notification settings could not be confirmed.");
  return result;
}
export async function changeTeamNotificationSettings(
  actorId: string,
  raw: z.infer<typeof teamNotificationChange>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    input = teamNotificationChange.parse(raw);
  if (
    (input.action === "assign" && actor !== input.ownerId) ||
    (input.action === "opt_in" && actor !== input.recipientId)
  )
    throw new Error("Notification settings could not be changed.");
  const revision = z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .parse(
      await teamCall(
        "set_project_team_notification_recipient",
        {
          p_actor: actor,
          p_owner: input.ownerId,
          p_project: input.projectId,
          p_recipient: input.recipientId,
          p_action: input.action,
          p_enabled: input.enabled,
          p_expected: input.expectedRevision,
          p_membership: input.expectedMembershipRevision,
        },
        rpc,
      ),
    );
  if (revision !== input.expectedRevision + 1)
    throw new Error("Notification settings could not be confirmed.");
  return { revision };
}
export async function readTeamNotificationHistory(
  actorId: string,
  raw: z.infer<typeof teamNotificationTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    input = teamNotificationTarget.parse(raw);
  const { teamNotificationHistory } = await import("./project-team-notifications");
  const result = teamNotificationHistory.parse(
    await teamCall(
      "read_project_team_notification_history",
      {
        p_actor: actor,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_recipient: input.recipientId,
      },
      rpc,
    ),
  );
  if (
    result.ownerId !== input.ownerId ||
    result.projectId !== input.projectId ||
    result.recipientId !== input.recipientId
  )
    throw new Error("Notification history could not be confirmed.");
  return result;
}
