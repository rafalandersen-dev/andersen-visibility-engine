import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useT, useAppLanguage } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readWeeklyPreparationFn, setSchedulerControlFn } from "@/lib/weekly-preparation.functions";
import { localWeekStart } from "@/lib/weekly-preparation";
import { normalizeAutoSchedulerConfig } from "@/lib/auto-scheduler";
import type { Project } from "@/lib/types";
import type { schedulerControlSchema } from "@/lib/weekly-preparation.server";
import type { z } from "zod";
import { toast } from "sonner";
type Control = z.infer<typeof schedulerControlSchema>;
function shiftWeek(week: string, days: number) {
  return new Date(Date.parse(week + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}
export function WeeklyPreparationPanel({ project }: { project: Project }) {
  const t = useT(),
    locale = useAppLanguage(),
    { user } = useAuth();
  const schedule = normalizeAutoSchedulerConfig(project.autoScheduler);
  const [week, setWeek] = useState(() =>
    shiftWeek(localWeekStart(new Date(), schedule.timeZone), 7),
  );
  const [edited, setEdited] = useState<Control | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["weekly-preparation", user?.id, project.id, week, project.autoScheduler],
    queryFn: () => readWeeklyPreparationFn({ data: { projectId: project.id, weekStart: week } }),
    enabled: !!user,
    staleTime: 0,
  });
  const report = query.data,
    control = edited ?? report?.control;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: report?.timeZone ?? schedule.timeZone,
    }).format(new Date(value));
  async function save() {
    if (!control || !report) return;
    setSaving(true);
    try {
      await setSchedulerControlFn({
        data: {
          projectId: project.id,
          expectedRevision: control.revision,
          engine: control.engine,
          preparation: control.preparation,
        },
      });
      setEdited(null);
      await query.refetch();
      toast.success(t("weekly.saved"));
    } catch {
      toast.error(t("weekly.saveFailed"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rounded-xl border border-border p-5 space-y-4">
      <h2 className="font-display text-xl">{t("weekly.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("weekly.help")}</p>
      {query.isPending && <p role="status">{t("weekly.loading")}</p>}
      {query.isError && <p role="alert">{t("weekly.unavailable")}</p>}
      {control && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm space-y-1">
            {t("weekly.engine")}
            <select
              className="block w-full border rounded-md bg-background p-2"
              value={control.engine}
              disabled={saving}
              onChange={(e) =>
                setEdited({ ...control, engine: e.target.value as Control["engine"] })
              }
            >
              {(["monthly", "weekly", "paused"] as const).map((engine) => (
                <option key={engine} value={engine}>
                  {t(`weekly.engine.${engine}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            {t("weekly.preparationDay")}
            <select
              className="block w-full border rounded-md bg-background p-2"
              value={control.preparation.preparationWeekday}
              disabled={saving}
              onChange={(e) =>
                setEdited({
                  ...control,
                  preparation: {
                    ...control.preparation,
                    preparationWeekday: Number(e.target.value),
                  },
                })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <option key={day} value={day}>
                  {t(`autoSched.day.${day}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            {t("weekly.preparationTime")}
            <Input
              type="time"
              value={control.preparation.preparationTime}
              disabled={saving}
              onChange={(e) =>
                setEdited({
                  ...control,
                  preparation: { ...control.preparation, preparationTime: e.target.value },
                })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            {t("weekly.reviewLead")}
            <Input
              type="number"
              min={1}
              max={168}
              value={control.preparation.reviewLeadHours}
              disabled={saving}
              onChange={(e) =>
                setEdited({
                  ...control,
                  preparation: { ...control.preparation, reviewLeadHours: Number(e.target.value) },
                })
              }
            />
          </label>
          <Button onClick={save} disabled={!edited || saving || query.isFetching}>
            {t("weekly.save")}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setWeek(shiftWeek(week, -7))}>
          {t("weekly.previous")}
        </Button>
        <span>{week}</span>
        <Button variant="outline" onClick={() => setWeek(shiftWeek(week, 7))}>
          {t("weekly.next")}
        </Button>
        <Button variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {t("weekly.refresh")}
        </Button>
      </div>
      {report && (
        <>
          <p className="text-sm">
            {t(report.enabled ? "weekly.enabled" : "weekly.disabled")} · {report.timeZone}
          </p>
          <p className="text-sm">
            {t("weekly.prepareAt")}:{" "}
            {report.prepareAt ? date(report.prepareAt) : t("weekly.invalidTime")}
          </p>
          <ul className="divide-y divide-border">
            {report.readiness.map((slot) => (
              <li key={slot.slotId} className="py-3 flex flex-wrap justify-between gap-2">
                <span>
                  {date(slot.publishAt)} —{" "}
                  {slot.assetId && slot.title ? (
                    <Link className="underline" to="/app/editor" search={{ id: slot.assetId }}>
                      {slot.title}
                    </Link>
                  ) : (
                    t("weekly.noDraft")
                  )}
                </span>
                <span>{t(`weekly.state.${slot.state}`)}</span>
              </li>
            ))}
          </ul>
          {report.issues.map((issue) => (
            <p key={issue.localDate + issue.reason} className="text-sm">
              {issue.localDate}: {t(`weekly.issue.${issue.reason}`)}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">{t("weekly.queueHelp")}</p>
        </>
      )}
    </section>
  );
}
