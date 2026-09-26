import { CITATION_REVIEW_DECISIONS } from "./citation-finding-review";
import type { CitationAccuracyResolution } from "./citation-business-fact";

/**
 * Pure decision/eligibility/link logic for the Citation Intelligence P4 review UI (no React, no I/O), so the
 * security-relevant wiring is deterministically testable. The server (released P3) is always authoritative
 * and re-checks live eligibility + the finding-scoped assignment + the pinned hash; these helpers only keep
 * the UI honest — they never widen access.
 */
export type CitationReviewDecision = (typeof CITATION_REVIEW_DECISIONS)[number];
/** The owner's live approval-policy mode (from `readOwnerTeamPolicyFn`); `null` = no policy set. */
export type ReviewPolicyMode = "disabled" | "separate_reviewers" | "editors_can_approve";

/** The minimal shape of a team roster member the grant/revoke controls need (`readProjectTeamRosterFn`). */
export interface ReviewerCandidate {
  actorId: string;
  email: string | null;
  role: "viewer" | "editor" | "reviewer";
  active: boolean;
  expiresAt: string | null;
}

function isExpired(expiresAt: string | null, now: number): boolean {
  if (expiresAt === null) return false;
  const t = Date.parse(expiresAt);
  return !Number.isFinite(t) || t <= now; // unparseable is treated as expired (fail closed)
}

/**
 * Candidates the owner may finding-scope-ASSIGN, mirroring the released `citation_review_authorized` policy so
 * the offered list matches what the server will accept: under `separate_reviewers` only `reviewer`s; under
 * `editors_can_approve` `reviewer`s AND `editor`s; under `disabled`/no policy, NONE. Always active,
 * non-expired, never the owner. The server re-checks live and is authoritative; an empty result is an honest
 * "no eligible member", never a fabricated candidate.
 */
export function grantEligibleReviewers(
  members: readonly ReviewerCandidate[],
  ownerId: string,
  policyMode: ReviewPolicyMode | null,
  now: number = Date.now(),
): ReviewerCandidate[] {
  if (policyMode !== "separate_reviewers" && policyMode !== "editors_can_approve") return [];
  const owner = ownerId.toLowerCase();
  return members.filter((m) => {
    if (!m.active || isExpired(m.expiresAt, now)) return false;
    if (m.actorId.toLowerCase() === owner) return false;
    return m.role === "reviewer" || (policyMode === "editors_can_approve" && m.role === "editor");
  });
}

/**
 * Members the owner may REVOKE finding access from — DISTINCT from grant eligibility (finding 4064342170's
 * sibling review): a departed/expired/inactive member (or one whose role no longer grants) may still hold a
 * stale assignment, so the owner must be able to revoke ANY current roster member (never only the currently
 * eligible ones), else revocation is impossible exactly when it matters. Only the owner is excluded (the owner
 * is never an assignee). Revoking a non-assignee is a safe server-side no-op.
 */
export function revokeTargets(
  members: readonly ReviewerCandidate[],
  ownerId: string,
): ReviewerCandidate[] {
  const owner = ownerId.toLowerCase();
  return members.filter((m) => m.actorId.toLowerCase() !== owner);
}

/** A reviewer surface is MASKED when the server withheld the whole record or the pin: no field is shown and
 * no receipt can be pinned/submitted (the server blocks a review save for a masked finding). */
export function reviewRecordMasked(view: {
  record: unknown | null;
  recordSha256: string | null;
}): boolean {
  return view.record === null || view.recordSha256 === null;
}

export type ReviewSubmitReason = "busy" | "withheld" | "uninspectable" | "choose";
export interface ReviewSubmitGuard {
  allowed: boolean;
  reason?: ReviewSubmitReason;
}

/**
 * Whether the reviewer may submit `decision` for this freshly-read view. Fails closed:
 * - never while a mutation is in flight (`busy`);
 * - never on a MASKED finding (record/hash withheld) — the server would reject it and no evidence was seen;
 * - never before an explicit decision is chosen (`""`) — there is NO default `approved` implying inspection;
 * - `approved` requires a COMPLETE live inspection (`inspectionComplete`) — no approval of unseen/uninspectable
 *   evidence — while `rejected`/`needs_changes` stay available as an honest opinion/dissent on a visible finding.
 */
export function reviewSubmitGuard(input: {
  record: unknown | null;
  recordSha256: string | null;
  inspectionComplete: boolean;
  decision: CitationReviewDecision | "";
  busy: boolean;
}): ReviewSubmitGuard {
  if (input.busy) return { allowed: false, reason: "busy" };
  if (reviewRecordMasked(input)) return { allowed: false, reason: "withheld" };
  if (input.decision === "") return { allowed: false, reason: "choose" };
  if (input.decision === "approved" && !input.inspectionComplete)
    return { allowed: false, reason: "uninspectable" };
  return { allowed: true };
}

/** The surfaced review error codes that mean "your pinned content is stale / conflicts" — the UI must REFRESH
 * (re-read the current hash) and let the reviewer re-decide, never blind-retry the stale attestation. */
export function isStaleConflict(code: string): boolean {
  return code === "citation_review_stale" || code === "citation_review_conflict";
}

/** Map a surfaced review error to the UI recovery action: refresh the finding for a stale/conflict pin, else
 * show the generic unavailable state (also what a revoked/expired/removed live-access denial collapses to). */
export function reviewErrorAction(code: string): "refresh" | "unavailable" {
  return isStaleConflict(code) ? "refresh" : "unavailable";
}

/** A decision the reviewer prepared against `pinnedSha` is invalidated once the finding is re-read at a
 * different hash (a new version / edited record) or masked (`null`): the reviewer must inspect and re-pin the
 * current version rather than submit a decision about content they no longer see. */
export function pendingDecisionInvalidated(
  pinnedSha: string | null,
  currentSha: string | null,
): boolean {
  if (pinnedSha === null) return true;
  return pinnedSha !== currentSha;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PROJECT_RE = /^[A-Za-z0-9_-]{1,64}$/; // matches evidenceProjectId (a slug, not a UUID)

export interface ReviewerLinkContext {
  ownerId: string;
  projectId: string;
  findingRowId: string;
}

/**
 * Resolve the review route's search params into a mode. A reviewer opens a finding they were assigned via an
 * owner-shared link that MUST carry the full `owner`+`project`+`finding` context (the reviewer need not own a
 * project). No params → owner-management mode (`"owner"`). A partial or malformed reviewer link is REJECTED
 * (`"invalid"`) rather than silently falling back to the reviewer's own project.
 */
export function reviewerLinkContext(search: {
  owner?: string;
  project?: string;
  finding?: string;
}): { mode: "owner" } | { mode: "reviewer"; context: ReviewerLinkContext } | { mode: "invalid" } {
  const owner = search.owner?.trim() ?? "";
  const project = search.project?.trim() ?? "";
  const finding = search.finding?.trim() ?? "";
  if (!owner && !project && !finding) return { mode: "owner" };
  if (!UUID_RE.test(owner) || !PROJECT_RE.test(project) || !UUID_RE.test(finding))
    return { mode: "invalid" };
  return {
    mode: "reviewer",
    context: { ownerId: owner, projectId: project, findingRowId: finding },
  };
}

/** Build the copyable, in-app scoped review link PATH the owner shares after granting (no external send). It
 * carries the exact owner/project/finding the assigned reviewer's requests need. The route/search encoding is
 * origin-independent; `absoluteReviewerLink` prefixes the application origin at the browser boundary. */
export function buildReviewerLink(ctx: ReviewerLinkContext): string {
  const p = new URLSearchParams({
    owner: ctx.ownerId,
    project: ctx.projectId,
    finding: ctx.findingRowId,
  });
  return `/app/citation-review?${p.toString()}`;
}

// An application ORIGIN only (scheme + host [+ port]); anything with a path/query/fragment, credentials or a
// non-http(s) scheme is refused so a share link can never be built onto a foreign or malformed base.
const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;

/**
 * The FULL shareable review URL: the validated current application origin (`window.location.origin` at the
 * browser boundary — never a hard-coded host) + the scoped in-app path. When no valid origin is available
 * (server render, a malformed value) the honest in-app path is returned rather than a fabricated host, and
 * `absolute` says which one the caller got.
 */
export function absoluteReviewerLink(
  ctx: ReviewerLinkContext,
  origin: string | null | undefined,
): { href: string; absolute: boolean } {
  const path = buildReviewerLink(ctx);
  const o = origin?.trim() ?? "";
  if (!ORIGIN_RE.test(o)) return { href: path, absolute: false };
  return { href: o + path, absolute: true };
}

/* ----------------------------------------------------- reviewer form recovery */

/**
 * The reviewer decision form's ACTUAL state machine (consumed via `useReducer` by `ReviewerFinding`), pure
 * so the recovery transitions the security review cares about are deterministic and unit-tested:
 * - a pending decision + note are bound to the exact inspected hash (`pinnedSha`); a (re)read at a DIFFERENT
 *   hash (new/edited version) or a mask (`null`) clears them;
 * - a `citation_review_stale` / `citation_review_conflict` submit result EXPLICITLY clears the pending
 *   decision + note (a conflict can happen at the SAME record hash — a different decision/note already
 *   exists — so the hash-bound reset alone would let the same selection be resubmitted blindly), sets the
 *   `refresh` notice and never retries;
 * - a withdrawn receipt id is remembered so a receipt list the UI can no longer refresh (assignment revoked)
 *   does not keep offering the withdrawn receipt;
 * - a NON-stale submit failure (forbidden/unavailable: the server refused this actor) sets an independent
 *   `denied` flag that hides the cached finding material for the rest of this mount. It is STICKY: no
 *   withdrawal start/failure/success clears it (a withdrawal must never un-hide a permission refusal); the
 *   reviewer re-opens the link, which mounts fresh and performs a new authorized read.
 */
export interface ReviewerFormState {
  decision: CitationReviewDecision | "";
  note: string;
  busy: boolean;
  action: "refresh" | null;
  /** Server refused this actor's decision: hide the cached finding until a fresh mount re-reads it. */
  denied: boolean;
  /** The finding hash the pending decision/note were prepared against (`null` = none inspected yet). */
  pinnedSha: string | null;
  withdraw: "ok" | "failed" | null;
  withdrawnIds: readonly string[];
}
export const initialReviewerForm: ReviewerFormState = {
  decision: "",
  note: "",
  busy: false,
  action: null,
  denied: false,
  pinnedSha: null,
  withdraw: null,
  withdrawnIds: [],
};
export type ReviewerFormEvent =
  | { type: "decision"; decision: CitationReviewDecision | "" }
  | { type: "note"; note: string }
  | { type: "view"; currentSha: string | null }
  | { type: "submit_start" }
  | { type: "submit_ok" }
  | { type: "submit_failed"; code: string }
  | { type: "withdraw_start" }
  | { type: "withdraw_ok"; id: string }
  | { type: "withdraw_failed" };

export function reviewerFormReducer(s: ReviewerFormState, e: ReviewerFormEvent): ReviewerFormState {
  switch (e.type) {
    case "decision":
      return s.busy ? s : { ...s, decision: e.decision };
    case "note":
      return s.busy ? s : { ...s, note: e.note };
    case "view":
      // Same hash re-read (e.g. a refetch after a same-hash conflict) keeps whatever the explicit clear left.
      if (e.currentSha === s.pinnedSha) return s;
      return { ...s, pinnedSha: e.currentSha, decision: "", note: "" };
    case "submit_start":
      return { ...s, busy: true, action: null, withdraw: null };
    case "submit_ok":
      return { ...s, busy: false, decision: "", note: "", action: null };
    case "submit_failed":
      // Stale/conflict: clear the pending selection UNCONDITIONALLY (the hash may be unchanged), then the
      // caller re-reads the finding; the reviewer must inspect and choose again — never a blind resubmit.
      // Anything else is a refusal of this actor: mark `denied` (sticky) so the cached finding is hidden.
      return reviewErrorAction(e.code) === "refresh"
        ? { ...s, busy: false, action: "refresh", decision: "", note: "" }
        : { ...s, busy: false, action: null, denied: true };
    case "withdraw_start":
      // `denied` is deliberately untouched here and below: a withdrawal never clears a permission refusal.
      return { ...s, busy: true, action: null, withdraw: null };
    case "withdraw_ok":
      return { ...s, busy: false, withdraw: "ok", withdrawnIds: [...s.withdrawnIds, e.id] };
    case "withdraw_failed":
      return { ...s, busy: false, withdraw: "failed" };
  }
}

/** Whether the submit button/handler may fire: the guard must allow it AND no read of the finding or the
 * receipts may be in flight (a decision is never sent against a version that is being re-read). Used by BOTH
 * the disabled state and the handler itself, so a click racing a refetch is refused, not just greyed out. */
export function canSubmitReview(input: { guard: ReviewSubmitGuard; fetching: boolean }): boolean {
  return input.guard.allowed && !input.fetching;
}

/** Whether the reviewer surface must render NO finding material: the current read errored (revoked/expired —
 * React Query still holds the last data, which must not be shown) OR the server refused this actor's decision
 * (`denied`, sticky for the mount). Only the reviewer's own receipt controls remain in that state. */
export function reviewerSurfaceHidden(input: {
  viewIsError: boolean;
  form: ReviewerFormState;
}): boolean {
  return input.viewIsError || input.form.denied;
}

/**
 * Whether finding material may be EXPOSED at all: only after THIS mount's own scoped read has actually
 * SUCCEEDED (`viewIsSuccess`), never on the mere presence of data (a cache from an earlier mount, a
 * placeholder, or data retained beside an error), and never while denied. Combined with a per-mount query key
 * (`reviewerQueryKeys`) this is what makes "re-open the link → fresh authorized read" true: a remount starts
 * with no data and shows nothing until its own read returns; a later background failure (`viewIsError`) hides
 * again; a later background success is a new authorized read and exposes again.
 */
export function reviewerMaterialExposed(input: {
  viewIsSuccess: boolean;
  viewIsError: boolean;
  form: ReviewerFormState;
}): boolean {
  return input.viewIsSuccess && !input.viewIsError && !input.form.denied;
}

let reviewerMountCounter = 0;
/** A token unique to one mount of the reviewer surface (never derived from tree position, so a remount at the
 * same place gets a NEW token). It scopes the query keys below so a new mount can never observe a previous
 * mount's cached finding/receipt data — the previous entries are simply unobserved (and, with `gcTime: 0`,
 * dropped) rather than the whole client cache being destroyed. */
export function newReviewerMountToken(): string {
  reviewerMountCounter += 1;
  return `mount-${reviewerMountCounter}-${Date.now().toString(36)}`;
}

/** The reviewer surface's two query keys, scoped by actor + owner + project + finding AND the mount token. */
export function reviewerQueryKeys(
  actorId: string,
  target: ReviewerLinkContext,
  mountToken: string,
): { view: readonly string[]; reviews: readonly string[] } {
  const scope = [
    actorId,
    target.ownerId,
    target.projectId,
    target.findingRowId,
    mountToken,
  ] as const;
  return {
    view: ["citation-for-review", ...scope],
    reviews: ["citation-reviews", ...scope],
  };
}

/** The caller's own ACTIVE receipt (server-flagged `mine`, not withdrawn, not withdrawn locally in this
 * session). Works on a receipt page the UI can no longer refresh (assignment revoked): the released
 * `remove_ai_citation_finding_review` lets a reviewer withdraw their OWN receipt without a current
 * assignment, and the receipt's decision is the reviewer's own — never the owner's finding material. */
export function ownActiveReceipt<T extends { id: string; mine: boolean; withdrawn: boolean }>(
  reviews: readonly T[] | undefined,
  withdrawnIds: readonly string[],
): T | null {
  return reviews?.find((r) => r.mine && !r.withdrawn && !withdrawnIds.includes(r.id)) ?? null;
}

/* --------------------------------------------------------- accuracy display */

/**
 * The displayable facts of one LIVE assessed-accuracy entry, taken from the real read contract
 * (`citationAccuracyResolutionSchema`): the reviewer's recorded human judgement (`humanStatus`, history) and
 * the server-recomputed `resolution` are DISTINCT and both shown; there is no `status` field on this entry
 * (typing this input as the contract type makes a wrong field a compile error, not an `undefined` render).
 */
export function accuracyEntryDisplay(a: CitationAccuracyResolution): {
  claim: string;
  factKind: string;
  humanStatus: string;
  resolution: CitationAccuracyResolution["resolution"];
  capturedOn: string | null;
} {
  return {
    claim: a.claimSpan,
    factKind: a.factKind,
    humanStatus: a.humanStatus,
    resolution: a.resolution,
    capturedOn: a.capturedAt ? a.capturedAt.slice(0, 10) : null,
  };
}

/**
 * The exact scope a finding-scoped assignment shares with the reviewer, as i18n keys, so the owner sees
 * "what will be shared" before granting. Kept as a stable list (not free text) so it cannot drift from the
 * server contract silently. `shared` is what the reviewer can inspect for THAT ONE finding; `withheld` stays
 * owner-only regardless of the grant.
 */
export const REVIEW_SHARE_SCOPE = {
  shared: [
    "citationReview.share.answerContent",
    "citationReview.share.selectedSourceMaterial",
    "citationReview.share.datedFacts",
    "citationReview.share.recordAndStatus",
  ],
  withheld: [
    "citationReview.share.notOtherFindings",
    "citationReview.share.notFindingsList",
    "citationReview.share.notArtifactBytes",
    "citationReview.share.notFactManagement",
    "citationReview.share.notExports",
  ],
} as const;
