import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import {
  EVIDENCE_QUALITIES,
  answerEvidenceSchema,
  evidenceCohorts,
  evidenceFocusIds,
  evidencePromptSchema,
  supersededAnswerIds,
  type AnswerEvidence,
  type EvidenceCohort,
  type EvidenceFocus,
  type EvidencePrompt,
  type EvidenceRow,
} from "@/lib/answer-evidence";
import { canonicalUuid } from "@/lib/pg-uuid";
import {
  readAnswerEvidenceFn,
  saveEvidencePromptFn,
  importAnswerEvidenceFn,
  removeAnswerEvidenceFn,
} from "@/lib/answer-evidence.functions";

const fieldClass = "mt-1 block w-full rounded border bg-background p-2 text-sm";
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AnswerEvidencePanel({
  projectId,
  initialFocus,
}: {
  projectId: string;
  /** Test/harness seam only: a pre-selected drill-down. */
  initialFocus?: EvidenceFocus;
}) {
  const { user } = useAuth();
  // Keyed by actor + project: a switch remounts, so no comparison or drill-down survives it.
  return user ? (
    <ProjectEvidence
      key={`${user.id}:${projectId}`}
      projectId={projectId}
      ownerId={user.id}
      initialFocus={initialFocus}
    />
  ) : null;
}
function ProjectEvidence({
  projectId,
  ownerId,
  initialFocus,
}: {
  projectId: string;
  ownerId: string;
  initialFocus?: EvidenceFocus;
}) {
  const t = useT();
  const scope = { projectId, expectedOwnerId: ownerId };
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [editing, setEditing] = useState<EvidencePrompt | null>(null);
  const [correction, setCorrection] = useState<EvidenceRow | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [removal, setRemoval] = useState<{ id: string; kind: "prompt" | "answer" } | null>(null);
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [focus, setFocus] = useState<EvidenceFocus | null>(initialFocus ?? null);
  const recordsHeading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: ["answer-evidence", ownerId, projectId],
    queryFn: () => readAnswerEvidenceFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const state = query.data;
  const latest = useMemo(() => {
    const m = new Map<string, EvidencePrompt>();
    for (const p of state?.prompts ?? [])
      if (!m.has(p.id) || m.get(p.id)!.revision < p.revision) m.set(p.id, p);
    return [...m.values()];
  }, [state]);
  const cohorts = useMemo(() => {
    try {
      return evidenceCohorts(state?.answers ?? [], start + "T00:00:00Z", end + "T00:00:00Z");
    } catch {
      return null;
    }
  }, [state, start, end]);
  // Canonical UUID identity: a correction stored with an upper/mixed-case `supersedesId` still retires its
  // predecessor. Stored ids are displayed and exported unchanged.
  const superseded = useMemo(() => supersededAnswerIds(state?.answers ?? []), [state]);
  const isSuperseded = (id: string) => superseded.has(canonicalUuid(id));
  // The drill-down is recomputed from the current result; a selection outside it shows nothing selected.
  const focusIds = focus && cohorts ? evidenceFocusIds(cohorts, focus) : null;
  const focusSet = focusIds ? new Set(focusIds.map(canonicalUuid)) : null;
  const shownAnswers = focusSet
    ? (state?.answers ?? []).filter((a) => focusSet.has(canonicalUuid(a.id)))
    : (state?.answers ?? []);
  // Opening and clearing a drill-down both land keyboard focus on the records heading, so the control that
  // disappears never drops a keyboard user back to the start of the page.
  function inspect(next: EvidenceFocus | null) {
    setFocus(next);
    requestAnimationFrame(() => recordsHeading.current?.focus());
  }
  async function mutate(operation: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    try {
      await operation();
      await query.refetch({ throwOnError: true });
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const label = (key: string) => t("answer." + key);
  const result = (v: boolean | null) => label(v === null ? "unknown" : v ? "yes" : "no");
  return (
    <section
      className="rounded-xl border p-5 mb-6 space-y-5"
      aria-labelledby="answer-evidence-title"
    >
      <h2 id="answer-evidence-title" className="font-display text-xl">
        {label("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{label("help")}</p>
      <p className="text-xs text-muted-foreground">{label("capacity")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          {label("refresh")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !state || query.isError}
          onClick={() =>
            download(`milo-answer-evidence-${projectId}.json`, {
              format: "milo-owner-answer-evidence-v1",
              projectId,
              verified: false,
              exportedAt: new Date().toISOString(),
              ...state,
            })
          }
        >
          {label("export")}
        </Button>
      </div>
      {(error || query.isError) && <p role="alert">{label("error")}</p>}
      {query.isPending && <p role="status">{label("loading")}</p>}
      {state && !query.isError && (
        <>
          <details open className="rounded-lg border p-4">
            <summary className="font-medium cursor-pointer">
              {label("prompts")} · {latest.length}
            </summary>
            <ul className="my-4 space-y-3">
              {latest.map((p) => (
                <li key={p.id} className="rounded border p-3 space-y-2">
                  <p className="whitespace-pre-wrap break-words">{p.data.prompt}</p>
                  <p className="text-xs">
                    {p.data.market} · {p.data.language} · {label("revision")} {p.revision} ·{" "}
                    {label("active")}: {result(p.data.active)}
                  </p>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(p)}>
                    {label("edit")}
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setRemoval({ id: p.id, kind: "prompt" })}
                  >
                    {label("remove")}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setFormVersion((v) => v + 1);
              }}
            >
              {label("new")}
            </Button>
            <form
              key={`${editing?.id ?? "new"}:${editing?.revision ?? 0}:${formVersion}`}
              className="mt-4 grid gap-3 md:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const read = (k: string) => String(f.get(k) ?? "");
                const ok = await mutate(async () => {
                  const prompt = evidencePromptSchema.parse({
                    prompt: read("prompt"),
                    intent: read("intent"),
                    source: read("source"),
                    market: read("market"),
                    language: read("language"),
                    brand: read("brand"),
                    websiteUrl: read("website"),
                    competitorUrls: read("competitors")
                      .split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                    active: f.has("active"),
                  });
                  await saveEvidencePromptFn({
                    data: {
                      ...scope,
                      id: editing?.id ?? crypto.randomUUID(),
                      expected: editing?.revision ?? 0,
                      prompt,
                    },
                  });
                });
                if (ok) {
                  setEditing(null);
                  setFormVersion((v) => v + 1);
                }
              }}
            >
              <fieldset disabled={busy} className="contents">
                {(
                  [
                    "prompt",
                    "intent",
                    "market",
                    "language",
                    "brand",
                    "website",
                    "competitors",
                  ] as const
                ).map((key) => (
                  <label key={key} className="text-sm">
                    {label(key)}
                    <textarea
                      className={fieldClass}
                      name={key}
                      required={key !== "competitors"}
                      maxLength={
                        key === "prompt"
                          ? 2000
                          : key === "competitors"
                            ? 21000
                            : key === "website"
                              ? 2048
                              : 120
                      }
                      rows={key === "prompt" ? 3 : 1}
                      defaultValue={
                        key === "website"
                          ? editing?.data.websiteUrl
                          : key === "competitors"
                            ? editing?.data.competitorUrls.join("\n")
                            : (editing?.data[key] ?? "")
                      }
                    />
                  </label>
                ))}
                <label className="text-sm">
                  {label("source")}
                  <select
                    name="source"
                    className={fieldClass}
                    defaultValue={editing?.data.source ?? "manual"}
                  >
                    {["manual", "gsc", "service", "readiness"].map((v) => (
                      <option key={v} value={v}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={editing?.data.active ?? true}
                  />{" "}
                  {label("active")}
                </label>
                <Button type="submit">{label("save")}</Button>
              </fieldset>
            </form>
          </details>
          {state.prompts.length > 0 && (
            <details open className="rounded-lg border p-4">
              <summary className="font-medium cursor-pointer">{label("capture")}</summary>
              {correction && (
                <p className="my-3 text-sm">
                  {label("correction")}{" "}
                  <Button variant="outline" onClick={() => setCorrection(null)} disabled={busy}>
                    {label("cancel")}
                  </Button>
                </p>
              )}
              <AnswerForm
                key={`${correction?.id ?? "new"}:${formVersion}`}
                prompts={state.prompts}
                correction={correction}
                busy={busy}
                onSave={async (answer) => {
                  const ok = await mutate(() =>
                    importAnswerEvidenceFn({ data: { ...scope, answer } }),
                  );
                  if (ok) {
                    setCorrection(null);
                    setFormVersion((v) => v + 1);
                  }
                }}
              />
              <label className="mt-4 block text-sm">
                {label("import")}
                <input
                  className={fieldClass}
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await mutate(async () => {
                      if (file.size > 90000) throw Error();
                      const answer = answerEvidenceSchema.parse(JSON.parse(await file.text()));
                      await importAnswerEvidenceFn({ data: { ...scope, answer } });
                    });
                  }}
                />
              </label>
            </details>
          )}
          {removal && (
            <div className="rounded border border-destructive p-4 space-y-3" role="alert">
              <p>{label("confirmRemove")}</p>
              <Button
                disabled={busy}
                variant="destructive"
                onClick={async () => {
                  const ok = await mutate(() =>
                    removeAnswerEvidenceFn({ data: { ...scope, ...removal } }),
                  );
                  if (ok) {
                    setRemoval(null);
                    setEditing(null);
                    setCorrection(null);
                  }
                }}
              >
                {label("remove")}
              </Button>{" "}
              <Button disabled={busy} variant="outline" onClick={() => setRemoval(null)}>
                {label("cancel")}
              </Button>
            </div>
          )}
          <h3 className="font-display text-lg">{label("window")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["start", start, setStart],
              ["end", end, setEnd],
            ].map(([key, value, setter]) => (
              <label key={String(key)} className="text-sm">
                {label(String(key))}
                <input
                  type="date"
                  className={fieldClass}
                  value={String(value)}
                  onChange={(e) => {
                    setFocus(null);
                    (setter as (s: string) => void)(e.target.value);
                  }}
                />
              </label>
            ))}
          </div>
          {!cohorts && <p role="alert">{label("error")}</p>}
          {cohorts?.map((g) => (
            <article key={g.key} className="rounded border p-3 text-sm space-y-2">
              <p className="whitespace-pre-wrap break-words">
                {g.sample.prompt.data.prompt} · {label("revision")} {g.sample.prompt.revision}
              </p>
              <p>
                {g.sample.input.surface} · {label(g.sample.input.mode)} · {g.sample.input.method} ·{" "}
                {g.sample.input.modelVersion ?? label("unknown")} · {g.sample.prompt.data.market} ·{" "}
                {g.sample.prompt.data.language}
              </p>
              <p>
                {label("mentions")}:{" "}
                {g.mentionSamples ? `${g.mentions}/${g.mentionSamples}` : label("unknown")}
              </p>
              <p>
                {t("answer.samples", { count: g.total })} {label("unverified")}
              </p>
              <DomainCoverageView cohort={g} focus={focus} onInspect={inspect} />
            </article>
          ))}
          {cohorts && !cohorts.length && (
            <p className="text-sm">{t("answerCoverage.noneInWindow")}</p>
          )}
          <p className="text-xs text-muted-foreground">{label("limits")}</p>
          <h3 ref={recordsHeading} tabIndex={-1} className="font-display text-lg">
            {label("answers")} · {state.answers.length}
          </h3>
          {focus && focusIds && (
            <div
              role="status"
              data-evidence-focus={focus.kind}
              className="flex flex-wrap items-center gap-2 rounded border bg-muted/40 p-3 text-sm"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {t("answerCoverage.showing", {
                  count: shownAnswers.length,
                  label:
                    focus.kind === "present"
                      ? t("answerCoverage.focus.present", { host: focus.host })
                      : t(`answerCoverage.focus.${focus.kind}`),
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                className={wrappingControl}
                onClick={() => inspect(null)}
              >
                {t("answerCoverage.showAll")}
              </Button>
            </div>
          )}
          {!state.answers.length && <p className="text-sm">{label("empty")}</p>}
          {shownAnswers.map((row) => (
            <details key={row.id} className="rounded border p-4">
              <summary className="cursor-pointer break-words">
                {row.input.surface} · {label(row.input.mode)} · {row.input.capturedAt} ·{" "}
                {label(row.input.status)}
                {isSuperseded(row.id) ? ` · ${label("superseded")}` : ""}
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <p>
                  {label("unverified")} · {row.id}
                </p>
                <p className="whitespace-pre-wrap">
                  {row.prompt.data.prompt} · {label("revision")} {row.prompt.revision} ·{" "}
                  {row.prompt.data.intent} · {label(row.prompt.data.source)}
                </p>
                <p>
                  {row.prompt.data.market} · {row.prompt.data.language} · {row.input.method} ·{" "}
                  {row.input.modelVersion ?? label("unknown")}
                </p>
                <p>
                  {label("brand")}: {row.prompt.data.brand} · {label("website")}:{" "}
                  {row.prompt.data.websiteUrl}
                </p>
                <p>
                  {label("mentions")}: {result(row.analysis.mention)} · {label("ownCitations")}:{" "}
                  {result(row.analysis.ownCitation)}
                </p>
                <p>
                  {label("cost")}:{" "}
                  {row.input.reportedCostUsd === null
                    ? label("unknown")
                    : `USD ${row.input.reportedCostUsd}`}
                </p>
                {row.input.sourceUrl && (
                  <p className="break-all">
                    {label("sourceUrl")}: {row.input.sourceUrl}
                  </p>
                )}
                {row.input.failure && (
                  <p className="whitespace-pre-wrap">
                    {label("failure")}: {row.input.failure}
                  </p>
                )}
                <pre className="whitespace-pre-wrap break-words rounded bg-muted p-3 max-h-96 overflow-auto font-sans">
                  {row.input.rawAnswer}
                </pre>
                <ul>
                  {row.analysis.citations.map((c) => (
                    <li key={c.url} className="break-all">
                      {label(c.kind)}: {c.url}
                    </li>
                  ))}
                </ul>
                <p>
                  {label("citationsComplete")}: {result(row.input.citationsComplete)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || isSuperseded(row.id)}
                  onClick={() => setCorrection(row)}
                >
                  {label("correct")}
                </Button>{" "}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRemoval({ kind: "answer", id: row.id })}
                >
                  {label("remove")}
                </Button>
              </div>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
/**
 * Supplied-citation coverage of one cohort: per declared domain, x of the SAME n eligible answers, with the
 * exact answers behind every number one keyboard action away. Declared order, never ranked.
 */
/** Coverage controls wrap inside narrow screens: the shared button never wraps and has a fixed height, but a
 * control naming a long host must stay whole (no ellipsis) and a usable touch target. */
const wrappingControl =
  "h-auto min-h-11 max-w-full whitespace-normal py-1.5 text-left [overflow-wrap:anywhere] sm:min-h-8";
function DomainCoverageView({
  cohort,
  focus,
  onInspect,
}: {
  cohort: EvidenceCohort;
  focus: EvidenceFocus | null;
  onInspect: (focus: EvidenceFocus) => void;
}) {
  const t = useT();
  const n = cohort.eligibleAnswerIds.length;
  const pressed = (f: EvidenceFocus) =>
    !!focus &&
    focus.key === f.key &&
    focus.kind === f.kind &&
    (f.kind !== "present" || (focus.kind === "present" && focus.host === f.host));
  return (
    <div className="space-y-2 border-t pt-2" data-domain-coverage={n}>
      <p className="font-medium">{t("answerCoverage.title")}</p>
      <p className="text-xs text-muted-foreground">
        {n ? t("answerCoverage.source", { n }) : t("answerCoverage.noEligible")}
      </p>
      {n > 0 && (
        <ul className="space-y-2">
          {cohort.domains.map((d) => {
            const f: EvidenceFocus = { key: cohort.key, kind: "present", host: d.host };
            const x = d.presentAnswerIds.length;
            return (
              <li key={d.host} className="min-w-0 space-y-1" data-domain={d.host} data-present={x}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="break-all font-medium">{d.host}</span>
                  <span className="text-xs text-muted-foreground">{t(`answer.${d.role}`)}</span>
                  <span>{t("answerCoverage.count", { x, n })}</span>
                  {x > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={wrappingControl}
                      aria-pressed={pressed(f)}
                      onClick={() => onInspect(f)}
                    >
                      {t("answerCoverage.showPresent", { host: d.host })}
                    </Button>
                  )}
                </div>
                {d.alsoCompetitor && (
                  <p className="text-xs text-amber-700 [overflow-wrap:anywhere] dark:text-amber-400">
                    {t("answerCoverage.alsoCompetitor")}
                  </p>
                )}
                {d.overlaps.length > 0 && (
                  <p className="text-xs text-amber-700 [overflow-wrap:anywhere] dark:text-amber-400">
                    {t("answerCoverage.overlaps", { hosts: d.overlaps.join(", ") })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs">{t("answerCoverage.quality", { total: cohort.total })}</p>
      <div className="flex flex-wrap gap-2" data-quality-total={cohort.total}>
        {EVIDENCE_QUALITIES.map((kind) => {
          const count = cohort.quality[kind].length;
          const f: EvidenceFocus = { key: cohort.key, kind };
          const text = t(`answerCoverage.quality.${kind}`, { count });
          return count > 0 ? (
            <Button
              key={kind}
              size="sm"
              variant="ghost"
              className={wrappingControl}
              aria-pressed={pressed(f)}
              onClick={() => onInspect(f)}
              data-quality={kind}
            >
              {text}
            </Button>
          ) : (
            <span
              key={kind}
              className="px-3 py-1 text-xs text-muted-foreground"
              data-quality={kind}
            >
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
function AnswerForm({
  prompts,
  correction,
  busy,
  onSave,
}: {
  prompts: EvidencePrompt[];
  correction: EvidenceRow | null;
  busy: boolean;
  onSave: (answer: AnswerEvidence) => Promise<void>;
}) {
  const t = useT(),
    label = (key: string) => t("answer." + key);
  const prior = correction?.input;
  const [promptKey, setPromptKey] = useState(
    prior ? `${prior.promptId}:${prior.promptRevision}` : `${prompts[0].id}:${prompts[0].revision}`,
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setInvalid(false);
        const f = new FormData(e.currentTarget),
          read = (key: string) => String(f.get(key) ?? "");
        const [promptId, rev] = promptKey.split(":");
        const parsed = answerEvidenceSchema.safeParse({
          promptId,
          promptRevision: Number(rev),
          surface: read("surface"),
          mode: read("mode"),
          method: read("method"),
          modelVersion: read("modelVersion").trim() || null,
          capturedAt: read("capturedAt"),
          status: read("status"),
          rawAnswer: read("rawAnswer"),
          citations: read("citations")
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          citationsComplete: f.has("citationsComplete"),
          failure: read("failure").trim() || null,
          reportedCostUsd: read("cost").trim() ? Number(read("cost")) : null,
          sourceUrl: read("sourceUrl").trim() || null,
          supersedesId: correction?.id ?? null,
        });
        if (!parsed.success) {
          setInvalid(true);
          return;
        }
        await onSave(parsed.data);
      }}
    >
      <fieldset className="contents" disabled={busy}>
        <label className="text-sm md:col-span-2">
          {label("prompt")}
          <select
            className={fieldClass}
            value={promptKey}
            onChange={(e) => setPromptKey(e.target.value)}
            disabled={!!correction}
          >
            {prompts.map((p) => (
              <option key={`${p.id}:${p.revision}`} value={`${p.id}:${p.revision}`}>
                {p.data.prompt.slice(0, 100)} · {label("revision")} {p.revision} · {p.data.market} /{" "}
                {p.data.language}
              </option>
            ))}
          </select>
        </label>
        {(["surface", "method", "modelVersion", "capturedAt", "sourceUrl", "cost"] as const).map(
          (key) => (
            <label key={key} className="text-sm">
              {label(key)}
              <input
                className={fieldClass}
                name={key}
                required={["surface", "method", "capturedAt"].includes(key)}
                maxLength={key === "sourceUrl" ? 2048 : 120}
                type={key === "cost" ? "number" : "text"}
                min={key === "cost" ? 0 : undefined}
                step={key === "cost" ? "any" : undefined}
                defaultValue={
                  key === "cost" ? (prior?.reportedCostUsd ?? "") : (prior?.[key] ?? "")
                }
              />
            </label>
          ),
        )}
        {(["mode", "status"] as const).map((key) => (
          <label key={key} className="text-sm">
            {label(key)}
            <select
              className={fieldClass}
              name={key}
              defaultValue={prior?.[key] ?? (key === "mode" ? "consumer-web" : "complete")}
            >
              {(key === "mode"
                ? ["consumer-web", "api", "search"]
                : ["complete", "failed", "truncated"]
              ).map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(["rawAnswer", "citations", "failure"] as const).map((key) => (
          <label key={key} className="text-sm md:col-span-2">
            {label(key)}
            <textarea
              className={fieldClass}
              name={key}
              rows={key === "rawAnswer" ? 8 : 2}
              maxLength={key === "rawAnswer" ? 50000 : key === "failure" ? 2000 : 210000}
              defaultValue={
                key === "citations" ? (prior?.citations.join("\n") ?? "") : (prior?.[key] ?? "")
              }
            />
          </label>
        ))}
        <label className="text-sm md:col-span-2">
          <input
            type="checkbox"
            name="citationsComplete"
            defaultChecked={prior?.citationsComplete ?? false}
          />{" "}
          {label("citationsComplete")}
        </label>
        <Button type="submit">{label("submit")}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const [promptId, rev] = promptKey.split(":");
            download("milo-answer-template.json", {
              promptId,
              promptRevision: Number(rev),
              surface: "",
              mode: "consumer-web",
              method: "",
              modelVersion: null,
              capturedAt: "",
              status: "complete",
              rawAnswer: "",
              citations: [],
              citationsComplete: false,
              failure: null,
              reportedCostUsd: null,
              sourceUrl: null,
              supersedesId: null,
            });
          }}
        >
          {label("downloadTemplate")}
        </Button>
      </fieldset>
      {invalid && (
        <p role="alert" className="md:col-span-2">
          {label("error")}
        </p>
      )}
    </form>
  );
}
