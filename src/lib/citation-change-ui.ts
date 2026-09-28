/**
 * Pure, event-driven state of the owner's change-artifact controls (candidate 20260928120000, Codex R3): the
 * draft field rows (unique enumerated keys, never silently collapsed), the FROZEN approval request and the FROZEN
 * performed declaration that a lost-response retry re-sends byte for byte. No React, no I/O: the component only
 * dispatches these transitions and renders the result; the browser harness exercises the real events.
 */
import {
  CITATION_CHANGE_FIELDS,
  changeFieldsValid,
  type CitationChangeKind,
} from "./citation-change";

/* ------------------------------------------------------------------------------------------ field rows */

export interface FieldRow {
  key: string;
  before: string;
  after: string;
}
export const firstFieldRow = (kind: CitationChangeKind): FieldRow => ({
  key: CITATION_CHANGE_FIELDS[kind][0],
  before: "",
  after: "",
});
/** Keys used by more than one row (each occurrence after the first is the offending one). */
export function duplicateRowIndexes(rows: readonly FieldRow[]): Set<number> {
  const seen = new Set<string>();
  const dup = new Set<number>();
  rows.forEach((r, i) => {
    if (seen.has(r.key)) dup.add(i);
    else seen.add(r.key);
  });
  return dup;
}
/** The next enumerated key of the kind that no row uses yet; null when every key is taken (no add offered). */
export function nextUnusedKey(kind: CitationChangeKind, rows: readonly FieldRow[]): string | null {
  const used = new Set(rows.map((r) => r.key));
  return CITATION_CHANGE_FIELDS[kind].find((k) => !used.has(k)) ?? null;
}
/** Add a row for the next unused key; a full form is returned unchanged (the control is disabled). */
export function addFieldRow(kind: CitationChangeKind, rows: readonly FieldRow[]): FieldRow[] {
  const key = nextUnusedKey(kind, rows);
  return key === null ? [...rows] : [...rows, { key, before: "", after: "" }];
}
export function setFieldRowKey(rows: readonly FieldRow[], index: number, key: string): FieldRow[] {
  return rows.map((r, i) => (i === index ? { ...r, key } : r));
}
export function setFieldRowValue(
  rows: readonly FieldRow[],
  index: number,
  part: "before" | "after",
  value: string,
): FieldRow[] {
  return rows.map((r, i) => (i === index ? { ...r, [part]: value } : r));
}
export function removeFieldRow(rows: readonly FieldRow[], index: number): FieldRow[] {
  return rows.length <= 1 ? [...rows] : rows.filter((_, i) => i !== index);
}
/** Serialize ONLY a duplicate-free form; duplicates are refused here (never folded by object keys). */
export function serializeFieldRows(
  rows: readonly FieldRow[],
): Record<string, { before: string | null; after: string }> | null {
  if (duplicateRowIndexes(rows).size > 0) return null;
  return Object.fromEntries(
    rows.map((r) => [r.key, { before: r.before.trim() ? r.before : null, after: r.after }]),
  );
}
export function fieldRowsValid(kind: CitationChangeKind, rows: readonly FieldRow[]): boolean {
  const fields = serializeFieldRows(rows);
  return fields !== null && changeFieldsValid(kind, fields);
}

/* --------------------------------------------------------------------------- frozen write requests */

/** Outcome tokens after which a retry can never succeed (the frozen request is dropped and the owner must read
 * the current state and decide again). Anything else — the transport-level generic error or the collapsed
 * `citation_change_unavailable` — leaves the write UNCERTAIN: the request stays frozen for an identical retry. */
export const TERMINAL_CHANGE_CODES: ReadonlySet<string> = new Set([
  "citation_change_stale",
  "citation_change_forbidden",
  "citation_change_unsupported",
  "citation_change_unapproved",
  "citation_change_receipt_invalid",
  "citation_change_capacity",
]);
export const isTerminalChangeCode = (code: string) => TERMINAL_CHANGE_CODES.has(code);

/** The complete approval request of ONE click: scope, artifact, its digest, the decision, the reviewed head and
 * the request identity. A retry sends exactly this object; nothing is recomputed from a fresher read. */
export interface FrozenApproval {
  projectId: string;
  artifactId: string;
  expectedSha: string;
  approved: boolean;
  expectedRevision: number;
  requestId: string;
}
export interface FrozenReceipt {
  projectId: string;
  artifactId: string;
  performedAt: string;
}
export type FrozenWrites = { approval: FrozenApproval | null; receipt: FrozenReceipt | null };
export const noFrozenWrites: FrozenWrites = { approval: null, receipt: null };

export type FrozenEvent =
  | { type: "approvalDecided"; request: FrozenApproval }
  | { type: "approvalSettled" }
  | { type: "approvalFailed"; code: string }
  | { type: "approvalDiscarded" }
  | { type: "receiptDeclared"; request: FrozenReceipt }
  | { type: "receiptSettled" }
  | { type: "receiptFailed"; code: string }
  | { type: "receiptDiscarded" };

/** Reducer over the frozen writes. A decision/declaration while one is pending is IGNORED (the UI offers only
 * retry or an explicit discard); a failure keeps the request unless the outcome is terminal. */
export function frozenWritesReducer(state: FrozenWrites, event: FrozenEvent): FrozenWrites {
  switch (event.type) {
    case "approvalDecided":
      return state.approval ? state : { ...state, approval: event.request };
    case "approvalSettled":
    case "approvalDiscarded":
      return { ...state, approval: null };
    case "approvalFailed":
      return isTerminalChangeCode(event.code) ? { ...state, approval: null } : state;
    case "receiptDeclared":
      return state.receipt ? state : { ...state, receipt: event.request };
    case "receiptSettled":
    case "receiptDiscarded":
      return { ...state, receipt: null };
    case "receiptFailed":
      return isTerminalChangeCode(event.code) ? { ...state, receipt: null } : state;
  }
}
/** Build the approval request the owner is deciding NOW from the artifact as currently read. */
export function approvalRequestFor(
  projectId: string,
  artifact: {
    id: string;
    artifactSha256: string;
    approval: { current: boolean; revision: number } | null;
  },
  requestId: string,
): FrozenApproval {
  return {
    projectId,
    artifactId: artifact.id,
    expectedSha: artifact.artifactSha256,
    approved: !artifact.approval?.current,
    expectedRevision: artifact.approval?.revision ?? 0,
    requestId,
  };
}
/** The note after an approval write: a replay is reported as HISTORICAL (the current decision comes from the
 * refetched read), never as a fresh approval. */
export function approvalOutcomeKey(result: { replayed: boolean; approved: boolean }): string {
  if (result.replayed) return "citationChange.approval.replayed";
  return result.approved ? "citationChange.approval.approved" : "citationChange.approval.revoked";
}

/** Codex R4: the frozen writes are per owner+project, ONE unresolved request per kind at a time. While a request
 * for artifact A is unresolved, the same-kind write controls of every OTHER artifact (and A's deletion) are
 * blocked and labelled — never sent, never able to settle A's identity implicitly. Returns the artifact id that
 * blocks, or null when the write may start. */
export function blockingWrite(
  frozen: FrozenWrites,
  kind: "approval" | "receipt",
  artifactId: string,
): string | null {
  const pending = frozen[kind];
  return pending && pending.artifactId !== artifactId ? pending.artifactId : null;
}
/** A deletion is blocked while ANY unresolved write targets the artifact (the owner resolves or discards first). */
export function deletionBlocked(frozen: FrozenWrites, artifactId: string): boolean {
  return frozen.approval?.artifactId === artifactId || frozen.receipt?.artifactId === artifactId;
}
/** In-memory registry so an unresolved request survives the form unmounting/remounting within the session
 * (the improvement draft closing and reopening); keyed by owner+project, never persisted. */
const frozenRegistry = new Map<string, FrozenWrites>();
export function rememberFrozenWrites(key: string, state: FrozenWrites): void {
  if (state.approval === null && state.receipt === null) frozenRegistry.delete(key);
  else frozenRegistry.set(key, state);
}
export function recallFrozenWrites(key: string): FrozenWrites {
  return frozenRegistry.get(key) ?? noFrozenWrites;
}
