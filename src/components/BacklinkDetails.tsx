import { BacklinkNextPage } from "./BacklinkNextPage";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { detailScope } from "@/lib/backlink-details";
import {
  readBacklinkDetailsHistoryFn,
  requestBacklinkDetailsFn,
  recoverBacklinkDetailsAccountingFn,
} from "@/lib/backlink-details.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function BacklinkDetails({
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
    <DetailsHistory
      key={`${user.id}:${projectId}:${website}`}
      userId={user.id}
      projectId={projectId}
      website={website}
      collectionAvailable={collectionAvailable}
    />
  ) : null;
}
function DetailsHistory({
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
  const [selection, setSelection] = useState<"first_seen" | "lost_last_seen">("first_seen");
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [requestId, setRequest] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const queryKey = ["backlink-details", userId, projectId, website];
  const query = useQuery({
    queryKey,
    queryFn: () => readBacklinkDetailsHistoryFn({ data: { projectId } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const refresh = () => client.invalidateQueries({ queryKey });
  const run = useMutation({
    mutationFn: (id: string) =>
      requestBacklinkDetailsFn({
        data: {
          projectId,
          requestId: id,
          dateFrom,
          dateTo,
          includeSubdomains,
          selection,
          limit,
          offset,
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
      recoverBacklinkDetailsAccountingFn({ data: { projectId, requestId: id } }),
    retry: false,
    onSettled: () => {
      void refresh();
    },
  });
  const disabled = !collectionAvailable || run.isPending || requestId !== null;
  return (
    <section className="mt-8 space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-display text-xl">{t("backlinkDetails.title")}</h2>
      <p className="break-all text-sm">{website}</p>
      <p className="max-w-3xl text-sm text-muted-foreground">{t("backlinkDetails.note")}</p>
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
            detailScope({
              target: new URL(
                /^https?:\/\//i.test(savedWebsite) ? savedWebsite : `https://${savedWebsite}`,
              ).hostname.toLowerCase(),
              dateFrom,
              dateTo,
              includeSubdomains,
              selection,
              limit,
              offset,
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
        <label className="space-y-1 text-sm">
          {t("backlinkDetails.selection")}
          <select
            className="block rounded border bg-background p-2"
            value={selection}
            disabled={disabled}
            onChange={(e) => setSelection(e.target.value as typeof selection)}
          >
            <option value="first_seen">{t("backlinkDetails.first_seen")}</option>
            <option value="lost_last_seen">{t("backlinkDetails.lost_last_seen")}</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          {t("backlinkDetails.limit")}
          <Input
            type="number"
            min={1}
            max={100}
            step={1}
            value={limit}
            disabled={disabled}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
        <label className="space-y-1 text-sm">
          {t("backlinkDetails.offset")}
          <Input
            type="number"
            required
            min={0}
            max={20000}
            step={1}
            value={offset}
            disabled={disabled}
            onChange={(e) => setOffset(Number(e.target.value))}
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
          {t(run.isPending ? "backlinkMonitor.running" : "backlinkDetails.run")}
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
              {row.scope.target} · {t("backlinkDetails." + row.scope.selection)} ·{" "}
              {row.scope.dateFrom} – {row.scope.dateTo} · {t("backlinkMonitor." + row.status)}
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              <p className="break-all">
                {t("backlinkMonitor.request")}: {row.requestId}
              </p>
              <p>
                {t("backlinkDetails.offset")}: {row.scope.offset ?? 0} ·{" "}
                {t("backlinkDetails.limit")}: {row.scope.limit}
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
              <BacklinkNextPage
                row={row}
                projectId={projectId}
                website={website}
                available={collectionAvailable && !run.isPending && !recovery.isPending}
                refresh={refresh}
              />
              {row.observation && (
                <>
                  <p>
                    {t("backlinkMonitor.observed")}: {row.observation.observedAt} · DataForSEO
                  </p>
                  <p>
                    {t("backlinkDetails.counts", {
                      retained: row.observation.retainedCount,
                      returned: row.observation.providerReturnedCount,
                      total: row.observation.providerTotalCount,
                    })}
                  </p>
                  {(row.observation.retainedTruncated || row.observation.moreProviderResults) && (
                    <p>{t("backlinkDetails.partial")}</p>
                  )}
                  {row.observation.links.length === 0 && <p>{t("backlinkDetails.noLinks")}</p>}
                  <ul className="space-y-3">
                    {row.observation.links.map((link) => (
                      <li
                        key={JSON.stringify([link.sourceUrl, link.targetUrl])}
                        className="space-y-1 rounded border p-3 break-words"
                      >
                        <p>
                          {t("backlinkDetails.source")}:{" "}
                          <a
                            className="underline break-all"
                            href={link.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {link.sourceUrl}
                          </a>
                        </p>
                        <p>
                          {t("backlinkDetails.target")}:{" "}
                          <a
                            className="underline break-all"
                            href={link.targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {link.targetUrl}
                          </a>
                        </p>
                        <p>
                          {t("backlinkDetails.anchor")}: {link.anchor ?? "—"}
                          {link.anchorTruncated ? "…" : ""}
                        </p>
                        <p>
                          {t("backlinkDetails.first")}: {link.firstSeenAt ?? "—"} ·{" "}
                          {t("backlinkDetails.last")}: {link.lastSeenAt ?? "—"}
                        </p>
                        <p>
                          {t("backlinkDetails.rank")}: {link.rank ?? "—"} ·{" "}
                          {t("backlinkDetails.spam")}: {link.spamScore ?? "—"}
                        </p>
                        <p>
                          {t("backlinkDetails.lost")}:{" "}
                          {link.providerLost === null
                            ? "—"
                            : t(link.providerLost ? "backlinkMonitor.yes" : "backlinkMonitor.no")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        ))}
    </section>
  );
}
