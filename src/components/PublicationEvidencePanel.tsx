import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useT, useAppLanguage } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  readPublicationEvidenceFn,
  readPublicationSnapshotFn,
  linkPublicationObservationFn,
} from "@/lib/publication-evidence.functions";
import {
  comparePublicationObservations,
  evidencePublicUrl,
  type PublicationEvidence,
} from "@/lib/publication-evidence";
import type { GscImport } from "@/lib/types";
export function PublicationEvidencePanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  return user ? (
    <EvidenceProject key={`${user.id}:${projectId}`} ownerId={user.id} projectId={projectId} />
  ) : null;
}
function EvidenceProject({ ownerId, projectId }: { ownerId: string; projectId: string }) {
  const t = useT();
  const [page, setPage] = useState(0);
  const imports = useStore(
    (s) => s.projects.find((p) => p.id === projectId)?.gscLite?.imports ?? [],
  );
  const query = useQuery({
    queryKey: ["publication-evidence", ownerId, projectId, page],
    queryFn: () => readPublicationEvidenceFn({ data: { projectId, page } }),
    staleTime: 0,
  });
  return (
    <section className="space-y-4 rounded-xl border p-5 mt-6">
      <h2 className="font-display text-xl">{t("proof.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("proof.help")}</p>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        {t("weekly.refresh")}
      </Button>
      {query.isPending && <p role="status">{t("proof.loading")}</p>}
      {query.isError && <p role="alert">{t("proof.failed")}</p>}
      {!query.isError && query.data && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("proof.total", { count: query.data.total })}
          </p>
          {query.data.total === 0 && <p>{t("proof.empty")}</p>}
          {query.data.items.map((item) => (
            <EvidenceItem
              key={item.id}
              projectId={projectId}
              item={item}
              imports={imports}
              refresh={() => query.refetch()}
            />
          ))}
          <div className="flex gap-3">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              {t("proof.previous")}
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * 50 >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("proof.next")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
function EvidenceItem({
  projectId,
  item,
  imports,
  refresh,
}: {
  projectId: string;
  item: PublicationEvidence;
  imports: GscImport[];
  refresh: () => Promise<unknown>;
}) {
  const t = useT(),
    locale = useAppLanguage();
  const [importId, setImportId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const before = item.observations.find((o) => o.importId === beforeId)?.data,
    after = item.observations.find((o) => o.importId === afterId)?.data;
  const comparison =
    before && after
      ? comparePublicationObservations(before, after, item.otherPublicationAttemptsAt)
      : null;
  const date = (s: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(s),
    );
  const liveUrl = evidencePublicUrl(item.outcomeData?.liveUrl);
  return (
    <article className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-medium">{item.title}</h3>
        <p className="text-sm">
          {t(`proof.state.${item.outcome}`)} · {date(item.startedAt)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("proof.version")}: <span className="break-all">{item.versionHash}</span>
      </p>
      <p className="text-sm">
        {t("proof.action")}:{" "}
        {typeof item.action?.title === "string" ? item.action.title : t("proof.manualAction")}
      </p>
      <p className="text-xs">
        {t("proof.provenance", {
          sources: item.sourceCount,
          knowledge: item.knowledgeCount,
          stages: item.stages.length,
        })}
      </p>
      {liveUrl && (
        <a className="text-sm underline" href={liveUrl} target="_blank" rel="noopener noreferrer">
          {t("proof.openPage")}
        </a>
      )}
      <p className="text-xs text-muted-foreground">{t("proof.connectorOnly")}</p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            setSnapshot(await readPublicationSnapshotFn({ data: { projectId, id: item.id } }));
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("proof.snapshot")}
      </Button>
      {snapshot && (
        <details open>
          <summary>{t("proof.savedText")}</summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
            {typeof snapshot.markdown === "string" ? snapshot.markdown : ""}
          </pre>
        </details>
      )}
      {item.outcome === "published" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("proof.importHelp")}</p>
          <label className="block text-sm">
            {t("proof.savedImport")}
            <select
              className="block w-full rounded border bg-background p-2"
              value={importId}
              disabled={busy}
              onChange={(e) => setImportId(e.target.value)}
            >
              <option value="">{t("proof.choose")}</option>
              {imports.map((imp) => (
                <option value={imp.id} key={imp.id}>
                  {imp.dateRange?.start ?? "?"} — {imp.dateRange?.end ?? "?"} ·{" "}
                  {imp.importedAt.slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={!importId || busy}
            onClick={async () => {
              setBusy(true);
              setFailed(false);
              try {
                await linkPublicationObservationFn({ data: { projectId, id: item.id, importId } });
                await refresh();
                setImportId("");
              } catch {
                setFailed(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("proof.link")}
          </Button>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm">
          {t("proof.actionFailed")}
        </p>
      )}
      {!!item.observations.length && (
        <>
          <ul className="text-sm space-y-1">
            {item.observations.map((o) => (
              <li key={o.importId}>
                {t(`proof.${o.data.relation}`)} · {o.data.windowStart} — {o.data.windowEnd} ·{" "}
                {t("proof.metrics", {
                  clicks: o.data.metrics.clicks,
                  impressions: o.data.metrics.impressions,
                })}
              </li>
            ))}
          </ul>
          <div className="grid sm:grid-cols-2 gap-3">
            {(["before", "later"] as const).map((relation) => (
              <label key={relation} className="text-sm">
                {t(`proof.${relation}`)}
                <select
                  className="block w-full rounded border bg-background p-2"
                  value={relation === "before" ? beforeId : afterId}
                  onChange={(e) =>
                    (relation === "before" ? setBeforeId : setAfterId)(e.target.value)
                  }
                >
                  <option value="">{t("proof.choose")}</option>
                  {item.observations
                    .filter((o) => o.data.relation === relation)
                    .map((o) => (
                      <option key={o.importId} value={o.importId}>
                        {o.data.windowStart} — {o.data.windowEnd}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          {comparison &&
            (comparison.comparable ? (
              <p role="status" className="text-sm">
                {t("proof.delta", {
                  clicks: comparison.clickChange,
                  impressions: comparison.impressionChange,
                })}{" "}
                {t("proof.tentative")} {comparison.lowVolume ? t("proof.lowVolume") : ""}
              </p>
            ) : (
              <p role="status">{t("proof.incomparable")}</p>
            ))}
        </>
      )}
    </article>
  );
}
