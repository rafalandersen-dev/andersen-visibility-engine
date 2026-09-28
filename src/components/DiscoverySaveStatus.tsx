import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiscoverySaveStatus as Status } from "@/lib/discovery-save-recovery";

/**
 * Visible, accessible save status for the discovery acceptance action. Pending and confirmed use
 * `role="status"`; an unconfirmed outcome uses `role="alert"` with an explicit non-submit Retry.
 * Wording distinguishes "in this open workspace" (memory) from a confirmed save, and an unknown
 * outcome from a definite failure. A session change offers no retry of the old context.
 */
export function DiscoverySaveStatus({
  status,
  onRetry,
  t,
}: {
  status: Status;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  if (status.kind === "idle") return null;
  if (status.kind === "pending")
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 px-4 py-2 text-xs text-[#586371]"
        data-discovery-save="pending"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t("planScreen.discovery.save.pending")}
      </p>
    );
  if (status.kind === "confirmed")
    return (
      <p
        role="status"
        aria-live="polite"
        className="px-4 py-2 text-xs text-[#398a63]"
        data-discovery-save="confirmed"
      >
        {t("planScreen.discovery.save.confirmed")}
      </p>
    );
  const reasonKey =
    status.reason === "notReady"
      ? "planScreen.discovery.save.notReady"
      : "planScreen.discovery.save.unconfirmed";
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-[#9a6d16]"
      data-discovery-save="unconfirmed"
      data-attempt={status.attempt}
    >
      <span>{t(reasonKey)}</span>
      <span className="text-[#697282]">{t("planScreen.discovery.save.retryNote")}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t("planScreen.discovery.save.retry")}
      </Button>
    </div>
  );
}
