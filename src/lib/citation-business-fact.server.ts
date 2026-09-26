import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import {
  citationBusinessFactStageInputSchema,
  citationBusinessFactSummarySchema,
  citationBusinessFactsStateSchema,
  citationFindingAccuracySchema,
} from "./citation-business-fact";
import type { KnowledgeRpc } from "./project-knowledge.server";
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();
// Only this fixed capacity code (resolvable by the owner deleting a fact) is surfaced; every other failure
// (validation, auth, an unresolved dependency, a missing row, a raw database error, network, or the
// timeout) collapses to the generic code, so no raw database error text ever escapes.
const SURFACED_CITATION_ERRORS = new Set([
  "citation_business_fact_capacity",
  // A correction submitted against a head version the owner never inspected (additive 20260926190000).
  "citation_business_fact_version_conflict",
]);
function surfacedCitationError(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  return typeof message === "string" && SURFACED_CITATION_ERRORS.has(message)
    ? message
    : "citation_record_unavailable";
}
class CitationRecordError extends Error {}
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("citation_record_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw new CitationRecordError(surfacedCitationError(r.error));
    return r.data;
  } catch (error) {
    throw error instanceof CitationRecordError ? error : Error("citation_record_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
export async function saveCitationBusinessFact(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  // Fully-validated business-fact record before the RPC. The server derives confirmedBy/confirmedAt and
  // refuses a foreign confirmer.
  const input = citationBusinessFactStageInputSchema.parse(value);
  // v2 (additive 20260926190000): the unchanged P3 save plus the expected-head guard (version + immutable head
  // row id) for corrections.
  return citationBusinessFactSummarySchema.parse(
    await call(
      "save_ai_citation_business_fact_v2",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_record: input.fact,
        p_expected_version: input.expectedVersion ?? null,
        p_expected_head: input.expectedHeadId ?? null,
      },
      rpc,
    ),
  );
}
export async function readCitationBusinessFacts(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return citationBusinessFactsStateSchema.parse(
    await call(
      "read_ai_citation_business_facts",
      { p_user: s.ownerId, p_project: s.projectId },
      rpc,
    ),
  );
}
export async function getCitationBusinessFact(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return citationBusinessFactSummarySchema.parse(
    await call(
      "read_ai_citation_business_fact",
      { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
      rpc,
    ),
  );
}
export async function removeCitationBusinessFact(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_citation_business_fact",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
        rpc,
      ),
    );
}
// The finding's assessed accuracy entries, resolved live against the dated facts. `findingId` is the
// finding ROW id (from the citation-record finding read), not the logical finding id.
export async function readCitationFindingAccuracy(
  raw: z.infer<typeof scope>,
  findingId: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return citationFindingAccuracySchema.parse(
    await call(
      "read_ai_citation_finding_accuracy",
      { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(findingId) },
      rpc,
    ),
  );
}
