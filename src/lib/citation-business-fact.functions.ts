import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { citationBusinessFactStageSchema } from "./citation-business-fact";
const scope = z.object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() });
export const saveCitationBusinessFactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope.extend(citationBusinessFactStageSchema.shape).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-business-fact.server")).saveCitationBusinessFact(
      { ownerId: context.userId, projectId: data.projectId },
      { fact: data.fact },
    );
  });
export const readCitationBusinessFactsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-business-fact.server")).readCitationBusinessFacts({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const getCitationBusinessFactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-business-fact.server")).getCitationBusinessFact(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const removeCitationBusinessFactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-business-fact.server")).removeCitationBusinessFact(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const readCitationFindingAccuracyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ findingId: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./citation-business-fact.server")).readCitationFindingAccuracy(
      { ownerId: context.userId, projectId: data.projectId },
      data.findingId,
    );
  });
