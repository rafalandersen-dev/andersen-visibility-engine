import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountConversationList } from "./milo-conversation-account";

/** The actor always comes from the verified session; erasure reuses
 * `eraseMiloConversationFn`, never a separate account-level delete path. */
export const listMyMiloConversationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => accountConversationList.parse(input))
  .handler(async ({ data, context }) => {
    const { listAccountConversations } = await import("./milo-conversation-account.server");
    return listAccountConversations(context.userId, data);
  });
