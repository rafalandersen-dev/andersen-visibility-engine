import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { technicalFindings, type TechnicalFindingCode } from "@/lib/technical-findings";
import type { CrawlPage } from "@/lib/technical-crawl";
import { captureTechnicalFindingFn } from "@/lib/technical-findings.functions";
import { saveWorkspaceNow, reloadWorkspaceForUser } from "@/lib/store";
export function TechnicalFindingActions({
  owner,
  projectId,
  runId,
  revision,
  pageIndex,
  page,
}: {
  owner: string;
  projectId: string;
  runId: string;
  revision: number;
  pageIndex: number;
  page: CrawlPage;
}) {
  const t = useT(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [created, setCreated] = useState<Partial<Record<TechnicalFindingCode, string>>>({});
  const findings = technicalFindings(page);
  async function capture(code: TechnicalFindingCode) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await saveWorkspaceNow();
      const receipt = await captureTechnicalFindingFn({
        data: { projectId, runId, revision, pageIndex, code },
      });
      if (!receipt.opportunityExists) {
        setRemoved(true);
        return;
      }
      setCreated((value) => ({ ...value, [code]: receipt.opportunityId }));
      await reloadWorkspaceForUser(owner);
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!findings.length) return null;
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-sm">{t("crawl.findingHelp")}</p>
      {removed && <p role="status">{t("crawl.opportunityRemoved")}</p>}
      {failed && (
        <p role="alert" className="text-sm">
          {t("crawl.captureError")}
        </p>
      )}
      {findings.map((code) => (
        <div key={code} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t(`crawl.finding_${code}`)}</span>
          {created[code] ? (
            <Link
              className="underline"
              to="/app/plan"
              search={{ view: "list", scale: "week", selected: created[code] }}
            >
              {t("crawl.openOpportunity")}
            </Link>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void capture(code)}>
              {t("crawl.capture")}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
