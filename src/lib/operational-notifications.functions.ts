import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  listOperationalNotifications,
  refreshOperationalNotifications,
} from "./operational-notifications.server";

export const getOperationalNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let fresh = false;
    try {
      fresh = await refreshOperationalNotifications(context.userId as string);
    } catch {
      /* retain previous known events */
    }
    try {
      return { fresh, items: await listOperationalNotifications(context.userId as string) };
    } catch {
      throw new Error("Your notifications are temporarily unavailable. Please try again.");
    }
  });
export const readOperationalNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
    const response = await client.rpc("mark_operational_notification_read", { p_id: data.id });
    if (response.error || response.data !== true)
      throw new Error("This notification could not be marked as read.");
    return { read: true };
  });
