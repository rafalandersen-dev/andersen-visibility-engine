import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { logDocumentSchema } from "./log-evidence";
const scope = z
  .object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() })
  .strict();
export const readLogEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("log_owner_changed");
    return (await import("./log-evidence.server")).readLogEvidence({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const importLogEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ document: logDocumentSchema }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("log_owner_changed");
    return (await import("./log-evidence.server")).importLogEvidence(
      { ownerId: context.userId, projectId: data.projectId },
      data.document,
    );
  });
export const removeLogEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("log_owner_changed");
    return (await import("./log-evidence.server")).removeLogEvidence(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
