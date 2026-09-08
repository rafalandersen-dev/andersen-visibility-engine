import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPublicationFailureFn } from "@/lib/operational-notifications.functions";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";

export function PublicationFailureDetails({
  projectId,
  assetId,
  queueId,
}: {
  projectId: string;
  assetId: string;
  queueId: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useT(),
    locale = useAppLanguage(),
    { user } = useAuth();
  const query = useQuery({
    queryKey: ["publication-failure", user?.id, projectId, assetId, queueId],
    queryFn: () => getPublicationFailureFn({ data: { projectId, assetId, queueId } }),
    enabled: open && !!user,
    staleTime: 0,
  });
  const report = query.isSuccess ? query.data : undefined;
  return (
    <div className="mt-4 border-t pt-3">
      <Button variant="outline" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {t("notifications.failureInspect")}
      </Button>
      {open && (
        <div className="mt-3 space-y-3 text-sm" aria-live="polite">
          {query.isPending && <p>{t("notifications.loading")}</p>}
          {query.isError && <p role="alert">{t("notifications.failureReadError")}</p>}
          {report &&
            (report.state === "failed" ? (
              <>
                <p className="font-medium">
                  {t(`notifications.failureReason.${report.reason.kind}`)}
                </p>
                <p className="text-muted-foreground">
                  {t("notifications.failureRecorded", {
                    at: new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(report.recordedAt)),
                    attempts: report.attempts,
                  })}
                </p>
                {report.draftChanged && <p>{t("notifications.failureDraftChanged")}</p>}
                {report.reason.httpStatus !== undefined && (
                  <p>{t("notifications.failureHttp", { status: report.reason.httpStatus })}</p>
                )}
                {report.reason.checks.length > 0 && (
                  <ul className="list-disc space-y-2 pl-5">
                    {report.reason.checks.map((check) => (
                      <li key={check}>{t(`notifications.failureCheck.${check}`)}</li>
                    ))}
                  </ul>
                )}
                <p className="text-muted-foreground">{t("notifications.failureHistoryLimit")}</p>
              </>
            ) : (
              <p>{t(`notifications.failureState.${report.state}`)}</p>
            ))}
          <Button variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {t("notifications.refresh")}
          </Button>
        </div>
      )}
    </div>
  );
}
