import { z } from "zod";
import { publicationVersionSchema } from "./publication-version";
export const knowledgeReviewInput = z
  .object({
    reviewId: z.string().uuid(),
    expectedVersion: publicationVersionSchema,
    expectedContext: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedFacts: z.array(z.string().max(600)).min(1).max(9300),
    confirmDeliverable: z.literal(true),
  })
  .strict();
