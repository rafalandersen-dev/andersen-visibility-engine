import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { conversationTarget } from "./milo-conversation";
import { conversationExportRequest } from "./milo-conversation-lifecycle";

export const exportMiloConversationPageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationExportRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { exportConversationPage } = await import("./milo-conversation-lifecycle.server");
    return exportConversationPage(context.userId, data);
  });
export const eraseMiloConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationTarget.parse(input))
  .handler(async ({ data, context }) => {
    const { eraseConversation } = await import("./milo-conversation-lifecycle.server");
    return eraseConversation(context.userId, data);
  });
