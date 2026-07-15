import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { generateOutreachDraft } from "@/lib/mock-ai";
import { buildOutreachTargets, normalizeOutreachDomain } from "@/lib/outreach";
import { updateOutreachDraft, useStore } from "@/lib/store";
import type { OutreachDraft, OutreachStatus, OutreachTargetSource } from "@/lib/types";
import { Check, Copy, Loader2, MailPlus, Pause, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/outreach")({
  head: () => ({ meta: [{ title: "AI Outreach — Milo Growth" }] }),
  component: OutreachPage,
});

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function OutreachPage() {
  const t = useT();
  const navigate = useNavigate();
  const activeProjectId = useStore((state) => state.activeProjectId);
  const project = useStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const analysis = useStore((state) => state.backlinkAnalyses.find((item) => item.projectId === state.activeProjectId));
  const orders = useStore((state) => state.linkMarketplaceOrders.filter((item) => item.projectId === state.activeProjectId));
  const drafts = useStore((state) => state.outreachDrafts.filter((item) => item.projectId === state.activeProjectId));
  const targets = useMemo(() => buildOutreachTargets(analysis, orders), [analysis, orders]);

  const [targetDomain, setTargetDomain] = useState("");
  const [source, setSource] = useState<OutreachTargetSource>("manual");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [reason, setReason] = useState("");
  const [suggestedAsset, setSuggestedAsset] = useState("");
  const [generating, setGenerating] = useState(false);

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
      <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">{t("outreach.safetyTitle")}</strong>{" "}{t("outreach.safety")}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section>
          <h2 className="font-display text-lg">{t("outreach.drafts")} ({drafts.length})</h2>
          {drafts.length ? <div className="mt-3 space-y-4">{drafts.slice().reverse().map((draft) => <DraftCard key={draft.id} draft={draft} t={t} />)}</div> : <div className="mt-3 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("outreach.empty")}</div>}
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

function DraftCard({ draft, t }: { draft: OutreachDraft; t: Translate }) {
  function setStatus(status: OutreachStatus) {
    updateOutreachDraft(draft.id, { status });
    toast.success(t("outreach.toast.status", { status: t(`outreach.status.${status}`) }));
  }
  async function copy() {
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
    toast.success(t("outreach.toast.copied"));
  }
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{draft.targetDomain}</h3><Badge variant="outline">{t(`outreach.status.${draft.status}`)}</Badge><Badge variant="secondary">{t(`outreach.source.${draft.source}`)}</Badge></div>{draft.contactEmail ? <p className="mt-1 text-xs text-muted-foreground">{draft.contactName ? `${draft.contactName} · ` : ""}{draft.contactEmail}</p> : null}</div>
        <Button size="sm" variant="ghost" onClick={copy}><Copy className="h-3.5 w-3.5" />{t("common.copy")}</Button>
      </div>
      <div className="mt-4 rounded-md border border-border bg-background/50 p-4"><p className="text-sm font-medium">{draft.subject}</p><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p></div>
      {draft.followUps.length ? <details className="mt-3"><summary className="cursor-pointer text-sm text-muted-foreground">{t("outreach.followUps")} ({draft.followUps.length})</summary><div className="mt-2 space-y-2">{draft.followUps.map((followUp) => <div key={`${followUp.delayDays}-${followUp.subject}`} className="rounded-md border border-border p-3 text-sm"><p className="font-medium">{t("outreach.afterDays", { count: followUp.delayDays })}: {followUp.subject}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{followUp.body}</p></div>)}</div></details> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {draft.status === "Draft" ? <Button size="sm" variant="outline" onClick={() => setStatus("Approved")}><Check className="h-3.5 w-3.5" />{t("outreach.approve")}</Button> : null}
        {draft.status === "Approved" || draft.status === "Queued" ? <Button size="sm" variant="outline" onClick={() => setStatus("Sent")}><Send className="h-3.5 w-3.5" />{t("outreach.markSent")}</Button> : null}
        {draft.status !== "Paused" && draft.status !== "Sent" && draft.status !== "Replied" ? <Button size="sm" variant="ghost" onClick={() => setStatus("Paused")}><Pause className="h-3.5 w-3.5" />{t("outreach.pause")}</Button> : null}
      </div>
    </article>
  );
}
