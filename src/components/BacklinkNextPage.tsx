import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useT } from "@/i18n";
import type { BacklinkDetailsHistory } from "@/lib/backlink-details-history";
import { requestBacklinkDetailsFn } from "@/lib/backlink-details.functions";
import { Button } from "./ui/button";
/** One explicit child request per saved parent. Refresh only reads history. */
export function BacklinkNextPage({
  row,
  projectId,
  website,
  available,
  refresh,
}: {
  row: BacklinkDetailsHistory[number];
  projectId: string;
  website: string;
  available: boolean;
  refresh: () => Promise<unknown>;
}) {
  const t = useT();
  const attempted = useRef<string | null>(null);
  const [requestId, setRequest] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (id: string) =>
      requestBacklinkDetailsFn({
        data: {
          projectId,
          requestId: id,
          parentRequestId: row.requestId,
          expectedWebsite: website.trim(),
        },
      }),
    retry: false,
    onSettled: () => {
      void refresh();
    },
  });
  const page = row.pageInfo;
  if (!page) return null;
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <p>
        {t("backlinkDetails.page", {
          page: page.pageNumber,
          count: page.priorReturnedCount + (row.observation?.providerReturnedCount ?? 0),
        })}
      </p>
      {page.canContinue && (
        <>
          <p>{t("backlinkDetails.nextNote")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={!available || run.isPending || requestId !== null}
            onClick={() => {
              if (!available || !page.canContinue || attempted.current !== null) return;
              const id = crypto.randomUUID();
              attempted.current = id;
              setRequest(id);
              run.mutate(id);
            }}
          >
            {t(run.isPending ? "backlinkMonitor.running" : "backlinkDetails.next")}
          </Button>
        </>
      )}
      {page.childRequestId && (
        <p className="break-all">
          {t("backlinkDetails.child")}: {page.childRequestId}
        </p>
      )}
      {page.pageNumber === 10000 && row.observation?.moreProviderResults && (
        <p>{t("backlinkDetails.pageLimit")}</p>
      )}
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
    </div>
  );
}
