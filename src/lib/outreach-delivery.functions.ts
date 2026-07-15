import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OutreachDeliveryStatus } from "./outreach-delivery.server";

export const getOutreachDeliveryStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<OutreachDeliveryStatus> => {
    const { getOutreachDeliveryStatus } = await import("./outreach-delivery.server");
    return getOutreachDeliveryStatus();
  });

export const sendOutreachEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        draftId: z.string().min(1).max(200),
        followUpIndex: z.number().int().min(0).max(1).optional(),
        acknowledgedRecipient: z.literal(true),
        acknowledgedContent: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sendOutreachEmail } = await import("./outreach-delivery.server");
    return sendOutreachEmail({
      userId: context.userId,
      draftId: data.draftId,
      step:
        typeof data.followUpIndex === "number"
          ? { kind: "followUp", followUpIndex: data.followUpIndex }
          : { kind: "initial" },
      acknowledgedRecipient: data.acknowledgedRecipient,
      acknowledgedContent: data.acknowledgedContent,
    });
  });
