import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { citationFindingStageSchema, citationImprovementStageSchema } from "./citation-record";
const scope = z.object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() });
export const saveCitationFindingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend(citationFindingStageSchema.shape).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).saveCitationFinding(
      { ownerId: context.userId, projectId: data.projectId },
      { scope: data.scope, finding: data.finding },
    );
  });
export const readCitationFindingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).readCitationFindings({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const getCitationFindingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).getCitationFinding(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const removeCitationFindingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).removeCitationFinding(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const saveCitationImprovementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope.extend(citationImprovementStageSchema.shape).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).saveCitationImprovement(
      { ownerId: context.userId, projectId: data.projectId },
      { scope: data.scope, improvement: data.improvement },
    );
  });
export const readCitationImprovementsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).readCitationImprovements({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const getCitationImprovementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).getCitationImprovement(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const removeCitationImprovementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-record.server")).removeCitationImprovement(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
