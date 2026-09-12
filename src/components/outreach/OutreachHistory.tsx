import type { OutreachReceipt } from "@/lib/outreach-receipts";
import { Button } from "@/components/ui/button";
export function OutreachHistory({
  receipts,
  ready,
  loading,
  refresh,
  cancel,
  t,
  locale,
}: {
  receipts: OutreachReceipt[];
  ready: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  cancel: (receipt: OutreachReceipt) => Promise<void>;
  t: (key: string) => string;
  locale: string;
}) {
  return (
    <section className="mb-5 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{t("outreach.integrity.history")}</h2>
        <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
          {t("outreach.integrity.refresh")}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("outreach.integrity.help")}</p>
      <p className="mt-2 text-sm">
        {!ready
          ? t("outreach.integrity.unavailable")
          : receipts.length
            ? ""
            : t("outreach.integrity.empty")}
      </p>
      {ready && receipts.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer">
            {t("outreach.integrity.records")} ({receipts.length})
          </summary>
          <div className="mt-3 max-h-96 space-y-3 overflow-auto">
            {receipts.map((r) => (
              <div
                key={`${r.draft_id}-${r.step}`}
                className="rounded border border-border p-3 text-sm"
              >
                <p className="font-medium">
                  {r.recipient} · {t(`outreach.integrity.${r.state}`)}
                </p>
                <p>
                  {r.draft_id} ·{" "}
                  {r.step === "initial"
                    ? t("outreach.integrity.initial")
                    : `${t("outreach.integrity.followup")} ${r.step === "followup-0" ? 1 : 2}`}
                </p>
                <p>
                  {t("outreach.integrity.reservedAt")}:{" "}
                  {new Date(r.reserved_at).toLocaleString(locale)} ·{" "}
                  {t("outreach.integrity.updatedAt")}:{" "}
                  {new Date(r.updated_at).toLocaleString(locale)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {t("outreach.integrity.version")}: {r.version_hash}
                </p>
                {r.state === "reserved" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => void cancel(r)}
                  >
                    {t("outreach.integrity.cancel")}
                  </Button>
                ) : null}
                {r.provider_message_id ? (
                  <p className="break-all text-xs">
                    {t("outreach.integrity.receipt")}: {r.provider_message_id}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
