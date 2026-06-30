import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, updateProject, saveWorkspaceNow } from "@/lib/store";
import { useT } from "@/i18n";
import type {
  Project,
  BrandIntelligence,
  BrandOffer,
  BrandInternalLink,
  BrandMarketLanguageRule,
} from "@/lib/types";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

const OFFER_TYPES: BrandOffer["type"][] = ["service", "product", "package", "membership", "other"];
const LINK_TYPES: BrandInternalLink["type"][] = ["service", "product", "article", "booking", "contact", "other"];
const PRIORITIES: BrandOffer["priority"][] = ["high", "medium", "low"];

// ---- list <-> string helpers (forgiving: comma or newline separated) ----
const toArr = (s: string): string[] =>
  s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const fromArr = (a: string[] | undefined): string => (a ?? []).join("\n");

type Form = {
  tone: string;
  styleNotes: string;
  wordsToUse: string;
  wordsToAvoid: string;
  allowedClaims: string;
  forbiddenClaims: string;
  requiredCaveats: string;
  primaryOffers: BrandOffer[];
  secondaryOffers: BrandOffer[];
  proofPoints: string;
  credentials: string;
  testimonialsNotes: string;
  trustSignals: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  ctaStyleNotes: string;
  internalLinks: BrandInternalLink[];
  marketLanguageRules: BrandMarketLanguageRule[];
  avoid: string;
};

function toForm(b: BrandIntelligence | undefined): Form {
  return {
    tone: b?.voice?.tone ?? "",
    styleNotes: b?.voice?.styleNotes ?? "",
    wordsToUse: fromArr(b?.voice?.wordsToUse),
    wordsToAvoid: fromArr(b?.voice?.wordsToAvoid),
    allowedClaims: fromArr(b?.claims?.allowedClaims),
    forbiddenClaims: fromArr(b?.claims?.forbiddenClaims),
    requiredCaveats: fromArr(b?.claims?.requiredCaveats),
    primaryOffers: b?.offers?.primaryOffers ?? [],
    secondaryOffers: b?.offers?.secondaryOffers ?? [],
    proofPoints: fromArr(b?.proof?.proofPoints),
    credentials: fromArr(b?.proof?.credentials),
    testimonialsNotes: b?.proof?.testimonialsNotes ?? "",
    trustSignals: fromArr(b?.proof?.trustSignals),
    primaryCtaLabel: b?.ctas?.primaryCtaLabel ?? "",
    primaryCtaUrl: b?.ctas?.primaryCtaUrl ?? "",
    secondaryCtaLabel: b?.ctas?.secondaryCtaLabel ?? "",
    secondaryCtaUrl: b?.ctas?.secondaryCtaUrl ?? "",
    ctaStyleNotes: b?.ctas?.ctaStyleNotes ?? "",
    internalLinks: b?.internalLinks ?? [],
    marketLanguageRules: b?.marketLanguageRules ?? [],
    avoid: fromArr(b?.avoid),
  };
}

function buildBrand(f: Form): BrandIntelligence {
  const cleanOffer = (o: BrandOffer): BrandOffer => ({
    name: o.name.trim(),
    type: o.type,
    priority: o.priority,
    description: o.description?.trim() || undefined,
    url: o.url?.trim() || undefined,
    targetAudience: o.targetAudience?.trim() || undefined,
    notes: o.notes?.trim() || undefined,
  });
  return {
    voice: {
      tone: f.tone.trim() || undefined,
      styleNotes: f.styleNotes.trim() || undefined,
      wordsToUse: toArr(f.wordsToUse),
      wordsToAvoid: toArr(f.wordsToAvoid),
    },
    claims: {
      allowedClaims: toArr(f.allowedClaims),
      forbiddenClaims: toArr(f.forbiddenClaims),
      requiredCaveats: toArr(f.requiredCaveats),
    },
    offers: {
      primaryOffers: f.primaryOffers.filter((o) => o.name.trim()).map(cleanOffer),
      secondaryOffers: f.secondaryOffers.filter((o) => o.name.trim()).map(cleanOffer),
    },
    proof: {
      proofPoints: toArr(f.proofPoints),
      credentials: toArr(f.credentials),
      testimonialsNotes: f.testimonialsNotes.trim() || undefined,
      trustSignals: toArr(f.trustSignals),
    },
    ctas: {
      primaryCtaLabel: f.primaryCtaLabel.trim() || undefined,
      primaryCtaUrl: f.primaryCtaUrl.trim() || undefined,
      secondaryCtaLabel: f.secondaryCtaLabel.trim() || undefined,
      secondaryCtaUrl: f.secondaryCtaUrl.trim() || undefined,
      ctaStyleNotes: f.ctaStyleNotes.trim() || undefined,
    },
    internalLinks: f.internalLinks.filter((l) => l.label.trim() || l.url.trim()),
    marketLanguageRules: f.marketLanguageRules.filter((r) => (r.notes ?? "").trim()),
    avoid: toArr(f.avoid),
    updatedAt: new Date().toISOString(),
  };
}

export function BrandIntelligenceCard({ project }: { project: Project }) {
  const t = useT();
  const services = useStore((s) => s.services.filter((x) => x.projectId === project.id));
  const [f, setF] = useState<Form>(() => toForm(project.brandIntelligence));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  function importFromServices() {
    const existing = new Set(f.primaryOffers.map((o) => o.name.trim().toLowerCase()));
    const imported: BrandOffer[] = services
      .filter((s) => !existing.has(s.name.trim().toLowerCase()))
      .map((s) => ({
        name: s.name,
        type: s.kind === "Product" ? "product" : "service",
        priority: s.priority === "High" ? "high" : s.priority === "Low" ? "low" : "medium",
        description: s.description || undefined,
        targetAudience: s.targetAudience || undefined,
      }));
    if (!imported.length) {
      toast.message(t("brand.offers.nothingToImport"));
      return;
    }
    setF((p) => ({ ...p, primaryOffers: [...p.primaryOffers, ...imported] }));
    toast.success(t("brand.offers.imported", { count: imported.length }));
  }

  async function save() {
    setSaving(true);
    try {
      updateProject(project.id, { brandIntelligence: buildBrand(f) });
      await saveWorkspaceNow();
      toast.success(t("brand.toast.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{t("brand.title")}</div>
      <div className="my-4 gold-rule" />
      <p className="text-sm text-muted-foreground max-w-2xl">{t("brand.intro")}</p>

      {/* 1. Brand voice */}
      <Group title={t("brand.section.voice")} help={t("brand.voice.help")}>
        <TextField label={t("brand.voice.tone")} value={f.tone} onChange={(v) => set("tone", v)} />
        <TextField label={t("brand.voice.styleNotes")} value={f.styleNotes} onChange={(v) => set("styleNotes", v)} />
        <ListField label={t("brand.voice.wordsToUse")} value={f.wordsToUse} onChange={(v) => set("wordsToUse", v)} hint={t("brand.listHint")} />
        <ListField label={t("brand.voice.wordsToAvoid")} value={f.wordsToAvoid} onChange={(v) => set("wordsToAvoid", v)} hint={t("brand.listHint")} />
      </Group>

      {/* 2. Claims & safety */}
      <Group title={t("brand.section.claims")} help={t("brand.claims.help")}>
        <ListField label={t("brand.claims.allowed")} value={f.allowedClaims} onChange={(v) => set("allowedClaims", v)} hint={t("brand.listHint")} />
        <ListField label={t("brand.claims.forbidden")} value={f.forbiddenClaims} onChange={(v) => set("forbiddenClaims", v)} hint={t("brand.listHint")} />
        <ListField label={t("brand.claims.caveats")} value={f.requiredCaveats} onChange={(v) => set("requiredCaveats", v)} hint={t("brand.listHint")} />
      </Group>

      {/* 3. Offers */}
      <Group
        title={t("brand.section.offers")}
        action={
          <div className="flex gap-2">
            {services.length ? (
              <Button size="sm" variant="outline" onClick={importFromServices}>{t("brand.offers.import")}</Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => set("primaryOffers", [...f.primaryOffers, { name: "", type: "service", priority: "medium" }])}>
              <Plus className="h-3.5 w-3.5" /> {t("brand.offers.add")}
            </Button>
          </div>
        }
      >
        <div className="md:col-span-2 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">{t("brand.offers.primary")}</div>
          <OfferList offers={f.primaryOffers} onChange={(o) => set("primaryOffers", o)} t={t} />
          <div className="text-xs font-medium text-muted-foreground pt-2">{t("brand.offers.secondary")}</div>
          <OfferList offers={f.secondaryOffers} onChange={(o) => set("secondaryOffers", o)} t={t} addLabel={t("brand.offers.add")} />
        </div>
      </Group>

      {/* 4. Proof & trust */}
      <Group title={t("brand.section.proof")}>
        <ListField label={t("brand.proof.points")} value={f.proofPoints} onChange={(v) => set("proofPoints", v)} hint={t("brand.listHint")} />
        <ListField label={t("brand.proof.credentials")} value={f.credentials} onChange={(v) => set("credentials", v)} hint={t("brand.listHint")} />
        <ListField label={t("brand.proof.trustSignals")} value={f.trustSignals} onChange={(v) => set("trustSignals", v)} hint={t("brand.listHint")} />
        <TextField label={t("brand.proof.testimonials")} value={f.testimonialsNotes} onChange={(v) => set("testimonialsNotes", v)} />
      </Group>

      {/* 5. CTA preferences */}
      <Group title={t("brand.section.cta")}>
        <TextField label={t("brand.cta.primaryLabel")} value={f.primaryCtaLabel} onChange={(v) => set("primaryCtaLabel", v)} />
        <TextField label={t("brand.cta.primaryUrl")} value={f.primaryCtaUrl} onChange={(v) => set("primaryCtaUrl", v)} placeholder="/book" />
        <TextField label={t("brand.cta.secondaryLabel")} value={f.secondaryCtaLabel} onChange={(v) => set("secondaryCtaLabel", v)} />
        <TextField label={t("brand.cta.secondaryUrl")} value={f.secondaryCtaUrl} onChange={(v) => set("secondaryCtaUrl", v)} placeholder="/services" />
        <TextField label={t("brand.cta.styleNotes")} value={f.ctaStyleNotes} onChange={(v) => set("ctaStyleNotes", v)} full />
      </Group>

      {/* 6. Internal links */}
      <Group
        title={t("brand.section.links")}
        action={
          <Button size="sm" variant="outline" onClick={() => set("internalLinks", [...f.internalLinks, { label: "", url: "", type: "service", priority: "medium" }])}>
            <Plus className="h-3.5 w-3.5" /> {t("brand.links.add")}
          </Button>
        }
      >
        <div className="md:col-span-2 space-y-2">
          {f.internalLinks.length === 0 ? <p className="text-sm text-muted-foreground">{t("brand.links.empty")}</p> : null}
          {f.internalLinks.map((l, i) => (
            <div key={i} className="rounded-md border border-border p-2 grid sm:grid-cols-[1fr,1fr,140px,120px,auto] gap-2 items-center">
              <Input placeholder={t("brand.field.label")} value={l.label} onChange={(e) => set("internalLinks", f.internalLinks.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <Input placeholder="/services/..." value={l.url} onChange={(e) => set("internalLinks", f.internalLinks.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
              <Select value={l.type} onValueChange={(v) => set("internalLinks", f.internalLinks.map((x, j) => j === i ? { ...x, type: v as BrandInternalLink["type"] } : x))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{LINK_TYPES.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={l.priority} onValueChange={(v) => set("internalLinks", f.internalLinks.map((x, j) => j === i ? { ...x, priority: v as BrandInternalLink["priority"] } : x))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((pr) => <SelectItem key={pr} value={pr}>{t(`common.${pr}`)}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => set("internalLinks", f.internalLinks.filter((_, j) => j !== i))} aria-label={t("brand.remove")}><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </Group>

      {/* 7. Market/language rules */}
      <Group
        title={t("brand.section.rules")}
        action={
          <Button size="sm" variant="outline" onClick={() => set("marketLanguageRules", [...f.marketLanguageRules, { market: "", language: "", notes: "" }])}>
            <Plus className="h-3.5 w-3.5" /> {t("brand.rules.add")}
          </Button>
        }
      >
        <div className="md:col-span-2 space-y-2">
          {f.marketLanguageRules.length === 0 ? <p className="text-sm text-muted-foreground">{t("brand.rules.empty")}</p> : null}
          {f.marketLanguageRules.map((r, i) => (
            <div key={i} className="rounded-md border border-border p-2 grid sm:grid-cols-[120px,120px,1fr,auto] gap-2 items-center">
              <Input placeholder={t("brand.rules.market")} value={r.market ?? ""} onChange={(e) => set("marketLanguageRules", f.marketLanguageRules.map((x, j) => j === i ? { ...x, market: e.target.value } : x))} />
              <Input placeholder={t("brand.rules.language")} value={r.language ?? ""} onChange={(e) => set("marketLanguageRules", f.marketLanguageRules.map((x, j) => j === i ? { ...x, language: e.target.value } : x))} />
              <Input placeholder={t("brand.field.notes")} value={r.notes ?? ""} onChange={(e) => set("marketLanguageRules", f.marketLanguageRules.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} />
              <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => set("marketLanguageRules", f.marketLanguageRules.filter((_, j) => j !== i))} aria-label={t("brand.remove")}><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </Group>

      {/* 8. Things to avoid */}
      <Group title={t("brand.section.avoid")} help={t("brand.avoid.help")}>
        <ListField label={t("brand.section.avoid")} value={f.avoid} onChange={(v) => set("avoid", v)} hint={t("brand.listHint")} full />
      </Group>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? t("brand.saving") : t("brand.save")}</Button>
      </div>
    </section>
  );
}

function OfferList({
  offers,
  onChange,
  t,
  addLabel,
}: {
  offers: BrandOffer[];
  onChange: (o: BrandOffer[]) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
  addLabel?: string;
}) {
  const upd = (i: number, patch: Partial<BrandOffer>) => onChange(offers.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-2">
      {offers.map((o, i) => (
        <div key={i} className="rounded-md border border-border p-3 space-y-2">
          <div className="flex gap-2">
            <Input className="flex-1" placeholder={t("brand.field.name")} value={o.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <Select value={o.type} onValueChange={(v) => upd(i, { type: v as BrandOffer["type"] })}>
              <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{OFFER_TYPES.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={o.priority} onValueChange={(v) => upd(i, { priority: v as BrandOffer["priority"] })}>
              <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((pr) => <SelectItem key={pr} value={pr}>{t(`common.${pr}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => onChange(offers.filter((_, j) => j !== i))} aria-label={t("brand.remove")}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Input className="text-xs" placeholder={t("brand.field.url")} value={o.url ?? ""} onChange={(e) => upd(i, { url: e.target.value })} />
            <Input className="text-xs" placeholder={t("brand.field.audience")} value={o.targetAudience ?? ""} onChange={(e) => upd(i, { targetAudience: e.target.value })} />
          </div>
          <Input className="text-xs" placeholder={t("brand.field.description")} value={o.description ?? ""} onChange={(e) => upd(i, { description: e.target.value })} />
        </div>
      ))}
      {addLabel ? (
        <Button size="sm" variant="ghost" onClick={() => onChange([...offers, { name: "", type: "service", priority: "medium" }])}>
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

function Group({ title, help, action, children }: { title: string; help?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-foreground">{title}</h3>
        {action}
      </div>
      {help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null}
      <div className="mt-3 grid md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, full }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ListField({ label, value, onChange, hint, full }: { label: string; value: string; onChange: (v: string) => void; hint?: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Textarea className="mt-1.5" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
