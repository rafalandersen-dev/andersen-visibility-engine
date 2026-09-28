import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const input = z
  .object({
    expectedOwnerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    versionHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
/** Owner-only approval provenance of one exact asset version (candidate 20260927190000). The authenticated user
 * IS the owner scope; a caller-supplied owner is only a change guard, never an authorization input. */
export const readPublicationApprovalProvenanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-approval.server")).readPublicationApprovalProvenance({
      ownerId: context.userId,
      projectId: data.projectId,
      assetId: data.assetId,
      versionHash: data.versionHash,
    });
  });
