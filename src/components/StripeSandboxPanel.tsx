import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  getStripeSandboxStatusFn,
  createStripeSandboxCheckoutFn,
} from "@/lib/stripe-sandbox.functions";

/** Rendered only in the owner's billing view; server role checks remain authoritative. */
export function StripeSandboxPanel() {
  const t = useT();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getStripeSandboxStatusFn()
      .then((result) => {
        if (!cancelled) setAvailable(result.available);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!available) return null;
  async function start() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await createStripeSandboxCheckoutFn({
        data: { requestId: requestId.current },
      });
      if (result.ok) window.location.assign(result.checkoutUrl);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mb-6 rounded-xl border border-border bg-card p-5"
      aria-label={t("billing.stripeTest.title")}
    >
      <h2 className="font-display text-lg">{t("billing.stripeTest.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("billing.stripeTest.description")}</p>
      <Button type="button" variant="outline" className="mt-4" disabled={busy} onClick={start}>
        {busy ? t("billing.stripeTest.opening") : t("billing.stripeTest.open")}
      </Button>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t("billing.stripeTest.error")}
        </p>
      ) : null}
    </section>
  );
}
