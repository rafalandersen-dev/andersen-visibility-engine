import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSchedulerRecoveryFn } from "@/lib/operational-notifications.functions";
import { useAuth } from "@/lib/auth";
import { setActiveProject } from "@/lib/store";
import { useT, useAppLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";

export function SchedulerRecoveryDetails({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const t = useT(),
    locale = useAppLanguage(),
    { user } = useAuth();
  const query = useQuery({
    queryKey: ["scheduler-recovery", user?.id, projectId],
    queryFn: () => getSchedulerRecoveryFn({ data: { projectId } }),
    enabled: open && !!user,
    staleTime: 0,
  });
  const report = query.data;
  return (
    <div className="mt-4 border-t pt-3">
      <Button variant="outline" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {t("notifications.recoveryInspect")}
      </Button>
      {open && (
        <div className="mt-3 space-y-3 text-sm" aria-live="polite">
          {query.isPending && <p>{t("notifications.loading")}</p>}
          {query.isError && <p role="alert">{t("notifications.recoveryReadError")}</p>}
          {report && (
            <>
              <p className="font-medium">{t(`notifications.recoveryState.${report.state}`)}</p>
              <p className="text-muted-foreground">
                {t("notifications.recoverySnapshot", {
                  at: new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(report.checkedAt)),
                })}
              </p>
              {report.state !== "absent" && (
                <>
                  <p>
                    {t("notifications.recoveryCounts", {
                      period: report.plannedPeriod,
                      saved: report.counts.saved,
                      pending: report.counts.pending,
                      publishing: report.counts.publishing,
                      published: report.counts.published,
                      failed: report.counts.failed,
                      cancelled: report.counts.cancelled,
                    })}
                  </p>
                  {report.counts.review_required > 0 && (
                    <p>{t("approval.heldCount", { count: report.counts.review_required })}</p>
                  )}
                  <p className="text-muted-foreground">
                    {t("notifications.recoveryEvidenceLimit")}
                  </p>
                  <ul className="space-y-2">
                    {report.assets.map((asset) => (
                      <li key={asset.id}>
                        <Link
                          className="break-words underline underline-offset-4"
                          to="/app/editor"
                          search={{ id: asset.id }}
                          onClick={() => setActiveProject(projectId)}
                        >
                          {asset.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {report.assets.length < report.counts.saved && (
                    <p>
                      {t("notifications.recoveryMore", {
                        shown: report.assets.length,
                        total: report.counts.saved,
                      })}
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <Button variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {t("notifications.refresh")}
          </Button>
        </div>
      )}
    </div>
  );
}
