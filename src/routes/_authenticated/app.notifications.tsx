import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useStore, setActiveProject } from "@/lib/store";
import { useT, useAppLanguage } from "@/i18n";
import {
  getOperationalNotificationsFn,
  readOperationalNotificationFn,
} from "@/lib/operational-notifications.functions";
import { toast } from "sonner";
import { OperationalEmailSettings } from "@/components/OperationalEmailSettings";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  component: NotificationsPage,
});
function NotificationsPage() {
  const t = useT();
  const locale = useAppLanguage();
  const { user } = useAuth();
  const projects = useStore((s) => s.projects);
  const client = useQueryClient();
  const key = ["operational-notifications", user?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getOperationalNotificationsFn(),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const read = useMutation({
    mutationFn: (id: string) => readOperationalNotificationFn({ data: { id } }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: () => toast.error(t("notifications.readError")),
  });
  return (
    <AppShell
      title={t("notifications.title")}
      description={t("notifications.subtitle")}
      actions={
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {t("notifications.refresh")}
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <OperationalEmailSettings />
        <div aria-live="polite">
          {query.isPending && <p className="text-muted-foreground">{t("notifications.loading")}</p>}
          {query.isError && (
            <p role="alert" className="rounded-xl border p-4">
              {t("notifications.error")}
            </p>
          )}
          {query.data && !query.data.fresh && (
            <p role="status" className="rounded-xl border p-4">
              {t("notifications.stale")}
            </p>
          )}
          {query.data?.fresh && query.data.items.length === 0 && (
            <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              {t("notifications.empty")}
            </p>
          )}
        </div>
        {query.data?.items.map((item) => {
          const project = projects.find((p) => p.id === item.project_id);
          const date = item.due_at ? new Date(item.due_at) : null;
          let deadline = "";
          if (date && Number.isFinite(date.getTime())) {
            try {
              deadline = new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: item.detail.timeZone,
              }).format(date);
            } catch {
              deadline = date.toISOString();
            }
          }
          const editor = item.kind === "approval_due" || item.kind === "publication_failed";
          const body =
            item.kind === "scheduler_recovery"
              ? t("notifications.recovery")
              : item.kind === "cadence_gap"
                ? t("notifications.coverage", {
                    missing: item.detail.missing ?? 0,
                    total: item.detail.total ?? 0,
                  })
                : t(
                    item.kind === "approval_due"
                      ? "notifications.approval"
                      : item.kind === "publication_failed"
                        ? "notifications.failure"
                        : "notifications.manual",
                  );
          return (
            <article key={item.id} className="rounded-2xl border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{project?.businessName || project?.name || t("notifications.project")}</span>
                <span>·</span>
                <span>{item.read_at ? t("notifications.saved") : t("notifications.unread")}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold">{t(`notifications.${item.kind}`)}</h2>
              <p className="mt-1 break-words font-medium">{item.target_title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              {deadline && (
                <p className="mt-2 text-sm">
                  <time dateTime={item.due_at ?? undefined}>{deadline}</time> ·{" "}
                  {item.detail.timeZone}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {editor ? (
                  <Button asChild>
                    <Link
                      to="/app/editor"
                      search={{ id: item.target_id }}
                      onClick={() => setActiveProject(item.project_id)}
                    >
                      {t("notifications.open")}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link
                      to="/app/plan"
                      search={
                        item.kind === "cadence_gap" || item.kind === "scheduler_recovery"
                          ? { view: "calendar" }
                          : { selected: item.target_id }
                      }
                      onClick={() => setActiveProject(item.project_id)}
                    >
                      {t(
                        item.kind === "cadence_gap" || item.kind === "scheduler_recovery"
                          ? "notifications.calendar"
                          : "notifications.open",
                      )}
                    </Link>
                  </Button>
                )}
                {!item.read_at && (
                  <Button
                    variant="ghost"
                    disabled={read.isPending}
                    onClick={() => read.mutate(item.id)}
                  >
                    {t("notifications.read")}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
