/**
 * Citation Intelligence forward workflow (27 September 2026): accepted exact finding row/version → Plan
 * opportunity (create or attach, stable source reference) → manual Studio draft at zero AI cost → the EXISTING
 * version-bound approval/publication → improvement record bound to the exact published attempt → explicit owner
 * inspection. Pure helpers and a reducer, no React and no server access; the component is thin.
 *
 * Authority boundaries (unchanged): factual acceptance never grants publication permission; a Plan task, a
 * draft, an approval or a connector acknowledgement is never destination proof; `owner_attested` is an owner
 * observation, never independent proof; identities are the store's own (no UUID alias is fabricated).
 */
import { z } from "zod";
import {
  findingPriority,
  improvementSchema,
  isVerifiedImprovement,
  countDistinctSubstantiveChanges,
  taskIdSchema,
  type Finding,
  type Improvement,
} from "./citation-finding";
import type {
  CitationChangeBinding,
  CitationFindingSummary,
  CitationImprovementSummary,
  CitationPanelScope,
  CitationPublicationBinding,
  citationImprovementDetailSchema,
} from "./citation-record";
import { changeErrorKey } from "./citation-change";
import type { changeArtifactSchema } from "./citation-change";
import { citationPublicationBindingSchema } from "./citation-record";
import type { evidenceRowSchema } from "./publication-evidence";
import type { ApprovalProvenance } from "./citation-approval.server";
import { slugifyForPublish } from "./markdown";
import { assetTypeForContentType } from "./asset-type-for-content";
import type { ContentAsset, Language, Opportunity, OpportunitySourceRef, Priority } from "./types";

export type EvidenceRow = z.infer<typeof evidenceRowSchema>;
export type ChangeArtifact = z.infer<typeof changeArtifactSchema>;
export type CitationImprovementDetail = z.infer<typeof citationImprovementDetailSchema>;

/** `OpportunitySourceRef.sourceType` for a finding-derived task; `sourceRecordId` is the exact finding ROW id. */
export const CITATION_FINDING_SOURCE = "citation_finding";
/** Distinct substantive verified changes the retest gate needs (spec CI-3). */
export const REQUIRED_VERIFIED_CHANGES = 2;

// ---------------------------------------------------------------------------------------------------------
// Finding row ↔ Plan task
// ---------------------------------------------------------------------------------------------------------
export type FindingLinkStatus =
  "current" | "superseded" | "deleted" | "dismissed" | "dissent" | "second_review";
export interface FindingLink {
  rowId: string;
  findingId: string | null;
  pinnedVersion: number | null;
  headVersion: number | null;
  /** Live state of the pinned row against the CURRENT list: precedence deleted > dismissed > dissent >
   * second_review > superseded > current. The pin itself never moves. */
  status: FindingLinkStatus;
}
/** Resolve a pinned finding ROW id against the live finding list (all versions). */
export function findingLink(rowId: string, rows: readonly CitationFindingSummary[]): FindingLink {
  const key = rowId.toLowerCase();
  const pinned = rows.find((r) => r.id.toLowerCase() === key);
  if (!pinned)
    return { rowId, findingId: null, pinnedVersion: null, headVersion: null, status: "deleted" };
  const chain = rows.filter((r) => r.findingId.toLowerCase() === pinned.findingId.toLowerCase());
  const head = chain.reduce((m, r) => (r.version > m.version ? r : m), pinned);
  let status: FindingLinkStatus = "current";
  if (head.decision === "dismissed") status = "dismissed";
  else if (head.reviewStatus === "independent_dissent") status = "dissent";
  else if (head.decision === "needs_second_review") status = "second_review";
  else if (head.version > pinned.version) status = "superseded";
  return {
    rowId: pinned.id,
    findingId: pinned.findingId,
    pinnedVersion: pinned.version,
    headVersion: head.version,
    status,
  };
}
export function findingSourceRef(row: { id: string }, capturedAt: string): OpportunitySourceRef {
  return { sourceType: CITATION_FINDING_SOURCE, sourceRecordId: row.id, capturedAt };
}
export function findingRowIdsOf(o: Pick<Opportunity, "sourceRefs">): string[] {
  return (o.sourceRefs ?? [])
    .filter((r) => r.sourceType === CITATION_FINDING_SOURCE && typeof r.sourceRecordId === "string")
    .map((r) => r.sourceRecordId as string);
}
/** Non-deleted tasks that carry a stable reference to this exact finding row (archived ones included, shown). */
export function tasksForFinding(opps: readonly Opportunity[], rowId: string): Opportunity[] {
  const key = rowId.toLowerCase();
  return opps.filter(
    (o) => !o.deletedAt && findingRowIdsOf(o).some((id) => id.toLowerCase() === key),
  );
}
export type TaskStatus = "active" | "archived" | "deleted" | "missing";
/** Live state of a task id from the client store. A missing/deleted task is reported as such — an improvement
 * or a finding link that names it is never silently rebound to another task. */
export function taskStatus(
  opps: readonly Opportunity[],
  taskId: string,
): { status: TaskStatus; opportunity: Opportunity | null } {
  const o = opps.find((x) => x.id === taskId);
  if (!o) return { status: "missing", opportunity: null };
  if (o.deletedAt) return { status: "deleted", opportunity: o };
  if (o.status === "archived" || o.archivedAt) return { status: "archived", opportunity: o };
  return { status: "active", opportunity: o };
}
const PRIORITY: Record<"low" | "medium" | "high", Priority> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
/** A new Plan opportunity for an accepted finding row. Same lifecycle and mutators as manual Plan entries;
 * creation is a `manual` opportunity with the `ai_visibility` primary source and the exact row reference. */
export function opportunityFromFinding(input: {
  projectId: string;
  row: CitationFindingSummary;
  record: Finding | null;
  language: Language;
  capturedAt: string;
}): Omit<Opportunity, "id" | "status"> {
  const { row, record } = input;
  const observation = record?.observation.replace(/\s+/g, " ").trim() ?? "";
  const shortObservation = observation.length > 90 ? observation.slice(0, 87) + "…" : observation;
  const title = shortObservation
    ? `Citation gap: ${shortObservation}`
    : `Citation finding ${row.findingId.slice(0, 8)} v${row.version}`;
  return {
    projectId: input.projectId,
    title,
    language: input.language,
    contentType: "Service Page",
    searchIntent: "Informational",
    targetAudience: `${row.client.name} (${row.client.market})`,
    businessValue: `Close a reviewed AI citation gap (finding ${row.findingId.slice(0, 8)} v${row.version}).`,
    recommendedCta: "",
    priority: record ? PRIORITY[findingPriority(record)] : "Medium",
    source: "aiVisibility",
    creationMode: "manual",
    primarySource: "ai_visibility",
    sourceRefs: [findingSourceRef(row, input.capturedAt)],
    evidence: [
      { label: "citationFindingId", value: row.findingId },
      { label: "citationFindingVersion", value: row.version },
      { label: "citationFindingRow", value: row.id },
    ],
    reasonDiscovered: observation || "Reviewed citation finding",
    summary: observation || undefined,
  };
}
/** A linked MANUAL draft (no generation, no AI spend) for an existing task. It carries the task identity the
 * publication snapshot will record as `actionId`, so a later published attempt can be bound to this task. The
 * asset type follows the task's content type through the established Plan → Studio mapping (a finding-created
 * task is a Service Page, an attached Blog Article stays an article, so the WordPress post/page decision
 * downstream is the task's, not a hard-coded page). */
export function manualDraftForTask(o: Opportunity, id: string, now: string): ContentAsset {
  return {
    id,
    projectId: o.projectId,
    opportunityId: o.id,
    title: o.title,
    slug: slugifyForPublish(o.title),
    metaTitle: "",
    metaDescription: "",
    h1: o.title,
    outline: [],
    faq: [],
    cta: o.recommendedCta ?? "",
    markdown: `# ${o.title}\n\n${o.summary ?? ""}`.trimEnd() + "\n",
    internalLinks: [],
    schemaSuggestions: [],
    editorNotes:
      "Manual draft created from a reviewed citation finding (no AI generation). Replace this text with the approved change before requesting approval.",
    status: "Draft",
    updatedAt: now,
    createdAt: now,
    assetType: assetTypeForContentType(o.contentType),
    sourceOpportunityId: o.id,
    sourceOpportunityTitle: o.title,
    sourceType: "manual",
    language: o.language,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Published attempt ↔ improvement binding
// ---------------------------------------------------------------------------------------------------------
/** Only PUBLISHED attempts with a live URL whose recorded Plan action is exactly this task (newest first). A
 * started/rejected/unknown attempt, or one for another task, cannot be bound. */
export function publishedAttemptsForTask(
  rows: readonly EvidenceRow[],
  taskId: string,
): EvidenceRow[] {
  return rows
    .filter(
      (r) =>
        r.outcome === "published" &&
        !!r.outcomeData?.liveUrl &&
        r.action !== null &&
        r.action.id === taskId,
    )
    .sort(
      (a, b) => Date.parse(b.finishedAt ?? b.startedAt) - Date.parse(a.finishedAt ?? a.startedAt),
    );
}
export function bindingFromAttempt(row: EvidenceRow): CitationPublicationBinding {
  return citationPublicationBindingSchema.parse({
    publicationId: row.id,
    assetId: row.assetId,
    versionHash: row.versionHash,
    ownerInspection: null,
  });
}
/** Baseline captures must PRECEDE the publication (server authoritative; UI pre-check). */
export function eligibleBaselines<T extends { id: string; capturedAt: string }>(
  answers: readonly T[],
  publishedAt: string | null,
): T[] {
  if (!publishedAt) return [];
  const p = Date.parse(publishedAt);
  return answers.filter((a) => Date.parse(a.capturedAt) < p);
}
export interface ImprovementDraft {
  improvementId: string;
  /** Exact finding ROW ids the owner selected (heads only are offered; the server pins the current rows). */
  findingRowIds: string[];
  taskId: string;
  publicationId: string | null;
  /** Change-kind binding (listing/configuration): the approved artifact and the performed receipt the owner
   * chose; exclusive with `publicationId`. */
  changeArtifactId: string | null;
  changeReceiptId: string | null;
  approvedBy: string;
  description: string;
  baselineCaptureIds: string[];
  /** Head token of the logical improvement id (0/null for a new record). */
  expectedVersion: number;
  expectedHeadId: string | null;
}
export function newImprovementDraft(
  improvementId: string,
  taskId: string,
  ownerId: string,
): ImprovementDraft {
  return {
    improvementId,
    findingRowIds: [],
    taskId,
    publicationId: null,
    changeArtifactId: null,
    changeReceiptId: null,
    approvedBy: ownerId,
    description: "",
    baselineCaptureIds: [],
    expectedVersion: 0,
    expectedHeadId: null,
  };
}
export interface ForwardPayload {
  scope: CitationPanelScope;
  improvement: Improvement;
  /** Public-URL binding (null for a change-kind payload). */
  binding: CitationPublicationBinding | null;
  /** Change-kind binding (null for a public-URL payload). */
  changeBinding: CitationChangeBinding | null;
  /** The exact finding ROW ids the owner reviewed (Codex N1/R1): the server refuses a newly minted version whose
   * resolved rows differ, so a finding version saved by another tab between review and save is never pinned
   * silently. Identical lost-response retries are unaffected (nothing new is pinned). */
  expectedFindingRowIds: string[];
}
export type PayloadIssue =
  | "findings_required"
  | "finding_unavailable"
  | "finding_not_bindable"
  | "scope_mixed"
  | "task_invalid"
  | "publication_required"
  | "publication_task_mismatch"
  | "description_required"
  | "baseline_after_publication"
  | "approval_unknown"
  | "approval_unavailable"
  | "artifact_required"
  | "artifact_unapproved"
  | "receipt_required"
  | "receipt_stale"
  | "invalid";
/** Draft issues whose copy lives in the change-evidence namespace (`citationChange.issue.*`). */
export const CHANGE_DRAFT_ISSUES: ReadonlySet<string> = new Set([
  "artifact_required",
  "artifact_unapproved",
  "receipt_required",
  "receipt_stale",
]);
export function draftIssueKey(issue: string): string {
  return CHANGE_DRAFT_ISSUES.has(issue)
    ? `citationChange.issue.${issue}`
    : `citationForward.issue.${issue}`;
}
/** Build the exact frozen payload from a draft against the CURRENT dependencies; every field of the binding and
 * of the declared approval facts derives from the chosen published attempt (never typed by the owner). The
 * approver comes from the owner-scoped approval provenance of the attempt's exact asset version (Codex N2/S3):
 * the owner, or the delegate reviewer recorded on the approval; an unapproved, revoked or unresolved approval
 * blocks the payload instead of defaulting to the owner. */
export function buildImprovementPayload(
  draft: ImprovementDraft,
  deps: {
    rows: readonly CitationFindingSummary[];
    attempts: readonly EvidenceRow[];
    answers: readonly { id: string; capturedAt: string }[];
    /** Provenance keyed by publication attempt id; absent = not loaded (never assumed). */
    approvals?: ReadonlyMap<string, ApprovalProvenance>;
    /** Change artifacts of the project (with their live approval and receipts) for listing/configuration kinds. */
    artifacts?: readonly ChangeArtifact[];
  },
): { ok: true; payload: ForwardPayload } | { ok: false; issues: PayloadIssue[] } {
  if (draft.changeArtifactId !== null) return buildChangePayload(draft, deps);
  const issues: PayloadIssue[] = [];
  if (draft.findingRowIds.length === 0) issues.push("findings_required");
  const selected = draft.findingRowIds.map((id) => findingLink(id, deps.rows));
  if (selected.some((l) => l.status === "deleted")) issues.push("finding_unavailable");
  if (selected.some((l) => l.status === "dismissed" || l.status === "superseded"))
    issues.push("finding_not_bindable");
  const rowsById = new Map(deps.rows.map((r) => [r.id.toLowerCase(), r]));
  const selectedRows = draft.findingRowIds
    .map((id) => rowsById.get(id.toLowerCase()))
    .filter((r): r is CitationFindingSummary => !!r);
  const scopeKey = (r: CitationFindingSummary) =>
    JSON.stringify([r.panelId.toLowerCase(), r.panelVersion, r.client.name, r.client.market]);
  if (selectedRows.length > 1 && new Set(selectedRows.map(scopeKey)).size > 1)
    issues.push("scope_mixed");
  if (!taskIdSchema.safeParse(draft.taskId).success) issues.push("task_invalid");
  const attempt = draft.publicationId
    ? deps.attempts.find((a) => a.id === draft.publicationId)
    : undefined;
  if (!attempt) issues.push("publication_required");
  else if (!publishedAttemptsForTask([attempt], draft.taskId).length)
    issues.push("publication_task_mismatch");
  if (draft.description.trim().length === 0) issues.push("description_required");
  const provenance = attempt ? deps.approvals?.get(attempt.id) : undefined;
  if (attempt && !provenance) issues.push("approval_unknown");
  else if (attempt && (!provenance!.approved || !provenance!.approverId))
    issues.push("approval_unavailable");
  if (attempt) {
    const eligible = new Set(
      eligibleBaselines(deps.answers, attempt.finishedAt ?? attempt.startedAt).map((a) => a.id),
    );
    if (draft.baselineCaptureIds.some((id) => !eligible.has(id)))
      issues.push("baseline_after_publication");
  }
  if (issues.length || !attempt || !provenance?.approverId || selectedRows.length === 0)
    return { ok: false, issues };
  const first = selectedRows[0];
  const scope: CitationPanelScope = {
    panelId: first.panelId,
    panelVersion: first.panelVersion,
    client: { name: first.client.name, market: first.client.market },
  };
  const findingIds = [...new Set(selectedRows.map((r) => r.findingId))];
  const improvement = improvementSchema.safeParse({
    improvementId: draft.improvementId,
    findingIds,
    taskId: draft.taskId,
    change: {
      description: draft.description.trim(),
      approvedVersion: attempt.versionHash,
      approvedBy: provenance.approverId,
      approvedAt: provenance.approvedAt ?? attempt.finishedAt ?? attempt.startedAt,
    },
    destination: { kind: "public_url", reference: attempt.outcomeData!.liveUrl },
    baselineCaptureIds: [...new Set(draft.baselineCaptureIds)],
    verification: null,
  });
  if (!improvement.success) return { ok: false, issues: ["invalid"] };
  return {
    ok: true,
    payload: {
      scope,
      improvement: improvement.data,
      binding: bindingFromAttempt(attempt),
      changeBinding: null,
      expectedFindingRowIds: selectedRows.map((r) => r.id),
    },
  };
}
/** Listing/configuration payload (candidate 20260928120000): every binding field derives from the chosen
 * approved artifact and its performed receipt — the artifact digest is the approved version, the approver is
 * the artifact's CURRENT approver (owner or delegate), the destination is the artifact's kind + reference. */
function buildChangePayload(
  draft: ImprovementDraft,
  deps: {
    rows: readonly CitationFindingSummary[];
    answers: readonly { id: string; capturedAt: string }[];
    artifacts?: readonly ChangeArtifact[];
  },
): { ok: true; payload: ForwardPayload } | { ok: false; issues: PayloadIssue[] } {
  const issues: PayloadIssue[] = [];
  if (draft.findingRowIds.length === 0) issues.push("findings_required");
  const selected = draft.findingRowIds.map((id) => findingLink(id, deps.rows));
  if (selected.some((l) => l.status === "deleted")) issues.push("finding_unavailable");
  if (selected.some((l) => l.status === "dismissed" || l.status === "superseded"))
    issues.push("finding_not_bindable");
  const rowsById = new Map(deps.rows.map((r) => [r.id.toLowerCase(), r]));
  const selectedRows = draft.findingRowIds
    .map((id) => rowsById.get(id.toLowerCase()))
    .filter((r): r is CitationFindingSummary => !!r);
  const scopeKey = (r: CitationFindingSummary) =>
    JSON.stringify([r.panelId.toLowerCase(), r.panelVersion, r.client.name, r.client.market]);
  if (selectedRows.length > 1 && new Set(selectedRows.map(scopeKey)).size > 1)
    issues.push("scope_mixed");
  if (!taskIdSchema.safeParse(draft.taskId).success) issues.push("task_invalid");
  const artifact = deps.artifacts?.find((a) => a.id === draft.changeArtifactId);
  if (!artifact) issues.push("artifact_required");
  const approval = artifact?.approval;
  if (artifact && (!approval || !approval.current || !approval.approverId))
    issues.push("artifact_unapproved");
  const receipt = artifact?.receipts.find((r) => r.id === draft.changeReceiptId);
  if (artifact && !receipt) issues.push("receipt_required");
  // T: a receipt from an earlier approval epoch is listed for audit but never bindable.
  if (receipt && receipt.current === false) issues.push("receipt_stale");
  if (draft.description.trim().length === 0) issues.push("description_required");
  if (receipt) {
    const eligible = new Set(eligibleBaselines(deps.answers, receipt.performedAt).map((a) => a.id));
    if (draft.baselineCaptureIds.some((id) => !eligible.has(id)))
      issues.push("baseline_after_publication");
  }
  if (issues.length || !artifact || !approval?.approverId || !receipt || selectedRows.length === 0)
    return { ok: false, issues };
  const first = selectedRows[0];
  const scope: CitationPanelScope = {
    panelId: first.panelId,
    panelVersion: first.panelVersion,
    client: { name: first.client.name, market: first.client.market },
  };
  const improvement = improvementSchema.safeParse({
    improvementId: draft.improvementId,
    findingIds: [...new Set(selectedRows.map((r) => r.findingId))],
    taskId: draft.taskId,
    change: {
      description: draft.description.trim(),
      approvedVersion: artifact.artifactSha256,
      approvedBy: approval.approverId,
      approvedAt: approval.approvedAt ?? receipt.performedAt,
    },
    destination: { kind: artifact.kind, reference: artifact.reference },
    baselineCaptureIds: [...new Set(draft.baselineCaptureIds)],
    verification: null,
  });
  if (!improvement.success) return { ok: false, issues: ["invalid"] };
  return {
    ok: true,
    payload: {
      scope,
      improvement: improvement.data,
      binding: null,
      changeBinding: {
        artifactId: artifact.id,
        artifactSha256: artifact.artifactSha256,
        receiptId: receipt.id,
        ownerInspection: null,
      },
      expectedFindingRowIds: selectedRows.map((r) => r.id),
    },
  };
}
/** The owner-inspection save: a NEW version of the stored record carrying the structured inspection. Only a
 * POSITIVE result may carry a `verification` block (the server derives its instants/provenance and refuses a
 * negative/inconclusive-backed one); it also needs the baselines it improves on. Opening the URL, an HTTP 200,
 * or a connector acknowledgement never produce an inspection — only this explicit owner choice does. */
export type InspectionResult = CitationPublicationBinding extends { ownerInspection: infer I }
  ? I extends { checkResult: infer R }
    ? R
    : never
  : never;
export function inspectionPayload(
  detail: Pick<
    CitationImprovementDetail,
    "record" | "publicationBinding" | "boundFindingRowIds" | "changeBinding"
  >,
  input: {
    checkResult: "shows_approved_content" | "does_not_show" | "inconclusive";
    observedAt: string;
    ownerId: string;
  },
):
  | {
      ok: true;
      improvement: Improvement;
      binding: CitationPublicationBinding | null;
      changeBinding: CitationChangeBinding | null;
      /** The rows the displayed record is bound to: an inspection never rebinds to an unreviewed head. */
      expectedFindingRowIds: string[];
    }
  | { ok: false; issue: "binding_required" | "baseline_required" } {
  const change = detail.changeBinding ?? null;
  if (change) {
    if (change.artifactDeleted) return { ok: false, issue: "binding_required" };
    const positive = input.checkResult === "shows_approved_content";
    if (positive && detail.record.baselineCaptureIds.length === 0)
      return { ok: false, issue: "baseline_required" };
    return {
      ok: true,
      improvement: {
        ...detail.record,
        verification: positive
          ? {
              method: "owner_inspection",
              receipt: "owner_inspection",
              verifiedAt: input.observedAt,
              reviewer: input.ownerId,
            }
          : null,
      },
      binding: null,
      changeBinding: {
        artifactId: change.artifactId,
        artifactSha256: change.artifactSha256,
        receiptId: change.receiptId,
        ownerInspection: {
          observedAt: input.observedAt,
          checkResult: input.checkResult,
          observedReference: change.reference,
        },
      },
      expectedFindingRowIds: [...detail.boundFindingRowIds],
    };
  }
  const binding = detail.publicationBinding;
  if (!binding) return { ok: false, issue: "binding_required" };
  const positive = input.checkResult === "shows_approved_content";
  if (positive && detail.record.baselineCaptureIds.length === 0)
    return { ok: false, issue: "baseline_required" };
  const improvement: Improvement = {
    ...detail.record,
    verification: positive
      ? {
          method: "owner_inspection",
          receipt: "owner_inspection",
          verifiedAt: input.observedAt,
          reviewer: input.ownerId,
        }
      : null,
  };
  return {
    ok: true,
    improvement,
    binding: {
      ...binding,
      ownerInspection: {
        observedAt: input.observedAt,
        checkResult: input.checkResult,
        observedUrl: detail.record.destination.reference,
      },
    },
    changeBinding: null,
    expectedFindingRowIds: [...detail.boundFindingRowIds],
  };
}
/** The complete inspection REQUEST for the displayed detail row (Codex N1/R2): the head token is the displayed
 * row itself — never a newer list head — so an inspection of a historical row cannot author a correction against
 * a different head. A row that is no longer the head of its logical improvement is refused locally (`not_head`);
 * the server's expected-head guard still refuses the race the client could not see. The request is a frozen
 * value: the caller keeps it for an identical retry after a lost response. */
export type InspectionRequest = {
  scope: CitationPanelScope;
  improvement: Improvement;
  binding: CitationPublicationBinding | null;
  changeBinding: CitationChangeBinding | null;
  expectedVersion: number;
  expectedHeadId: string;
  expectedFindingRowIds: string[];
};
export function inspectionRequest(
  detail: Pick<
    CitationImprovementDetail,
    | "id"
    | "improvementId"
    | "version"
    | "panelId"
    | "panelVersion"
    | "client"
    | "record"
    | "publicationBinding"
    | "boundFindingRowIds"
    | "changeBinding"
  >,
  summaries: readonly CitationImprovementSummary[],
  input: {
    checkResult: "shows_approved_content" | "does_not_show" | "inconclusive";
    observedAt: string;
    ownerId: string;
  },
):
  | { ok: true; request: InspectionRequest }
  | { ok: false; issue: "binding_required" | "baseline_required" | "not_head" } {
  const head = improvementHead(detail.improvementId, summaries);
  if (head.expectedHeadId !== null && head.expectedHeadId.toLowerCase() !== detail.id.toLowerCase())
    return { ok: false, issue: "not_head" };
  const built = inspectionPayload(detail, input);
  if (!built.ok) return built;
  return {
    ok: true,
    request: {
      scope: {
        panelId: detail.panelId,
        panelVersion: detail.panelVersion,
        client: { name: detail.client.name, market: detail.client.market },
      },
      improvement: built.improvement,
      binding: built.binding,
      changeBinding: built.changeBinding,
      expectedVersion: detail.version,
      expectedHeadId: detail.id,
      expectedFindingRowIds: built.expectedFindingRowIds,
    },
  };
}
/** Server codes → i18n keys (fixed allowlist; anything else is the generic unavailable message). */
export function forwardErrorKey(code: string): string {
  switch (code) {
    case "citation_improvement_version_conflict":
      return "citationForward.error.conflict";
    case "citation_improvement_finding_stale":
      return "citationForward.error.findingStale";
    case "citation_improvement_finding_unresolved":
      return "citationForward.error.findingUnresolved";
    case "citation_improvement_baseline_unresolved":
      return "citationForward.error.baselineUnresolved";
    case "citation_improvement_binding_unresolved":
      return "citationForward.error.bindingUnresolved";
    case "citation_improvement_binding_unapproved":
      return "citationForward.error.bindingUnapproved";
    case "citation_improvement_binding_receipt_stale":
      return "citationChange.error.receiptStale";
    case "citation_improvement_binding_approval_mismatch":
      return "citationForward.error.approvalMismatch";
    case "citation_improvement_binding_task_mismatch":
      return "citationForward.error.taskMismatch";
    case "citation_improvement_binding_destination_mismatch":
      return "citationForward.error.destinationMismatch";
    case "citation_improvement_binding_inspection_invalid":
      return "citationForward.error.inspectionInvalid";
    case "citation_improvement_verification_unbacked":
      return "citationForward.error.verificationUnbacked";
    case "citation_improvement_scope_drift":
      return "citationForward.error.scopeDrift";
    case "citation_improvement_capacity":
      return "citationForward.error.capacity";
    case "citation_improvement_reviewer_mismatch":
    case "invalid_citation_improvement":
      return "citationForward.error.invalid";
    default:
      if (code.startsWith("citation_change_") || code.startsWith("citation_inspection_"))
        return changeErrorKey(code);
      return "citationForward.error.unavailable";
  }
}
/** The CURRENT head row of every logical improvement id in a list that carries all versions (the released read
 * returns history too). Earlier rows are audit history: their historical statuses never count as current. */
export function currentImprovementHeads(
  summaries: readonly CitationImprovementSummary[],
): CitationImprovementSummary[] {
  const heads = new Map<string, CitationImprovementSummary>();
  for (const s of summaries) {
    const key = s.improvementId.toLowerCase();
    const h = heads.get(key);
    if (!h || s.version > h.version) heads.set(key, s);
  }
  return [...heads.values()];
}
/** Retest readiness from AUTHORITATIVE live statuses of the CURRENT heads only (Codex N1/R3): a later negative,
 * inconclusive or correcting version of an improvement removes its earlier positive from every count.
 * Distinctness needs the immutable records, so only the attested heads' details are consulted; nothing is
 * invented, no comparison round is computed here, and `owner_attested` remains an owner observation. */
export type AttestedDetail = Pick<
  CitationImprovementDetail,
  | "id"
  | "improvementId"
  | "version"
  | "verificationStatus"
  | "evidenceStatus"
  | "record"
  | "independentStatus"
  | "verifiedEligible"
  | "verifiedAt"
>;
/** Heads whose details the readiness gate needs: owner-attested ones and any the server marks eligible (a
 * positive independent inspection over a delivered/receipted change). */
export function readinessDetailIds(summaries: readonly CitationImprovementSummary[]): string[] {
  return currentImprovementHeads(summaries)
    .filter((s) => s.verificationStatus === "owner_attested" || s.verifiedEligible === true)
    .map((s) => s.id);
}
export function retestReadiness(
  allSummaries: readonly CitationImprovementSummary[],
  attestedDetails: ReadonlyMap<string, AttestedDetail>,
) {
  const summaries = currentImprovementHeads(allSummaries);
  // Codex N2/S2: the detail read is the NEWER authoritative status. A head counts only when its fresh detail
  // (same row, same logical id and version) is STILL eligible: owner_attested with a recorded baseline, or —
  // candidate 20260928120000 — the server's `verifiedEligible` predicate (a positive independent inspection over
  // a delivered/receipted change, and NEVER a disputed delivery). A revoke, baseline/source removal, dismissal
  // or a newly active negative inspection between the two reads drops it.
  const verified = summaries
    .filter((s) => s.verificationStatus === "owner_attested" || s.verifiedEligible === true)
    .map((s) => {
      const d = attestedDetails.get(s.id);
      if (
        !d ||
        d.id !== s.id ||
        d.improvementId.toLowerCase() !== s.improvementId.toLowerCase() ||
        d.version !== s.version
      )
        return null;
      const live = {
        verificationStatus: d.verificationStatus,
        record: d.record,
        verifiedEligible: d.verifiedEligible,
        independentStatus: d.independentStatus,
        verifiedAt: d.verifiedAt,
      };
      if (typeof d.verifiedEligible !== "boolean" && d.evidenceStatus !== "baseline_recorded")
        return null;
      return isVerifiedImprovement(live) ? d.record : null;
    })
    .filter((r): r is Improvement => !!r);
  return {
    attested: summaries.filter((s) => s.verificationStatus === "owner_attested").length,
    distinctVerified: countDistinctSubstantiveChanges(verified),
    required: REQUIRED_VERIFIED_CHANGES,
    connectorReceipts: summaries.filter((s) => s.verificationStatus === "connector_receipt").length,
    approvalBound: summaries.filter((s) => s.verificationStatus === "approval_bound").length,
    unverified: summaries.filter((s) => s.verificationStatus === "unverified").length,
    baselineMissing: summaries.filter((s) => s.evidenceStatus === "baseline_missing").length,
    receiptsRecorded: summaries.filter((s) => s.verificationStatus === "receipt_recorded").length,
    independentlyInspected: summaries.filter(
      (s) => s.independentStatus === "independently_inspected",
    ).length,
    disputed: summaries.filter((s) => s.independentStatus === "disputed").length,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Reducer: frozen payload, owner/project identity, head token, conflict continuation
// ---------------------------------------------------------------------------------------------------------
export interface ForwardState {
  identity: string;
  stage: "idle" | "draft" | "review" | "saving" | "saved";
  draft: ImprovementDraft | null;
  /** The exact payload reviewed by the owner; the save sends THIS, never a rebuilt one. */
  reviewed: ForwardPayload | null;
  issues: PayloadIssue[];
  errorKey: string | null;
  conflict: { version: number; id: string } | null;
  savedVersion: number | null;
}
export type ForwardAction =
  | { type: "scopeChanged"; identity: string }
  | { type: "start"; draft: ImprovementDraft }
  | { type: "edit"; patch: Partial<ImprovementDraft> }
  | { type: "review"; result: ReturnType<typeof buildImprovementPayload> }
  | { type: "back" }
  | { type: "saveStarted" }
  | { type: "saved"; version: number }
  | { type: "saveFailed"; code: string }
  | { type: "conflictLoaded"; head: { version: number; id: string } }
  | { type: "continueOnHead" }
  | { type: "cancel" };
export function initialForwardState(identity: string): ForwardState {
  return {
    identity,
    stage: "idle",
    draft: null,
    reviewed: null,
    issues: [],
    errorKey: null,
    conflict: null,
    savedVersion: null,
  };
}
export function forwardReducer(state: ForwardState, action: ForwardAction): ForwardState {
  switch (action.type) {
    case "scopeChanged":
      // A draft, a reviewed payload or a pending result started under another owner/project is discarded.
      return action.identity === state.identity ? state : initialForwardState(action.identity);
    case "start":
      return { ...initialForwardState(state.identity), stage: "draft", draft: action.draft };
    case "edit":
      if (!state.draft || state.stage === "saving") return state;
      return {
        ...state,
        stage: "draft",
        draft: { ...state.draft, ...action.patch },
        reviewed: null,
        issues: [],
        errorKey: null,
      };
    case "review":
      if (!state.draft || state.stage === "saving") return state;
      return action.result.ok
        ? { ...state, stage: "review", reviewed: action.result.payload, issues: [], errorKey: null }
        : { ...state, stage: "draft", reviewed: null, issues: action.result.issues };
    case "back":
      return state.stage === "review" ? { ...state, stage: "draft", reviewed: null } : state;
    case "saveStarted":
      return state.stage === "review" && state.reviewed
        ? { ...state, stage: "saving", errorKey: null, conflict: null }
        : state;
    case "saved":
      return {
        ...state,
        stage: "saved",
        savedVersion: action.version,
        draft: null,
        reviewed: null,
      };
    case "saveFailed":
      // The frozen payload is KEPT for an identical retry (idempotent server digest); the stage returns to
      // review so the owner sees exactly what will be resent.
      return state.stage === "saving"
        ? { ...state, stage: "review", errorKey: forwardErrorKey(action.code) }
        : state;
    case "conflictLoaded":
      return state.errorKey === "citationForward.error.conflict"
        ? { ...state, conflict: action.head }
        : state;
    case "continueOnHead":
      // Adopt the CURRENT head token and re-review: the owner must inspect the payload again on the new head.
      if (!state.conflict || !state.draft) return state;
      return {
        ...state,
        stage: "draft",
        reviewed: null,
        errorKey: null,
        draft: {
          ...state.draft,
          expectedVersion: state.conflict.version,
          expectedHeadId: state.conflict.id,
        },
        conflict: null,
      };
    case "cancel":
      return initialForwardState(state.identity);
    default:
      return state;
  }
}
/** The head token of a logical improvement id from the live list (0/null when absent). */
export function improvementHead(
  improvementId: string,
  summaries: readonly CitationImprovementSummary[],
): { expectedVersion: number; expectedHeadId: string | null } {
  const chain = summaries.filter(
    (s) => s.improvementId.toLowerCase() === improvementId.toLowerCase(),
  );
  if (chain.length === 0) return { expectedVersion: 0, expectedHeadId: null };
  const head = chain.reduce((m, s) => (s.version > m.version ? s : m));
  return { expectedVersion: head.version, expectedHeadId: head.id };
}

// ---------------------------------------------------------------------------------------------------------
// Interaction logic kept pure so it can be exercised with deferred promises (Codex N1/R5, R6): the component
// only wires these to React state.
// ---------------------------------------------------------------------------------------------------------
export type CreateTaskOutcome =
  | { outcome: "created"; task: Opportunity }
  | { outcome: "duplicate"; tasks: Opportunity[] }
  | { outcome: "read_failed" | "not_eligible" | "identity_mismatch" | "stale" };
/** Create a Plan task from an exact finding row ONLY after the authenticated detail read succeeded, returned the
 * very row that was selected, and that row is still eligible — and only while the caller is still mounted under
 * the identity it started for. A rejected/changed read, a dismissed head or a lost identity creates nothing.
 * `existing` is consulted AFTER the read, immediately before the mutation: a non-deleted task of this project
 * already pinned to the exact row (created or attached meanwhile, archived included) means nothing is created and
 * those tasks are returned instead — a second click or a race never duplicates work or rebinds anything. */
export async function createTaskFromFinding(input: {
  projectId: string;
  row: CitationFindingSummary;
  language: Language;
  read: () => Promise<
    {
      id: string;
      findingId: string;
      version: number;
      decision: CitationFindingSummary["decision"];
    } & ({ recordValid: true; record: Finding } | { recordValid: false; record: unknown })
  >;
  isCurrent: () => boolean;
  /** Live, project-scoped, non-deleted tasks pinned to the exact row (evaluated at mutation time). */
  existing: () => readonly Opportunity[];
  add: (o: Omit<Opportunity, "id" | "status">) => Opportunity;
  now?: () => string;
}): Promise<CreateTaskOutcome> {
  let detail: Awaited<ReturnType<typeof input.read>>;
  try {
    detail = await input.read();
  } catch {
    return { outcome: "read_failed" };
  }
  if (!input.isCurrent()) return { outcome: "stale" };
  if (
    detail.id.toLowerCase() !== input.row.id.toLowerCase() ||
    detail.findingId.toLowerCase() !== input.row.findingId.toLowerCase() ||
    detail.version !== input.row.version
  )
    return { outcome: "identity_mismatch" };
  if (detail.decision === "dismissed" || !detail.recordValid) return { outcome: "not_eligible" };
  const already = input.existing();
  if (already.length > 0) return { outcome: "duplicate", tasks: [...already] };
  const task = input.add(
    opportunityFromFinding({
      projectId: input.projectId,
      row: input.row,
      record: detail.record,
      language: input.language,
      capturedAt: (input.now ?? (() => new Date().toISOString()))(),
    }),
  );
  return { outcome: "created", task };
}
/** Read the publication evidence through the released BOUNDED page contract (pages of 50, at most 20 pages)
 * until every recorded attempt is loaded or the bound is reached; a failing page fails the whole read (never a
 * silently partial list). `complete` is false only when more attempts exist than the bound allows. */
export async function collectPublishedAttempts(
  read: (page: number) => Promise<{ items: EvidenceRow[]; total: number }>,
  opts: { maxPages?: number } = {},
): Promise<{ items: EvidenceRow[]; total: number; complete: boolean }> {
  const maxPages = Math.min(opts.maxPages ?? 20, 20);
  const items: EvidenceRow[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const r = await read(page);
    total = r.total;
    for (const it of r.items)
      if (!seen.has(it.id)) {
        seen.add(it.id);
        items.push(it);
      }
    if (r.items.length === 0 || items.length >= total) break;
  }
  return { items, total, complete: items.length >= total };
}
/** A Plan task's pinned finding rows with their live chain state and, when the pin is not the current head, the
 * bindable current head the owner may choose EXPLICITLY (Codex N1/R4). The pin itself never moves. */
export interface PinnedRowView {
  rowId: string;
  link: FindingLink;
  /** The current head of the same logical finding when it differs from the pin and is bindable (accepted or
   * provisional, not dismissed); null otherwise. */
  currentHead: CitationFindingSummary | null;
}
export function pinnedRowsOf(
  task: Pick<Opportunity, "sourceRefs">,
  rows: readonly CitationFindingSummary[],
): PinnedRowView[] {
  return findingRowIdsOf(task).map((rowId) => {
    const link = findingLink(rowId, rows);
    let currentHead: CitationFindingSummary | null = null;
    if (link.findingId && link.headVersion !== null && link.headVersion !== link.pinnedVersion) {
      const head = rows.find(
        (r) =>
          r.findingId.toLowerCase() === link.findingId!.toLowerCase() &&
          r.version === link.headVersion,
      );
      if (head && head.decision !== "dismissed") currentHead = head;
    }
    return { rowId: link.rowId, link, currentHead };
  });
}
/** Tasks of a project that carry at least one finding pin, deleted ones included (shown as deleted, never
 * substituted), newest reference first. */
export function pinnedTasks(opps: readonly Opportunity[]): Opportunity[] {
  return opps.filter((o) => findingRowIdsOf(o).length > 0);
}

/** Codex R5: the evidence chip of a row. The stored `evidenceStatus` is the released OWNER-verification axis
 * (baseline_absent = no owner verification block). A row the server marks eligible through an INDEPENDENT
 * inspection (not owner-attested) has its baselines resolved by the live predicate, so the owner-axis wording
 * "no baseline recorded" would be false for that path; it is labelled by its real proof source instead. Every
 * other state keeps the released label; an unknown live projection never turns into a confirmed one. */
export function evidenceLabelKey(
  s: Pick<CitationImprovementSummary, "evidenceStatus"> &
    Partial<
      Pick<
        CitationImprovementSummary,
        "verificationStatus" | "verifiedEligible" | "independentStatus"
      >
    >,
): string {
  if (
    s.verifiedEligible === true &&
    s.independentStatus === "independently_inspected" &&
    s.verificationStatus !== "owner_attested"
  )
    return "citationChange.evidence.independentBaseline";
  return `citationForward.improvement.evidence.${s.evidenceStatus}`;
}
