import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { publicationVersionSchema } from "./publication-version";
const target = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();
export const readPublicationApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => target.parse(value))
  .handler(async ({ data, context }) => {
    const { readPublicationApproval } = await import("./publication-approval.server");
    return readPublicationApproval({ ...data, ownerId: context.userId });
  });
export const setPublicationApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    target
      .extend({
        expectedVersion: publicationVersionSchema,
        approved: z.boolean(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { setPublicationApproval } = await import("./publication-approval.server");
    return setPublicationApproval(
      { ownerId: context.userId, projectId: data.projectId, assetId: data.assetId },
      { expectedVersion: data.expectedVersion, approved: data.approved },
    );
  });
