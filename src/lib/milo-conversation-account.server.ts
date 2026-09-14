import { z } from "zod";
import { accountConversationList, checkedAccountConversations } from "./milo-conversation-account";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import type { TeamReadRpc } from "./project-team-read.server";

/** Account-level discovery of the authenticated actor's own conversations. Actor-only
 * admission grants no project read; storage returns titles only while access is current. */
export async function listAccountConversations(
  actor: string,
  raw: z.input<typeof accountConversationList>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actorId = z.string().uuid().parse(actor),
    input = accountConversationList.parse(raw);
  const deadline = Date.now() + 10000;
  const lease = await acquireTeamPreview(actorId, actorId, null, rpc);
  try {
    if (Date.now() >= deadline) throw new Error("Conversation directory could not be confirmed.");
    return checkedAccountConversations(
      actorId,
      input,
      await teamCall(
        "list_my_milo_conversations",
        {
          p_actor: actorId,
          p_before_created: input.before?.createdAt ?? null,
          p_before_conversation: input.before?.conversationId ?? null,
        },
        rpc,
      ),
    );
  } finally {
    await releaseTeamPreview(actorId, actorId, lease, rpc).catch(() => {});
  }
}
