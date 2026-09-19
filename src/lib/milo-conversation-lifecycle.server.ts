import { z } from "zod";
import { conversationTarget } from "./milo-conversation";
import {
  checkedConversationErasure,
  checkedConversationExportPage,
  conversationExportRequest,
} from "./milo-conversation-lifecycle";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import { admittedReadRpc } from "./project-team-read-admission.server";
import { acquireTeamPreview, releaseTeamPreview } from "./project-team-preview-limit.server";
import type { TeamReadRpc } from "./project-team-read.server";

function args(actor: string, input: z.infer<typeof conversationTarget>) {
  return {
    p_actor: z.string().uuid().parse(actor),
    p_owner: input.ownerId,
    p_project: input.projectId,
    p_conversation: input.conversationId,
  };
}
export async function exportConversationPage(
  actor: string,
  raw: z.input<typeof conversationExportRequest>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const input = conversationExportRequest.parse(raw);
  const result = await teamCall(
    "export_milo_conversation_page",
    {
      ...args(actor, input),
      p_after: input.after,
      p_version: input.version ?? null,
    },
    admittedReadRpc(actor, rpc),
  );
  return checkedConversationExportPage(actor, input, result);
}
export async function eraseConversation(
  actor: string,
  raw: z.infer<typeof conversationTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const input = conversationTarget.parse(raw),
    params = args(actor, input);
  const deadline = Date.now() + 10000;
  // Erasure of one's existing private history must remain possible after client
  // membership is revoked. Actor-only admission grants no project read access;
  // the erasure RPC checks the immutable owner/actor/conversation itself.
  const lease = await acquireTeamPreview(actor, actor, null, rpc);
  try {
    if (Date.now() >= deadline) throw new Error("Conversation erasure could not be confirmed.");
    return checkedConversationErasure(
      actor,
      input,
      await teamCall("erase_milo_conversation", params, rpc),
    );
  } finally {
    await releaseTeamPreview(actor, actor, lease, rpc).catch(() => {});
  }
}
