import { z } from "zod";
import { conversationTurnTarget } from "./milo-conversation";

export const metadataField = z.enum(["title", "h1", "metaTitle", "metaDescription"]);
export const metadataFields = z
  .object({
    title: z.string().max(1000).optional(),
    h1: z.string().max(1000).optional(),
    metaTitle: z.string().max(1000).optional(),
    metaDescription: z.string().max(4000).optional(),
  })
  .strict();
export const metadataPatch = metadataFields.refine(
  (fields) =>
    Object.keys(fields).length > 0 &&
    (fields.title === undefined || fields.title.trim().length > 0) &&
    new TextEncoder().encode(JSON.stringify(fields)).byteLength <= 16000,
);
export const metadataProposalResponse = z
  .object({ explanation: z.string().trim().min(1).max(1500), fields: metadataFields })
  .strict();
export const metadataProposal = metadataProposalResponse.extend({ fields: metadataPatch });
export const draftProposalTarget = conversationTurnTarget.extend({
  proposalId: z.string().uuid(),
});
export const draftProposalView = draftProposalTarget
  .extend({
    actorId: z.string().uuid(),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    explanation: z.string().min(1).max(1500),
    before: metadataFields,
    fields: metadataPatch,
    state: z.enum(["waiting", "ready", "unavailable", "applied"]),
    createdAt: z.string().datetime({ offset: true }),
    appliedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (view) =>
      Object.keys(view.fields).sort().join() === Object.keys(view.before).sort().join() &&
      (view.state === "applied") === (view.appliedAt !== null),
  );
export type DraftProposalView = z.infer<typeof draftProposalView>;
