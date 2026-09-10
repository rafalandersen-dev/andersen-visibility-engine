import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import {
  prepareLogImport,
  summarizeLogBatch,
  type LogDocument,
  type LogRow,
} from "@/lib/log-evidence";
import {
  readLogEvidenceFn,
  importLogEvidenceFn,
  removeLogEvidenceFn,
} from "@/lib/log-evidence.functions";
import { Button } from "./ui/button";
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
export function LogEvidencePanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  return user ? (
    <ProjectLogs key={`${user.id}:${projectId}`} projectId={projectId} ownerId={user.id} />
  ) : null;
}
function ProjectLogs({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const t = useT(),
    l = (k: string) => t("logs." + k);
  const scope = { projectId, expectedOwnerId: ownerId };
  const query = useQuery({
    queryKey: ["log-evidence", ownerId, projectId],
    queryFn: () => readLogEvidenceFn({ data: scope }),
    retry: false,
    staleTime: 0,
  });
  const [preview, setPreview] = useState<LogDocument | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [remove, setRemove] = useState<string | null>(null);
  const [start, setStart] = useState("2020-01-01"),
    [end, setEnd] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [correction, setCorrection] = useState<string | null>(null);
  const state = query.data;
  const superseded = new Set(state?.map((r) => r.input.supersedesId).filter(Boolean));
  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    try {
      await fn();
      setPreview(null);
      setRemove(null);
      setCorrection(null);
      await query.refetch({ throwOnError: true });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mb-8 rounded-xl border bg-card p-5 space-y-4"
      aria-labelledby="log-evidence-title"
    >
      <h2 className="font-display text-xl" id="log-evidence-title">
        {l("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{l("help")}</p>
      <p className="text-sm">{l("privacy")}</p>
      <p className="text-xs text-muted-foreground">{l("limits")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          {l("refresh")}
        </Button>
        <Button
          variant="outline"
          disabled={!state || query.isError || busy}
          onClick={() =>
            download(`milo-log-history-${projectId}.json`, {
              format: "milo-log-archive-v1",
              projectId,
              exportedAt: new Date().toISOString(),
              verified: false,
              batches: state,
            })
          }
        >
          {l("export")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            download("milo-log-template.json", {
              format: "milo-log-evidence-v1",
              source: "",
              layer: "edge",
              method: "",
              hostname: "",
              windowStart: "",
              windowEnd: "",
              completeness: "unknown",
              publicPathsConfirmed: false,
              supersedesId: correction,
              rows: [{ time: "", page: "", status: null, method: "GET", userAgent: "" }],
            })
          }
        >
          {l("template")}
        </Button>
      </div>
      {(error || query.isError) && <p role="alert">{l("error")}</p>}
      {query.isPending && <p role="status">{l("loading")}</p>}
      {state && !query.isError && (
        <>
          <label className="block text-sm">
            {l("import")}
            <input
              className="mt-2 block max-w-full"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                setPreview(null);
                setError(false);
                if (!file) return;
                try {
                  if (file.size > 500000) throw Error();
                  const raw: unknown = JSON.parse(await file.text());
                  const safe = prepareLogImport(raw);
                  if (correction && safe.input.supersedesId !== correction) throw Error();
                  setPreview(safe);
                } catch {
                  setError(true);
                }
              }}
            />
          </label>
          {correction && (
            <div className="text-sm">
              {l("correcting")} {correction}{" "}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setCorrection(null);
                  setPreview(null);
                }}
              >
                {l("cancel")}
              </Button>
            </div>
          )}
          {preview && (
            <div className="rounded border p-4 space-y-3">
              <p>
                {l("preview")} · {preview.input.rows.length} {l("rows")} · {preview.duplicateRows}{" "}
                {l("duplicates")}
              </p>
              <p className="text-xs">{l("dedupe")}</p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(preview, null, 2)}
              </pre>
              <Button
                disabled={busy}
                onClick={() =>
                  void mutate(() => importLogEvidenceFn({ data: { ...scope, document: preview } }))
                }
              >
                {l("save")}
              </Button>{" "}
              <Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>
                {l("cancel")}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              {l("start")}
              <input
                className="ml-2 rounded border p-1"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              {l("end")}
              <input
                className="ml-2 rounded border p-1"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{l("separate")}</p>
          {state.length === 0 && <p>{l("empty")}</p>}
          {state.map((row) => (
            <details key={row.id} className="rounded border p-3" open={state.length === 1}>
              <summary className="cursor-pointer break-words">
                {row.input.source} · {row.input.hostname} · {l(row.input.layer)} ·{" "}
                {superseded.has(row.id) ? l("superseded") : l("unverified")}
              </summary>
              <p className="mt-3 text-xs break-words">
                {l("window")}: {row.input.windowStart} → {row.input.windowEnd} ·{" "}
                {l(row.input.completeness)} · {row.input.method}
              </p>
              <p className="text-xs">
                {l("received")}: {row.createdAt} · {row.id}
              </p>
              {superseded.has(row.id) ? (
                <p className="my-3">{l("superseded")}</p>
              ) : (
                <BatchSummary row={row} start={start} end={end} />
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || superseded.has(row.id)}
                  onClick={() => {
                    setCorrection(row.id);
                    setPreview(null);
                  }}
                >
                  {l("correct")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRemove(row.id)}
                >
                  {l("remove")}
                </Button>
              </div>
              <details className="mt-3">
                <summary>{l("safeEvidence")}</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(row, null, 2)}
                </pre>
              </details>
            </details>
          ))}
          {remove && (
            <div role="alert" className="rounded border p-4 space-y-2">
              <p>{l("removeWarning")}</p>
              <p className="text-xs break-all">{remove}</p>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void mutate(() => removeLogEvidenceFn({ data: { ...scope, id: remove } }))
                }
              >
                {l("confirmRemove")}
              </Button>{" "}
              <Button variant="outline" disabled={busy} onClick={() => setRemove(null)}>
                {l("cancel")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function BatchSummary({ row, start, end }: { row: LogRow; start: string; end: string }) {
  const t = useT(),
    l = (k: string) => t("logs." + k);
  let s;
  try {
    s = summarizeLogBatch(row, start + "T00:00:00Z", end + "T00:00:00Z");
  } catch {
    return <p role="alert">{l("invalidWindow")}</p>;
  }
  return (
    <div className="my-3 space-y-3">
      <p>
        {l("rows")}: {s.supplied} · {l("claims")}: {s.claimed} · {l("coverage")}: {l(s.coverage)}
      </p>
      <p className="text-xs">{l("notTraffic")}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(["agents", "pages", "days", "statuses", "methods"] as const).map((key) => (
          <div key={key} className="rounded border p-3 max-h-64 overflow-auto">
            <h3 className="font-medium text-sm">{l(key)}</h3>
            <ul className="text-xs space-y-1 mt-2">
              {s[key].map(([name, count]) => (
                <li key={name} className="flex justify-between gap-4">
                  <span className="break-all">{name === "unknown" ? l("unknown") : name}</span>
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
