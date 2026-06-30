import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, updateAuthorityOpportunity, removeAuthorityOpportunity } from "@/lib/store";
import { useT } from "@/i18n";
import {
  generateAuthorityOpportunities,
  convertAuthorityOpportunityToOpportunity,
  migrateLegacyAuthority,
} from "@/lib/mock-ai";
import type {
  AuthorityOpportunity,
  AuthorityOpportunityType,
  AuthorityStatus,
  AuthorityPriority,
} from "@/lib/types";
import { Award, Loader2, RefreshCw, Plus, Check, ExternalLink, Copy, Trash2, Rocket, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/authority")({
  head: () => ({
    meta: [
      { title: "Authority — Milo Growth" },
      { name: "description", content: "Find and track safe, relevant authority-building opportunities." },
    ],
  }),
  component: AuthorityPage,
});

const TYPES: AuthorityOpportunityType[] = [
  "localDirectory", "industryDirectory", "reviewProfile", "citationNap", "partnerLink",
  "supplierLink", "association", "localPr", "guestContribution", "resourcePage", "community", "trustSignal", "other",
];
const STATUSES: AuthorityStatus[] = ["suggested", "planned", "contacted", "submitted", "live", "rejected", "notRelevant"];
const PRIORITIES: AuthorityPriority[] = ["high", "medium", "low"];

function AuthorityPage() {
  const navigate = useNavigate();
  const t = useT();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const items = useStore((s) => s.authorityOpportunities.filter((a) => a.projectId === s.activeProjectId));

  const [generating, setGenerating] = useState(false);
  const [fStatus, setFStatus] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fPriority, setFPriority] = useState<string>("all");
  const [search, setSearch] = useState("");

  // One-time migration of legacy Authority v1 items into the v2 tracker.
  useEffect(() => {
    if (activeProjectId) migrateLegacyAuthority(activeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const summary = useMemo(() => ({
    total: items.length,
    live: items.filter((i) => i.status === "live").length,
    inProgress: items.filter((i) => ["planned", "contacted", "submitted"].includes(i.status)).length,
    high: items.filter((i) => i.priority === "high").length,
    partner: items.filter((i) => i.type === "partnerLink" || i.type === "supplierLink").length,
    review: items.filter((i) => i.type === "reviewProfile" || i.type === "citationNap").length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (fStatus !== "all" && i.status !== fStatus) return false;
      if (fType !== "all" && i.type !== fType) return false;
      if (fPriority !== "all" && i.priority !== fPriority) return false;
      if (q && !(`${i.title} ${i.description} ${i.type}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, fStatus, fType, fPriority, search]);

  const liveItems = useMemo(() => items.filter((i) => i.status === "live"), [items]);

  async function generate() {
    if (!activeProjectId) return;
    setGenerating(true);
    try {
      const fresh = await generateAuthorityOpportunities(activeProjectId);
      toast.success(t("authority.toast.generated", { count: fresh.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  if (!project) {
    return (
      <AppShell title={t("authority.title")} description={t("authority.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Award className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("analytics.setupFirst")}</div>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>{t("nav.setup")}</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("authority.title")}
      description={t("authority.subtitle")}
      actions={
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : items.length ? <RefreshCw className="h-4 w-4" /> : <Award className="h-4 w-4" />}
          {generating ? t("authority.generating") : items.length ? t("authority.regenerate") : t("authority.generate")}
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground max-w-3xl mb-5">{t("authority.disclaimer")}</p>

      {/* Section 1 — Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label={t("authority.summary.total")} value={summary.total} />
        <Stat label={t("authority.summary.live")} value={summary.live} />
        <Stat label={t("authority.summary.inProgress")} value={summary.inProgress} />
        <Stat label={t("authority.summary.highPriority")} value={summary.high} />
        <Stat label={t("authority.summary.partner")} value={summary.partner} />
        <Stat label={t("authority.summary.review")} value={summary.review} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("authority.safeNote")}</p>

      {items.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-12 text-center">
          <Award className="mx-auto h-8 w-8 text-gold/70" strokeWidth={1.4} />
          <div className="mt-3 font-display text-lg">{t("authority.generate")}</div>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg mx-auto">{t("authority.empty")}</p>
        </div>
      ) : (
        <>
          {/* Live authority signals */}
          {liveItems.length > 0 ? (
            <section className="mt-8 rounded-lg border-2 border-emerald-500/30 bg-card p-5">
              <h2 className="font-display text-lg">{t("authority.liveSignals")}</h2>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {liveItems.map((i) => (
                  <div key={i.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{i.title}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-600">{t(`authority.type.${i.type}`)}</span>
                    </div>
                    {i.relatedServiceOrOffer ? <div className="mt-0.5 text-xs text-muted-foreground">{i.relatedServiceOrOffer}</div> : null}
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      {i.liveLinkUrl ? <a href={i.liveLinkUrl} target="_blank" rel="noopener noreferrer" className="text-foreground/80 underline underline-offset-4 inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />{t("authority.viewLive")}</a> : null}
                      {i.liveAt ? <span className="text-muted-foreground">{i.liveAt.slice(0, 10)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("authority.liveNote")}</p>
            </section>
          ) : null}

          {/* Section — Tracker */}
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-display text-lg">{t("authority.tracker")}</h2>
              <div className="flex flex-wrap gap-2">
                <FilterSelect value={fStatus} onChange={setFStatus} allLabel={t("authority.filter.allStatuses")} options={STATUSES.map((s) => ({ value: s, label: t(`authority.status.${s}`) }))} />
                <FilterSelect value={fType} onChange={setFType} allLabel={t("authority.filter.allTypes")} options={TYPES.map((s) => ({ value: s, label: t(`authority.type.${s}`) }))} />
                <FilterSelect value={fPriority} onChange={setFPriority} allLabel={t("authority.filter.allPriorities")} options={PRIORITIES.map((s) => ({ value: s, label: t(`common.${s}`) }))} />
                <Input className="h-9 w-40" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("authority.search")} />
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("authority.none")}</p>
            ) : (
              <div className="space-y-3">
                {filtered.map((i) => <AuthorityCard key={i.id} item={i} projectId={activeProjectId} t={t} />)}
              </div>
            )}
          </section>

          <div className="pt-6">
            <Link to="/app/opportunities" className="text-sm text-foreground/70 underline underline-offset-4 hover:text-foreground">
              {t("nav.opportunities")} →
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}

function AuthorityCard({ item, projectId, t }: { item: AuthorityOpportunity; projectId: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const upd = (patch: Partial<AuthorityOpportunity>) => updateAuthorityOpportunity(item.id, patch);

  function changeStatus(next: AuthorityStatus) {
    const patch: Partial<AuthorityOpportunity> = { status: next };
    if (next === "live" && !item.liveAt) patch.liveAt = new Date().toISOString();
    upd(patch);
    toast.success(t("authority.toast.statusChanged"));
  }

  async function copyTemplate() {
    const text = item.outreachTemplate || item.outreachNote || "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success(t("authority.copied")); } catch { toast.error("Could not copy"); }
  }

  async function convert() {
    setConverting(true);
    try {
      await convertAuthorityOpportunityToOpportunity(projectId, item.id);
      toast.success(t("authority.toast.converted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create opportunity");
    } finally {
      setConverting(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground">{item.title}</h3>
            <Tag>{t(`authority.type.${item.type}`)}</Tag>
            <Tag tone={item.priority === "high" ? "gold" : "muted"}>{t(`common.${item.priority}`)}</Tag>
            {item.estimatedValue ? <Tag>{t("authority.value")}: {t(`common.${item.estimatedValue}`)}</Tag> : null}
            {item.difficulty ? <Tag>{t("authority.difficulty")}: {t(`authority.diff.${item.difficulty}`)}</Tag> : null}
          </div>
          {item.description ? <p className="mt-1.5 text-sm text-muted-foreground">{item.description}</p> : null}
          {item.nextStep ? <p className="mt-1.5 text-sm"><span className="text-muted-foreground">{t("authority.field.nextStep")}: </span>{item.nextStep}</p> : null}
        </div>
        <Select value={item.status} onValueChange={(v) => changeStatus(v as AuthorityStatus)}>
          <SelectTrigger className="h-8 w-36 text-xs shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`authority.status.${s}`)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /> {open ? t("authority.action.done") : t("authority.action.edit")}</Button>
        {item.outreachTemplate || item.outreachNote ? <Button size="sm" variant="ghost" onClick={copyTemplate}><Copy className="h-3.5 w-3.5" /> {t("authority.copyTemplate")}</Button> : null}
        {item.status !== "live" ? <Button size="sm" variant="ghost" onClick={() => changeStatus("live")}><Rocket className="h-3.5 w-3.5" /> {t("authority.action.markLive")}</Button> : null}
        {item.linkedOpportunityId ? (
          <Button size="sm" variant="ghost" disabled className="text-muted-foreground"><Check className="h-3.5 w-3.5" /> {t("authority.action.converted")}</Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={convert} disabled={converting}>{converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {t("authority.action.convert")}</Button>
        )}
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive ml-auto" onClick={() => { removeAuthorityOpportunity(item.id); toast.success(t("authority.toast.deleted")); }}><Trash2 className="h-3.5 w-3.5" /> {t("authority.action.delete")}</Button>
      </div>

      {open ? (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {item.relevanceReason ? <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">{t("authority.relevance")}: </span>{item.relevanceReason}</p> : null}
          {item.requirements?.length ? <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">{t("authority.requirements")}: </span>{item.requirements.join(", ")}</p> : null}
          {item.safetyNotes ? <p className="text-xs text-amber-600">{item.safetyNotes}</p> : null}

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t("authority.field.targetUrl")} value={item.targetUrl ?? ""} onChange={(v) => upd({ targetUrl: v })} placeholder="https://" />
            <Field label={t("authority.field.submissionUrl")} value={item.submissionUrl ?? ""} onChange={(v) => upd({ submissionUrl: v })} placeholder="https://" />
            <Field label={t("authority.field.contactName")} value={item.contactName ?? ""} onChange={(v) => upd({ contactName: v })} />
            <Field label={t("authority.field.contactEmail")} value={item.contactEmail ?? ""} onChange={(v) => upd({ contactEmail: v })} />
            <Field label={t("authority.field.contactPageUrl")} value={item.contactPageUrl ?? ""} onChange={(v) => upd({ contactPageUrl: v })} placeholder="https://" />
            <Field label={t("authority.field.liveLinkUrl")} value={item.liveLinkUrl ?? ""} onChange={(v) => upd({ liveLinkUrl: v })} placeholder="https://" />
            <Field label={t("authority.field.suggestedPageToLink")} value={item.suggestedPageToLink ?? ""} onChange={(v) => upd({ suggestedPageToLink: v })} />
            <Field label={t("authority.field.relatedServiceOrOffer")} value={item.relatedServiceOrOffer ?? ""} onChange={(v) => upd({ relatedServiceOrOffer: v })} />
            <Field label={t("authority.field.anchor")} value={item.anchorOrListingText ?? ""} onChange={(v) => upd({ anchorOrListingText: v })} />
            <Field label={t("authority.field.nextStep")} value={item.nextStep ?? ""} onChange={(v) => upd({ nextStep: v })} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("authority.outreachTemplate")}</label>
            <Textarea className="mt-1.5 text-sm" rows={4} value={item.outreachTemplate ?? ""} onChange={(e) => upd({ outreachTemplate: e.target.value })} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input className="mt-1.5 h-9 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function FilterSelect({ value, onChange, allLabel, options }: { value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-display text-3xl text-foreground">{value}</div>
    </div>
  );
}

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "gold" | "muted" }) {
  const cls =
    tone === "gold" ? "bg-accent/30 border-accent/40 text-accent-foreground"
      : tone === "muted" ? "bg-muted text-muted-foreground border-border"
      : "bg-secondary border-border text-secondary-foreground";
  return <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}
