import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { outreachReviewSchema, outreachSendInput } from "./outreach-receipts";
import type { OutreachSendStep } from "./outreach-delivery.server";
const step = (index?: number): OutreachSendStep =>
  typeof index === "number" ? { kind: "followUp", followUpIndex: index } : { kind: "initial" };
export const getOutreachDeliveryStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getOutreachDeliveryStatus } = await import("./outreach-delivery.server");
    return getOutreachDeliveryStatus();
  });
export const reviewOutreachMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outreachReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { reviewOutreachMessage } = await import("./outreach-delivery.server");
    return reviewOutreachMessage(context.userId, data.draftId, step(data.followUpIndex));
  });
export const readOutreachDeliveriesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { readOutreachDeliveries } = await import("./outreach-receipts.server");
    return readOutreachDeliveries(context.userId, data.projectId);
  });
export const sendOutreachEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outreachSendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { sendOutreachEmail } = await import("./outreach-delivery.server");
    return sendOutreachEmail({ ...data, userId: context.userId, step: step(data.followUpIndex) });
  });

export const recoverOutreachReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outreachReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { recoverOutreachReceipt } = await import("./outreach-delivery.server");
    return recoverOutreachReceipt(context.userId, data.draftId, step(data.followUpIndex));
  });
