import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  getOwnerBenchmarkStatusFn,
  runOwnerBenchmarkStageFn,
} from "@/lib/owner-benchmark.functions";
type Status = Awaited<ReturnType<typeof getOwnerBenchmarkStatusFn>>;
/** Only a service-provisioned run link opens this panel; role/run ownership
 * checks on every server call remain authoritative. Mounting only reads. */
export function OwnerBenchmarkPanel({ runId }: { runId: string }) {
  const t = useT();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false),
    alive = useRef(true);
  const refresh = useCallback(async () => {
    const result = await getOwnerBenchmarkStatusFn({ data: { runId } });
    if (!result) throw new Error("test_unavailable");
    if (alive.current) {
      setStatus(result);
      setFailed(false);
    }
    return result;
  }, [runId]);
  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => {
      if (alive.current) setFailed(true);
    });
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== "running") return;
    const timer = setInterval(() => {
      void refresh().catch(() => {
        if (alive.current) setFailed(true);
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [status?.state, refresh]);
  if (!status)
    return failed ? (
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">{t("benchmark.title")}</h2>
        <p role="alert" className="mt-3 text-sm">
          {t("benchmark.statusError")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void refresh().catch(() => setFailed(true))}
        >
          {t("benchmark.refresh")}
        </Button>
      </section>
    ) : null;
  const ready = status.state === "ready" && status.configured && !status.expired && !failed;
  async function start() {
    if (running.current || !ready || !status) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    let next = status;
    try {
      for (let count = 0; count < 3 && alive.current && next.state === "ready"; count++) {
        const result = await runOwnerBenchmarkStageFn({ data: { runId, stage: next.stage } });
        if (!alive.current) break;
        if (result.outcome !== "completed_stage") {
          await refresh();
          setFailed(true);
          break;
        }
        const updated = await refresh();
        if (!updated) {
          setFailed(true);
          break;
        }
        next = updated;
      }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      className="mb-6 rounded-xl border border-border bg-card p-5"
      aria-label={t("benchmark.title")}
    >
      <h2 className="font-display text-xl">{t("benchmark.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("benchmark.description")}</p>
      <p className="mt-3 font-medium">{status.title}</p>
      <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-live="polite">
        {(["scan", "article", "image"] as const).map((stage, index) => (
          <li key={stage}>
            {index + 1}. {t(`benchmark.${stage}`)} ·{" "}
            {t(
              status.completed.includes(stage)
                ? "benchmark.done"
                : status.stage === stage && (busy || status.state === "running")
                  ? "benchmark.working"
                  : "benchmark.waiting",
            )}
          </li>
        ))}
      </ol>
      {!status.configured ? <p className="mt-3 text-sm">{t("benchmark.configuration")}</p> : null}
      {status.expired && status.state !== "completed" ? (
        <p className="mt-3 text-sm">{t("benchmark.expired")}</p>
      ) : null}
      {failed || status.needsAttention ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {t("benchmark.stopped")}
        </p>
      ) : null}
      {status.state === "completed" ? (
        <p className="mt-3 text-sm">{t("benchmark.complete")}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {ready ? (
          <Button type="button" disabled={busy} onClick={() => void start()}>
            {t(
              busy
                ? "benchmark.working"
                : status.stage === "scan"
                  ? "benchmark.start"
                  : "benchmark.continue",
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void refresh().catch(() => setFailed(true))}
        >
          {t("benchmark.refresh")}
        </Button>
        {status.completed.includes("article") ? (
          <Button asChild variant="outline">
            <a href={`/app/editor?id=${encodeURIComponent(status.assetId)}`}>
              {t("benchmark.openDraft")}
            </a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
