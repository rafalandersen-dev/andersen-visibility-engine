import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { Info, ShieldCheck, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/beta-notes")({
  head: () => ({
    meta: [
      { title: "Beta notes — Milo Growth" },
      { name: "description", content: "Current beta limitations and what to confirm before wider self-service launch." },
    ],
  }),
  component: BetaNotesPage,
});

const LIMITATION_KEYS = [
  "beta.limit.paddle",
  "beta.limit.wordpress",
  "beta.limit.shopify",
  "beta.limit.aiCandidate",
  "beta.limit.legal",
  "beta.limit.analytics",
  "beta.limit.gsc",
  "beta.limit.images",
];

const DEMO_SAFE_KEYS = ["beta.demo.rankings", "beta.demo.payments", "beta.demo.connectors", "beta.demo.data"];

function BetaNotesPage() {
  const t = useT();
  return (
    <AppShell title={t("beta.title")} description={t("beta.subtitle")}>
      <div className="rounded-lg border border-gold/40 bg-gold/5 px-5 py-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-gold mt-0.5 shrink-0" />
        <p className="text-sm text-foreground/85">{t("beta.intro")}</p>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-accent" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("beta.limitsTitle")}</span>
        </div>
        <ul className="divide-y divide-border">
          {LIMITATION_KEYS.map((k) => (
            <li key={k} className="px-5 py-3 text-sm text-foreground/85 flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">{t("beta.reassure")}</div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("beta.demoSafeTitle")}</span>
        </div>
        <ul className="divide-y divide-border">
          {DEMO_SAFE_KEYS.map((k) => (
            <li key={k} className="px-5 py-3 text-sm text-foreground/85 flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link to="/app/launch-checklist">
          <Button variant="outline">{t("beta.backToChecklist")}</Button>
        </Link>
        <a href="/demo-script" target="_blank" rel="noreferrer">
          <Button variant="ghost">{t("beta.openDemoScript")}</Button>
        </a>
      </div>
    </AppShell>
  );
}
