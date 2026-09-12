import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { monitoringScope } from "@/lib/backlink-monitoring";
import {
  readBacklinkMonitoringHistoryFn,
  requestBacklinkMonitoringFn,
  recoverBacklinkMonitoringAccountingFn,
} from "@/lib/backlink-monitoring.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function BacklinkMonitoring({
  projectId,
  website,
  collectionAvailable,
}: {
  projectId: string;
  website: string;
  collectionAvailable: boolean;
}) {
  const { user } = useAuth();
  return user ? (
    <MonitoringHistory
      key={`${user.id}:${projectId}:${website}`}
      userId={user.id}
      projectId={projectId}
      website={website}
      collectionAvailable={collectionAvailable}
    />
  ) : null;
}
function MonitoringHistory({
  userId,
  projectId,
  website,
  collectionAvailable,
}: {
  userId: string;
  projectId: string;
  website: string;
  collectionAvailable: boolean;
}) {
  const t = useT(),
    client = useQueryClient();
  const [dateTo, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateFrom, setFrom] = useState(() =>
    new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [includeSubdomains, setSubdomains] = useState(false);
  const [requestId, setRequest] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const queryKey = ["backlink-monitoring", userId, projectId];
  const query = useQuery({
    queryKey,
    queryFn: () => readBacklinkMonitoringHistoryFn({ data: { projectId } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: ["backlink-recurring", userId, projectId] }),
    ]);
  const run = useMutation({
    mutationFn: (id: string) =>
      requestBacklinkMonitoringFn({
        data: {
          projectId,
          requestId: id,
          dateFrom,
          dateTo,
          includeSubdomains,
          expectedWebsite: website.trim(),
        },
      }),
    retry: false,
    onSettled: () => {
      void refresh();
    },
  });
  const recovery = useMutation({
    mutationFn: (id: string) =>
      recoverBacklinkMonitoringAccountingFn({ data: { projectId, requestId: id } }),
    retry: false,
    onSettled: () => {
      void refresh();
    },
  });
  const disabled = !collectionAvailable || run.isPending || requestId !== null;
  const fields = [
    "newBacklinks",
    "lostBacklinks",
    "newReferringDomains",
    "lostReferringDomains",
    "newReferringMainDomains",
    "lostReferringMainDomains",
  ] as const;
  const labels = [
    "newLinks",
    "lostLinks",
    "newDomains",
    "lostDomains",
    "newMainDomains",
    "lostMainDomains",
  ];
  return (
    <section id="backlink-history" className="mt-8 space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-display text-xl">{t("backlinkMonitor.title")}</h2>
      <p className="break-all text-sm">{website}</p>
      <p className="max-w-3xl text-sm text-muted-foreground">{t("backlinkMonitor.note")}</p>
      {!collectionAvailable && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("backlinkMonitor.unavailable")}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled || !query.isSuccess) return;
          try {
            const savedWebsite = website.trim();
            monitoringScope({
              target: new URL(
                /^https?:\/\//i.test(savedWebsite) ? savedWebsite : `https://${savedWebsite}`,
              ).hostname.toLowerCase(),
              dateFrom,
              dateTo,
              includeSubdomains,
            });
          } catch {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          const id = crypto.randomUUID();
          setRequest(id);
          run.mutate(id);
        }}
      >
        <label className="space-y-1 text-sm">
          {t("backlinkMonitor.from")}
          <Input
            type="date"
            required
            min="2019-01-30"
            max={dateTo}
            value={dateFrom}
            disabled={disabled}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          {t("backlinkMonitor.to")}
          <Input
            type="date"
            required
            min={dateFrom}
            max={new Date().toISOString().slice(0, 10)}
            value={dateTo}
            disabled={disabled}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            checked={includeSubdomains}
            disabled={disabled}
            onChange={(e) => setSubdomains(e.target.checked)}
          />
          {t("backlinkMonitor.subdomains")}
        </label>
        <Button type="submit" disabled={disabled || !query.isSuccess}>
          {t(run.isPending ? "backlinkMonitor.running" : "backlinkMonitor.run")}
        </Button>
        {requestId && !run.isPending && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRequest(null);
              run.reset();
            }}
          >
            {t("backlinkMonitor.new")}
          </Button>
        )}
      </form>
      {invalid && <p role="alert">{t("backlinkMonitor.invalid")}</p>}
      {requestId && (
        <p className="break-all text-xs">
          {t("backlinkMonitor.request")}: {requestId}
        </p>
      )}
      {(run.isError || run.data) && (
        <p role="status">
          {t(
            "backlinkMonitor." +
              (run.isError || run.data?.state === "unknown" || run.data?.state === "unavailable"
                ? "uncertain"
                : (run.data?.state ?? "uncertain")),
          )}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={query.isFetching}
        onClick={() => {
          void query.refetch();
        }}
      >
        {t("backlinkMonitor.refresh")}
      </Button>
      {query.isPending && <p role="status">{t("backlinkMonitor.loading")}</p>}
      {query.isError && <p role="alert">{t("backlinkMonitor.error")}</p>}
      {recovery.isError && <p role="alert">{t("backlinkMonitor.recoveryFailed")}</p>}
      {recovery.data && (
        <p role="status">
          {t(
            recovery.data.recovered
              ? "backlinkMonitor.recovered"
              : "backlinkMonitor.recoveryFailed",
          )}
        </p>
      )}
      {query.isSuccess && query.data.length === 0 && <p>{t("backlinkMonitor.empty")}</p>}
      {query.isSuccess &&
        query.data.map((row) => (
          <details key={row.requestId} className="rounded-md border p-3">
            <summary className="cursor-pointer break-words text-sm">
              {t(row.recurring ? "backlinkRecurring.scheduled" : "backlinkRecurring.manual")} ·{" "}
              {row.scope.target} · {row.scope.dateFrom} – {row.scope.dateTo} ·{" "}
              {t("backlinkMonitor." + row.status)}
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              {row.recurring && (
                <>
                  <p>
                    {t("backlinkRecurring.occurrence")}: {row.recurring.occurrenceAt}
                  </p>
                  {row.recurring.undispatched && <p>{t("backlinkRecurring.undispatched")}</p>}
                </>
              )}
              <p className="break-all">
                {t("backlinkMonitor.request")}: {row.requestId}
              </p>
              <p>
                {t("backlinkMonitor.subdomains")}:{" "}
                {t(row.scope.includeSubdomains ? "backlinkMonitor.yes" : "backlinkMonitor.no")}
              </p>
              <p>
                {t("backlinkMonitor.accounting")}: {t("backlinkMonitor." + row.accounting)}
              </p>
              {row.status === "succeeded" && row.accounting === "pending" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={recovery.isPending}
                  onClick={() => recovery.mutate(row.requestId)}
                >
                  {t("backlinkMonitor.recover")}
                </Button>
              )}
              {row.observation && (
                <>
                  <p>
                    {t("backlinkMonitor.observed")}: {row.observation.observedAt} · DataForSEO
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          <th className="p-2">{t("backlinkMonitor.date")}</th>
                          {labels.map((label) => (
                            <th key={label} className="p-2">
                              {t("backlinkMonitor." + label)}
                            </th>
                          ))}
                          <th className="p-2">{t("backlinkMonitor.reported")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.observation.days.map((day) => (
                          <tr key={day.date} className="border-t">
                            <td className="whitespace-nowrap p-2">{day.date}</td>
                            {fields.map((field) => (
                              <td key={field} className="p-2 tabular-nums">
                                {day[field] ?? "—"}
                              </td>
                            ))}
                            <td className="p-2">{t("backlinkMonitor." + day.state)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </details>
        ))}
    </section>
  );
}
