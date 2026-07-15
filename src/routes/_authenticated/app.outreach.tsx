import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OutreachDraftCard } from "@/components/outreach/OutreachDraftCard";
import { useT } from "@/i18n";
import { generateOutreachDraft } from "@/lib/mock-ai";
import { getOutreachDeliveryStatusFn } from "@/lib/outreach-delivery.functions";
import type { OutreachDeliveryStatus } from "@/lib/outreach-delivery.server";
import { buildOutreachTargets, normalizeOutreachDomain } from "@/lib/outreach";
import { useStore } from "@/lib/store";
import type { OutreachTargetSource } from "@/lib/types";
import { Loader2, MailPlus, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/outreach")({
  head: () => ({ meta: [{ title: "AI Outreach — Milo Growth" }] }),
  component: OutreachPage,
});

function OutreachPage() {
  const t = useT();
  const navigate = useNavigate();
  const activeProjectId = useStore((state) => state.activeProjectId);
  const project = useStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const analysis = useStore((state) => state.backlinkAnalyses.find((item) => item.projectId === state.activeProjectId));
  const orders = useStore((state) => (state.linkMarketplaceOrders ?? []).filter((item) => item.projectId === state.activeProjectId));
  const drafts = useStore((state) => (state.outreachDrafts ?? []).filter((item) => item.projectId === state.activeProjectId));
  const targets = useMemo(() => buildOutreachTargets(analysis, orders), [analysis, orders]);

  const [targetDomain, setTargetDomain] = useState("");
  const [source, setSource] = useState<OutreachTargetSource>("manual");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [reason, setReason] = useState("");
  const [suggestedAsset, setSuggestedAsset] = useState("");
  const [generating, setGenerating] = useState(false);
  const [delivery, setDelivery] = useState<OutreachDeliveryStatus>({
    provider: "resend",
    credentialsPresent: false,
    senderConfigured: false,
    replyToConfigured: false,
    sendingEnabled: false,
    ready: false,
    dailyLimit: 5,
  });

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const status = await getOutreachDeliveryStatusFn();
        if (!cancelled) setDelivery(status);
      } catch {
        // Fail closed: drafts still work, but live sending stays disabled.
      }
    }
    void loadStatus();
    return () => { cancelled = true; };
  }, []);

  if (!project) {
    return (
      <AppShell title={t("outreach.title")} description={t("outreach.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <MailPlus className="mx-auto h-8 w-8 text-gold/70" />
          <p className="mt-3 text-sm text-muted-foreground">{t("analytics.setupFirst")}</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>{t("nav.setup")}</Button>
        </div>
      </AppShell>
    );
  }

  function pickTarget(domain: string, targetSource: OutreachTargetSource, targetReason: string) {
    setTargetDomain(domain); setSource(targetSource); setReason(targetReason);
  }

  async function generate() {
    const domain = normalizeOutreachDomain(targetDomain);
    if (!domain) { toast.error(t("outreach.invalidDomain")); return; }
    setGenerating(true);
    try {
      await generateOutreachDraft(activeProjectId, { targetDomain: domain, source, contactName, contactEmail, reason, suggestedAsset });
      setTargetDomain(""); setContactName(""); setContactEmail(""); setReason(""); setSuggestedAsset(""); setSource("manual");
      toast.success(t("outreach.toast.generated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("outreach.toast.failed"));
    } finally { setGenerating(false); }
  }

  return (
    <AppShell title={t("outreach.title")} description={t("outreach.subtitle")}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="font-medium">{t("outreach.deliveryTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{delivery.ready ? t("outreach.deliveryReady", { count: delivery.dailyLimit }) : t("outreach.deliveryPending")}</p>
          </div>
        </div>
        <Badge variant={delivery.ready ? "secondary" : "outline"}>{delivery.ready ? t("outreach.sendingEnabled") : t("outreach.sendingLocked")}</Badge>
      </div>
      <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">{t("outreach.safetyTitle")}</strong>{" "}{t("outreach.safety")}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section>
          <h2 className="font-display text-lg">{t("outreach.drafts")} ({drafts.length})</h2>
          {drafts.length ? <div className="mt-3 space-y-4">{drafts.slice().reverse().map((draft) => <OutreachDraftCard key={draft.id} draft={draft} deliveryReady={delivery.ready} t={t} />)}</div> : <div className="mt-3 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("outreach.empty")}</div>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-lg">{t("outreach.newDraft")}</h2>
            {targets.length ? <div className="mt-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">{t("outreach.suggestedTargets")}</p><div className="mt-2 flex flex-wrap gap-2">{targets.slice(0, 8).map((target) => <Button key={target.domain} size="sm" variant="outline" onClick={() => pickTarget(target.domain, target.source, target.reason)}>{target.domain}</Button>)}</div></div> : null}
            <div className="mt-4 space-y-3">
              <Field label={t("outreach.domain")}><Input value={targetDomain} onChange={(event) => { setTargetDomain(event.target.value); setSource("manual"); }} placeholder="publisher.example" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("outreach.contactName")}><Input value={contactName} onChange={(event) => setContactName(event.target.value)} /></Field>
                <Field label={t("outreach.contactEmail")}><Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder={t("outreach.optional")} /></Field>
              </div>
              <Field label={t("outreach.reason")}><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("outreach.reasonPlaceholder")} rows={3} /></Field>
              <Field label={t("outreach.asset")}><Input value={suggestedAsset} onChange={(event) => setSuggestedAsset(event.target.value)} placeholder={t("outreach.assetPlaceholder")} /></Field>
              <Button className="w-full" onClick={generate} disabled={generating || !targetDomain.trim()}>{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? t("outreach.generating") : t("outreach.generate")}</Button>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
