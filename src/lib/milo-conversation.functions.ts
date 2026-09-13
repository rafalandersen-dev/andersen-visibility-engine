import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  conversationList,
  conversationRead,
  conversationSend,
  conversationTurnTarget,
} from "./milo-conversation";

export const sendMiloMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationSend.parse(input))
  .handler(async ({ data, context }) => {
    const { beginConversationTurn } = await import("./milo-conversation.server");
    const saved = await beginConversationTurn(context.userId, data);
    // The database queues independent execution in the same transaction. Losing
    // this browser response never owns, cancels or replays the provider request.
    return { turn: saved.turn };
  });
/** Only a still-pending saved turn can acquire work. Resume never changes its
 * original text, generation choice, client, actor or durable attempt. */
export const resumeMiloTurnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationTurnTarget.parse(input))
  .handler(async ({ data, context }) => {
    const { resumeConversationTurn } = await import("./milo-conversation.server");
    return { turn: await resumeConversationTurn(context.userId, data) };
  });
export const readMiloConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationRead.parse(input))
  .handler(async ({ data, context }) => {
    const { readConversation } = await import("./milo-conversation.server");
    return readConversation(context.userId, data);
  });
export const listMiloConversationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationList.parse(input))
  .handler(async ({ data, context }) => {
    const { listConversations } = await import("./milo-conversation.server");
    return listConversations(context.userId, data);
  });
export const cancelMiloTurnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationTurnTarget.parse(input))
  .handler(async ({ data, context }) => {
    const { cancelConversationTurn } = await import("./milo-conversation.server");
    return { turn: await cancelConversationTurn(context.userId, data) };
  });
