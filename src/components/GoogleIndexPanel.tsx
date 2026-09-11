import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { saveWorkspaceNow } from "@/lib/store";
import type { Project } from "@/lib/types";
import { inspectionInProperty } from "@/lib/google-index";
import { readGoogleIndexObservation } from "@/lib/google-index-view";
import { listGoogleIndexFn, requestGoogleIndexFn } from "@/lib/google-index.functions";
import { Button } from "./ui/button";
export function GoogleIndexPanel({ project }: { project: Project }) {
  const { user } = useAuth();
  return user ? (
    <Inspection key={`${user.id}:${project.id}`} owner={user.id} project={project} />
  ) : null;
}
function Inspection({ owner, project }: { owner: string; project: Project }) {
  const t = useT(),
    mounted = useRef(true),
    lock = useRef(false);
  const [url, setUrl] = useState(project.websiteUrl ?? ""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState<{ requestId: string; url: string } | null>(null);
  const property = project.gscOAuth?.selectedSite?.siteUrl;
  const history = useQuery({
    queryKey: ["google-index-history", owner, project.id],
    queryFn: () => listGoogleIndexFn({ data: { projectId: project.id } }),
    retry: false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function inspect() {
    if (lock.current) return;
    const request = attempt ?? { requestId: crypto.randomUUID(), url };
    if (!property || !inspectionInProperty(request.url, property)) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    setAttempt(request);
    try {
      await saveWorkspaceNow();
      if (!mounted.current) return;
      await requestGoogleIndexFn({ data: { projectId: project.id, ...request } });
      if (mounted.current) setAttempt(null);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        await history.refetch();
      }
    }
  }
  const state = (value: string | null) => (value ? t(`gindex.state_${value}`) : null);
  const field = (label: string, value: string | null | undefined) => (
    <div>
      <dt className="font-medium">{t(`gindex.${label}`)}</dt>
      <dd className="break-words">{value ?? t("gindex.unknownValue")}</dd>
    </div>
  );
  return (
    <section className="mb-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("gindex.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("gindex.help")}</p>
      {!property ? (
        <p>{t("gindex.connect")}</p>
      ) : (
        <p className="break-all text-sm">
          {t("gindex.property")}: {property}
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void inspect();
        }}
      >
        <label className="block text-sm">
          {t("gindex.url")}
          <input
            type="url"
            required
            maxLength={8192}
            value={url}
            disabled={busy || !!attempt}
            onChange={(event) => setUrl(event.target.value)}
            className="mt-1 w-full rounded-md border bg-background p-2"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || !property || !inspectionInProperty(attempt?.url ?? url, property)}
          >
            {t(busy ? "gindex.busy" : attempt ? "gindex.retry" : "gindex.inspect")}
          </Button>
          {attempt && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setAttempt(null);
                setFailed(false);
              }}
            >
              {t("gindex.newRequest")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || history.isFetching}
            onClick={() => void history.refetch()}
          >
            {t("gindex.refresh")}
          </Button>
        </div>
      </form>
      {failed && <p role="alert">{t("gindex.requestError")}</p>}
      {history.isError && <p role="alert">{t("gindex.historyError")}</p>}
      {history.isPending && <p role="status">{t("gindex.loading")}</p>}
      <h3 className="font-semibold">{t("gindex.history")}</h3>
      <p className="text-sm text-muted-foreground">{t("gindex.historyHelp")}</p>
      {history.data?.length === 0 && <p>{t("gindex.empty")}</p>}
      {history.data?.map((row) => {
        const evidence = readGoogleIndexObservation(row);
        return (
          <details key={row.requestId} className="rounded-lg border p-3">
            <summary className="cursor-pointer break-words">
              {row.url} — {t(`gindex.${row.status}`)}
            </summary>
            <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              {field("property", row.property)}
              {field("requested", row.createdAt)}
            </dl>
            {row.status === "unknown" && <p className="mt-2 text-sm">{t("gindex.unknownHelp")}</p>}
            {row.status === "held" && <p className="mt-2 text-sm">{t("gindex.heldHelp")}</p>}
            {row.error && <p className="mt-2 text-sm">{t(`gindex.error_${row.error}`)}</p>}
            {row.status === "succeeded" && !evidence && (
              <p role="alert">{t("gindex.invalidEvidence")}</p>
            )}
            {evidence && (
              <div className="mt-3 space-y-3">
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  {field("observed", evidence.observedAt)}
                  {field("lastCrawl", evidence.lastCrawlTime)}
                  {field(
                    "verdict",
                    evidence.verdict ? t(`gindex.verdict_${evidence.verdict}`) : null,
                  )}
                  {field("coverage", evidence.coverageState)}
                  {field("googleCanonical", evidence.googleCanonical)}
                  {field("userCanonical", evidence.userCanonical)}
                  {field("robots", state(evidence.robotsTxtState))}
                  {field("indexing", state(evidence.indexingState))}
                  {field("fetch", state(evidence.pageFetchState))}
                  {field("crawler", state(evidence.crawledAs))}
                </dl>
                {!evidence.indexStatusAvailable && <p>{t("gindex.noStatus")}</p>}
                {(["sitemaps", "referringUrls"] as const).map((key) => (
                  <div key={key}>
                    <h4 className="font-medium">{t(`gindex.${key}`)}</h4>
                    <p className="text-sm text-muted-foreground">{t("gindex.listHelp")}</p>
                    {!evidence[key].complete && <p>{t("gindex.partial")}</p>}
                    <ul className="list-inside list-disc text-sm">
                      {evidence[key].values.map((value, index) => (
                        <li className="break-all" key={`${index}:${value}`}>
                          {value}
                        </li>
                      ))}
                    </ul>
                    {!evidence[key].values.length && <p>{t("gindex.noneReported")}</p>}
                  </div>
                ))}
                {evidence.inspectionResultLink && (
                  <a
                    className="underline"
                    href={evidence.inspectionResultLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("gindex.openGoogle")}
                  </a>
                )}
              </div>
            )}
          </details>
        );
      })}
    </section>
  );
}
