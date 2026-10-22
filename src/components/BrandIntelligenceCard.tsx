import {
  OWNER_FIELD_LABEL_KEYS,
  ownerBrandBaseline,
  saveOwnerBrandForm,
  toBrandForm,
  type BrandForm,
} from "./brand-intelligence-form";
import type { OwnerBrandField } from "@/lib/brand-owner-edits";
import { useEffect, useRef, useState } from "react";
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
import { useStore } from "@/lib/store";
import { storeBrandSaveDeps } from "./brand-intelligence-store-deps";
import { useT } from "@/i18n";
import type { Project, BrandOffer, BrandInternalLink } from "@/lib/types";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ProjectKnowledgePanel } from "./ProjectKnowledgePanel";
import { useAuth } from "@/lib/auth";

const OFFER_TYPES: BrandOffer["type"][] = ["service", "product", "package", "membership", "other"];
const LINK_TYPES: BrandInternalLink["type"][] = [
  "service",
  "product",
  "article",
  "booking",
  "contact",
  "other",
];
const PRIORITIES: BrandOffer["priority"][] = ["high", "medium", "low"];

type Form = BrandForm;
const toForm = toBrandForm;

export function BrandIntelligenceCard({ project }: { project: Project }) {
  const { user } = useAuth();
  return <BrandIntelligenceEditor key={`${user?.id}:${project.id}`} project={project} />;
}

function BrandIntelligenceEditor({ project }: { project: Project }) {
  const t = useT();
  const { user } = useAuth();
  const services = useStore((s) => s.services.filter((x) => x.projectId === project.id));
  const [f, setF] = useState<Form>(() => toForm(project.brandIntelligence));
  const [saving, setSaving] = useState(false);
  // The confirmed baseline: a value from this session's unconfirmed earlier attempt is
  // shown in the form as an edit to retry, not adopted as already saved.
  const [baseline, setBaseline] = useState(() =>
    ownerBrandBaseline(project.id, project.brandIntelligence, storeBrandSaveDeps.sessionKey()),
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  // Success is shown only after the requested values are confirmed in the saved
  // workspace. Every failure keeps the entered form; the form is locked while saving.
  async function save() {
    if (saving) return;
    setSaving(true);
    const submitted = f;
    // A result arriving after this editor closed (project switch, remount) names its
    // project, so it is not read as being about the project now on screen.
    const toastText = (text: string) => (mounted.current ? text : `${project.name}: ${text}`);
    try {
      const result = await saveOwnerBrandForm(project.id, submitted, baseline, storeBrandSaveDeps);
      switch (result.status) {
        case "saved":
          setBaseline(result.brand);
          setF((prev) => (prev === submitted ? toForm(result.brand) : prev));
          toast.success(toastText(t("brand.toast.saved")));
          break;
        case "noop":
          toast.message(toastText(t("brand.toast.noChanges")));
          break;
        case "conflict":
          toast.error(toastText(t("knowledge.ui.projectChanged")));
          break;
        case "invalid": {
          const { code, field, index } = result.error;
          const label = t(OWNER_FIELD_LABEL_KEYS[field as OwnerBrandField] ?? "brand.title");
          const row = index === undefined ? "" : ` (${t("brand.error.row", { row: index + 1 })})`;
          const reason = ["required", "tooLong", "invalidUrl", "limit"].includes(code)
            ? `brand.error.${code}`
            : "brand.error.unsupported";
          toast.error(toastText(`${label}${row}: ${t(reason)}`));
          break;
        }
        case "unavailable":
          toast.error(toastText(t("shell.producer.notReady")));
          break;
        case "failed":
          // The entered values stay in the form; the attempt is remembered for retry/revert.
          toast.error(toastText(t("shell.signOutDialog.title")));
          break;
      }
    } catch {
      toast.error(toastText(t("onboarding.toast.saveError")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {t("brand.title")}
      </div>
      <div className="my-4 gold-rule" />
      <p className="text-sm text-muted-foreground max-w-2xl">{t("brand.intro")}</p>

      {/* Locked while a save is pending so its completion cannot overwrite newer typing. */}
      <fieldset disabled={saving} aria-busy={saving} className="m-0 min-w-0 border-0 p-0">
        {/* 1. Brand voice */}
        <Group title={t("brand.section.voice")} help={t("brand.voice.help")}>
          <TextField
            label={t("brand.voice.tone")}
            value={f.tone}
            onChange={(v) => set("tone", v)}
          />
          <TextField
            label={t("brand.voice.styleNotes")}
            value={f.styleNotes}
            onChange={(v) => set("styleNotes", v)}
          />
          <ListField
            label={t("brand.voice.wordsToUse")}
            value={f.wordsToUse}
            onChange={(v) => set("wordsToUse", v)}
            hint={t("brand.listHint")}
          />
          <ListField
            label={t("brand.voice.wordsToAvoid")}
            value={f.wordsToAvoid}
            onChange={(v) => set("wordsToAvoid", v)}
            hint={t("brand.listHint")}
          />
        </Group>

        {/* 2. Claims & safety */}
        <Group title={t("brand.section.claims")} help={t("brand.claims.help")}>
          <ListField
            label={t("brand.claims.allowed")}
            value={f.allowedClaims}
            onChange={(v) => set("allowedClaims", v)}
            hint={t("brand.listHint")}
          />
          <ListField
            label={t("brand.claims.forbidden")}
            value={f.forbiddenClaims}
            onChange={(v) => set("forbiddenClaims", v)}
            hint={t("brand.listHint")}
          />
          <ListField
            label={t("brand.claims.caveats")}
            value={f.requiredCaveats}
            onChange={(v) => set("requiredCaveats", v)}
            hint={t("brand.listHint")}
          />
        </Group>

        {/* 3. Offers */}
        <Group
          title={t("brand.section.offers")}
          action={
            <div className="flex flex-wrap gap-2">
              {services.length ? (
                <Button size="sm" variant="outline" onClick={importFromServices}>
                  {t("brand.offers.import")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  set("primaryOffers", [
                    ...f.primaryOffers,
                    { name: "", type: "service", priority: "medium" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> {t("brand.offers.add")}
              </Button>
            </div>
          }
        >
          <div className="md:col-span-2 min-w-0 space-y-3">
            <div className="text-xs font-medium text-muted-foreground">
              {t("brand.offers.primary")}
            </div>
            <OfferList offers={f.primaryOffers} onChange={(o) => set("primaryOffers", o)} t={t} />
            <div className="text-xs font-medium text-muted-foreground pt-2">
              {t("brand.offers.secondary")}
            </div>
            <OfferList
              offers={f.secondaryOffers}
              onChange={(o) => set("secondaryOffers", o)}
              t={t}
              addLabel={t("brand.offers.add")}
            />
          </div>
        </Group>

        {/* 4. Proof & trust */}
        <Group title={t("brand.section.proof")}>
          <ListField
            label={t("brand.proof.points")}
            value={f.proofPoints}
            onChange={(v) => set("proofPoints", v)}
            hint={t("brand.listHint")}
          />
          <ListField
            label={t("brand.proof.credentials")}
            value={f.credentials}
            onChange={(v) => set("credentials", v)}
            hint={t("brand.listHint")}
          />
          <ListField
            label={t("brand.proof.trustSignals")}
            value={f.trustSignals}
            onChange={(v) => set("trustSignals", v)}
            hint={t("brand.listHint")}
          />
          <TextField
            label={t("brand.proof.testimonials")}
            value={f.testimonialsNotes}
            onChange={(v) => set("testimonialsNotes", v)}
          />
        </Group>

        {/* 5. CTA preferences */}
        <Group title={t("brand.section.cta")}>
          <TextField
            label={t("brand.cta.primaryLabel")}
            value={f.primaryCtaLabel}
            onChange={(v) => set("primaryCtaLabel", v)}
          />
          <TextField
            label={t("brand.cta.primaryUrl")}
            value={f.primaryCtaUrl}
            onChange={(v) => set("primaryCtaUrl", v)}
            placeholder="/book"
          />
          <TextField
            label={t("brand.cta.secondaryLabel")}
            value={f.secondaryCtaLabel}
            onChange={(v) => set("secondaryCtaLabel", v)}
          />
          <TextField
            label={t("brand.cta.secondaryUrl")}
            value={f.secondaryCtaUrl}
            onChange={(v) => set("secondaryCtaUrl", v)}
            placeholder="/pricing"
          />
          <TextField
            label={t("brand.cta.styleNotes")}
            value={f.ctaStyleNotes}
            onChange={(v) => set("ctaStyleNotes", v)}
            full
          />
        </Group>

        {/* 6. Internal links */}
        <Group
          title={t("brand.section.links")}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("internalLinks", [
                  ...f.internalLinks,
                  { label: "", url: "", type: "service", priority: "medium" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> {t("brand.links.add")}
            </Button>
          }
        >
          <div className="md:col-span-2 space-y-2">
            {f.internalLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("brand.links.empty")}</p>
            ) : null}
            {f.internalLinks.map((l, i) => (
              <div
                key={i}
                className="rounded-md border border-border p-2 grid sm:grid-cols-[1fr,1fr,140px,120px,auto] gap-2 items-center"
              >
                <Input
                  placeholder={t("brand.field.label")}
                  value={l.label ?? ""}
                  onChange={(e) =>
                    set(
                      "internalLinks",
                      f.internalLinks.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="/your-page-path"
                  value={l.url ?? ""}
                  onChange={(e) =>
                    set(
                      "internalLinks",
                      f.internalLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    )
                  }
                />
                <Select
                  value={l.type}
                  onValueChange={(v) =>
                    set(
                      "internalLinks",
                      f.internalLinks.map((x, j) =>
                        j === i ? { ...x, type: v as BrandInternalLink["type"] } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_TYPES.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {tp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={l.priority}
                  onValueChange={(v) =>
                    set(
                      "internalLinks",
                      f.internalLinks.map((x, j) =>
                        j === i ? { ...x, priority: v as BrandInternalLink["priority"] } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        {t(`common.${pr}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    set(
                      "internalLinks",
                      f.internalLinks.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={t("brand.remove")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Group>

        {/* 7. Market/language rules */}
        <Group
          title={t("brand.section.rules")}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("marketLanguageRules", [
                  ...f.marketLanguageRules,
                  { market: "", language: "", notes: "" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> {t("brand.rules.add")}
            </Button>
          }
        >
          <div className="md:col-span-2 space-y-2">
            {f.marketLanguageRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("brand.rules.empty")}</p>
            ) : null}
            {f.marketLanguageRules.map((r, i) => (
              <div
                key={i}
                className="rounded-md border border-border p-2 grid sm:grid-cols-[120px,120px,1fr,auto] gap-2 items-center"
              >
                <Input
                  placeholder={t("brand.rules.market")}
                  value={r.market ?? ""}
                  onChange={(e) =>
                    set(
                      "marketLanguageRules",
                      f.marketLanguageRules.map((x, j) =>
                        j === i ? { ...x, market: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  placeholder={t("brand.rules.language")}
                  value={r.language ?? ""}
                  onChange={(e) =>
                    set(
                      "marketLanguageRules",
                      f.marketLanguageRules.map((x, j) =>
                        j === i ? { ...x, language: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  placeholder={t("brand.field.notes")}
                  value={r.notes ?? ""}
                  onChange={(e) =>
                    set(
                      "marketLanguageRules",
                      f.marketLanguageRules.map((x, j) =>
                        j === i ? { ...x, notes: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    set(
                      "marketLanguageRules",
                      f.marketLanguageRules.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={t("brand.remove")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Group>

        {/* 8. Things to avoid */}
        <Group title={t("brand.section.avoid")} help={t("brand.avoid.help")}>
          <ListField
            label={t("brand.section.avoid")}
            value={f.avoid}
            onChange={(v) => set("avoid", v)}
            hint={t("brand.listHint")}
            full
          />
        </Group>
      </fieldset>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? t("brand.saving") : t("brand.save")}
        </Button>
      </div>
      {user && (
        <ProjectKnowledgePanel
          key={`${user.id}:${project.id}`}
          ownerId={user.id}
          projectId={project.id}
          initialWebsiteUrl={project.websiteUrl}
        />
      )}
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
  const upd = (i: number, patch: Partial<BrandOffer>) =>
    onChange(offers.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-2">
      {offers.map((o, i) => (
        <div key={i} className="min-w-0 rounded-md border border-border p-3 space-y-2">
          {/* Phone widths: a 3-column grid — name spans the first two columns beside Remove, the type and
              priority selects share the second row — so nothing is narrower than its content and the row never
              widens the page. From `sm` up it is the original single flex line. DOM (and Tab) order is unchanged:
              name → type → priority → remove. */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center">
            <Input
              className="col-span-2 row-start-1 min-w-0 sm:flex-1"
              placeholder={t("brand.field.name")}
              value={o.name}
              onChange={(e) => upd(i, { name: e.target.value })}
            />
            <Select value={o.type} onValueChange={(v) => upd(i, { type: v as BrandOffer["type"] })}>
              <SelectTrigger className="col-start-1 row-start-2 h-9 w-full min-w-0 text-xs sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFER_TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {tp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={o.priority}
              onValueChange={(v) => upd(i, { priority: v as BrandOffer["priority"] })}
            >
              <SelectTrigger className="col-start-2 row-start-2 h-9 w-full min-w-0 text-xs sm:w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((pr) => (
                  <SelectItem key={pr} value={pr}>
                    {t(`common.${pr}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              className="col-start-3 row-start-1 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(offers.filter((_, j) => j !== i))}
              aria-label={t("brand.remove")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Input
              className="text-xs"
              placeholder={t("brand.field.url")}
              value={o.url ?? ""}
              onChange={(e) => upd(i, { url: e.target.value })}
            />
            <Input
              className="text-xs"
              placeholder={t("brand.field.audience")}
              value={o.targetAudience ?? ""}
              onChange={(e) => upd(i, { targetAudience: e.target.value })}
            />
          </div>
          <Input
            className="text-xs"
            placeholder={t("brand.field.description")}
            value={o.description ?? ""}
            onChange={(e) => upd(i, { description: e.target.value })}
          />
        </div>
      ))}
      {addLabel ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange([...offers, { name: "", type: "service", priority: "medium" }])}
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

function Group({
  title,
  help,
  action,
  children,
}: {
  title: string;
  help?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        className="mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ListField({
  label,
  value,
  onChange,
  hint,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Textarea
        className="mt-1.5"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
