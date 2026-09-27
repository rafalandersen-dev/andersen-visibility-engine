import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { readAnswerEvidenceFn } from "@/lib/answer-evidence.functions";
import { readPublicationApprovalProvenanceFn } from "@/lib/citation-approval.functions";
import { readProjectTeamRosterFn } from "@/lib/project-team.functions";
import {
  readPublicationEvidenceFn,
  readPublicationSnapshotFn,
} from "@/lib/publication-evidence.functions";
import {
  getCitationFindingFn,
  getCitationImprovementFn,
  readCitationFindingsFn,
  readCitationImprovementsFn,
  removeCitationImprovementFn,
  saveCitationImprovementFn,
} from "@/lib/citation-record.functions";
import {
  addOpportunity,
  getState,
  uid,
  updateOpportunity,
  upsertContent,
  useStore,
} from "@/lib/store";
import { authoringIdentity, headRows } from "@/lib/citation-authoring";
import {
  buildImprovementPayload,
  collectPublishedAttempts,
  createTaskFromFinding,
  currentImprovementHeads,
  eligibleBaselines,
  findingLink,
  findingSourceRef,
  forwardErrorKey,
  forwardReducer,
  improvementHead,
  initialForwardState,
  inspectionRequest,
  manualDraftForTask,
  newImprovementDraft,
  pinnedRowsOf,
  pinnedTasks,
  publishedAttemptsForTask,
  retestReadiness,
  tasksForFinding,
  taskStatus,
  type AttestedDetail,
  type CitationImprovementDetail,
  type ForwardState,
  type InspectionRequest,
} from "@/lib/citation-forward";
import type { ApprovalProvenance } from "@/lib/citation-approval.server";
import type { CitationImprovementSummary } from "@/lib/citation-record";
import type { Language, Opportunity } from "@/lib/types";

function Notice({
  tone,
  children,
}: {
  tone: "error" | "empty" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-destructive/40 text-destructive"
      : tone === "info"
        ? "border-border text-foreground/70"
        : "border-border text-muted-foreground";
  return <div className={`rounded-lg border border-dashed p-4 text-sm ${cls}`}>{children}</div>;
}
const chip =
  "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground";
const TASK_NOTES = {
  created: "citationForward.task.created",
  duplicate: "citationForward.task.duplicate",
  read_failed: "citationForward.task.readFailed",
  not_eligible: "citationForward.task.notEligible",
  identity_mismatch: "citationForward.task.notEligible",
  stale: "citationForward.task.stale",
} as const;

/**
 * Owner forward workflow: exact finding row/version → Plan task (create/attach, stable row reference) → manual
 * Studio draft (no AI) → the EXISTING approval/publication → improvement bound to the exact published attempt →
 * explicit owner inspection. Thin over the pure helpers/reducer in `citation-forward.ts`; every server status is
 * the live value; no automatic positive on opening a URL. Keyed by owner+project at the route.
 *
 * Codex N1: existing Plan pins are listed independently of the eligible NEW sources (R4); task creation is
 * de-duplicated, identity-guarded and fails closed on a rejected/changed read (R5); publication evidence is read
 * through the bounded page contract, not page 0 only (R6); saves carry the reviewed finding rows (R1); an
 * inspection is bound to the displayed row and frozen for retry (R2); readiness counts current heads only and is
 * withheld while live statuses cannot be refreshed (R3).
 */
export function CitationForwardPanel({
  projectId,
  ownerId,
  language,
  onOpenStudio,
  onOpenPlan,
  initialState,
  initialOpenImprovementId,
}: {
  projectId: string;
  ownerId: string;
  language: Language;
  onOpenStudio?: (assetId: string) => void;
  onOpenPlan?: () => void;
  /** Test/harness seams only: a pre-filled author state and a pre-opened improvement row. */
  initialState?: ForwardState;
  initialOpenImprovementId?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const identity = authoringIdentity(ownerId, projectId);
  const findings = useQuery({
    queryKey: ["citation-findings", ownerId, projectId],
    queryFn: () => readCitationFindingsFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const evidence = useQuery({
    queryKey: ["publication-evidence", ownerId, projectId],
    // Bounded paging (R6): every recorded attempt up to the released 20 × 50 contract, never page 0 only.
    queryFn: () =>
      collectPublishedAttempts((page) => readPublicationEvidenceFn({ data: { projectId, page } })),
    staleTime: 0,
    retry: false,
  });
  const answers = useQuery({
    queryKey: ["answer-evidence", ownerId, projectId],
    queryFn: () => readAnswerEvidenceFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const improvements = useQuery({
    queryKey: ["citation-improvements", ownerId, projectId],
    queryFn: () => readCitationImprovementsFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  // Whole-array selectors (stable references) filtered in memo: the selector cache keys on the snapshot, so a
  // fresh `filter` result per render would re-render endlessly.
  const allOpportunities = useStore((s) => s.opportunities);
  const allContent = useStore((s) => s.content);
  const opportunities = useMemo(
    () => allOpportunities.filter((o) => o.projectId === projectId),
    [allOpportunities, projectId],
  );
  const content = useMemo(
    () => allContent.filter((c) => c.projectId === projectId),
    [allContent, projectId],
  );

  const rows = useMemo(() => findings.data?.findings ?? [], [findings.data]);
  const heads = useMemo(() => headRows(rows).filter((r) => r.decision !== "dismissed"), [rows]);
  const attempts = useMemo(() => evidence.data?.items ?? [], [evidence.data]);
  const answerRows = useMemo(
    () => (answers.data?.answers ?? []).map((a) => ({ id: a.id, capturedAt: a.input.capturedAt })),
    [answers.data],
  );
  const list = useMemo(() => improvements.data?.improvements ?? [], [improvements.data]);
  const pinned = useMemo(() => pinnedTasks(opportunities), [opportunities]);
  // Codex N2/S3: the approver of the chosen attempt's exact asset version comes from the owner-scoped provenance
  // read (the owner, or the delegate reviewer recorded on the approval), never from a typed id or a default.
  const [stored, dispatch] = useReducer(
    forwardReducer,
    initialState ?? initialForwardState(identity),
  );
  const view = stored.identity === identity ? stored : initialForwardState(identity);
  const { draft, stage, reviewed, issues, errorKey, conflict, savedVersion } = view;
  const attemptsForDraft = draft ? publishedAttemptsForTask(attempts, draft.taskId) : [];
  const draftAttempt = draft?.publicationId
    ? (attemptsForDraft.find((a) => a.id === draft.publicationId) ?? null)
    : null;
  const provenance = useQuery({
    queryKey: [
      "publication-approval-provenance",
      ownerId,
      projectId,
      draftAttempt?.assetId ?? null,
      draftAttempt?.versionHash ?? null,
    ],
    queryFn: () =>
      readPublicationApprovalProvenanceFn({
        data: { ...scope, assetId: draftAttempt!.assetId, versionHash: draftAttempt!.versionHash },
      }),
    enabled: !!draftAttempt,
    staleTime: 0,
    retry: false,
  });
  const roster = useQuery({
    queryKey: ["project-team-roster", ownerId, projectId],
    queryFn: () => readProjectTeamRosterFn({ data: { projectId } }),
    enabled: provenance.data?.approverKind === "delegate",
    staleTime: 0,
    retry: false,
  });
  const approvals = useMemo(() => {
    const m = new Map<string, ApprovalProvenance>();
    if (draftAttempt && provenance.data) m.set(draftAttempt.id, provenance.data);
    return m;
  }, [draftAttempt, provenance.data]);
  const delegateEmail =
    provenance.data?.approverKind === "delegate"
      ? (roster.data?.members.find((m) => m.actorId === provenance.data?.approverId)?.email ?? null)
      : null;

  const [pick, setPick] = useState("");
  const [attachPick, setAttachPick] = useState("");
  const [taskNote, setTaskNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedRow = heads.find((r) => r.id === pick) ?? null;
  const link = selectedRow ? findingLink(selectedRow.id, rows) : null;
  // Non-deleted tasks of THIS project already pinned to the selected exact row (archived included): creation
  // is offered only when there is none; the live store is re-checked again right before the mutation.
  const alreadyPinned = selectedRow ? tasksForFinding(opportunities, selectedRow.id) : [];

  useEffect(() => {
    dispatch({ type: "scopeChanged", identity });
  }, [identity]);
  // Identity + mount guard for every async continuation: a read that resolves after a project/account switch or
  // after unmount must not touch the global store or this instance's state (R5).
  const liveIdentity = useRef(identity);
  liveIdentity.current = identity;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const stillCurrent = (startedFor: string) => alive.current && liveIdentity.current === startedFor;
  const [busy, setBusy] = useState(false);

  async function createTask() {
    if (!selectedRow || creating) return;
    const startedFor = identity;
    const row = selectedRow;
    setCreating(true);
    setTaskNote(null);
    const result = await createTaskFromFinding({
      projectId,
      row,
      language,
      read: () => getCitationFindingFn({ data: { ...scope, id: row.id } }),
      isCurrent: () => stillCurrent(startedFor),
      existing: () =>
        tasksForFinding(
          getState().opportunities.filter((o) => o.projectId === projectId),
          row.id,
        ),
      add: addOpportunity,
    });
    if (!stillCurrent(startedFor)) return;
    setCreating(false);
    setTaskNote(TASK_NOTES[result.outcome]);
  }
  function attachTask() {
    if (!selectedRow || !attachPick) return;
    const target = opportunities.find((o) => o.id === attachPick && !o.deletedAt);
    if (!target) return;
    const ref = findingSourceRef(selectedRow, new Date().toISOString());
    updateOpportunity(target.id, { sourceRefs: [...(target.sourceRefs ?? []), ref] });
    setTaskNote("citationForward.task.attached");
  }
  function manualDraft(taskId: string) {
    const task = opportunities.find((o) => o.id === taskId && !o.deletedAt);
    if (!task) return;
    const asset = manualDraftForTask(task, uid(), new Date().toISOString());
    upsertContent(asset);
    updateOpportunity(task.id, { currentContentAssetId: asset.id, status: "drafting" });
    onOpenStudio?.(asset.id);
  }
  function startImprovement(task: Opportunity) {
    // The author binds against the CURRENT publication history: re-read it (and the approval provenance of any
    // attempt) when the form opens, so an attempt published after this panel mounted is offered too.
    void qc.invalidateQueries({ queryKey: ["publication-evidence", ownerId, projectId] });
    void qc.invalidateQueries({
      queryKey: ["publication-approval-provenance", ownerId, projectId],
    });
    const d = newImprovementDraft(crypto.randomUUID(), task.id, ownerId);
    // Pre-select only pins that are still the current head; a superseded/deleted/dismissed pin needs an
    // explicit choice of the current version in the form (R4: the pin itself never moves).
    d.findingRowIds = pinnedRowsOf(task, rows)
      .filter((p) => p.link.status === "current" || p.link.status === "second_review")
      .map((p) => p.rowId);
    dispatch({ type: "start", draft: d });
  }
  function review() {
    if (!draft) return;
    dispatch({
      type: "review",
      result: buildImprovementPayload(draft, { rows, attempts, answers: answerRows, approvals }),
    });
  }
  async function save() {
    if (!draft || !reviewed || busy) return;
    setBusy(true);
    const startedFor = identity;
    dispatch({ type: "saveStarted" });
    try {
      const result = await saveCitationImprovementFn({
        data: {
          ...scope,
          scope: reviewed.scope,
          improvement: reviewed.improvement,
          binding: reviewed.binding,
          expectedVersion: draft.expectedVersion,
          expectedHeadId: draft.expectedHeadId,
          expectedFindingRowIds: reviewed.expectedFindingRowIds,
        },
      });
      if (!stillCurrent(startedFor)) return;
      dispatch({ type: "saved", version: result.version });
      await qc.invalidateQueries({ queryKey: ["citation-improvements", ownerId, projectId] });
    } catch (e) {
      if (!stillCurrent(startedFor)) return;
      const code = e instanceof Error ? e.message : "";
      dispatch({ type: "saveFailed", code });
      if (code === "citation_improvement_version_conflict") {
        try {
          const current = await readCitationImprovementsFn({ data: scope });
          if (!stillCurrent(startedFor)) return;
          const head = improvementHead(draft.improvementId, current.improvements);
          if (head.expectedHeadId)
            dispatch({
              type: "conflictLoaded",
              head: { version: head.expectedVersion, id: head.expectedHeadId },
            });
        } catch {
          /* the conflict message alone is honest: no continuation without a read head */
        }
      } else if (code === "citation_improvement_finding_stale") {
        // The reviewed finding rows moved: refresh the finding list so the form shows the current versions;
        // the owner must choose them explicitly and review again (nothing was written).
        void qc.invalidateQueries({ queryKey: ["citation-findings", ownerId, projectId] });
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const baselineOptions = draftAttempt
    ? eligibleBaselines(answerRows, draftAttempt.finishedAt ?? draftAttempt.startedAt)
    : [];
  const draftTask = draft ? (opportunities.find((o) => o.id === draft.taskId) ?? null) : null;
  const draftPins = draftTask ? pinnedRowsOf(draftTask, rows) : [];
  const toggleRow = (rowId: string, on: boolean) =>
    dispatch({
      type: "edit",
      patch: {
        findingRowIds: on
          ? [...new Set([...draft!.findingRowIds, rowId])]
          : draft!.findingRowIds.filter((id) => id !== rowId),
      },
    });

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationForward.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-3xl">{t("citationForward.intro")}</p>
        <p className="text-xs text-amber-700 max-w-3xl">{t("citationForward.authority")}</p>
      </header>

      {/* 1. Finding version → Plan task (NEW sources: bindable current heads only) */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t("citationForward.findings.title")}</h4>
        {findings.isError ? (
          <Notice tone="error">{t("citationReview.error.loadFindings")}</Notice>
        ) : findings.isPending ? (
          <Notice tone="info">{t("citationForward.common.loading")}</Notice>
        ) : heads.length === 0 ? (
          <Notice tone="empty">{t("citationForward.findings.empty")}</Notice>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 max-w-full text-xs space-y-1">
              <span className="font-medium text-foreground/70">
                {t("citationForward.findings.pick")}
              </span>
              <select
                className="block w-full max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={pick}
                onChange={(e) => {
                  setPick(e.target.value);
                  setTaskNote(null);
                }}
              >
                <option value="">{t("citationForward.findings.pickPlaceholder")}</option>
                {heads.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t(`citationReview.family.${r.family}`)} · v{r.version} ·{" "}
                    {r.findingId.slice(0, 8)} · {t(`citationReview.decision.${r.decision}`)}
                  </option>
                ))}
              </select>
            </label>
            {selectedRow ? (
              <>
                <Button
                  size="sm"
                  disabled={creating || alreadyPinned.length > 0}
                  title={alreadyPinned.length > 0 ? t("citationForward.task.duplicate") : undefined}
                  onClick={() => void createTask()}
                >
                  {t("citationForward.task.create")}
                </Button>
                <select
                  aria-label={t("citationForward.task.attach")}
                  className="max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={attachPick}
                  onChange={(e) => setAttachPick(e.target.value)}
                >
                  <option value="">{t("citationForward.task.attachPlaceholder")}</option>
                  {opportunities
                    .filter(
                      (o) =>
                        !o.deletedAt &&
                        !pinnedRowsOf(o, rows).some((p) => p.rowId === selectedRow.id),
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                </select>
                <Button size="sm" variant="outline" disabled={!attachPick} onClick={attachTask}>
                  {t("citationForward.task.attach")}
                </Button>
              </>
            ) : null}
          </div>
        )}
        {link ? (
          <p className="text-xs text-muted-foreground">
            <span className={chip}>{t(`citationForward.findings.state.${link.status}`)}</span>{" "}
            {link.pinnedVersion !== null && link.headVersion !== null
              ? t("citationForward.findings.pinned", {
                  pinned: link.pinnedVersion,
                  head: link.headVersion,
                })
              : null}
          </p>
        ) : null}
        {selectedRow &&
        alreadyPinned.length > 0 &&
        taskNote !== "citationForward.task.duplicate" ? (
          <p className="text-xs text-muted-foreground" data-already-pinned={alreadyPinned.length}>
            {t("citationForward.task.duplicate")}
          </p>
        ) : null}
        {taskNote ? (
          <p
            className={
              taskNote === "citationForward.task.created" ||
              taskNote === "citationForward.task.attached"
                ? "text-xs text-emerald-700"
                : "text-xs text-destructive"
            }
          >
            {t(taskNote)}
          </p>
        ) : null}

        {/* 1b. EXISTING pins (R4): every task pinned to any finding row, with the live chain state of each pin.
            Independent of the picker above so a task whose pin was superseded/dismissed/deleted stays reachable. */}
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-foreground/70">
            {t("citationForward.task.pinnedTitle")}
          </h5>
          {pinned.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("citationForward.task.pinnedEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {pinned.map((o) => {
                const state = taskStatus(opportunities, o.id);
                const asset = content.find((c) =>
                  o.currentContentAssetId
                    ? c.id === o.currentContentAssetId
                    : c.opportunityId === o.id,
                );
                const pins = pinnedRowsOf(o, rows);
                return (
                  <li key={o.id} className="rounded-lg border border-border p-3 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{o.title}</span>
                      <span className={chip}>
                        {t(`citationForward.task.state.${state.status}`)}
                      </span>
                      <span className={chip}>{o.id}</span>
                    </div>
                    <ul className="ml-4 list-disc">
                      {pins.map((p) => (
                        <li key={p.rowId}>
                          {p.rowId.slice(0, 8)}{" "}
                          <span className={chip}>
                            {t(`citationForward.findings.state.${p.link.status}`)}
                          </span>{" "}
                          {p.link.pinnedVersion !== null && p.link.headVersion !== null
                            ? t("citationForward.findings.pinned", {
                                pinned: p.link.pinnedVersion,
                                head: p.link.headVersion,
                              })
                            : null}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      {asset ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={state.status === "deleted"}
                          onClick={() => onOpenStudio?.(asset.id)}
                        >
                          {t("citationForward.studio.open")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={state.status !== "active"}
                          onClick={() => manualDraft(o.id)}
                        >
                          {t("citationForward.studio.manualDraft")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onOpenPlan?.()}>
                        {t("citationForward.studio.plan")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state.status === "deleted"}
                        onClick={() => startImprovement(o)}
                      >
                        {t("citationForward.improvement.start")}
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      {t("citationForward.studio.manualNote")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">{t("citationForward.task.localNote")}</p>
        </div>
      </div>

      {/* 2. Improvement author: frozen payload, review, save with head + finding-row tokens */}
      {draft ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium">{t("citationForward.improvement.title")}</h4>
          <p className="text-xs text-muted-foreground">{t("citationForward.improvement.intro")}</p>
          {stage === "review" && reviewed ? (
            <div className="space-y-2 text-xs">
              <p>
                {t("citationForward.improvement.detailTask")}: {reviewed.improvement.taskId}
              </p>
              <p>
                {t("citationForward.improvement.detailDestination")}:{" "}
                {reviewed.improvement.destination.reference}
              </p>
              <p>
                {t("citationForward.improvement.detailRows")}:{" "}
                {reviewed.expectedFindingRowIds.map((id) => id.slice(0, 8)).join(", ")}
              </p>
              <details className="rounded-md border border-border p-2">
                <summary className="cursor-pointer">{t("citationReview.record.rawAudit")}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                  {JSON.stringify(
                    {
                      scope: reviewed.scope,
                      improvement: reviewed.improvement,
                      binding: reviewed.binding,
                      expectedFindingRowIds: reviewed.expectedFindingRowIds,
                      expectedVersion: draft.expectedVersion,
                      expectedHeadId: draft.expectedHeadId,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {errorKey ? <Notice tone="error">{t(errorKey)}</Notice> : null}
              {conflict ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch({ type: "continueOnHead" })}
                >
                  {t("citationForward.error.conflictContinue")}
                </Button>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void save()}>
                  {errorKey
                    ? t("citationForward.improvement.retry")
                    : t("citationForward.improvement.save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => dispatch({ type: "back" })}
                >
                  {t("citationForward.improvement.back")}
                </Button>
              </div>
            </div>
          ) : stage === "saving" ? (
            <Notice tone="info">{t("citationForward.common.loading")}</Notice>
          ) : (
            <form
              className="space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
            >
              <fieldset className="space-y-1">
                <legend className="font-medium text-foreground/70">
                  {t("citationForward.improvement.rowsPick")}
                </legend>
                {draftPins.map((p) => {
                  const bindable = p.link.status === "current" || p.link.status === "second_review";
                  return (
                    <div key={p.rowId} className="space-y-1">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={!bindable}
                          checked={draft.findingRowIds.includes(p.rowId)}
                          onChange={(e) => toggleRow(p.rowId, e.target.checked)}
                        />
                        <span>
                          {p.rowId.slice(0, 8)}{" "}
                          <span className={chip}>
                            {t(`citationForward.findings.state.${p.link.status}`)}
                          </span>{" "}
                          {p.link.pinnedVersion !== null && p.link.headVersion !== null
                            ? t("citationForward.findings.pinned", {
                                pinned: p.link.pinnedVersion,
                                head: p.link.headVersion,
                              })
                            : null}
                        </span>
                      </label>
                      {p.currentHead ? (
                        <label className="ml-6 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.findingRowIds.includes(p.currentHead.id)}
                            onChange={(e) => toggleRow(p.currentHead!.id, e.target.checked)}
                          />
                          <span>
                            {t("citationForward.improvement.useCurrent", {
                              head: p.currentHead.version,
                            })}
                          </span>
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
              <label className="block space-y-1">
                <span className="font-medium text-foreground/70">
                  {t("citationForward.improvement.publication")}
                </span>
                {evidence.isError ? (
                  <Notice tone="error">{t("citationForward.error.loadEvidence")}</Notice>
                ) : evidence.isPending ? (
                  <Notice tone="info">{t("citationForward.common.loading")}</Notice>
                ) : attemptsForDraft.length === 0 ? (
                  <Notice tone="empty">{t("citationForward.improvement.publicationNone")}</Notice>
                ) : (
                  <select
                    className="block w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                    value={draft.publicationId ?? ""}
                    onChange={(e) =>
                      dispatch({
                        type: "edit",
                        patch: { publicationId: e.target.value || null, baselineCaptureIds: [] },
                      })
                    }
                  >
                    <option value="">{t("citationForward.improvement.publication")}</option>
                    {attemptsForDraft.map((a) => (
                      <option key={a.id} value={a.id}>
                        {t("citationForward.improvement.publicationOption", {
                          finished: (a.finishedAt ?? a.startedAt).slice(0, 16),
                          version: a.versionHash.slice(0, 12),
                          url: a.outcomeData?.liveUrl ?? "",
                        })}
                      </option>
                    ))}
                  </select>
                )}
                {evidence.data && !evidence.data.complete ? (
                  <span className="text-destructive">
                    {t("citationForward.improvement.publicationPartial", {
                      loaded: evidence.data.items.length,
                      total: evidence.data.total,
                    })}
                  </span>
                ) : null}
              </label>
              <div className="space-y-1">
                <span className="font-medium text-foreground/70">
                  {t("citationForward.improvement.approvedBy")}
                </span>
                {!draftAttempt ? null : provenance.isError ? (
                  <Notice tone="error">{t("citationForward.issue.approval_unknown")}</Notice>
                ) : !provenance.data ? (
                  <p className="text-muted-foreground">{t("citationForward.common.loading")}</p>
                ) : !provenance.data.approved ? (
                  <Notice tone="error">{t("citationForward.improvement.approvalNone")}</Notice>
                ) : provenance.data.approverKind === "owner" ? (
                  <p data-approver="owner">{t("citationForward.improvement.approvedByOwner")}</p>
                ) : (
                  <p data-approver="delegate">
                    {t("citationForward.improvement.approvalDelegate", {
                      email: delegateEmail ?? (roster.isError ? "?" : "…"),
                    })}
                  </p>
                )}
              </div>
              <label className="block space-y-1">
                <span className="font-medium text-foreground/70">
                  {t("citationForward.improvement.description")}
                </span>
                <textarea
                  className="block w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  rows={3}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) =>
                    dispatch({ type: "edit", patch: { description: e.target.value } })
                  }
                />
              </label>
              <fieldset className="space-y-1">
                <legend className="font-medium text-foreground/70">
                  {t("citationForward.improvement.baselines")}
                </legend>
                {!draftAttempt ? null : baselineOptions.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("citationForward.improvement.baselinesNone")}
                  </p>
                ) : (
                  baselineOptions.map((a) => (
                    <label key={a.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.baselineCaptureIds.includes(a.id)}
                        onChange={(e) =>
                          dispatch({
                            type: "edit",
                            patch: {
                              baselineCaptureIds: e.target.checked
                                ? [...draft.baselineCaptureIds, a.id]
                                : draft.baselineCaptureIds.filter((id) => id !== a.id),
                            },
                          })
                        }
                      />
                      <span>
                        {a.id.slice(0, 8)} · {a.capturedAt}
                      </span>
                    </label>
                  ))
                )}
                <p className="text-muted-foreground">
                  {t("citationForward.improvement.baselinesHint")}
                </p>
              </fieldset>
              {issues.length ? (
                <ul className="text-destructive">
                  {issues.map((i) => (
                    <li key={i}>{t(`citationForward.issue.${i}`)}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" type="submit" disabled={busy}>
                  {t("citationForward.improvement.review")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => dispatch({ type: "cancel" })}
                >
                  {t("citationForward.improvement.cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : savedVersion !== null ? (
        <p className="text-xs text-emerald-700">
          {t("citationForward.improvement.saved", { version: savedVersion })}
        </p>
      ) : null}

      {/* 3. Improvements list, detail, inspection, readiness */}
      <ImprovementList
        projectId={projectId}
        ownerId={ownerId}
        list={list}
        isError={improvements.isError}
        isPending={improvements.isPending}
        rows={rows}
        opportunities={opportunities}
        initialOpen={initialOpenImprovementId ?? null}
      />
    </section>
  );
}

function ImprovementList({
  projectId,
  ownerId,
  list,
  isError,
  isPending,
  rows,
  opportunities,
  initialOpen,
}: {
  projectId: string;
  ownerId: string;
  list: CitationImprovementSummary[];
  isError: boolean;
  isPending: boolean;
  rows: Parameters<typeof findingLink>[1];
  opportunities: Parameters<typeof taskStatus>[0];
  initialOpen: string | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [checkResult, setCheckResult] = useState<
    "shows_approved_content" | "does_not_show" | "inconclusive" | ""
  >("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The frozen inspection request of the displayed row (R2): built once, re-sent unchanged on retry, discarded
  // when the owner changes the result or opens another row.
  const [pending, setPending] = useState<{ detailId: string; request: InspectionRequest } | null>(
    null,
  );
  const detail = useQuery({
    queryKey: ["citation-improvement", ownerId, projectId, open],
    queryFn: () => getCitationImprovementFn({ data: { ...scope, id: open! } }),
    enabled: open !== null,
    staleTime: 0,
    retry: false,
  });
  // Readiness reads CURRENT heads only (R3): an earlier positive version never counts once a later version exists.
  const heads = useMemo(() => currentImprovementHeads(list), [list]);
  const headIds = useMemo(() => new Set(heads.map((s) => s.id)), [heads]);
  const attestedIds = heads
    .filter((s) => s.verificationStatus === "owner_attested")
    .map((s) => s.id);
  const attested = useQuery({
    queryKey: ["citation-improvement-attested", ownerId, projectId, attestedIds.join(",")],
    // Codex N2/S2: keep the WHOLE fresh detail (its own live status), not only the immutable record; readiness
    // counts a head only while the newer detail read still says owner_attested with a recorded baseline.
    queryFn: async () => {
      const entries = await Promise.all(
        attestedIds.map(async (id) => {
          const d = await getCitationImprovementFn({ data: { ...scope, id } });
          return [id, d as AttestedDetail] as const;
        }),
      );
      return new Map<string, AttestedDetail>(entries);
    },
    enabled: attestedIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const d = open ? detail.data : undefined;
  const liveUrl =
    d?.record.destination.kind === "public_url" ? d.record.destination.reference : null;
  const [showSnapshot, setShowSnapshot] = useState(false);
  const snapshot = useQuery({
    queryKey: [
      "publication-snapshot",
      ownerId,
      projectId,
      d?.publicationBinding?.publicationId ?? null,
    ],
    queryFn: () =>
      readPublicationSnapshotFn({ data: { projectId, id: d!.publicationBinding!.publicationId } }),
    enabled: showSnapshot && !!d?.publicationBinding,
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    setCheckResult("");
    setShowSnapshot(false);
    setNote(null);
    setPending(null);
  }, [open]);

  async function recordInspection(detailNow: CitationImprovementDetail) {
    if (!checkResult || busy) return;
    let request: InspectionRequest;
    if (pending && pending.detailId === detailNow.id) {
      request = pending.request;
    } else {
      const built = inspectionRequest(detailNow, list, {
        checkResult,
        observedAt: new Date().toISOString(),
        ownerId,
      });
      if (!built.ok) {
        setNote(
          built.issue === "baseline_required"
            ? "citationForward.inspection.baselineRequired"
            : built.issue === "not_head"
              ? "citationForward.inspection.notHead"
              : "citationForward.inspection.bindingRequired",
        );
        return;
      }
      request = built.request;
      setPending({ detailId: detailNow.id, request });
    }
    setBusy(true);
    try {
      const result = await saveCitationImprovementFn({ data: { ...scope, ...request } });
      setPending(null);
      setNote(null);
      await qc.invalidateQueries({ queryKey: ["citation-improvements", ownerId, projectId] });
      setOpen(result.id);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setNote(forwardErrorKey(code));
      if (
        code === "citation_improvement_version_conflict" ||
        code === "citation_improvement_finding_stale"
      ) {
        // The displayed row is no longer the head, or its bound findings moved: drop the frozen request (an
        // identical retry cannot succeed) and refresh the list so the current version can be opened.
        setPending(null);
        void qc.invalidateQueries({ queryKey: ["citation-improvements", ownerId, projectId] });
        void qc.invalidateQueries({ queryKey: ["citation-findings", ownerId, projectId] });
      }
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await removeCitationImprovementFn({ data: { ...scope, id } });
      setNote("citationForward.improvement.removed");
      setOpen(null);
      await qc.invalidateQueries({ queryKey: ["citation-improvements", ownerId, projectId] });
    } catch {
      setNote("citationForward.error.unavailable");
    } finally {
      setBusy(false);
    }
  }
  // Codex P3: a pending list read or a pending detail read is never shown as a measured zero; only a LOADED
  // (possibly empty) list with its needed details yields counts.
  const readinessState: "unavailable" | "loading" | "ready" =
    isError || attested.isError
      ? "unavailable"
      : isPending || (attestedIds.length > 0 && attested.data === undefined)
        ? "loading"
        : "ready";
  const readiness = retestReadiness(list, attested.data ?? new Map());

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{t("citationForward.improvement.listTitle")}</h4>
      {isError ? (
        <Notice tone="error">{t("citationForward.error.loadImprovements")}</Notice>
      ) : isPending ? (
        <Notice tone="info">{t("citationForward.common.loading")}</Notice>
      ) : list.length === 0 ? (
        <Notice tone="empty">{t("citationForward.improvement.listEmpty")}</Notice>
      ) : (
        <ul className="space-y-1">
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full rounded-md border border-border px-3 py-2 text-left text-xs hover:bg-muted"
                aria-pressed={open === s.id}
                onClick={() => setOpen(open === s.id ? null : s.id)}
              >
                <span className="font-medium">{s.improvementId.slice(0, 8)}</span>{" "}
                <span className={chip}>
                  {t("citationForward.improvement.version", { version: s.version })}
                </span>{" "}
                <span className={chip}>
                  {t(`citationForward.improvement.status.${s.verificationStatus}`)}
                </span>{" "}
                <span className={chip}>
                  {t(`citationForward.improvement.evidence.${s.evidenceStatus}`)}
                </span>
                {!headIds.has(s.id) ? (
                  <>
                    {" "}
                    <span className={chip}>{t("citationForward.improvement.historyRow")}</span>
                  </>
                ) : null}
                {s.predecessorDeleted ? (
                  <>
                    {" "}
                    <span className={chip}>{t("citationForward.findings.state.deleted")}</span>
                  </>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t("citationForward.improvement.statusNote")}
      </p>

      {open ? (
        detail.isError ? (
          <Notice tone="error">{t("citationForward.error.loadImprovements")}</Notice>
        ) : !d ? (
          <Notice tone="info">{t("citationForward.common.loading")}</Notice>
        ) : (
          <div className="space-y-3 rounded-lg border border-border p-4 text-xs">
            <div className="flex flex-wrap gap-2">
              <span className={chip}>
                {t(`citationForward.improvement.status.${d.verificationStatus}`)}
              </span>
              <span className={chip}>
                {t(`citationForward.improvement.evidence.${d.evidenceStatus}`)}
              </span>
              <span className={chip}>
                {t("citationForward.improvement.version", { version: d.version })}
              </span>
              {!headIds.has(d.id) ? (
                <span className={chip}>{t("citationForward.improvement.historyRow")}</span>
              ) : null}
            </div>
            <div>
              <span className="font-medium text-foreground/70">
                {t("citationForward.improvement.detailTask")}:{" "}
              </span>
              {d.record.taskId}{" "}
              <span className={chip}>
                {t(
                  `citationForward.task.state.${taskStatus(opportunities, d.record.taskId).status}`,
                )}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground/70">
                {t("citationForward.improvement.detailDestination")}:{" "}
              </span>
              {d.record.destination.kind} · {d.record.destination.reference}
            </div>
            <div className="space-y-1">
              <span className="font-medium text-foreground/70">
                {t("citationForward.improvement.detailRows")}:
              </span>
              <ul className="ml-4 list-disc">
                {d.boundFindingRowIds.map((rowId) => {
                  const l = findingLink(rowId, rows);
                  return (
                    <li key={rowId}>
                      {rowId.slice(0, 8)}{" "}
                      <span className={chip}>
                        {t(`citationForward.findings.state.${l.status}`)}
                      </span>{" "}
                      {l.pinnedVersion !== null && l.headVersion !== null
                        ? t("citationForward.findings.pinned", {
                            pinned: l.pinnedVersion,
                            head: l.headVersion,
                          })
                        : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            {d.publicationBinding && liveUrl ? (
              <div className="space-y-2 rounded-md border border-border p-3">
                <h5 className="font-medium">{t("citationForward.inspection.title")}</h5>
                <p className="text-muted-foreground">{t("citationForward.inspection.intro")}</p>
                <div className="flex flex-wrap gap-2">
                  <a className="underline" href={liveUrl} target="_blank" rel="noopener noreferrer">
                    {t("citationForward.inspection.open")}
                  </a>
                  <Button size="sm" variant="outline" onClick={() => setShowSnapshot((v) => !v)}>
                    {t("citationForward.inspection.snapshot")}
                  </Button>
                </div>
                {showSnapshot ? (
                  snapshot.isError ? (
                    <Notice tone="error">{t("citationForward.error.loadEvidence")}</Notice>
                  ) : snapshot.data ? (
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border p-2 text-[11px]">
                      {snapshot.data.markdown}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground">{t("citationForward.common.loading")}</p>
                  )
                ) : null}
                {!headIds.has(d.id) ? (
                  <Notice tone="info">{t("citationForward.inspection.notHead")}</Notice>
                ) : (
                  <>
                    <fieldset className="space-y-1">
                      <legend className="font-medium text-foreground/70">
                        {t("citationForward.inspection.result")}
                      </legend>
                      {(["shows_approved_content", "does_not_show", "inconclusive"] as const).map(
                        (r) => (
                          <label key={r} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="inspection-result"
                              value={r}
                              checked={checkResult === r}
                              disabled={busy}
                              onChange={() => {
                                setCheckResult(r);
                                setPending(null);
                                setNote(null);
                              }}
                            />
                            <span>{t(`citationForward.inspection.${r}`)}</span>
                          </label>
                        ),
                      )}
                    </fieldset>
                    <p className="text-muted-foreground">
                      {t("citationForward.inspection.negativeNote")}
                    </p>
                    <Button
                      size="sm"
                      disabled={!checkResult || busy}
                      onClick={() => void recordInspection(d)}
                    >
                      {pending && pending.detailId === d.id
                        ? t("citationForward.inspection.retry")
                        : t("citationForward.inspection.record")}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                {t("citationForward.improvement.detailNoBinding")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(d.id)}>
                {t("citationForward.improvement.remove")}
              </Button>
            </div>
          </div>
        )
      ) : null}
      {note ? (
        <p
          className={
            note.includes(".error.") || note.includes("Required") || note.includes("notHead")
              ? "text-xs text-destructive"
              : "text-xs text-emerald-700"
          }
        >
          {t(note)}
        </p>
      ) : null}

      <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
        <h5 className="font-medium">{t("citationForward.readiness.title")}</h5>
        {readinessState === "unavailable" ? (
          <Notice tone="error">{t("citationForward.readiness.unavailable")}</Notice>
        ) : readinessState === "loading" ? (
          <p className="text-muted-foreground">{t("citationForward.common.loading")}</p>
        ) : (
          <>
            <p>
              {t("citationForward.readiness.verified", {
                count: readiness.distinctVerified,
                required: readiness.required,
              })}
            </p>
            <p>{t("citationForward.readiness.receipts", { count: readiness.connectorReceipts })}</p>
            <p>
              {t("citationForward.readiness.approvalBound", { count: readiness.approvalBound })}
            </p>
            <p>{t("citationForward.readiness.unverified", { count: readiness.unverified })}</p>
            <p>
              {t("citationForward.readiness.baselineMissing", { count: readiness.baselineMissing })}
            </p>
          </>
        )}
        <p className="text-muted-foreground">{t("citationForward.readiness.note")}</p>
      </div>
    </div>
  );
}
