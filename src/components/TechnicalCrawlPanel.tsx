import { sitemapFilesForPage } from "@/lib/technical-sitemap-membership";
import { CrawlOwnershipPanel } from "./CrawlOwnershipPanel";
import { useCrawlOwnership } from "@/lib/use-crawl-ownership";
import { TechnicalFindingActions } from "./TechnicalFindingActions";
import { processTechnicalCrawl } from "@/lib/technical-crawl-client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import * as api from "@/lib/technical-crawl.functions";

export function TechnicalCrawlPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  return user ? (
    <ProjectCrawl key={`${user.id}:${projectId}`} owner={user.id} projectId={projectId} />
  ) : null;
}
function ProjectCrawl({ owner, projectId }: { owner: string; projectId: string }) {
  const t = useT();
  const ownership = useCrawlOwnership(owner, projectId);
  const ownsSite =
    !ownership.isError &&
    ownership.data?.status === "verified" &&
    Date.parse(ownership.data.expiresAt) > Date.now();
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [failed, setFailed] = useState(false);
  const stop = useRef(true);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  const history = useQuery({
    queryKey: ["technical-history", owner, projectId],
    queryFn: () => api.listTechnicalCrawlsFn({ data: { projectId } }),
    retry: false,
    staleTime: 0,
  });
  const result = useQuery({
    queryKey: ["technical-run", owner, projectId, runId],
    queryFn: () => api.readTechnicalCrawlFn({ data: { projectId, runId: runId! } }),
    enabled: !!runId,
    retry: false,
    staleTime: 0,
  });
  const refetchResult = result.refetch;
  async function refresh() {
    const reads = await Promise.all([history.refetch(), ...(runId ? [result.refetch()] : [])]);
    if (mounted.current) setFailed(reads.some((read) => read.isError));
  }
  async function execute(id: string, create: boolean, resumeAdmission = false) {
    if (lock.current || cancelling) return;
    lock.current = true;
    stop.current = false;
    setBusy(true);
    setFailed(false);
    setRunId(id);
    try {
      if (resumeAdmission) await api.resumeTechnicalAdmissionFn({ data: { projectId, runId: id } });
      if (create) await api.startTechnicalCrawlFn({ data: { projectId, runId: id } });
      await processTechnicalCrawl(
        () => api.stepTechnicalCrawlFn({ data: { projectId, runId: id } }),
        () => stop.current || !mounted.current,
        () => history.refetch(),
      );
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      lock.current = false;
      stop.current = true;
      if (mounted.current) {
        setBusy(false);
        await history.refetch();
      }
    }
  }
  // Read-only refresh while processing; this never starts or resumes a crawl.
  useEffect(() => {
    if (!busy || !runId) return;
    const timer = setInterval(() => {
      void refetchResult();
    }, 1500);
    return () => clearInterval(timer);
  }, [busy, runId, refetchResult]);
  useEffect(() => {
    if (!busy && runId) void refetchResult();
  }, [busy, runId, refetchResult]);
  async function cancel() {
    if (!runId || cancelling) return;
    stop.current = true;
    setCancelling(true);
    setFailed(false);
    try {
      await api.cancelTechnicalCrawlFn({ data: { projectId, runId } });
      await refresh();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setCancelling(false);
    }
  }
  const saved = !result.isError ? result.data : null;
  const state = saved?.state;
  const active = saved && ["preparing", "running"].includes(saved.status);
  const existing = history.data?.some((item) => ["preparing", "running"].includes(item.status));
  return (
    <section className="mb-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-display text-xl">{t("crawl.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("crawl.help")}</p>
      <p className="text-sm text-muted-foreground">{t("crawl.scope")}</p>
      <CrawlOwnershipPanel owner={owner} projectId={projectId} />
      {saved?.admissionHold && (
        <p className="text-sm text-muted-foreground">
          {t(`crawl.admission_${saved.admissionHold}`)}
          {saved.retryAfter ? ` ${new Date(saved.retryAfter).toLocaleString()}` : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            !ownsSite ||
            busy ||
            cancelling ||
            history.isPending ||
            history.isError ||
            existing ||
            failed
          }
          onClick={() => void execute(crypto.randomUUID(), true)}
        >
          {t("crawl.start")}
        </Button>
        {saved?.status === "held" && saved.admissionHold && !busy && (
          <Button
            disabled={!ownsSite || cancelling || failed}
            onClick={() => void execute(runId!, false, true)}
          >
            {t("crawl.retryAdmission")}
          </Button>
        )}
        {active && !busy && (
          <Button
            disabled={!ownsSite || cancelling || failed}
            onClick={() => void execute(runId!, false)}
          >
            {t("crawl.resume")}
          </Button>
        )}
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              stop.current = true;
            }}
          >
            {t("crawl.pause")}
          </Button>
        )}
        {active && (
          <Button variant="outline" disabled={cancelling} onClick={() => void cancel()}>
            {t("crawl.cancel")}
          </Button>
        )}
        <Button variant="outline" onClick={() => void refresh()}>
          {t("crawl.refresh")}
        </Button>
      </div>
      {busy && <p role="status">{t("crawl.processing")}</p>}
      {(failed || history.isError || result.isError) && <p role="alert">{t("crawl.error")}</p>}
      <label className="block text-sm">
        {t("crawl.history")}
        <select
          className="mt-2 block w-full rounded border bg-background p-2"
          value={runId ?? ""}
          disabled={busy || cancelling}
          onChange={(event) => {
            setFailed(false);
            setRunId(event.target.value || null);
          }}
        >
          <option value="">{t("crawl.select")}</option>
          {(history.data ?? []).map((item) => (
            <option key={item.run_id} value={item.run_id}>
              {item.created_at} · {t(`crawl.${item.status}`)} · {item.origin}
            </option>
          ))}
        </select>
      </label>
      {saved && (
        <div className="space-y-3">
          <p className="break-all">
            {saved.origin} · {t(`crawl.${saved.status}`)}
          </p>
          <p className="text-sm">
            {t("crawl.updated")}: {saved.updatedAt}
          </p>
          {state && (
            <>
              <p>{t("crawl.counts", { done: state.pages.length, queued: state.queue.length })}</p>
              <p className="text-sm">
                {t("crawl.robots")}: {t(`crawl.robots_${state.robots.state}`)}
              </p>
              {state.coverageLimits.length > 0 && (
                <ul className="list-disc pl-5">
                  {state.coverageLimits.map((limit) => (
                    <li key={limit}>{t(`crawl.${limit}`)}</li>
                  ))}
                </ul>
              )}
              {state.sitemaps && (
                <details className="rounded border p-3" open>
                  <summary>{t("crawl.sitemaps")}</summary>
                  <p className="mt-2 text-sm">{t("crawl.sitemapHelp")}</p>
                  <p>
                    {t("crawl.sitemapCounts", {
                      files: state.sitemaps.files.length,
                      queued: state.sitemaps.queue.length,
                      urls: state.sitemaps.entries.length,
                    })}
                  </p>
                  <ul className="list-disc pl-5">
                    {state.sitemaps.limitations.map((limit) => (
                      <li key={limit}>{t(`crawl.sitemap_${limit}`)}</li>
                    ))}
                  </ul>
                  {state.sitemaps.files.map((file) => (
                    <div key={file.requestedUrl} className="mt-2 border-t pt-2 text-sm break-all">
                      <p>
                        {file.requestedUrl} · {t(`crawl.sitemap_${file.state}`)}
                        {file.status ? ` · HTTP ${file.status}` : ""}
                      </p>
                      <p>
                        {t("crawl.observedAt")}: {file.observedAt}
                      </p>
                      {file.finalUrl && (
                        <p>
                          {t("crawl.finalUrl")}: {file.finalUrl}
                        </p>
                      )}
                      <p>
                        {t("crawl.sitemapEntries", {
                          locs: file.locCount,
                          rejected: file.rejectedCount,
                        })}
                        {file.kind ? ` · ${file.kind}` : ""}
                      </p>
                    </div>
                  ))}
                </details>
              )}
              {state.pages.map((page, pageIndex) => (
                <details key={page.requestedUrl} className="rounded border p-3">
                  <summary className="cursor-pointer break-all">
                    {page.requestedUrl} · {t(`crawl.${page.state}`)}
                    {page.observation ? ` · HTTP ${page.observation.status}` : ""}
                  </summary>
                  <p className="mt-2 text-sm">
                    {t("crawl.depth")}: {page.depth ?? t("crawl.unknown")}
                  </p>
                  {page.blockedUrl && (
                    <p className="text-sm break-all">
                      {t("crawl.finalUrl")}: {page.blockedUrl}
                    </p>
                  )}
                  {state.sitemaps && (
                    <p className="text-sm break-all">
                      {t("crawl.sitemapMembership")}:{" "}
                      {sitemapFilesForPage(
                        state.sitemaps.entries,
                        page.requestedUrl,
                        page.observation?.url,
                      ).join(" | ") || t("crawl.notFound")}
                    </p>
                  )}
                  {["completed", "cancelled", "held"].includes(saved.status) && (
                    <TechnicalFindingActions
                      owner={owner}
                      projectId={projectId}
                      runId={saved.runId}
                      revision={saved.revision}
                      pageIndex={pageIndex}
                      page={page}
                    />
                  )}
                  {page.observation && (
                    <div className="mt-2 space-y-2 break-words text-sm">
                      <p>
                        {t("crawl.observedAt")}: {page.observation.observedAt}
                      </p>
                      <p>
                        {t("crawl.finalUrl")}: {page.observation.url}
                      </p>
                      {!page.observation.complete && <p>{t("crawl.partial_page")}</p>}
                      <p>
                        {t("crawl.pageTitle")}: {page.observation.title || t("crawl.notFound")}
                      </p>
                      <p>
                        {t("crawl.description")}:{" "}
                        {page.observation.descriptions.join(" | ") || t("crawl.notFound")}
                      </p>
                      <p>H1: {page.observation.headings.join(" | ") || t("crawl.notFound")}</p>
                      <p>
                        {t("crawl.canonical")}:{" "}
                        {page.observation.canonicals.join(" | ") || t("crawl.notFound")}
                      </p>
                      <p>
                        Hreflang:{" "}
                        {page.observation.alternateLanguages
                          .map((item) => `${item.language}: ${item.url}`)
                          .join(" | ") || t("crawl.notFound")}
                      </p>
                      <p>
                        {t("crawl.directives")}:{" "}
                        {page.observation.robots
                          .map((item) => `${item.source}/${item.agent}: ${item.value}`)
                          .join(" | ") || t("crawl.notFound")}
                      </p>
                      <p>
                        {t("crawl.structured")}:{" "}
                        {page.observation.structuredData
                          .map(
                            (item) =>
                              `${t(`crawl.${item.state}`)}: ${item.types.join(", ")}${item.complete ? "" : ` (${t("crawl.partial_page")})`}`,
                          )
                          .join(" | ") || t("crawl.notFound")}
                      </p>
                      <details>
                        <summary>
                          {t("crawl.links")} ({page.observation.internalLinks.length})
                        </summary>
                        <ul className="list-disc pl-5">
                          {page.observation.internalLinks.map((url) => (
                            <li key={url}>{url}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
