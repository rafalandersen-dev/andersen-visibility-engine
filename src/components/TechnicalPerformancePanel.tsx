import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { saveWorkspaceNow } from "@/lib/store";
import type { Project } from "@/lib/types";
import type { PerformanceQuery } from "@/lib/technical-performance-transport.server";
import {
  performancePageInWebsite,
  readPerformanceObservation,
} from "@/lib/technical-performance-view";
import {
  listTechnicalPerformanceFn,
  requestTechnicalPerformanceFn,
} from "@/lib/technical-performance.functions";
import { Button } from "./ui/button";
export function TechnicalPerformancePanel({ project }: { project: Project }) {
  const { user } = useAuth();
  return user ? (
    <Measurements key={`${user.id}:${project.id}`} owner={user.id} project={project} />
  ) : null;
}
function Measurements({ owner, project }: { owner: string; project: Project }) {
  const t = useT(),
    mounted = useRef(true),
    lock = useRef(false);
  const [source, setSource] = useState<"crux" | "pagespeed">("crux"),
    [device, setDevice] = useState("mobile"),
    [scope, setScope] = useState<"url" | "origin">("url");
  const [url, setUrl] = useState(
    project.websiteUrl && !/^https?:\/\//i.test(project.websiteUrl)
      ? `https://${project.websiteUrl}`
      : (project.websiteUrl ?? ""),
  );
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState<{ requestId: string; query: PerformanceQuery } | null>(
    null,
  );
  const history = useQuery({
    queryKey: ["technical-performance-history", owner, project.id],
    queryFn: () => listTechnicalPerformanceFn({ data: { projectId: project.id } }),
    retry: false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const query: PerformanceQuery =
    source === "crux"
      ? {
          source,
          url,
          scope,
          device:
            device === "mobile"
              ? "PHONE"
              : device === "desktop"
                ? "DESKTOP"
                : device === "tablet"
                  ? "TABLET"
                  : "ALL",
        }
      : { source, url, device: device === "desktop" ? "desktop" : "mobile" };
  const configured = history.data?.configured[source] ?? false;
  async function measure() {
    if (lock.current) return;
    const request = attempt ?? { requestId: crypto.randomUUID(), query };
    if (!performancePageInWebsite(request.query.url, project.websiteUrl ?? "")) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    setAttempt(request);
    try {
      await saveWorkspaceNow();
      if (!mounted.current) return;
      await requestTechnicalPerformanceFn({ data: { projectId: project.id, ...request } });
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
  const entry = (label: string, value: string | number | null | undefined) => (
    <div>
      <dt className="font-medium">{t(`perf.${label}`)}</dt>
      <dd className="break-words">{value ?? t("perf.unknownValue")}</dd>
    </div>
  );
  return (
    <section className="mb-6 space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("perf.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("perf.help")}</p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void measure();
        }}
      >
        <fieldset disabled={busy || !!attempt} className="grid gap-3 md:grid-cols-3">
          <label>
            {t("perf.source")}
            <select
              className="mt-1 w-full rounded border bg-background p-2"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as "crux" | "pagespeed");
                setDevice("mobile");
              }}
            >
              <option value="crux">{t("perf.crux")}</option>
              <option value="pagespeed">{t("perf.pagespeed")}</option>
            </select>
          </label>
          <label>
            {t("perf.device")}
            <select
              className="mt-1 w-full rounded border bg-background p-2"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
            >
              {(source === "crux"
                ? ["mobile", "desktop", "tablet", "all"]
                : ["mobile", "desktop"]
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`perf.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {source === "crux" && (
            <label>
              {t("perf.scope")}
              <select
                className="mt-1 w-full rounded border bg-background p-2"
                value={scope}
                onChange={(e) => setScope(e.target.value as "url" | "origin")}
              >
                <option value="url">{t("perf.page")}</option>
                <option value="origin">{t("perf.origin")}</option>
              </select>
            </label>
          )}
          <label className="md:col-span-3">
            {t("perf.url")}
            <input
              type="url"
              required
              maxLength={8192}
              className="mt-1 w-full rounded border bg-background p-2"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        </fieldset>
        <p className="text-sm text-muted-foreground">
          {t(source === "crux" ? "perf.fieldHelp" : "perf.labHelp")}
        </p>
        {!configured && !history.isPending && <p>{t("perf.configuration")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy ||
              (!attempt && !configured) ||
              !performancePageInWebsite(attempt?.query.url ?? url, project.websiteUrl ?? "")
            }
          >
            {t(busy ? "perf.busy" : attempt ? "perf.retry" : "perf.measure")}
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
              {t("perf.newRequest")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || history.isFetching}
            onClick={() => void history.refetch()}
          >
            {t("perf.refresh")}
          </Button>
        </div>
      </form>
      {failed && <p role="alert">{t("perf.requestError")}</p>}
      {history.isError && <p role="alert">{t("perf.historyError")}</p>}
      {history.isPending && <p role="status">{t("perf.loading")}</p>}
      <h3 className="font-semibold">{t("perf.history")}</h3>
      <p className="text-sm text-muted-foreground">{t("perf.historyHelp")}</p>
      {history.data?.requests.length === 0 && <p>{t("perf.empty")}</p>}
      {history.data?.requests.map((row) => {
        const evidence = readPerformanceObservation(row);
        return (
          <details key={row.requestId} className="rounded-lg border p-3">
            <summary className="cursor-pointer break-words">
              {t(`perf.${row.source}`)} · {t(`perf.status_${row.status}`)} · {row.url}
            </summary>
            <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              {entry("requested", row.createdAt)}
              {entry(
                "device",
                t(
                  `perf.${({ PHONE: "mobile", DESKTOP: "desktop", TABLET: "tablet", ALL: "all" } as Record<string, string>)[row.device] ?? row.device}`,
                ),
              )}
              {entry("scope", t(row.scope === "origin" ? "perf.origin" : "perf.page"))}
            </dl>
            {row.status === "unknown" && <p>{t("perf.unknownHelp")}</p>}
            {row.status === "held" && <p>{t("perf.heldHelp")}</p>}
            {row.error && <p>{t(`perf.error_${row.error}`)}</p>}
            {row.status === "succeeded" && !evidence && <p role="alert">{t("perf.invalid")}</p>}
            {evidence && (
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                {entry("observed", evidence.observedAt)}
                {evidence.source === "crux" ? (
                  <>
                    {entry("availability", t(`perf.${evidence.availability}`))}
                    {entry("assessment", t(`perf.${evidence.assessment}`))}
                    {entry("returned", evidence.returnedId)}
                    {entry(
                      "period",
                      evidence.collectionPeriod
                        ? `${evidence.collectionPeriod.firstDate} – ${evidence.collectionPeriod.lastDate}`
                        : null,
                    )}
                    {(["lcp", "inp", "cls"] as const).map((name) => (
                      <div key={name}>
                        <dt className="font-medium">
                          {name.toUpperCase()} (p75
                          {evidence.metrics[name].unit === "ms" ? ", ms" : ""})
                        </dt>
                        <dd>
                          {evidence.metrics[name].p75 ?? t("perf.unknownValue")} ·{" "}
                          {t(`perf.${evidence.metrics[name].rating}`)}
                        </dd>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {entry("score", evidence.performanceScore)}
                    {entry("labTime", evidence.fetchTime)}
                    {entry("finalUrl", evidence.finalUrl)}
                    {entry("lcp", evidence.metrics.lcpMs)}
                    {entry("cls", evidence.metrics.cls)}
                    {entry("tbt", evidence.metrics.totalBlockingTimeMs)}
                    {(!evidence.identityMatches || evidence.runtimeFailed) && (
                      <div>{t("perf.labUnavailable")}</div>
                    )}
                  </>
                )}
              </dl>
            )}
          </details>
        );
      })}
    </section>
  );
}
