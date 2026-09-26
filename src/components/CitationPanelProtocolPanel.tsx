import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { readAnswerEvidenceFn } from "@/lib/answer-evidence.functions";
import {
  lockCitationPanelFn,
  readCitationProtocolFn,
  saveCitationPanelDraftFn,
} from "@/lib/citation-protocol.functions";
import type { PanelProtocol } from "@/lib/citation-panel";
import {
  MAX_QUESTIONS,
  buildPanelDraft,
  currentPanelVersion,
  emptyPanelDraftForm,
  formFromPanel,
  lockIssues,
  panelHeads,
  stockholmLocalLabel,
  weeklyStockholmSlots,
  type PanelDraftForm,
  type PromptChoice,
} from "@/lib/citation-panel-ui";

const field = "mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm";
const chip =
  "text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-border text-muted-foreground";
const panelKey = (p: { panelId: string; version: number }) => `${p.panelId}:${p.version}`;

/**
 * Read-only view of ONE stored panel version exactly as the server holds it: every question with its bound prompt
 * id/revision and text, the declared languages, the true surface mode (an `api` mode is shown as such, never
 * rewritten), model/search evidence, every session and location control, and a discovery schedule with its
 * timezone and rounds (stored UTC instant + Stockholm wall-clock). Used for the lock review and for inspecting
 * already-locked versions; it renders nothing that is not stored.
 */
export function PanelDetailView({ panel }: { panel: PanelProtocol }) {
  const t = useT();
  const opt = (name: string) => t(`citationAuthoring.option.${name}`);
  const yesNo = (v: boolean | null) => (v === null ? opt("unknown") : v ? opt("yes") : opt("no"));
  const dash = "—";
  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-2 break-words" key={label}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <div className="space-y-3 text-xs" data-panel-detail={panelKey(panel)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {t("citationAuthoring.panels.detail.title", { version: panel.version })}
        </span>
        <span className={chip}>{t(`citationAuthoring.panels.kind.${panel.kind}`)}</span>
        <span className={chip}>{t(`citationAuthoring.panels.status.${panel.status}`)}</span>
        {panel.approval ? (
          <span className="text-muted-foreground">
            {t("citationAuthoring.panels.approvedAt", { date: panel.approval.approvedAt })}
          </span>
        ) : null}
      </div>
      <dl className="space-y-1">
        {row(t("citationAuthoring.panels.client"), panel.client.name)}
        {row(t("citationAuthoring.panels.market"), panel.client.market)}
        {row(t("citationAuthoring.panels.questionLanguage"), panel.questionLanguage)}
        {row(t("citationAuthoring.panels.interfaceLanguage"), panel.interfaceLanguage)}
      </dl>
      <div className="font-medium text-foreground/70">
        {t("citationAuthoring.panels.surface.title")}
      </div>
      <dl className="space-y-1">
        {row(t("citationAuthoring.panels.surface.service"), panel.surface.service)}
        {row(t("citationAuthoring.panels.surface.interface"), panel.surface.interface)}
        {row(
          t("citationAuthoring.panels.surface.mode"),
          t(`citationAuthoring.panels.surface.mode.${panel.surface.mode}`),
        )}
        {row(t("citationAuthoring.panels.surface.searchMode"), panel.surface.searchMode ?? dash)}
        {row(t("citationAuthoring.panels.surface.modelLabel"), panel.surface.modelLabel ?? dash)}
        {row(
          t("citationAuthoring.panels.surface.webSearch"),
          opt(panel.surface.webSearchEvidenced),
        )}
      </dl>
      <div className="font-medium text-foreground/70">
        {t("citationAuthoring.panels.session.title")}
      </div>
      <dl className="space-y-1">
        {row(t("citationAuthoring.panels.session.freshSession"), yesNo(panel.session.freshSession))}
        {row(
          t("citationAuthoring.panels.session.personalisation"),
          opt(panel.session.personalisation),
        )}
        {row(t("citationAuthoring.panels.session.signedIn"), opt(panel.session.signedIn))}
        {row(t("citationAuthoring.panels.session.memory"), opt(panel.session.memory))}
        {row(
          t("citationAuthoring.panels.session.customInstructions"),
          opt(panel.session.customInstructions),
        )}
        {row(
          t("citationAuthoring.panels.session.connectedTools"),
          opt(panel.session.connectedTools),
        )}
        {row(t("citationAuthoring.panels.session.accountTier"), panel.session.accountTier ?? dash)}
        {row(
          t("citationAuthoring.panels.session.extraInstruction"),
          panel.session.extraInstruction ?? opt("none"),
        )}
        {row(
          t("citationAuthoring.panels.session.priorMessages"),
          String(panel.session.priorMessages),
        )}
      </dl>
      <div className="font-medium text-foreground/70">
        {t("citationAuthoring.panels.collection.title")}
      </div>
      <dl className="space-y-1">
        {row(t("citationAuthoring.panels.collection.country"), panel.collection.country ?? dash)}
        {row(t("citationAuthoring.panels.collection.city"), panel.collection.city ?? dash)}
        {row(
          t("citationAuthoring.panels.collection.devicePermission"),
          opt(panel.collection.devicePermission),
        )}
        {row(t("citationAuthoring.panels.collection.vpn"), yesNo(panel.collection.vpn))}
      </dl>
      <div className="font-medium text-foreground/70">
        {t("citationAuthoring.panels.questions")} ({panel.questions.length})
      </div>
      <ol className="list-decimal pl-5 space-y-1">
        {panel.questions.map((q) => (
          <li key={q.id} className="break-words">
            <span className="font-medium">{q.id}</span> · {q.text}
            <span className="block text-muted-foreground">
              {t("citationAuthoring.panels.detail.revision", {
                id: q.promptId,
                revision: q.promptRevision,
              })}{" "}
              · {q.language}
            </span>
          </li>
        ))}
      </ol>
      <div className="font-medium text-foreground/70">
        {t("citationAuthoring.panels.schedulePreview")}
      </div>
      {panel.schedule ? (
        <dl className="space-y-1">
          {row(t("citationAuthoring.panels.detail.timezone"), panel.schedule.timezone)}
          {row(t("citationAuthoring.panels.detail.rounds"), String(panel.rounds))}
          {panel.schedule.slots.map((s) =>
            row(
              `${s.round}`,
              `${stockholmLocalLabel(s.intendedAt)} (${panel.schedule!.timezone}) · ${s.intendedAt}`,
            ),
          )}
        </dl>
      ) : (
        <p className="text-muted-foreground">
          {panel.kind === "brand"
            ? t("citationAuthoring.panels.detail.noSchedule")
            : `${t("citationAuthoring.panels.detail.rounds")}: ${panel.rounds}`}
        </p>
      )}
    </div>
  );
}

/**
 * Owner draft → explicit review → approve-and-lock flow over the RELEASED P2 contracts (`readCitationProtocolFn`,
 * `saveCitationPanelDraftFn`, `lockCitationPanelFn`). Every question binds to a saved prompt revision (the RPC
 * refuses anything else), a discovery panel needs the 10×4 grid and a prospective Stockholm schedule, and the
 * server mints the approval receipt. Nothing here schedules, captures, seeds or approves automatically.
 */
export function CitationPanelProtocolPanel({
  projectId,
  ownerId,
  seed,
  initialView,
}: {
  projectId: string;
  ownerId: string;
  seed: { clientName: string; market: string; language: string };
  /** Test seam only: open the stored detail of a head and/or the lock review for a draft head
   * (`"panelId:version"`) on first render, for static assertions. Never used by the route. */
  initialView?: { inspect?: string; lockCandidate?: string };
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const reviewHeadingId = useId();
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
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
  const panels = useMemo(() => protocol.data?.panels ?? [], [protocol.data]);
  const heads = useMemo(() => panelHeads(panels), [panels]);
  const prompts: PromptChoice[] = useMemo(
    () =>
      (evidence.data?.prompts ?? []).map((p) => ({
        id: p.id,
        revision: p.revision,
        text: p.data.prompt,
        language: p.data.language,
      })),
    [evidence.data],
  );
  // Draft form and lock candidate are bound to the owner+project identity they were started in: after the
  // AppShell project picker swaps the active project in place, a previous project's draft is neither shown nor
  // saved/locked under the new one.
  const identity = `${ownerId.toLowerCase()}:${projectId}`;
  const [editingState, setEditingState] = useState<{
    identity: string;
    editing: { panelId: string; expected: number; form: PanelDraftForm } | null;
  }>({ identity, editing: null });
  const editing = editingState.identity === identity ? editingState.editing : null;
  const setEditing = (next: { panelId: string; expected: number; form: PanelDraftForm } | null) =>
    setEditingState({ identity, editing: next });
  const [lockState, setLockState] = useState<{
    identity: string;
    candidate: PanelProtocol | null;
    /** Test seam: a "panelId:version" resolved against the loaded heads until the owner acts. */
    seedKey: string | null;
  }>({ identity, candidate: null, seedKey: initialView?.lockCandidate ?? null });
  const lockCandidate =
    lockState.identity === identity
      ? (lockState.candidate ??
        (lockState.seedKey
          ? (heads.find((h) => panelKey(h) === lockState.seedKey && h.status === "draft") ?? null)
          : null))
      : null;
  const setLockCandidate = (next: PanelProtocol | null) =>
    setLockState({ identity, candidate: next, seedKey: null });
  // Which stored head is expanded read-only (locked or draft); independent of the lock review.
  const [inspectKey, setInspectKey] = useState<string | null>(initialView?.inspect ?? null);
  const [busy, setBusy] = useState(false);
  // LIVE identity for async continuations (the route-level key remount is the production guard; this is the
  // in-instance fallback the save/lock closures compare against, not their own captured props).
  const liveIdentity = useRef(identity);
  liveIdentity.current = identity;
  // The review region is non-modal; when it opens, keyboard focus moves to its heading so the owner reads the
  // stored version from the top before reaching Approve and lock.
  const lockCandidateKey = lockCandidate ? panelKey(lockCandidate) : null;
  useEffect(() => {
    if (lockCandidateKey) reviewHeadingRef.current?.focus();
  }, [lockCandidateKey]);
  const [issues, setIssues] = useState<string[]>([]);
  const [msg, setMsg] = useState<{
    tone: "ok" | "error";
    key: string;
    vars?: Record<string, string | number>;
  } | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["citation-protocol", ownerId, projectId] });

  function startNew() {
    setMsg(null);
    setIssues([]);
    setLockCandidate(null);
    setEditing({
      panelId: crypto.randomUUID(),
      expected: 0,
      form: emptyPanelDraftForm(seed),
    });
  }
  function startRevise(panel: PanelProtocol) {
    setMsg(null);
    setIssues([]);
    setLockCandidate(null);
    setEditing({
      panelId: panel.panelId,
      expected: currentPanelVersion(panels, panel.panelId),
      form: formFromPanel(panel),
    });
  }
  async function saveDraft() {
    if (!editing || busy) return;
    const built = buildPanelDraft(editing.form, editing.panelId, editing.expected, prompts);
    if (!built.ok) {
      setIssues(built.issues);
      return;
    }
    setBusy(true);
    setIssues([]);
    setMsg(null);
    const startedFor = identity;
    try {
      await saveCitationPanelDraftFn({
        data: {
          ...scope,
          panelId: editing.panelId,
          expected: editing.expected,
          panel: built.draft,
        },
      });
      if (liveIdentity.current !== startedFor) return;
      setMsg({
        tone: "ok",
        key: "citationAuthoring.panels.saved",
        vars: { version: built.draft.version },
      });
      setEditing(null);
      await refresh();
    } catch {
      if (liveIdentity.current !== startedFor) return;
      // The draft form stays exactly as typed; no success is claimed.
      setMsg({ tone: "error", key: "citationAuthoring.panels.saveFailed" });
    } finally {
      setBusy(false);
    }
  }
  async function lock() {
    if (!lockCandidate || busy) return;
    setBusy(true);
    setMsg(null);
    const startedFor = identity;
    try {
      // The server refuses a stale candidate (expectedVersion ≠ stored head) — no client-side override.
      const locked = await lockCitationPanelFn({
        data: { ...scope, panelId: lockCandidate.panelId, expectedVersion: lockCandidate.version },
      });
      if (liveIdentity.current !== startedFor) return;
      setMsg({
        tone: "ok",
        key: "citationAuthoring.panels.locked",
        vars: { version: locked.version },
      });
      setLockCandidate(null);
      await refresh();
    } catch {
      if (liveIdentity.current !== startedFor) return;
      setMsg({ tone: "error", key: "citationAuthoring.panels.lockFailed" });
    } finally {
      setBusy(false);
    }
  }

  const opt = (name: string) => t(`citationAuthoring.option.${name}`);
  const update = (patch: Partial<PanelDraftForm>) =>
    setEditingState((s) =>
      s.identity === identity && s.editing
        ? { identity, editing: { ...s.editing, form: { ...s.editing.form, ...patch } } }
        : s,
    );

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationAuthoring.panels.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t("citationAuthoring.panels.intro")}
        </p>
      </header>
      {protocol.isError || evidence.isError ? (
        <p className="text-sm text-destructive">{t("citationAuthoring.panels.error")}</p>
      ) : protocol.isPending || evidence.isPending ? (
        <p className="text-sm text-muted-foreground">{t("citationAuthoring.common.loading")}</p>
      ) : (
        <>
          {heads.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("citationAuthoring.panels.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {heads.map((p) => {
                const lockable = p.status === "draft";
                const why = lockable ? lockIssues(p, Date.now()) : [];
                return (
                  <li
                    key={`${p.panelId}:${p.version}`}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {t(`citationAuthoring.panels.kind.${p.kind}`)}
                      </span>
                      <span className={chip}>
                        {t(`citationAuthoring.panels.status.${p.status}`)}
                      </span>
                      <span className={chip}>
                        {t("citationAuthoring.panels.version", { version: p.version })}
                      </span>
                      <span className="text-muted-foreground">
                        {p.client.name} · {p.client.market}
                      </span>
                      {p.approval ? (
                        <span className="text-[11px] text-muted-foreground">
                          {t("citationAuthoring.panels.approvedAt", {
                            date: p.approval.approvedAt.slice(0, 10),
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={inspectKey === panelKey(p)}
                        onClick={() =>
                          setInspectKey((k) => (k === panelKey(p) ? null : panelKey(p)))
                        }
                      >
                        {inspectKey === panelKey(p)
                          ? t("citationAuthoring.panels.hideDetail")
                          : t("citationAuthoring.panels.inspect")}
                      </Button>
                      {lockable ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => startRevise(p)}
                          >
                            {t("citationAuthoring.panels.edit")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy || why.length > 0}
                            onClick={() => setLockCandidate(p)}
                          >
                            {t("citationAuthoring.panels.reviewLock")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                    {inspectKey === panelKey(p) ? (
                      <div className="mt-2 rounded border border-border p-3">
                        <PanelDetailView panel={p} />
                      </div>
                    ) : null}
                    {why.length ? (
                      <div className="mt-2 text-xs text-amber-600">
                        {t("citationAuthoring.panels.lockIssues")}
                        <ul className="list-disc pl-4">
                          {why.map((w) => (
                            <li key={w}>{t(`citationAuthoring.lockIssue.${w}`)}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {lockCandidate ? (
            // Non-modal, labelled review region: the EXACT stored draft is shown read-only; nothing is written
            // until "Approve and lock" is clicked, Cancel closes it, and a stale candidate is refused by the server.
            <section
              role="region"
              aria-labelledby={reviewHeadingId}
              className="rounded-lg border border-foreground/40 p-4 space-y-3"
            >
              <h4
                id={reviewHeadingId}
                ref={reviewHeadingRef}
                tabIndex={-1}
                className="text-sm font-medium outline-none"
              >
                {t("citationAuthoring.panels.lockConfirmTitle")}
                <span className="sr-only"> · {t("citationAuthoring.panels.reviewRegion")}</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("citationAuthoring.panels.lockConfirmBody", {
                  version: lockCandidate.version + 1,
                })}
              </p>
              <PanelDetailView panel={lockCandidate} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={lock}>
                  {t("citationAuthoring.panels.lock")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setLockCandidate(null)}
                >
                  {t("citationAuthoring.common.cancel")}
                </Button>
              </div>
            </section>
          ) : null}
          {!editing ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={startNew}>
              {t("citationAuthoring.panels.new")}
            </Button>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveDraft();
              }}
            >
              <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
                <label className="text-sm">
                  {t("citationAuthoring.panels.kind")}
                  <select
                    className={field}
                    value={editing.form.kind}
                    onChange={(e) => update({ kind: e.target.value as PanelDraftForm["kind"] })}
                  >
                    <option value="discovery">
                      {t("citationAuthoring.panels.kind.discovery")}
                    </option>
                    <option value="brand">{t("citationAuthoring.panels.kind.brand")}</option>
                  </select>
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.panels.client")}
                  <input
                    className={field}
                    maxLength={200}
                    value={editing.form.client.name}
                    onChange={(e) =>
                      update({ client: { ...editing.form.client, name: e.target.value } })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.panels.market")}
                  <input
                    className={field}
                    maxLength={120}
                    value={editing.form.client.market}
                    onChange={(e) =>
                      update({ client: { ...editing.form.client, market: e.target.value } })
                    }
                  />
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.panels.questionLanguage")}
                  <input
                    className={field}
                    maxLength={40}
                    value={editing.form.questionLanguage}
                    onChange={(e) => update({ questionLanguage: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.panels.interfaceLanguage")}
                  <input
                    className={field}
                    maxLength={40}
                    value={editing.form.interfaceLanguage}
                    onChange={(e) => update({ interfaceLanguage: e.target.value })}
                  />
                </label>
              </fieldset>
              <div className="text-xs font-medium text-foreground/70">
                {t("citationAuthoring.panels.surface.title")}
              </div>
              <fieldset className="grid gap-3 sm:grid-cols-3" disabled={busy}>
                {(["service", "interface", "searchMode", "modelLabel"] as const).map((k) => (
                  <label key={k} className="text-sm">
                    {t(`citationAuthoring.panels.surface.${k}`)}
                    <input
                      className={field}
                      maxLength={120}
                      value={editing.form.surface[k]}
                      onChange={(e) =>
                        update({ surface: { ...editing.form.surface, [k]: e.target.value } })
                      }
                    />
                  </label>
                ))}
                <label className="text-sm">
                  {t("citationAuthoring.panels.surface.mode")}
                  <select
                    className={field}
                    value={editing.form.surface.mode}
                    onChange={(e) =>
                      update({
                        surface: {
                          ...editing.form.surface,
                          mode: e.target.value as "consumer-web" | "search",
                        },
                      })
                    }
                  >
                    <option value="consumer-web">
                      {t("citationAuthoring.panels.surface.mode.consumer-web")}
                    </option>
                    <option value="search">
                      {t("citationAuthoring.panels.surface.mode.search")}
                    </option>
                  </select>
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.panels.surface.webSearch")}
                  <select
                    className={field}
                    value={editing.form.surface.webSearchEvidenced}
                    onChange={(e) =>
                      update({
                        surface: {
                          ...editing.form.surface,
                          webSearchEvidenced: e.target
                            .value as PanelDraftForm["surface"]["webSearchEvidenced"],
                        },
                      })
                    }
                  >
                    {(["evidenced", "not_evidenced", "unknown"] as const).map((v) => (
                      <option key={v} value={v}>
                        {opt(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <div className="text-xs font-medium text-foreground/70">
                {t("citationAuthoring.panels.session.title")}
              </div>
              <fieldset className="grid gap-3 sm:grid-cols-3" disabled={busy}>
                {(
                  [
                    ["personalisation", ["non_personalised", "personalised", "unknown"]],
                    ["signedIn", ["signed_in", "signed_out", "unknown"]],
                    ["memory", ["off", "on", "unknown"]],
                    ["customInstructions", ["none", "present", "unknown"]],
                    ["connectedTools", ["none", "present", "unknown"]],
                  ] as const
                ).map(([k, options]) => (
                  <label key={k} className="text-sm">
                    {t(`citationAuthoring.panels.session.${k}`)}
                    <select
                      className={field}
                      value={editing.form.session[k]}
                      onChange={(e) =>
                        update({ session: { ...editing.form.session, [k]: e.target.value } })
                      }
                    >
                      {options.map((v) => (
                        <option key={v} value={v}>
                          {opt(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="text-sm">
                  {t("citationAuthoring.panels.session.accountTier")}
                  <input
                    className={field}
                    maxLength={40}
                    value={editing.form.session.accountTier}
                    onChange={(e) =>
                      update({ session: { ...editing.form.session, accountTier: e.target.value } })
                    }
                  />
                </label>
              </fieldset>
              <div className="text-xs font-medium text-foreground/70">
                {t("citationAuthoring.panels.collection.title")}
              </div>
              <fieldset className="grid gap-3 sm:grid-cols-4" disabled={busy}>
                {(["country", "city"] as const).map((k) => (
                  <label key={k} className="text-sm">
                    {t(`citationAuthoring.panels.collection.${k}`)}
                    <input
                      className={field}
                      maxLength={120}
                      value={editing.form.collection[k]}
                      onChange={(e) =>
                        update({ collection: { ...editing.form.collection, [k]: e.target.value } })
                      }
                    />
                  </label>
                ))}
                <label className="text-sm">
                  {t("citationAuthoring.panels.collection.devicePermission")}
                  <select
                    className={field}
                    value={editing.form.collection.devicePermission}
                    onChange={(e) =>
                      update({
                        collection: {
                          ...editing.form.collection,
                          devicePermission: e.target
                            .value as PanelDraftForm["collection"]["devicePermission"],
                        },
                      })
                    }
                  >
                    {(["granted", "denied", "unknown"] as const).map((v) => (
                      <option key={v} value={v}>
                        {opt(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.panels.collection.vpn")}
                  <select
                    className={field}
                    value={editing.form.collection.vpn}
                    onChange={(e) =>
                      update({
                        collection: {
                          ...editing.form.collection,
                          vpn: e.target.value as "unknown" | "yes" | "no",
                        },
                      })
                    }
                  >
                    {(["unknown", "yes", "no"] as const).map((v) => (
                      <option key={v} value={v}>
                        {opt(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <div className="text-xs font-medium text-foreground/70">
                {t("citationAuthoring.panels.questions")}
              </div>
              {prompts.length === 0 ? (
                <p className="text-xs text-amber-600">{t("citationAuthoring.panels.noPrompts")}</p>
              ) : (
                <ol className="space-y-2">
                  {editing.form.questionKeys.map((key, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <select
                        className={`${field} mt-0 flex-1 min-w-48`}
                        aria-label={`${t("citationAuthoring.panels.questions")} ${i + 1}`}
                        value={key}
                        disabled={busy}
                        onChange={(e) => {
                          const next = [...editing.form.questionKeys];
                          next[i] = e.target.value;
                          update({ questionKeys: next });
                        }}
                      >
                        {prompts.map((p) => (
                          <option key={`${p.id}:${p.revision}`} value={`${p.id}:${p.revision}`}>
                            {p.text.slice(0, 90)} · r{p.revision} · {p.language}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          update({
                            questionKeys: editing.form.questionKeys.filter((_, j) => j !== i),
                          })
                        }
                      >
                        {t("citationAuthoring.common.remove")}
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  busy || prompts.length === 0 || editing.form.questionKeys.length >= MAX_QUESTIONS
                }
                onClick={() =>
                  update({
                    questionKeys: [
                      ...editing.form.questionKeys,
                      `${prompts[0].id}:${prompts[0].revision}`,
                    ],
                  })
                }
              >
                {t("citationAuthoring.panels.addQuestion")}
              </Button>
              {editing.form.kind === "discovery" ? (
                <fieldset className="grid gap-3 sm:grid-cols-3" disabled={busy}>
                  <legend className="text-xs font-medium text-foreground/70">
                    {t("citationAuthoring.panels.firstSlot")}
                  </legend>
                  <label className="text-sm">
                    {t("citationAuthoring.panels.slotDate")}
                    <input
                      className={field}
                      type="date"
                      value={editing.form.firstSlot.date}
                      onChange={(e) =>
                        update({ firstSlot: { ...editing.form.firstSlot, date: e.target.value } })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    {t("citationAuthoring.panels.slotTime")}
                    <input
                      className={field}
                      type="time"
                      value={editing.form.firstSlot.time}
                      onChange={(e) =>
                        update({ firstSlot: { ...editing.form.firstSlot, time: e.target.value } })
                      }
                    />
                  </label>
                  <div className="text-xs text-muted-foreground">
                    <div>{t("citationAuthoring.panels.schedulePreview")}</div>
                    <ul>
                      {(weeklyStockholmSlots(editing.form.firstSlot, 4) ?? []).map((s) => (
                        <li key={s.round}>
                          {s.round}: {s.intendedAt.slice(0, 16).replace("T", " ")} UTC
                        </li>
                      ))}
                    </ul>
                  </div>
                </fieldset>
              ) : null}
              {issues.length ? (
                <ul className="text-xs text-destructive list-disc pl-4">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" type="submit" disabled={busy}>
                  {t("citationAuthoring.panels.saveDraft", { version: editing.expected + 1 })}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  {t("citationAuthoring.common.cancel")}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      {msg ? (
        <p className={`text-xs ${msg.tone === "ok" ? "text-emerald-600" : "text-destructive"}`}>
          {t(msg.key, msg.vars)}
        </p>
      ) : null}
    </section>
  );
}
