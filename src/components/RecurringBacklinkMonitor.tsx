import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useAppLanguage, useT } from "@/i18n";
import type { BacklinkMonitorConfig } from "@/lib/backlink-recurring-config";
import type { BacklinkMonitorSettings } from "@/lib/backlink-recurring";
import { backlinkMonitorForm } from "@/lib/backlink-recurring-form";
import {
  readBacklinkMonitorConfigFn,
  saveBacklinkMonitorConfigFn,
} from "@/lib/backlink-recurring.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Props = { projectId: string; website: string; collectionAvailable: boolean };
export function RecurringBacklinkMonitor(props: Props) {
  const { user } = useAuth();
  return user ? (
    <OwnerMonitor
      key={`${user.id}:${props.projectId}:${props.website}`}
      {...props}
      userId={user.id}
    />
  ) : null;
}

function OwnerMonitor({
  userId,
  projectId,
  website,
  collectionAvailable,
}: Props & { userId: string }) {
  const t = useT(),
    language = useAppLanguage(),
    client = useQueryClient();
  const [attempted, setAttempted] = useState(false);
  const [reload, setReload] = useState(0);
  const queryKey = ["backlink-recurring", userId, projectId, website];
  const query = useQuery({
    queryKey,
    queryFn: () => readBacklinkMonitorConfigFn({ data: { projectId } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const save = useMutation({
    mutationFn: (settings: BacklinkMonitorSettings) =>
      saveBacklinkMonitorConfigFn({
        data: {
          projectId,
          changeId: crypto.randomUUID(),
          expectedRevision: query.data?.revision ?? 0,
          expectedWebsite: website.trim(),
          settings,
        },
      }),
    retry: false,
    onSuccess: (result) => {
      if (result.state === "saved") {
        client.setQueryData(queryKey, result.monitor);
        setAttempted(false);
      }
    },
  });
  const blocked = attempted || save.isPending || query.isFetching || !query.isSuccess;
  const submit = (settings: BacklinkMonitorSettings) => {
    if (blocked || (settings.enabled && !collectionAvailable)) return;
    setAttempted(true);
    save.mutate(settings);
  };
  const money = (microusd: number) =>
    new Intl.NumberFormat(language, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(microusd / 1_000_000);
  const config = query.isSuccess ? query.data : null;
  const changedWebsite = !!config && config.website.trim() !== website.trim();
  const capHeld =
    !!config &&
    config.settings.monthlyCapMicrousd - config.spending.reservedOrSpentMicrousd <
      24000 + 36 * config.settings.lookbackDays;
  return (
    <section
      className="mt-8 space-y-4 rounded-lg border bg-card p-5"
      aria-label={t("backlinkRecurring.title")}
    >
      <h2 className="font-display text-xl">{t("backlinkRecurring.title")}</h2>
      <p className="break-all text-sm">{website}</p>
      <p className="max-w-3xl text-sm text-muted-foreground">{t("backlinkRecurring.note")}</p>
      {query.isPending && <p role="status">{t("backlinkRecurring.loading")}</p>}
      {query.isError && <p role="alert">{t("backlinkRecurring.error")}</p>}
      {query.isSuccess && (
        <>
          <p role="status">
            {t(config?.settings.enabled ? "backlinkRecurring.enabled" : "backlinkRecurring.paused")}
          </p>
          {config && (
            <div className="space-y-2 text-sm">
              <p>
                {t("backlinkRecurring.spending", {
                  month: config.billingMonth,
                  used: money(config.spending.reservedOrSpentMicrousd),
                  cap: money(config.settings.monthlyCapMicrousd),
                })}
              </p>
              {config.spending.unsettled && <p role="status">{t("backlinkRecurring.unsettled")}</p>}
              {config.settings.enabled && capHeld && (
                <p role="status">{t("backlinkRecurring.capHeld")}</p>
              )}
              {changedWebsite && <p role="status">{t("backlinkRecurring.changedWebsite")}</p>}
              {config.settings.enabled &&
                !config.spending.unsettled &&
                !capHeld &&
                !changedWebsite && <p>{t("backlinkRecurring.next", { date: config.nextDueAt })}</p>}
              {config.settings.enabled && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={blocked}
                  onClick={() => submit({ ...config.settings, enabled: false })}
                >
                  {t("backlinkRecurring.pause")}
                </Button>
              )}
            </div>
          )}
          {!collectionAvailable && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("backlinkRecurring.unavailable")}
            </p>
          )}
          <MonitorForm
            key={`${config?.revision ?? 0}:${reload}`}
            config={config ?? null}
            blocked={blocked}
            collectionAvailable={collectionAvailable}
            onSave={submit}
          />
        </>
      )}
      {(save.isError || save.data) && (
        <p role="status">
          {t(
            "backlinkRecurring." +
              (save.isError
                ? "uncertain"
                : save.data?.state === "saved"
                  ? "saved"
                  : save.data?.state === "website_changed"
                    ? "changedWebsite"
                    : "uncertain"),
          )}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={query.isFetching || save.isPending}
        onClick={async () => {
          const result = await query.refetch();
          if (result.isSuccess) {
            setAttempted(false);
            setReload((v) => v + 1);
            save.reset();
          }
        }}
      >
        {t("backlinkRecurring.refresh")}
      </Button>
      <p className="text-sm">
        <a className="underline" href="#backlink-history">
          {t("backlinkRecurring.history")}
        </a>
      </p>
    </section>
  );
}

function MonitorForm({
  config,
  blocked,
  collectionAvailable,
  onSave,
}: {
  config: BacklinkMonitorConfig | null;
  blocked: boolean;
  collectionAvailable: boolean;
  onSave: (s: BacklinkMonitorSettings) => void;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(config?.settings.enabled ?? false);
  const [cadence, setCadence] = useState<"daily" | "weekly">(config?.settings.cadence ?? "weekly");
  const [lookbackDays, setDays] = useState(String(config?.settings.lookbackDays ?? 7));
  const [includeSubdomains, setSubdomains] = useState(config?.settings.includeSubdomains ?? false);
  const [cap, setCap] = useState(String((config?.settings.monthlyCapMicrousd ?? 0) / 1_000_000));
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked || (enabled && !collectionAvailable)) return;
        try {
          const settings = backlinkMonitorForm({
            enabled,
            cadence,
            lookbackDays,
            includeSubdomains,
            cap,
          });
          setInvalid(false);
          onSave(settings);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <fieldset disabled={blocked} className="flex flex-wrap items-end gap-4">
        <legend className="mb-3 text-sm font-medium">{t("backlinkRecurring.settings")}</legend>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!collectionAvailable && !enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {t("backlinkRecurring.enable")}
        </label>
        <label className="space-y-1 text-sm">
          {t("backlinkRecurring.cadence")}
          <select
            className="block h-9 rounded-md border bg-background px-3"
            value={cadence}
            onChange={(e) => setCadence(e.target.value === "daily" ? "daily" : "weekly")}
          >
            <option value="daily">{t("backlinkRecurring.daily")}</option>
            <option value="weekly">{t("backlinkRecurring.weekly")}</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          {t("backlinkRecurring.days")}
          <Input
            type="number"
            min="1"
            max="92"
            step="1"
            required
            value={lookbackDays}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          {t("backlinkRecurring.cap")}
          <Input
            inputMode="decimal"
            required
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            checked={includeSubdomains}
            onChange={(e) => setSubdomains(e.target.checked)}
          />
          {t("backlinkMonitor.subdomains")}
        </label>
        <Button type="submit" disabled={enabled && !collectionAvailable}>
          {t("backlinkRecurring.save")}
        </Button>
      </fieldset>
      <p className="max-w-3xl text-xs text-muted-foreground">{t("backlinkRecurring.allowance")}</p>
      {invalid && <p role="alert">{t("backlinkRecurring.invalid")}</p>}
    </form>
  );
}
