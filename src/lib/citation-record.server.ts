import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { findingSchema } from "./citation-finding";
import {
  citationFindingDetailEnvelopeSchema,
  citationFindingDetailSchema,
  citationFindingStageInputSchema,
  citationFindingSummarySchema,
  citationFindingsStateSchema,
  citationImprovementDetailSchema,
  citationImprovementStageSchema,
  citationImprovementSummarySchema,
  citationImprovementsStateSchema,
} from "./citation-record";
import type { KnowledgeRpc } from "./project-knowledge.server";
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();
// The database raises this small, fixed allowlist of capacity codes when a save is refused for a reason
// the owner can resolve by deleting a record; only these exact tokens are surfaced. EVERY other failure
// (validation, auth, an unresolved dependency, a missing row, a raw database error, network, or the
// timeout) collapses to the generic code, so no raw database error text ever escapes.
const SURFACED_CITATION_ERRORS = new Set([
  "citation_finding_capacity",
  "citation_improvement_capacity",
  // Owner-resolvable authoring outcomes (additive 20260926190000): a stale different edit (reopen the current
  // version), a scope that is not a stored LOCKED panel with the same client (lock the panel / fix the scope),
  // and a reused finding id under a changed scope (a scope change is a NEW finding identity).
  "citation_finding_version_conflict",
  "citation_panel_scope_unauthenticated",
  "citation_finding_scope_drift",
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
// A RETURNED rpc error already mapped through the allowlist; the catch rethrows these verbatim but
// collapses every other thrown/rejected error (a rejected/thrown rpc promise, the dynamic import, or the
// timeout) to the generic code, never treating a client/transport failure as the DB's capacity signal.
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
export async function saveCitationFinding(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  // Bounded, fully-validated finding record + declared scope before the RPC. The server derives the
  // actor/reviewer and refuses a record whose reviewer is not the authenticated caller.
  const input = citationFindingStageInputSchema.parse(value);
  // v2 (additive 20260926190000): the same P3 save under the account lock plus the expected-head guard (version
  // + immutable head row id) and the persisted scope-binding stamp; every insert is scope-enforced by the trigger.
  return citationFindingSummarySchema.parse(
    await call(
      "save_ai_citation_finding_v2",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_record: input.finding,
        p_scope: input.scope,
        p_expected_version: input.expectedVersion ?? null,
        p_expected_head: input.expectedHeadId ?? null,
      },
      rpc,
    ),
  );
}
export async function readCitationFindings(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return citationFindingsStateSchema.parse(
    await call("read_ai_citation_findings_v2", { p_user: s.ownerId, p_project: s.projectId }, rpc),
  );
}
export async function getCitationFinding(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  // Parse the envelope with the record as BOUNDED JSON (depth/size-capped, never `unknown`), so a
  // legacy/malformed stored record yields an honest detail the owner can inspect and delete rather than a
  // crash, and a pathologically deep/oversized record is refused. A well-formed record is then re-validated
  // against the exact strict `findingSchema` to pick the discriminated `recordValid` branch.
  const env = citationFindingDetailEnvelopeSchema.parse(
    await call(
      "read_ai_citation_finding_v2",
      { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
      rpc,
    ),
  );
  const asFinding = findingSchema.safeParse(env.record);
  return citationFindingDetailSchema.parse(
    asFinding.success
      ? { ...env, recordValid: true, record: asFinding.data }
      : { ...env, recordValid: false },
  );
}
export async function removeCitationFinding(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_citation_finding",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
        rpc,
      ),
    );
}
export async function saveCitationImprovement(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const input = citationImprovementStageSchema.parse(value);
  return citationImprovementSummarySchema.parse(
    await call(
      "save_ai_citation_improvement_v2",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_record: input.improvement,
        p_scope: input.scope,
        p_binding: input.binding ?? null,
      },
      rpc,
    ),
  );
}
export async function readCitationImprovements(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return citationImprovementsStateSchema.parse(
    await call(
      "read_ai_citation_improvements_v2",
      { p_user: s.ownerId, p_project: s.projectId },
      rpc,
    ),
  );
}
export async function getCitationImprovement(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return citationImprovementDetailSchema.parse(
    await call(
      "read_ai_citation_improvement_v2",
      { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
      rpc,
    ),
  );
}
export async function removeCitationImprovement(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_citation_improvement",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
        rpc,
      ),
    );
}
