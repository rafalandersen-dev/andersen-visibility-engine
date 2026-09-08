import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  listOperationalNotifications,
  refreshOperationalNotifications,
} from "./operational-notifications.server";
import { inspectSchedulerRecovery } from "./scheduler-recovery.server";
import { inspectPublicationFailure } from "./publication-failure.server";

export const getPublicationFailureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().min(1).max(200),
        assetId: z.string().min(1).max(200),
        queueId: z.string().uuid(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    try {
      return await inspectPublicationFailure(
        context.userId as string,
        data.projectId,
        data.assetId,
        data.queueId,
      );
    } catch {
      throw new Error("Saved publication details are temporarily unavailable.");
    }
  });

export const getSchedulerRecoveryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: z.string().min(1).max(200) })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    try {
      return await inspectSchedulerRecovery(context.userId as string, data.projectId);
    } catch {
      throw new Error("Saved automation records are temporarily unavailable.");
    }
  });

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
