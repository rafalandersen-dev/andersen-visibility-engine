import {
  ACCURACY_STATES,
  RECOMMENDATION_STATES,
  SUPPORT_STATES,
  findingSchema,
  type BusinessFact,
  type Finding,
} from "./citation-finding";
import type { CitationPanelScope } from "./citation-record";
import type { EvidenceRow } from "./answer-evidence";
import type { CitationBusinessFactSummary } from "./citation-business-fact";

/**
 * Pure state + mapping for the owner's finding authoring form (both gap families). The form keeps observation,
 * hypothesis, source support and factual accuracy as DISTINCT sections; `draftToFinding` builds the exact
 * `findingSchema` record (no extra field, no default approval, reviewer = the authenticated owner) and reports
 * schema issues by path. Evidence, source records and dated facts are referenced by their EXACT stored ids and
 * revisions (never free text), and `staleSelections` detects a draft whose references no longer exist in the
 * fresh reads. Saving/reopening/versioning happens through the existing record functions.
 */
export interface SupportDraft {
  claimSpan: string;
  citedUrl: string;
  status: (typeof SUPPORT_STATES)[number];
  sourcePassage: string;
  sourceCapturedAt: string;
  reason: string;
  /** Exact stored source record pin, or null (owner-recorded provenance only, not independently inspectable). */
  selectedRecord: {
    sourceId: string;
    recordId: string;
    sourceRevision: number;
    recordRevision: number;
  } | null;
}
export interface AccuracyDraft {
  claimSpan: string;
  status: (typeof ACCURACY_STATES)[number];
  /** The exact stored fact ROW (id + version + logical id + kind) the claim was compared with, or null. */
  fact: {
    factRowId: string;
    factId: string;
    factVersion: number;
    factKind: BusinessFact["kind"];
  } | null;
}
export interface FindingDraft {
  findingId: string;
  /** Head ROW being edited: version (0 for a new finding) + its immutable row id (null for a new finding). The
   * row id is the ABA-proof half of the token: a deleted head recreated under the same number is a different
   * row, and the server refuses a write on top of a row the owner never inspected. */
  expectedVersion: number;
  expectedHeadId: string | null;
  family: Finding["family"];
  scope: CitationPanelScope | null;
  /** Exact answer-evidence row id (from the saved captures) — required for both families. */
  answerId: string | null;
  /** Optional cited source id (project knowledge source). */
  sourceId: string | null;
  entityMatch: Finding["entityMatch"];
  answerComplete: boolean;
  citationsComplete: boolean;
  observation: string;
  hypothesis: string;
  competitorCited: "yes" | "no" | "unknown";
  ownCited: "yes" | "no" | "unknown";
  recommendation: {
    enabled: boolean;
    status: (typeof RECOMMENDATION_STATES)[number];
    passage: string;
    target: string;
    suitability: "fits" | "does_not_fit" | "unknown";
  };
  support: SupportDraft[];
  accuracy: AccuracyDraft[];
  priority: Finding["priority"];
  decision: Finding["decision"];
}

export function newFindingDraft(findingId: string, family: Finding["family"]): FindingDraft {
  return {
    findingId,
    expectedVersion: 0,
    expectedHeadId: null,
    family,
    scope: null,
    answerId: null,
    sourceId: null,
    entityMatch: "confirmed",
    answerComplete: true,
    citationsComplete: true,
    observation: "",
    hypothesis: "",
    competitorCited: "unknown",
    ownCited: "unknown",
    recommendation: {
      enabled: false,
      status: "unclear",
      passage: "",
      target: "",
      suitability: "unknown",
    },
    support: [],
    accuracy: [],
    priority: { harm: "medium", relevance: "medium", fixability: "medium" },
    decision: "needs_second_review",
  };
}
export function emptySupport(): SupportDraft {
  return {
    claimSpan: "",
    citedUrl: "",
    status: "not_checked",
    sourcePassage: "",
    sourceCapturedAt: "",
    reason: "",
    selectedRecord: null,
  };
}
export function emptyAccuracy(): AccuracyDraft {
  return { claimSpan: "", status: "not_checked", fact: null };
}

/**
 * Stored-instant ↔ `datetime-local` round trip with an EXPLICIT convention: the control shows the instant as UTC
 * wall-clock (`YYYY-MM-DDTHH:MM:SS`, `step=1`) and an edit produces a `…Z` instant. The draft keeps the STORED
 * string untouched until the owner really edits, so a `+02:00` offset or fractional seconds (which the control
 * cannot display) survive review and resave byte-for-byte — the instant is never silently reinterpreted.
 */
export function instantToUtcInput(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString().slice(0, 19);
}
/** The draft value after a control change: the ORIGINAL stored string when the visible UTC wall-clock did not
 * change (no silent rewrite of offset/precision), else the edited wall-clock as a `Z` instant. */
export function instantFromUtcInput(input: string, original: string): string {
  if (input === instantToUtcInput(original)) return original;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return `${input}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input)) return `${input}Z`;
  return input;
}
/** True when the stored string carries something the UTC control cannot show (a non-Z offset or fractional
 * seconds), so the owner should see the exact stored form next to the control. */
export function instantDisplayDiffers(iso: string): boolean {
  const t = iso.trim();
  if (!t || Number.isNaN(Date.parse(t))) return false;
  return t !== `${instantToUtcInput(t)}Z` && t !== `${instantToUtcInput(t)}.000Z`;
}

const tri = (v: "yes" | "no" | "unknown") => (v === "unknown" ? null : v === "yes");
const isoOrNull = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return `${t}:00Z`;
  return Number.isNaN(Date.parse(t)) ? null : t;
};

/** Build the exact record for `saveCitationFindingFn`, or the schema issues (`path: message`). */
export function draftToFinding(
  draft: FindingDraft,
  ownerId: string,
  nowIso: string,
  answerCapturedAt: string | null,
): { ok: true; finding: Finding; scope: CitationPanelScope } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (!draft.scope) issues.push("scope: choose a locked panel version");
  if (!draft.answerId) issues.push("evidence: choose the captured answer");
  const review = { reviewer: ownerId, reviewedAt: nowIso };
  const evidence: Finding["evidence"] = [];
  if (draft.answerId) evidence.push({ kind: "answer", id: draft.answerId });
  if (draft.sourceId) evidence.push({ kind: "source", id: draft.sourceId });
  const support = draft.support.map((s) => {
    const assessed = s.status !== "not_checked";
    return {
      claimSpan: s.claimSpan.trim(),
      citedUrl: s.citedUrl.trim(),
      answerCapturedAt: answerCapturedAt ?? nowIso,
      status: s.status,
      sourcePassage: assessed ? s.sourcePassage.trim() || null : null,
      sourceCapturedAt: assessed ? isoOrNull(s.sourceCapturedAt) : null,
      reason: s.reason.trim() || null,
      review: assessed ? review : null,
      selectedRecord: assessed ? s.selectedRecord : null,
    };
  });
  const accuracy = draft.accuracy.map((a) => {
    const assessed = a.status !== "not_checked" && a.status !== "unclear";
    return {
      claimSpan: a.claimSpan.trim(),
      factKind: a.fact?.factKind ?? "entity",
      status: a.status,
      factId: a.fact?.factId ?? null,
      factRowId: a.fact?.factRowId ?? null,
      factVersion: a.fact?.factVersion ?? null,
      captureEvidenceId: draft.answerId,
      review: assessed ? review : null,
    };
  });
  const candidate = {
    findingId: draft.findingId,
    family: draft.family,
    evidence,
    entityMatch: draft.entityMatch,
    capture: { answerComplete: draft.answerComplete, citationsComplete: draft.citationsComplete },
    observation: draft.observation.trim(),
    hypothesis: draft.hypothesis.trim() || null,
    competitorCited: tri(draft.competitorCited),
    ownCited: tri(draft.ownCited),
    recommendation: draft.recommendation.enabled
      ? {
          status: draft.recommendation.status,
          passage: draft.recommendation.passage.trim() || null,
          target: draft.recommendation.target.trim() || null,
          suitability: draft.recommendation.suitability,
          review,
        }
      : null,
    support,
    accuracy,
    priority: draft.priority,
    decision: draft.decision,
    review,
    secondReview: null,
    linkedTaskId: null,
  };
  const parsed = findingSchema.safeParse(candidate);
  if (!parsed.success)
    issues.push(
      ...parsed.error.issues.map((i) => `${i.path.join(".") || "finding"}: ${i.message}`),
    );
  if (issues.length || !draft.scope) return { ok: false, issues };
  return { ok: true, finding: parsed.data!, scope: draft.scope };
}

/** Prefill an edit draft from a stored, VALID finding record, anchored to the ROW the owner actually inspected
 * (`inspected.id` + `inspected.version`, never the list's head): the next save is version `version + 1` ONLY if
 * that row is still the head — otherwise the server conflicts and the owner compares the current head first. */
export function draftFromRecord(
  record: Finding,
  scope: CitationPanelScope,
  inspected: { id: string; version: number },
): FindingDraft {
  const answer = record.evidence.find((e) => e.kind === "answer")?.id ?? null;
  const source = record.evidence.find((e) => e.kind === "source")?.id ?? null;
  const fromTri = (v: boolean | null): "yes" | "no" | "unknown" =>
    v === null ? "unknown" : v ? "yes" : "no";
  return {
    findingId: record.findingId,
    expectedVersion: inspected.version,
    expectedHeadId: inspected.id,
    family: record.family,
    scope,
    answerId: answer,
    sourceId: source,
    entityMatch: record.entityMatch,
    answerComplete: record.capture.answerComplete,
    citationsComplete: record.capture.citationsComplete,
    observation: record.observation,
    hypothesis: record.hypothesis ?? "",
    competitorCited: fromTri(record.competitorCited),
    ownCited: fromTri(record.ownCited),
    recommendation: record.recommendation
      ? {
          enabled: true,
          status: record.recommendation.status,
          passage: record.recommendation.passage ?? "",
          target: record.recommendation.target ?? "",
          suitability: record.recommendation.suitability,
        }
      : { enabled: false, status: "unclear", passage: "", target: "", suitability: "unknown" },
    support: record.support.map((s) => ({
      claimSpan: s.claimSpan,
      citedUrl: s.citedUrl,
      status: s.status,
      sourcePassage: s.sourcePassage ?? "",
      sourceCapturedAt: s.sourceCapturedAt ?? "",
      reason: s.reason ?? "",
      selectedRecord: s.selectedRecord
        ? {
            sourceId: s.selectedRecord.sourceId,
            recordId: s.selectedRecord.recordId,
            sourceRevision: s.selectedRecord.sourceRevision,
            recordRevision: s.selectedRecord.recordRevision ?? 1,
          }
        : null,
    })),
    accuracy: record.accuracy.map((a) => ({
      claimSpan: a.claimSpan,
      status: a.status,
      fact:
        a.factRowId && a.factId && a.factVersion
          ? {
              factRowId: a.factRowId,
              factId: a.factId,
              factVersion: a.factVersion,
              factKind: a.factKind,
            }
          : null,
    })),
    priority: { ...record.priority },
    decision: record.decision,
  };
}

/** References in the draft that no longer resolve in the FRESH reads (deleted/superseded evidence or facts). */
export function staleSelections(
  draft: FindingDraft,
  fresh: {
    answers: readonly Pick<EvidenceRow, "id">[];
    sources: readonly { id: string; revision: number; status: string }[];
    records: readonly { id: string; revision: number; sourceId: string; sourceRevision: number }[];
    facts: readonly CitationBusinessFactSummary[];
    lockedScopes: readonly { panelId: string; panelVersion: number }[];
  },
): string[] {
  const stale: string[] = [];
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (draft.answerId && !fresh.answers.some((a) => eq(a.id, draft.answerId!))) stale.push("answer");
  if (draft.sourceId) {
    const src = fresh.sources.find((s) => eq(s.id, draft.sourceId!));
    if (!src || src.status !== "active") stale.push("source");
  }
  draft.support.forEach((s, i) => {
    if (!s.selectedRecord) return;
    const ok = fresh.records.some(
      (r) =>
        eq(r.id, s.selectedRecord!.recordId) &&
        eq(r.sourceId, s.selectedRecord!.sourceId) &&
        r.revision === s.selectedRecord!.recordRevision &&
        r.sourceRevision === s.selectedRecord!.sourceRevision,
    );
    if (!ok) stale.push(`support.${i}`);
  });
  draft.accuracy.forEach((a, i) => {
    if (!a.fact) return;
    const ok = fresh.facts.some(
      (f) => eq(f.id, a.fact!.factRowId) && f.version === a.fact!.factVersion,
    );
    if (!ok) stale.push(`accuracy.${i}`);
  });
  if (
    draft.scope &&
    !fresh.lockedScopes.some(
      (s) => eq(s.panelId, draft.scope!.panelId) && s.panelVersion === draft.scope!.panelVersion,
    )
  )
    stale.push("scope");
  return stale;
}

/** Map a surfaced server code to an i18n key under `citationAuthoring.saveError.*`. Meaningful wording only;
 * the raw code never reaches the owner. */
export function authoringErrorKey(code: string): string {
  switch (code) {
    case "citation_finding_version_conflict":
      return "versionConflict";
    case "citation_panel_scope_unauthenticated":
      return "scopeUnauthenticated";
    case "citation_finding_scope_drift":
      return "scopeDrift";
    case "citation_finding_capacity":
      return "capacity";
    default:
      return "unavailable";
  }
}

/** The latest stored version of a logical finding id in the owner list (0 when absent). */
export function headVersionOf(
  findings: readonly { findingId: string; version: number }[],
  findingId: string,
): number {
  return findings
    .filter((f) => f.findingId.toLowerCase() === findingId.toLowerCase())
    .reduce((m, f) => Math.max(m, f.version), 0);
}

/** One row per logical finding id — its current head (highest version) — for the edit picker. Historical
 * versions are never offered for editing: a save must be anchored to the head the owner actually inspected,
 * and a historical row can only be opened for comparison through the conflict path. */
export function headRows<T extends { findingId: string; version: number }>(
  findings: readonly T[],
): T[] {
  const heads = new Map<string, T>();
  for (const f of findings) {
    const key = f.findingId.toLowerCase();
    const current = heads.get(key);
    if (!current || f.version > current.version) heads.set(key, f);
  }
  return [...heads.values()];
}

/** Owner + project identity an authoring draft belongs to. Every draft is bound to it: a draft started under one
 * project is never displayed or submitted under another (the AppShell project picker swaps the active project in
 * place, so the identity — not the component instance — is the isolation boundary). */
export function authoringIdentity(ownerId: string, projectId: string): string {
  return `${ownerId.toLowerCase()}:${projectId}`;
}

/**
 * Pure authoring state machine for the finding author (the component only renders it and performs the async
 * calls). Guarantees that are regression-tested in node without a DOM:
 *  - The REVIEWED payload is frozen: `review` builds the exact record ONCE (with that instant's `reviewedAt`) and
 *    keeps it for the save and for every retry after a lost response, as long as the draft inputs are unchanged.
 *    A busy/error re-render, a "back to editing" without changes or a conflict acknowledgement never mints a new
 *    timestamp, so a retry is byte-identical and idempotent server-side. Any field edit invalidates it.
 *  - An edit is anchored to the ROW the owner inspected (`startEdit` carries `expectedHeadId` + version from the
 *    opened detail); a background list refetch never advances that token.
 *  - Conflict continuation is possible ONLY when the current head could be shown and validated; an invalid or
 *    unavailable head keeps the draft and explains, it never becomes a consent token.
 *  - State is bound to the owner+project identity; a different identity yields the initial state.
 */
export interface ReviewedPayload {
  /** Semantic key of the draft inputs the payload was built from (tokens excluded). */
  key: string;
  finding: Finding;
  scope: CitationPanelScope;
}
export interface AuthoringState {
  identity: string;
  draft: FindingDraft | null;
  stage: "edit" | "review";
  reviewed: ReviewedPayload | null;
  issues: string[];
  /** `citationAuthoring.saveError.*` key of the last failed action, or null. */
  errorKey: string | null;
  /** The current head after a version conflict: `record` is null when it could not be shown/validated. */
  conflict: { id: string; version: number; record: Finding | null } | null;
  saved: { version: number } | null;
}
export type AuthoringAction =
  | { type: "startNew"; draft: FindingDraft }
  | { type: "startEdit"; draft: FindingDraft }
  | { type: "edit"; patch: Partial<FindingDraft> }
  | { type: "review"; ownerId: string; nowIso: string; answerCapturedAt: string | null }
  | { type: "back" }
  | { type: "saveStarted" }
  | { type: "saved"; version: number }
  | { type: "saveFailed"; code: string }
  | { type: "conflictLoaded"; head: { id: string; version: number; record: Finding | null } }
  | { type: "continueOnHead" }
  | { type: "unavailable" }
  | { type: "cancel" }
  | { type: "scopeChanged"; identity: string };

export function initialAuthoringState(identity: string): AuthoringState {
  return {
    identity,
    draft: null,
    stage: "edit",
    reviewed: null,
    issues: [],
    errorKey: null,
    conflict: null,
    saved: null,
  };
}
/** The draft inputs that determine the record — everything except the concurrency token. */
export function reviewKey(draft: FindingDraft, answerCapturedAt: string | null): string {
  const { expectedVersion: _v, expectedHeadId: _h, ...inputs } = draft;
  return JSON.stringify([inputs, answerCapturedAt]);
}
/** Whether the owner may acknowledge the current head and continue on top of it. */
export function canContinueOnHead(state: AuthoringState): boolean {
  return state.conflict !== null && state.conflict.record !== null;
}
export function authoringReducer(state: AuthoringState, action: AuthoringAction): AuthoringState {
  switch (action.type) {
    case "scopeChanged":
      return action.identity === state.identity ? state : initialAuthoringState(action.identity);
    case "startNew":
    case "startEdit":
      return { ...initialAuthoringState(state.identity), draft: action.draft };
    case "edit": {
      if (!state.draft) return state;
      // A field change invalidates the reviewed payload (a new review mints a new instant); the token is untouched.
      return { ...state, draft: { ...state.draft, ...action.patch }, reviewed: null, issues: [] };
    }
    case "review": {
      if (!state.draft) return state;
      const key = reviewKey(state.draft, action.answerCapturedAt);
      if (state.reviewed && state.reviewed.key === key)
        return { ...state, stage: "review", issues: [] };
      const built = draftToFinding(
        state.draft,
        action.ownerId,
        action.nowIso,
        action.answerCapturedAt,
      );
      if (!built.ok) return { ...state, issues: built.issues, stage: "edit" };
      return {
        ...state,
        reviewed: { key, finding: built.finding, scope: built.scope },
        issues: [],
        stage: "review",
      };
    }
    case "back":
      return { ...state, stage: "edit" };
    case "saveStarted":
      return { ...state, errorKey: null, conflict: null, saved: null };
    case "saved":
      return { ...initialAuthoringState(state.identity), saved: { version: action.version } };
    case "saveFailed":
      return { ...state, errorKey: authoringErrorKey(action.code) };
    case "conflictLoaded":
      return state.errorKey === "versionConflict" ? { ...state, conflict: action.head } : state;
    case "continueOnHead": {
      if (!state.draft || !canContinueOnHead(state) || !state.conflict) return state;
      // Only the token moves to the INSPECTED head; the reviewed payload stays byte-identical for the retry.
      return {
        ...state,
        draft: {
          ...state.draft,
          expectedVersion: state.conflict.version,
          expectedHeadId: state.conflict.id,
        },
        conflict: null,
        errorKey: null,
      };
    }
    case "unavailable":
      return { ...state, errorKey: "unavailable" };
    case "cancel":
      return initialAuthoringState(state.identity);
    default:
      return state;
  }
}
