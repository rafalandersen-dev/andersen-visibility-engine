import { businessFactSchema, type BusinessFact } from "./citation-finding";
import type { CitationBusinessFactSummary } from "./citation-business-fact";

/**
 * Pure helpers for the owner's dated business-fact list/create/correct UI. A fact is immutable per version; a
 * correction is a NEW version of the same logical `factId` with its own declared validity interval, saved with
 * the head version the owner inspected (`expectedVersion`, checked atomically by the server). `confirmedBy` must
 * be the authenticated owner and `confirmedAt` is re-stamped by the server; the client only carries a placeholder.
 */
export const FACT_KINDS = businessFactSchema.shape.kind.options;
export type FactKind = BusinessFact["kind"];

export interface FactDraft {
  factId: string;
  kind: FactKind;
  value: string;
  /** ISO 8601 instants (offset or Z), ≤ microsecond precision; `validUntil` may be empty (open-ended). */
  validFrom: string;
  validUntil: string;
  /** Head ROW being corrected: version (0 for a new fact) + its immutable row id (null for a new fact). The row
   * id is the ABA-proof half of the token: a deleted head recreated under the same number is a different row. */
  expectedVersion: number;
  expectedHeadId: string | null;
}

export function newFactDraft(factId: string): FactDraft {
  return {
    factId,
    kind: "price",
    value: "",
    validFrom: "",
    validUntil: "",
    expectedVersion: 0,
    expectedHeadId: null,
  };
}

/** A correction draft: same logical id, value prefilled, validity to be declared by the owner, the INSPECTED
 * head row (version + id) pinned. */
export function correctionDraftFrom(head: CitationBusinessFactSummary): FactDraft {
  return {
    factId: head.record.factId,
    kind: head.record.kind,
    value: head.record.value,
    validFrom: "",
    validUntil: "",
    expectedVersion: head.version,
    expectedHeadId: head.id,
  };
}

/** Accepts `YYYY-MM-DD` (→ midnight UTC), `YYYY-MM-DDTHH:MM` (→ UTC) or a full ISO instant; returns a
 * `businessFactSchema`-valid instant or null. */
export function normalizeInstant(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00Z`;
  if (/\.\d{7,}/.test(s)) return null;
  if (Number.isNaN(Date.parse(s))) return null;
  return s;
}

export type FactIssue = "value" | "validFrom" | "validUntil" | "order" | "precision" | "schema";

/** Build the exact fact record from the draft (or the issues to show). Placeholder `confirmedAt` = `nowIso`. */
export function factDraftToRecord(
  draft: FactDraft,
  ownerId: string,
  nowIso: string,
): { ok: true; fact: BusinessFact } | { ok: false; issues: FactIssue[] } {
  const issues: FactIssue[] = [];
  const value = draft.value.trim();
  if (!value) issues.push("value");
  const validFrom = normalizeInstant(draft.validFrom);
  if (!validFrom) issues.push(/\.\d{7,}/.test(draft.validFrom) ? "precision" : "validFrom");
  let validUntil: string | null = null;
  if (draft.validUntil.trim()) {
    validUntil = normalizeInstant(draft.validUntil);
    if (!validUntil) issues.push(/\.\d{7,}/.test(draft.validUntil) ? "precision" : "validUntil");
  }
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom))
    issues.push("order");
  if (issues.length) return { ok: false, issues };
  const parsed = businessFactSchema.safeParse({
    factId: draft.factId,
    kind: draft.kind,
    value,
    confirmedBy: ownerId,
    confirmedAt: nowIso,
    validFrom,
    validUntil,
  });
  return parsed.success ? { ok: true, fact: parsed.data } : { ok: false, issues: ["schema"] };
}

/** Group stored versions by logical fact: the head (highest version) plus its history, newest heads first. */
export interface FactChain {
  factId: string;
  head: CitationBusinessFactSummary;
  versions: CitationBusinessFactSummary[];
}
export function factChains(rows: readonly CitationBusinessFactSummary[]): FactChain[] {
  const byId = new Map<string, CitationBusinessFactSummary[]>();
  for (const r of rows) {
    const key = r.record.factId.toLowerCase();
    byId.set(key, [...(byId.get(key) ?? []), r]);
  }
  return [...byId.values()]
    .map((versions) => {
      const sorted = [...versions].sort((a, b) => b.version - a.version);
      return { factId: sorted[0].record.factId, head: sorted[0], versions: sorted };
    })
    .sort((a, b) => Date.parse(b.head.createdAt) - Date.parse(a.head.createdAt));
}

/** Whether a fact version's declared validity covers an instant (open-ended when `validUntil` is null). */
export function validAt(fact: BusinessFact, instantIso: string): boolean {
  const t = Date.parse(instantIso);
  return (
    Date.parse(fact.validFrom) <= t && (fact.validUntil === null || Date.parse(fact.validUntil) > t)
  );
}

/** Map a surfaced server code to an i18n key under `citationAuthoring.factError.*`. */
export function factErrorKey(code: string): string {
  switch (code) {
    case "citation_business_fact_version_conflict":
      return "versionConflict";
    case "citation_business_fact_capacity":
      return "capacity";
    default:
      return "unavailable";
  }
}
