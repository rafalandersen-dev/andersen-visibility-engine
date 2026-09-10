import { z } from "zod";
export const outreachReceiptSchema = z.object({
  draft_id: z.string().min(1).max(200),
  project_id: z.string().min(1).max(200),
  step: z.enum(["initial", "followup-0", "followup-1"]),
  version_hash: z.string().regex(/^[a-f0-9]{64}$/),
  recipient: z.string().min(3).max(254),
  state: z.enum(["reserved", "dispatching", "accepted", "unknown", "blocked"]),
  reserved_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  provider_message_id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,200}$/)
    .nullable(),
});
export type OutreachReceipt = z.infer<typeof outreachReceiptSchema>;
export const outreachReviewSchema = z.object({
  draftId: z.string().min(1).max(200),
  followUpIndex: z.number().int().min(0).max(1).optional(),
});
export const outreachSendInput = outreachReviewSchema.extend({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgedRecipient: z.literal(true),
  acknowledgedContent: z.literal(true),
});
