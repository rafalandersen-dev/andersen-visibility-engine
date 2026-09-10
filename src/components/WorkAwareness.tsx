import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useStore, setActiveProject } from "@/lib/store";
import { useT, useAppLanguage } from "@/i18n";
import { getWorkAwarenessFn } from "@/lib/work-awareness.functions";
import { Button } from "./ui/button";

export function WorkAwareness() {
  const t = useT(),
    locale = useAppLanguage(),
    { user } = useAuth();
  const projects = useStore((s) => s.projects);
  const active = useStore((s) => s.activeProjectId);
  const [selected, setSelected] = useState<string | null>(null);
  const projectId =
    projects.find((p) => p.id === selected)?.id ??
    projects.find((p) => p.id === active)?.id ??
    projects[0]?.id;
  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4">
      <h2 className="text-lg font-semibold">{t("awareness.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("awareness.help")}</p>
      <label className="block text-sm">
        {t("awareness.project")}
        <select
          className="block mt-1 w-full rounded border bg-background p-2"
          value={projectId ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.businessName || p.name}
            </option>
          ))}
        </select>
      </label>
      {user && projectId && (
        <ProjectWork
          key={`${user.id}:${projectId}`}
          projectId={projectId}
          ownerId={user.id}
          locale={locale}
        />
      )}
    </section>
  );
}
function ProjectWork({
  projectId,
  ownerId,
  locale,
}: {
  projectId: string;
  ownerId: string;
  locale: string;
}) {
  const t = useT(),
    [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["work-awareness", ownerId, projectId, page],
    queryFn: () => getWorkAwarenessFn({ data: { projectId, page } }),
    refetchInterval: 60_000,
    retry: false,
  });
  // Hide stale retained data on failed rechecks; never imply a cleared queue.
  const report = query.isError ? undefined : query.data;
  const date = (value: string) => {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return t("awareness.error");
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: report?.timeZone ?? "UTC",
      }).format(parsed);
    } catch {
      return parsed.toISOString();
    }
  };
  return (
    <div className="space-y-4">
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        {t("notifications.refresh")}
      </Button>
      {query.isPending && <p role="status">{t("notifications.loading")}</p>}
      {query.isError && <p role="alert">{t("awareness.error")}</p>}
      {report && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("awareness.checked", { at: date(report.checkedAt) })} · {report.timeZone}
          </p>
          {report.engine === "paused" ? (
            <p>{t("awareness.paused")}</p>
          ) : (
            !report.enabled && <p>{t("awareness.disabled")}</p>
          )}
          {report.approvals.length === 0 && <p>{t("awareness.empty")}</p>}
          {report.approvals.map((item) => (
            <article key={item.id} className="border-t pt-3 space-y-2">
              <h3 className="font-medium">{item.title}</h3>
              <p>{t(`awareness.${item.state}`)}</p>
              <p className="text-sm">
                <time dateTime={item.publishAt}>{date(item.publishAt)}</time>
              </p>
              {item.late && <p className="text-sm text-muted-foreground">{t("awareness.late")}</p>}
              <Button asChild variant="outline">
                <Link
                  to="/app/editor"
                  search={{ id: item.assetId }}
                  onClick={() => setActiveProject(projectId)}
                >
                  {t("notifications.open")}
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link
                  to="/app/plan"
                  search={{ view: "calendar" }}
                  onClick={() => setActiveProject(projectId)}
                >
                  {t("notifications.calendar")}
                </Link>
              </Button>
            </article>
          ))}
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="ghost"
              disabled={report.page === 0}
              onClick={() => setPage(report.page - 1)}
            >
              {t("weekly.previous")}
            </Button>
            <span>{t("awareness.page", { page: report.page + 1, pages: report.pages })}</span>
            <Button
              variant="ghost"
              disabled={report.page + 1 >= report.pages}
              onClick={() => setPage(report.page + 1)}
            >
              {t("weekly.next")}
            </Button>
          </div>
          {report.weeks.map((week) => (
            <article className="border-t pt-3 space-y-2" key={week.period}>
              <h3 className="font-medium">
                {t("awareness.weekly")} · {week.period.slice(5)}
              </h3>
              <ul className="space-y-2">
                {week.readiness.map((slot) => (
                  <li key={slot.slotId} className="text-sm">
                    {date(slot.publishAt)} · {t(`weekly.state.${slot.state}`)}
                    {slot.assetId && slot.title && (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          className="underline"
                          to="/app/editor"
                          search={{ id: slot.assetId }}
                          onClick={() => setActiveProject(projectId)}
                        >
                          {slot.title}
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {week.stages
                .filter((s) => s.state === "unknown" || s.state === "cancelled")
                .map((stage) => (
                  <p key={stage.requestId} className="text-sm">
                    {date(stage.publishAt)} · {t(`weekly.stageState.${stage.state}`)}
                  </p>
                ))}
              {week.summary && (
                <p className="text-sm text-muted-foreground">
                  {t("awareness.history")}: {t(`weekly.action.${week.summary.summary.action}`)} ·{" "}
                  {date(week.summary.updatedAt)}
                </p>
              )}
            </article>
          ))}
          <Button asChild variant="outline">
            <Link to="/app/setup" onClick={() => setActiveProject(projectId)}>
              {t("awareness.settings")}
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
