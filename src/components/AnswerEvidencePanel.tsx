import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import {
  answerEvidenceSchema,
  evidenceCohorts,
  evidencePromptSchema,
  type AnswerEvidence,
  type EvidencePrompt,
  type EvidenceRow,
} from "@/lib/answer-evidence";
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
export function AnswerEvidencePanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  return user ? (
    <ProjectEvidence key={`${user.id}:${projectId}`} projectId={projectId} ownerId={user.id} />
  ) : null;
}
function ProjectEvidence({ projectId, ownerId }: { projectId: string; ownerId: string }) {
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
  const superseded = new Set(state?.answers.map((a) => a.input.supersedesId).filter(Boolean));
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
                  onChange={(e) => (setter as (s: string) => void)(e.target.value)}
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
                {g.mentionSamples ? `${g.mentions}/${g.mentionSamples}` : label("unknown")} ·{" "}
                {label("ownCitations")}:{" "}
                {g.citationSamples ? `${g.ownCitations}/${g.citationSamples}` : label("unknown")}
              </p>
              <p>
                {t("answer.samples", { count: g.total })} {label("unverified")}
              </p>
            </article>
          ))}
          <p className="text-xs text-muted-foreground">{label("limits")}</p>
          <h3 className="font-display text-lg">
            {label("answers")} · {state.answers.length}
          </h3>
          {!state.answers.length && <p className="text-sm">{label("empty")}</p>}
          {state.answers.map((row) => (
            <details key={row.id} className="rounded border p-4">
              <summary className="cursor-pointer break-words">
                {row.input.surface} · {label(row.input.mode)} · {row.input.capturedAt} ·{" "}
                {label(row.input.status)}
                {superseded.has(row.id) ? ` · ${label("superseded")}` : ""}
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
                  disabled={busy || superseded.has(row.id)}
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
