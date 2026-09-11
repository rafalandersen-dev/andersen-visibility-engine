import { useEffect, useRef, useState } from "react";
import { useCrawlOwnership } from "@/lib/use-crawl-ownership";
import { useT } from "@/i18n";
import { saveWorkspaceNow } from "@/lib/store";
import * as api from "@/lib/technical-ownership.functions";
import { Button } from "./ui/button";
export function CrawlOwnershipPanel({ owner, projectId }: { owner: string; projectId: string }) {
  const t = useT();
  const proof = useCrawlOwnership(owner, projectId);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const locked = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function act(action: "issue" | "verify" | "revoke") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await saveWorkspaceNow();
      if (!mounted.current) return;
      const fn =
        action === "issue"
          ? api.issueCrawlOwnershipFn
          : action === "verify"
            ? api.verifyCrawlOwnershipFn
            : api.revokeCrawlOwnershipFn;
      await fn({ data: { projectId } });
      if (mounted.current) {
        const fresh = await proof.refetch();
        if (fresh.isError) setFailed(true);
      }
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const saved = proof.isError ? null : proof.data;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{t("crawl.ownershipTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("crawl.ownershipHelp")}</p>
      {proof.isPending ? (
        <p>{t("crawl.ownershipLoading")}</p>
      ) : saved ? (
        <>
          <p className="text-sm">
            {t(`crawl.ownership_${saved.status}`)} · {saved.origin}
          </p>
          {saved.status === "pending" && (
            <>
              <p className="text-sm">{t("crawl.ownershipInstructions")}</p>
              <dl className="space-y-2 text-sm">
                <dt>{t("crawl.ownershipName")}</dt>
                <dd className="break-all font-mono">{saved.name}</dd>
                <dt>{t("crawl.ownershipValue")}</dt>
                <dd className="break-all font-mono">{saved.value}</dd>
              </dl>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {t("crawl.ownershipExpires")} {new Date(saved.expiresAt).toLocaleString()}
          </p>
        </>
      ) : null}
      {(failed || proof.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {t("crawl.ownershipError")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(!saved || ["expired", "revoked"].includes(saved.status)) && (
          <Button
            variant="outline"
            disabled={busy || proof.isPending || proof.isError}
            onClick={() => void act("issue")}
          >
            {t("crawl.ownershipIssue")}
          </Button>
        )}
        {saved?.status === "pending" && (
          <Button variant="outline" disabled={busy} onClick={() => void act("verify")}>
            {t("crawl.ownershipVerify")}
          </Button>
        )}
        {saved && ["pending", "verified"].includes(saved.status) && (
          <Button variant="outline" disabled={busy} onClick={() => void act("revoke")}>
            {t("crawl.ownershipRevoke")}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void proof.refetch()}>
          {t("crawl.refresh")}
        </Button>
      </div>
    </section>
  );
}
