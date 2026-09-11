import { z } from "zod";
import { backlinkDetailScope } from "./backlink-details";
export const backlinkDetailsRequest = backlinkDetailScope
  .omit({ target: true })
  .extend({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    requestId: z.string().uuid(),
    expectedWebsite: z.string().trim().min(1).max(8192),
  })
  .strict();
export const backlinkDetailsHistoryInput = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export const backlinkDetailsRecoveryInput = backlinkDetailsHistoryInput
  .extend({ requestId: z.string().uuid() })
  .strict();
