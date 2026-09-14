import type { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { conversationTarget } from "./milo-conversation";
import { conversationKey } from "./milo-conversation.ui";
import { forgetMiloConversation, rememberedMiloConversation } from "./milo-conversation-location";

export const accountConversationsKey = (actor: string) =>
  ["milo-account-conversations", actor] as const;

/** Purge this exact erased private history and its proposals, even if the caller
 * navigated away after the erasure was already dispatched. Other clients stay intact. */
export async function purgeErasedConversation(
  client: QueryClient,
  actorId: string,
  target: z.infer<typeof conversationTarget>,
) {
  const { ownerId, projectId, conversationId } = target;
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    (query.queryKey[0] === "milo-conversation" &&
      query.queryKey[1] === actorId &&
      query.queryKey[2] === ownerId &&
      query.queryKey[3] === projectId &&
      query.queryKey[4] === "history" &&
      query.queryKey[5] === conversationId) ||
    (query.queryKey[0] === "milo-draft-proposal" &&
      query.queryKey[1] === actorId &&
      query.queryKey[2] === ownerId &&
      query.queryKey[3] === projectId &&
      query.queryKey[4] === conversationId);
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
  // Directory entries include titles. Remove the old title immediately,
  // and require a new authorized read before rendering another directory.
  const directory = [...conversationKey(actorId, { ownerId, projectId }), "directory"];
  await client.cancelQueries({ queryKey: directory });
  client.resetQueries({ queryKey: directory });
  await client.cancelQueries({ queryKey: accountConversationsKey(actorId) });
  void client.invalidateQueries({ queryKey: accountConversationsKey(actorId) });
  if (rememberedMiloConversation(actorId, { ownerId, projectId }) === conversationId)
    forgetMiloConversation(actorId, { ownerId, projectId });
}
