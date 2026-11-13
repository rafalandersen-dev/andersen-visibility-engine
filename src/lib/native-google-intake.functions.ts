import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { NATIVE_COMPLETENESS, nativeLimitationNoteSchema } from "./native-google-intake";
const scope = z.object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() });
/**
 * Owner endpoints for the typed native-report interpretation. Staging/list/get/remove stay on the
 * existing native-ai-artifact.functions; these only persist and read back the parsed interpretation
 * of an already-staged artifact. The server re-parses the actual stored bytes — the browser never
 * supplies the rows, hash, aggregation or market.
 */
export const persistNativeReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope
      .extend({
        id: z.string().uuid(),
        completeness: z.enum(NATIVE_COMPLETENESS),
        limitationNote: nativeLimitationNoteSchema,
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-google-intake.server")).persistNativeReport(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
      data.completeness,
      data.limitationNote,
    );
  });
export const readNativeReportParsedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-google-intake.server")).readNativeReportParsed(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const readNativeReportParseStatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-google-intake.server")).readNativeReportParseStates({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
