import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { FindingRecordView } from "./CitationReviewPanel";
import { readAnswerEvidenceFn } from "@/lib/answer-evidence.functions";
import { readCitationProtocolFn } from "@/lib/citation-protocol.functions";
import { readProjectKnowledgeFn } from "@/lib/project-knowledge.functions";
import { readCitationBusinessFactsFn } from "@/lib/citation-business-fact.functions";
import {
  getCitationFindingFn,
  readCitationFindingsFn,
  saveCitationFindingFn,
} from "@/lib/citation-record.functions";
import { lockedScopes } from "@/lib/citation-panel-ui";
import { factChains } from "@/lib/citation-business-fact-ui";
import { scopeBinding, type CitationPanelScope } from "@/lib/citation-record";
import type { Finding } from "@/lib/citation-finding";
import {
  authoringIdentity,
  authoringReducer,
  canContinueOnHead,
  draftFromRecord,
  emptyAccuracy,
  emptySupport,
  headRows,
  initialAuthoringState,
  instantDisplayDiffers,
  instantFromUtcInput,
  instantToUtcInput,
  newFindingDraft,
  staleSelections,
  type AuthoringState,
  type FindingDraft,
} from "@/lib/citation-authoring";

const field = "mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm";
const area = "mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm";
const chip =
  "text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-border text-muted-foreground";

/**
 * Owner finding authoring for BOTH gap families over the released P3 save/read functions (+ the additive
 * expected-head guard and locked-scope enforcement). Evidence, source records and dated facts are chosen by
 * exact stored id/revision from fresh reads; the exact record is shown before saving and FROZEN for the save and
 * every retry (a lost response is retried byte-identically, so the server's idempotency returns the stored row);
 * a failed save keeps the draft; an edit is anchored to the head ROW the owner opened (version + immutable id);
 * a version conflict shows the current stored head for comparison and lets the owner continue on top of it only
 * when that head could be shown. All state lives in the pure `authoringReducer` (regression-tested without a
 * DOM) and is bound to the owner+project identity. Review handoff is the existing P4 grant flow below.
 */
export function CitationFindingAuthor({
  projectId,
  ownerId,
  onSaved,
  initialState,
}: {
  projectId: string;
  ownerId: string;
  onSaved?: () => void;
  /** Test/harness seam only: start from a given reducer state (e.g. a loaded conflict) for static assertions. */
  initialState?: AuthoringState;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const identity = authoringIdentity(ownerId, projectId);
  const protocol = useQuery({
    queryKey: ["citation-protocol", ownerId, projectId],
    queryFn: () => readCitationProtocolFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const evidence = useQuery({
    queryKey: ["answer-evidence", ownerId, projectId],
    queryFn: () => readAnswerEvidenceFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const knowledge = useQuery({
    queryKey: ["project-knowledge", ownerId, projectId],
    queryFn: () => readProjectKnowledgeFn({ data: { projectId } }),
    staleTime: 0,
    retry: false,
  });
  const facts = useQuery({
    queryKey: ["citation-business-facts", ownerId, projectId],
    queryFn: () => readCitationBusinessFactsFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const findings = useQuery({
    queryKey: ["citation-findings", ownerId, projectId],
    queryFn: () => readCitationFindingsFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const scopes = useMemo(() => lockedScopes(protocol.data?.panels ?? []), [protocol.data]);
  const answers = useMemo(() => evidence.data?.answers ?? [], [evidence.data]);
  const sources = useMemo(
    () => (knowledge.data?.sources ?? []).filter((s) => s.status === "active"),
    [knowledge.data],
  );
  const records = useMemo(() => knowledge.data?.records ?? [], [knowledge.data]);
  const factHeads = useMemo(() => factChains(facts.data?.facts ?? []), [facts.data]);
  const list = useMemo(() => findings.data?.findings ?? [], [findings.data]);

  const [stored, dispatch] = useReducer(
    authoringReducer,
    initialState ?? initialAuthoringState(identity),
  );
  // A draft never renders — and is never submitted — under another owner/project than it was started in: the
  // AppShell project picker swaps the active project in place, so until the reset effect below has run, the
  // stored state of the previous identity is treated as absent.
  const view = stored.identity === identity ? stored : initialAuthoringState(identity);
  useEffect(() => {
    dispatch({ type: "scopeChanged", identity });
  }, [identity]);
  // LIVE identity for async continuations: a result that arrives after this instance's props moved to another
  // owner/project is dropped. (The production guard is the route-level key remount; this ref is the in-instance
  // fallback and is what the closures below compare against, not their own captured props.)
  const liveIdentity = useRef(identity);
  liveIdentity.current = identity;
  const stillCurrent = (startedFor: string) => liveIdentity.current === startedFor;
  const { draft, stage, issues, errorKey, conflict, saved, reviewed } = view;
  const [busy, setBusy] = useState(false);
  const [editPick, setEditPick] = useState("");
  const heads = useMemo(() => headRows(list), [list]);

  const answerRow = draft?.answerId
    ? answers.find((a) => a.id.toLowerCase() === draft.answerId!.toLowerCase())
    : undefined;
  const answerCapturedAt = answerRow?.input.capturedAt ?? null;
  const fresh = {
    answers,
    sources,
    records,
    facts: facts.data?.facts ?? [],
    lockedScopes: scopes,
  };
  const stale = draft ? staleSelections(draft, fresh) : [];

  function startNew(family: Finding["family"]) {
    const d = newFindingDraft(crypto.randomUUID(), family);
    d.scope = scopes[0]
      ? {
          panelId: scopes[0].panelId,
          panelVersion: scopes[0].panelVersion,
          client: scopes[0].client,
        }
      : null;
    dispatch({ type: "startNew", draft: d });
  }
  async function startEdit(rowId: string) {
    if (!rowId || busy) return;
    setBusy(true);
    const startedFor = identity;
    try {
      const detail = await getCitationFindingFn({ data: { ...scope, id: rowId } });
      if (!stillCurrent(startedFor)) return; // a late result from a previous scope
      if (!detail.recordValid) {
        dispatch({ type: "unavailable" });
        return;
      }
      // Anchored to the ROW actually opened (its id + version), never to the list's head: if the list was stale
      // the server conflicts and the owner compares the real head before continuing.
      dispatch({
        type: "startEdit",
        draft: draftFromRecord(
          detail.record,
          { panelId: detail.panelId, panelVersion: detail.panelVersion, client: detail.client },
          { id: detail.id, version: detail.version },
        ),
      });
    } catch {
      dispatch({ type: "unavailable" });
    } finally {
      setBusy(false);
    }
  }
  function review() {
    dispatch({ type: "review", ownerId, nowIso: new Date().toISOString(), answerCapturedAt });
  }
  async function save() {
    // Exactly the FROZEN reviewed payload is sent (never rebuilt at click time); the token is the inspected head.
    if (!draft || !reviewed || busy || stale.length) return;
    setBusy(true);
    const startedFor = identity;
    dispatch({ type: "saveStarted" });
    try {
      const result = await saveCitationFindingFn({
        data: {
          ...scope,
          scope: reviewed.scope,
          finding: reviewed.finding,
          expectedVersion: draft.expectedVersion,
          expectedHeadId: draft.expectedHeadId,
        },
      });
      if (!stillCurrent(startedFor)) return;
      dispatch({ type: "saved", version: result.version });
      await qc.invalidateQueries({ queryKey: ["citation-findings", ownerId, projectId] });
      onSaved?.();
    } catch (e) {
      if (!stillCurrent(startedFor)) return;
      const code = e instanceof Error ? e.message : "";
      dispatch({ type: "saveFailed", code });
      if (code === "citation_finding_version_conflict") {
        // Show the CURRENT stored head for comparison; the draft is kept untouched. Continuation is offered only
        // when the head could be read AND validated (`recordValid`); otherwise the owner is told it is unavailable.
        try {
          const current = await readCitationFindingsFn({ data: scope });
          const head = headRows(current.findings).find(
            (f) => f.findingId.toLowerCase() === draft.findingId.toLowerCase(),
          );
          if (head) {
            const detail = await getCitationFindingFn({ data: { ...scope, id: head.id } });
            if (!stillCurrent(startedFor)) return;
            dispatch({
              type: "conflictLoaded",
              head: {
                id: detail.id,
                version: detail.version,
                record: detail.recordValid ? detail.record : null,
              },
            });
          }
        } catch {
          /* the conflict message alone is still honest: no continuation without a shown head */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const upd = (patch: Partial<FindingDraft>) => dispatch({ type: "edit", patch });
  const selectScope = (key: string) => {
    const s = scopes.find((x) => `${x.panelId}:${x.panelVersion}` === key);
    upd({
      scope: s ? { panelId: s.panelId, panelVersion: s.panelVersion, client: s.client } : null,
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationAuthoring.author.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t("citationAuthoring.author.intro")}
        </p>
      </header>
      {saved ? (
        <p className="text-xs text-emerald-600">
          {t("citationAuthoring.author.saved", { version: saved.version })}
        </p>
      ) : null}
      {!draft ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy || scopes.length === 0}
            onClick={() => startNew("citation_source")}
          >
            {t("citationAuthoring.author.new")} · {t("citationReview.family.citation_source")}
          </Button>
          <Button
            size="sm"
            disabled={busy || scopes.length === 0}
            onClick={() => startNew("recommendation_accuracy")}
          >
            {t("citationAuthoring.author.new")} ·{" "}
            {t("citationReview.family.recommendation_accuracy")}
          </Button>
          {scopes.length === 0 && !protocol.isPending ? (
            <span className="text-xs text-amber-600">
              {t("citationAuthoring.author.scopeNone")}
            </span>
          ) : null}
          {heads.length ? (
            <label className="text-sm flex items-center gap-2">
              <span>{t("citationAuthoring.author.editExisting")}</span>
              <select
                className={`${field} mt-0 w-72`}
                value={editPick}
                onChange={(e) => setEditPick(e.target.value)}
                disabled={busy}
              >
                <option value="">{t("citationAuthoring.author.editPick")}</option>
                {heads.map((f) => (
                  <option key={f.id} value={f.id}>
                    {t(`citationReview.family.${f.family}`)} · v{f.version} ·{" "}
                    {f.createdAt.slice(0, 10)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !editPick}
                onClick={() => startEdit(editPick)}
              >
                {t("citationAuthoring.author.editExisting")}
              </Button>
            </label>
          ) : null}
          {errorKey ? (
            <p className="text-xs text-destructive">
              {t(`citationAuthoring.saveError.${errorKey}`)}
            </p>
          ) : null}
        </div>
      ) : stage === "review" && reviewed ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {t("citationAuthoring.author.review")}
            </span>
            <span className={chip}>{t(`citationReview.family.${draft.family}`)}</span>
            <span className={chip}>{t(`citationReview.decision.${draft.decision}`)}</span>
            <span>
              {reviewed.scope.client.name} · {reviewed.scope.client.market} · v
              {reviewed.scope.panelVersion}
            </span>
          </div>
          {/* The FROZEN payload: what is shown here is byte-for-byte what Save (and any retry) sends. */}
          <FindingRecordView record={reviewed.finding} />
          {stale.length ? (
            <p className="text-xs text-amber-600">
              {t("citationAuthoring.author.stale", { fields: stale.join(", ") })}
            </p>
          ) : null}
          {errorKey ? (
            <div className="space-y-2">
              <p className="text-xs text-destructive">
                {t("citationAuthoring.author.error")}:{" "}
                {t(`citationAuthoring.saveError.${errorKey}`)}
              </p>
              {conflict ? (
                <div className="rounded-lg border border-amber-500/40 p-3 space-y-2">
                  <div className="text-xs font-medium">
                    {t("citationAuthoring.author.conflictTitle")} · v{conflict.version}
                  </div>
                  {conflict.record ? (
                    <>
                      <FindingRecordView record={conflict.record} />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !canContinueOnHead(view)}
                        onClick={() => dispatch({ type: "continueOnHead" })}
                      >
                        {t("citationAuthoring.author.conflictContinue", {
                          version: conflict.version,
                        })}
                      </Button>
                    </>
                  ) : (
                    // The current head could not be shown/validated: no consent token is offered; the draft stays.
                    <p className="text-xs text-amber-700">
                      {t("citationAuthoring.author.conflictUnavailable")}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || stale.length > 0} onClick={save}>
              {t("citationAuthoring.author.save", { version: draft.expectedVersion + 1 })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => dispatch({ type: "back" })}
            >
              {t("citationAuthoring.author.back")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
            <div className="text-sm">
              {t("citationAuthoring.author.family")}
              <div className="mt-1">
                <span className={chip}>{t(`citationReview.family.${draft.family}`)}</span>
              </div>
            </div>
            <label className="text-sm">
              {t("citationAuthoring.author.scope")}
              <select
                className={field}
                value={draft.scope ? `${draft.scope.panelId}:${draft.scope.panelVersion}` : ""}
                onChange={(e) => selectScope(e.target.value)}
              >
                <option value="">—</option>
                {scopes.map((s) => (
                  <option
                    key={`${s.panelId}:${s.panelVersion}`}
                    value={`${s.panelId}:${s.panelVersion}`}
                  >
                    {t(`citationAuthoring.panels.kind.${s.kind}`)} · {s.client.name} ·{" "}
                    {s.client.market} · v{s.panelVersion}
                  </option>
                ))}
              </select>
              {draft.expectedVersion > 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  {t("citationAuthoring.author.scopeNote")}
                </span>
              ) : null}
            </label>
            <label className="text-sm">
              {t("citationAuthoring.author.answer")}
              <select
                className={field}
                value={draft.answerId ?? ""}
                onChange={(e) => upd({ answerId: e.target.value || null })}
              >
                <option value="">
                  {answers.length ? "—" : t("citationAuthoring.author.answerNone")}
                </option>
                {answers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.input.capturedAt.slice(0, 10)} · {a.input.surface} ·{" "}
                    {a.prompt.data.prompt.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("citationAuthoring.author.source")}
              <select
                className={field}
                value={draft.sourceId ?? ""}
                onChange={(e) => upd({ sourceId: e.target.value || null })}
              >
                <option value="">
                  {sources.length ? "—" : t("citationAuthoring.author.sourceNone")}
                </option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · r{s.revision}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("citationAuthoring.author.entityMatch")}
              <select
                className={field}
                value={draft.entityMatch}
                onChange={(e) =>
                  upd({ entityMatch: e.target.value as FindingDraft["entityMatch"] })
                }
              >
                {(["confirmed", "ambiguous", "not_this_business"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`citationAuthoring.entity.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm space-y-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.answerComplete}
                  onChange={(e) => upd({ answerComplete: e.target.checked })}
                />
                {t("citationAuthoring.author.answerComplete")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.citationsComplete}
                  onChange={(e) => upd({ citationsComplete: e.target.checked })}
                />
                {t("citationAuthoring.author.citationsComplete")}
              </label>
            </div>
          </fieldset>
          <fieldset className="space-y-3" disabled={busy}>
            <label className="text-sm block">
              {t("citationAuthoring.author.observation")}
              <textarea
                className={area}
                rows={3}
                maxLength={4000}
                required
                value={draft.observation}
                onChange={(e) => upd({ observation: e.target.value })}
              />
            </label>
            <label className="text-sm block">
              {t("citationAuthoring.author.hypothesis")}
              <textarea
                className={area}
                rows={2}
                maxLength={2000}
                value={draft.hypothesis}
                onChange={(e) => upd({ hypothesis: e.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["competitorCited", "ownCited"] as const).map((k) => (
                <label key={k} className="text-sm">
                  {t(`citationAuthoring.author.${k}`)}
                  <select
                    className={field}
                    value={draft[k]}
                    onChange={(e) => upd({ [k]: e.target.value } as Partial<FindingDraft>)}
                  >
                    {(["unknown", "yes", "no"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationAuthoring.option.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          {/* Recommendation (family B) — distinct from observation and support. */}
          <fieldset className="space-y-2" disabled={busy}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.recommendation.enabled}
                onChange={(e) =>
                  upd({ recommendation: { ...draft.recommendation, enabled: e.target.checked } })
                }
              />
              {t("citationAuthoring.author.recommendation")}
            </label>
            {draft.recommendation.enabled ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  {t("citationAuthoring.author.recommendation")}
                  <select
                    className={field}
                    value={draft.recommendation.status}
                    onChange={(e) =>
                      upd({
                        recommendation: {
                          ...draft.recommendation,
                          status: e.target.value as FindingDraft["recommendation"]["status"],
                        },
                      })
                    }
                  >
                    {(
                      [
                        "recommended",
                        "mentioned_only",
                        "explicitly_not_recommended",
                        "not_present",
                        "unclear",
                      ] as const
                    ).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationAuthoring.recommendation.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.suitability")}
                  <select
                    className={field}
                    value={draft.recommendation.suitability}
                    onChange={(e) =>
                      upd({
                        recommendation: {
                          ...draft.recommendation,
                          suitability: e.target.value as "fits" | "does_not_fit" | "unknown",
                        },
                      })
                    }
                  >
                    {(["fits", "does_not_fit", "unknown"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationAuthoring.suitability.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  {t("citationAuthoring.author.recommendationPassage")}
                  <textarea
                    className={area}
                    rows={2}
                    maxLength={4000}
                    value={draft.recommendation.passage}
                    onChange={(e) =>
                      upd({ recommendation: { ...draft.recommendation, passage: e.target.value } })
                    }
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  {t("citationAuthoring.author.recommendationTarget")}
                  <input
                    className={field}
                    maxLength={300}
                    value={draft.recommendation.target}
                    onChange={(e) =>
                      upd({ recommendation: { ...draft.recommendation, target: e.target.value } })
                    }
                  />
                </label>
              </div>
            ) : null}
          </fieldset>
          {/* Source support claims — distinct from factual accuracy. */}
          <fieldset className="space-y-2" disabled={busy}>
            <div className="text-xs font-medium text-foreground/70">
              {t("citationAuthoring.author.support")}
            </div>
            {draft.support.map((s, i) => (
              <div key={i} className="rounded border border-border p-3 grid gap-2 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  {t("citationAuthoring.author.claimSpan")}
                  <input
                    className={field}
                    maxLength={4000}
                    value={s.claimSpan}
                    onChange={(e) =>
                      upd({
                        support: draft.support.map((x, j) =>
                          j === i ? { ...x, claimSpan: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.citedUrl")}
                  <input
                    className={field}
                    maxLength={2048}
                    value={s.citedUrl}
                    onChange={(e) =>
                      upd({
                        support: draft.support.map((x, j) =>
                          j === i ? { ...x, citedUrl: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.supportStatus")}
                  <select
                    className={field}
                    value={s.status}
                    onChange={(e) =>
                      upd({
                        support: draft.support.map((x, j) =>
                          j === i ? { ...x, status: e.target.value as typeof s.status } : x,
                        ),
                      })
                    }
                  >
                    {(
                      [
                        "supports",
                        "partly_supports",
                        "contradicts",
                        "unclear",
                        "not_checked",
                      ] as const
                    ).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationAuthoring.support.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {s.status !== "not_checked" ? (
                  <>
                    <label className="text-sm sm:col-span-2">
                      {t("citationAuthoring.author.sourcePassage")}
                      <textarea
                        className={area}
                        rows={2}
                        maxLength={4000}
                        value={s.sourcePassage}
                        onChange={(e) =>
                          upd({
                            support: draft.support.map((x, j) =>
                              j === i ? { ...x, sourcePassage: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      {t("citationAuthoring.author.sourceCapturedAt")}
                      {/* UTC wall-clock view of the stored instant; the stored string is kept verbatim until edited. */}
                      <input
                        className={field}
                        type="datetime-local"
                        step={1}
                        value={instantToUtcInput(s.sourceCapturedAt)}
                        onChange={(e) =>
                          upd({
                            support: draft.support.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    sourceCapturedAt: instantFromUtcInput(
                                      e.target.value,
                                      x.sourceCapturedAt,
                                    ),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                      <span className="block text-[11px] text-muted-foreground">
                        {t("citationAuthoring.author.utcInstant")}
                        {instantDisplayDiffers(s.sourceCapturedAt)
                          ? ` · ${t("citationAuthoring.author.storedInstant", { value: s.sourceCapturedAt })}`
                          : null}
                      </span>
                    </label>
                    <label className="text-sm">
                      {t("citationAuthoring.author.selectedRecord")}
                      <select
                        className={field}
                        value={
                          s.selectedRecord
                            ? `${s.selectedRecord.recordId}:${s.selectedRecord.recordRevision}`
                            : ""
                        }
                        onChange={(e) => {
                          const r = records.find((x) => `${x.id}:${x.revision}` === e.target.value);
                          upd({
                            support: draft.support.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    selectedRecord: r
                                      ? {
                                          sourceId: r.sourceId,
                                          recordId: r.id,
                                          sourceRevision: r.sourceRevision,
                                          recordRevision: r.revision,
                                        }
                                      : null,
                                  }
                                : x,
                            ),
                          });
                        }}
                      >
                        <option value="">{t("citationAuthoring.author.selectedRecordNone")}</option>
                        {records
                          .filter(
                            (r) =>
                              !draft.sourceId ||
                              r.sourceId.toLowerCase() === draft.sourceId.toLowerCase(),
                          )
                          .map((r) => (
                            <option key={`${r.id}:${r.revision}`} value={`${r.id}:${r.revision}`}>
                              {r.value.slice(0, 60)} · {r.locator} · r{r.revision}/s
                              {r.sourceRevision}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                ) : null}
                <label className="text-sm sm:col-span-2">
                  {t("citationAuthoring.author.reason")}
                  <input
                    className={field}
                    maxLength={500}
                    value={s.reason}
                    onChange={(e) =>
                      upd({
                        support: draft.support.map((x, j) =>
                          j === i ? { ...x, reason: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => upd({ support: draft.support.filter((_, j) => j !== i) })}
                  >
                    {t("citationAuthoring.common.remove")}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.support.length >= 20}
              onClick={() => upd({ support: [...draft.support, emptySupport()] })}
            >
              {t("citationAuthoring.author.addSupport")}
            </Button>
          </fieldset>
          {/* Factual accuracy claims — pinned to an exact dated fact version. */}
          <fieldset className="space-y-2" disabled={busy}>
            <div className="text-xs font-medium text-foreground/70">
              {t("citationAuthoring.author.accuracy")}
            </div>
            {draft.accuracy.map((a, i) => (
              <div key={i} className="rounded border border-border p-3 grid gap-2 sm:grid-cols-3">
                <label className="text-sm sm:col-span-3">
                  {t("citationAuthoring.author.claimSpan")}
                  <input
                    className={field}
                    maxLength={4000}
                    value={a.claimSpan}
                    onChange={(e) =>
                      upd({
                        accuracy: draft.accuracy.map((x, j) =>
                          j === i ? { ...x, claimSpan: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.accuracy")}
                  <select
                    className={field}
                    value={a.status}
                    onChange={(e) =>
                      upd({
                        accuracy: draft.accuracy.map((x, j) =>
                          j === i ? { ...x, status: e.target.value as typeof a.status } : x,
                        ),
                      })
                    }
                  >
                    {(
                      [
                        "accurate_at_capture",
                        "incorrect_at_capture",
                        "outdated_now",
                        "unclear",
                        "not_checked",
                      ] as const
                    ).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationAuthoring.accuracy.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  {t("citationAuthoring.author.fact")}
                  <select
                    className={field}
                    value={a.fact ? a.fact.factRowId : ""}
                    onChange={(e) => {
                      const row = (facts.data?.facts ?? []).find((f) => f.id === e.target.value);
                      upd({
                        accuracy: draft.accuracy.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                fact: row
                                  ? {
                                      factRowId: row.id,
                                      factId: row.record.factId,
                                      factVersion: row.version,
                                      factKind: row.record.kind,
                                    }
                                  : null,
                              }
                            : x,
                        ),
                      });
                    }}
                  >
                    <option value="">{t("citationAuthoring.author.factNone")}</option>
                    {factHeads.flatMap((c) =>
                      c.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {t(`citationAuthoring.kind.${v.record.kind}`)} ·{" "}
                          {v.record.value.slice(0, 50)} · v{v.version} ·{" "}
                          {v.record.validFrom.slice(0, 10)}
                        </option>
                      )),
                    )}
                  </select>
                </label>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => upd({ accuracy: draft.accuracy.filter((_, j) => j !== i) })}
                  >
                    {t("citationAuthoring.common.remove")}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.accuracy.length >= 20}
              onClick={() => upd({ accuracy: [...draft.accuracy, emptyAccuracy()] })}
            >
              {t("citationAuthoring.author.addAccuracy")}
            </Button>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-4" disabled={busy}>
            {(["harm", "relevance", "fixability"] as const).map((k) => (
              <label key={k} className="text-sm">
                {t(`citationAuthoring.priority.${k}`)}
                <select
                  className={field}
                  value={draft.priority[k]}
                  onChange={(e) =>
                    upd({
                      priority: {
                        ...draft.priority,
                        [k]: e.target.value as "low" | "medium" | "high",
                      },
                    })
                  }
                >
                  {(["low", "medium", "high"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`citationAuthoring.level.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="text-sm">
              {t("citationAuthoring.author.decision")}
              <select
                className={field}
                value={draft.decision}
                onChange={(e) => upd({ decision: e.target.value as Finding["decision"] })}
              >
                {(["needs_second_review", "accepted", "dismissed"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`citationReview.decision.${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {stale.length ? (
            <p className="text-xs text-amber-600">
              {t("citationAuthoring.author.stale", { fields: stale.join(", ") })}
            </p>
          ) : null}
          {issues.length ? (
            <div className="text-xs text-destructive">
              {t("citationAuthoring.author.issues")}
              <ul className="list-disc pl-4">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {errorKey ? (
            <p className="text-xs text-destructive">
              {t(`citationAuthoring.saveError.${errorKey}`)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {t("citationAuthoring.author.review")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => dispatch({ type: "cancel" })}
            >
              {t("citationAuthoring.common.cancel")}
            </Button>
          </div>
        </form>
      )}
      {list.length ? (
        <p className="text-[11px] text-muted-foreground">
          {list.filter((f) => scopeBinding(f.scopeEnforcedAt) === "legacy").length > 0
            ? t("citationAuthoring.binding.legacy")
            : t("citationAuthoring.binding.enforced")}
        </p>
      ) : null}
    </section>
  );
}
