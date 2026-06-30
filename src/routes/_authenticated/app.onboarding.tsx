import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import {
  addProject,
  updateProject,
  setActiveProject,
  addService,
  saveWorkspaceNow,
  getState,
  ProjectLimitError,
} from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  MARKETS,
  LANGUAGE_OPTIONS,
  GROWTH_GOALS,
  marketDefaults,
  contentLangToProjectLanguage,
  isProjectSetupComplete,
} from "@/lib/onboarding";
import { scanWebsiteFn } from "@/lib/ai.functions";
import {
  generateSeoOpportunities,
  generateContentCalendar,
  runSiteAudit,
  runCompetitorGap,
} from "@/lib/mock-ai";
import type { Market, Currency, OnboardingLanguage, Priority, Project } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Globe, Loader2, Plus, Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/onboarding")({
  head: () => ({ meta: [{ title: "Get started — Milo Growth" }] }),
  component: OnboardingWizard,
});

type WizardService = { name: string; kind: "Service" | "Product"; priority: Priority; description: string };

type WizardData = {
  market: Market;
  currency: Currency;
  appLanguage: OnboardingLanguage;
  primaryContentLanguage: OnboardingLanguage;
  websiteUrl: string;
  businessName: string;
  businessType: string;
  description: string;
  targetAudience: string;
  mainLocation: string;
  targetLocations: string;
  toneOfVoice: string;
  brandNotes: string;
  services: WizardService[];
  competitorUrls: [string, string, string];
  growthGoals: string[];
  scan?: Record<string, unknown>;
};

const STEP_TITLES = [
  "Where should Milo help you grow?",
  "What website should Milo work on?",
  "Confirm your business profile",
  "What do you sell?",
  "Who are your competitors?",
  "What should Milo focus on first?",
  "Your first growth project is ready",
];

const DRAFT_KEY = "milo_onboarding_draft_v1";

function initialData(): WizardData {
  const d = marketDefaults("PL");
  return {
    market: "PL",
    currency: d.currency,
    appLanguage: d.appLanguage,
    primaryContentLanguage: d.primaryContentLanguage,
    websiteUrl: "",
    businessName: "",
    businessType: "",
    description: "",
    targetAudience: "",
    mainLocation: "",
    targetLocations: "",
    toneOfVoice: "",
    brandNotes: "",
    services: [],
    competitorUrls: ["", "", ""],
    growthGoals: [],
  };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function OnboardingWizard() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [step, setStep] = useState(1);
  const [w, setW] = useState<WizardData>(initialData);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");

  // Restore draft (resilient to refresh mid-wizard).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { step?: number; data?: WizardData };
        if (saved.data) setW({ ...initialData(), ...saved.data });
        if (saved.step) setStep(Math.min(7, Math.max(1, saved.step)));
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft on change.
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data: w }));
    } catch {
      /* ignore */
    }
  }, [step, w]);

  const set = <K extends keyof WizardData>(k: K, v: WizardData[K]) => setW((p) => ({ ...p, [k]: v }));

  const setMarket = (market: Market) => {
    const d = marketDefaults(market);
    setW((p) => ({ ...p, market, currency: d.currency, appLanguage: d.appLanguage, primaryContentLanguage: d.primaryContentLanguage }));
  };

  async function runScan() {
    const url = w.websiteUrl.trim();
    if (!url) return;
    setScanning(true);
    try {
      const res = await scanWebsiteFn({ data: { url } });
      if (res.ok) {
        setW((p) => ({
          ...p,
          businessName: p.businessName || res.businessName || "",
          businessType: p.businessType || res.businessType || "",
          description: p.description || res.description || "",
          services:
            p.services.length > 0
              ? p.services
              : (res.services ?? []).map((s) => ({ name: s.name, kind: s.kind, priority: "Medium" as Priority, description: s.description })),
          scan: { title: res.title, metaDescription: res.metaDescription, businessName: res.businessName, businessType: res.businessType, primaryLanguage: res.primaryLanguage },
        }));
        toast.success("Scanned your website — review the details");
      } else {
        toast.message("Couldn’t read that website — fill the details manually");
      }
    } catch {
      toast.message("Couldn’t scan the website — you can fill the details manually");
    } finally {
      setScanning(false);
    }
  }

  async function handleContinue() {
    if (step === 2) {
      // Best-effort scan on leaving the website step (non-blocking on failure).
      if (w.websiteUrl.trim() && !w.scan) await runScan();
      setStep(3);
      return;
    }
    setStep((s) => Math.min(7, s + 1));
  }

  function toggleGoal(goal: string) {
    setW((p) => ({
      ...p,
      growthGoals: p.growthGoals.includes(goal) ? p.growthGoals.filter((g) => g !== goal) : [...p.growthGoals, goal],
    }));
  }

  function addServiceRow() {
    setW((p) => ({ ...p, services: [...p.services, { name: "", kind: "Service", priority: "Medium", description: "" }] }));
  }
  function updateServiceRow(i: number, patch: Partial<WizardService>) {
    setW((p) => ({ ...p, services: p.services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }
  function removeServiceRow(i: number) {
    setW((p) => ({ ...p, services: p.services.filter((_, idx) => idx !== i) }));
  }

  function buildProjectPayload(): Omit<Project, "id"> {
    return {
      name: w.businessName.trim() || hostFromUrl(w.websiteUrl) || "My project",
      websiteUrl: w.websiteUrl.trim(),
      businessName: w.businessName.trim(),
      businessType: w.businessType.trim(),
      primaryLanguage: contentLangToProjectLanguage(w.primaryContentLanguage),
      additionalLanguages: [],
      mainLocation: w.mainLocation.trim(),
      targetLocations: w.targetLocations.split(",").map((s) => s.trim()).filter(Boolean),
      description: w.description.trim(),
      targetAudience: w.targetAudience.trim(),
      toneOfVoice: w.toneOfVoice.trim(),
      uniqueSellingPoints: "",
      brandNotes: w.brandNotes.trim(),
      setupComplete: true,
      market: w.market,
      currency: w.currency,
      appLanguage: w.appLanguage,
      primaryContentLanguage: w.primaryContentLanguage,
      growthGoals: w.growthGoals,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingSourceData: w.scan,
    };
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenStatus("Saving your project…");
    let projectId = "";
    try {
      const payload = buildProjectPayload();
      const s = getState();
      const existing = s.projects.find((p) => p.id === s.activeProjectId);
      if (existing && !isProjectSetupComplete(existing)) {
        updateProject(existing.id, payload);
        projectId = existing.id;
      } else {
        projectId = addProject(payload, { isOwner });
      }
      setActiveProject(projectId);
      for (const sv of w.services.filter((x) => x.name.trim())) {
        addService({
          projectId,
          name: sv.name.trim(),
          kind: sv.kind,
          description: sv.description.trim(),
          targetAudience: "",
          locationRelevance: "",
          priority: sv.priority,
        });
      }
      // Critical: persist setup BEFORE any AI work so nothing is lost on failure.
      await saveWorkspaceNow();
    } catch (e) {
      if (e instanceof ProjectLimitError) {
        toast.error(e.message);
        setGenerating(false);
        return;
      }
      toast.error("Could not save your project. Please try again.");
      setGenerating(false);
      return;
    }

    // Best-effort foundation — each independent and non-fatal.
    try {
      setGenStatus("Generating opportunities & calendar…");
      const tasks: Promise<unknown>[] = [];
      tasks.push(
        (async () => {
          try {
            await generateSeoOpportunities(projectId);
            await generateContentCalendar(projectId);
          } catch {
            /* non-fatal */
          }
        })(),
      );
      if (w.websiteUrl.trim()) {
        tasks.push(runSiteAudit(projectId, w.websiteUrl.trim()).catch(() => {}));
      }
      const comps = w.competitorUrls.map((c) => c.trim()).filter(Boolean);
      if (comps.length) {
        tasks.push(runCompetitorGap(projectId, comps).catch(() => {}));
      }
      await Promise.allSettled(tasks);
      toast.success("Your first growth plan is ready");
    } catch {
      toast.message("Setup saved. Some AI steps didn’t finish — you can run them from each module.");
    } finally {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setGenerating(false);
      navigate({ to: "/app" });
    }
  }

  const canContinue =
    step === 3 ? Boolean(w.businessName.trim()) : true; // only business name is required

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 md:px-10 py-6 border-b border-border flex items-center justify-between">
        <div>
          <div className="font-display text-xl leading-tight">Milo Growth</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Get started</div>
        </div>
        <div className="text-xs text-muted-foreground">Step {step} of 7</div>
      </header>

      {/* Progress */}
      <div className="h-1 bg-secondary">
        <div className="h-full bg-gold/80 transition-all" style={{ width: `${(step / 7) * 100}%` }} />
      </div>

      <main className="flex-1 px-6 md:px-10 py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-display text-2xl md:text-3xl">{STEP_TITLES[step - 1]}</h1>

          <div className="mt-7 space-y-6">
            {step === 1 && (
              <>
                <Field label="Market / country">
                  <Select value={w.market} onValueChange={(v) => setMarket(v as Market)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Helper>Sets sensible defaults: currency {w.currency}.</Helper>
                </Field>
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="App language">
                    <Select value={w.appLanguage} onValueChange={(v) => set("appLanguage", v as OnboardingLanguage)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Primary content language">
                    <Select value={w.primaryContentLanguage} onValueChange={(v) => set("primaryContentLanguage", v as OnboardingLanguage)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </>
            )}

            {step === 2 && (
              <Field label="Website URL">
                <Input value={w.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="https://yourbusiness.com" disabled={scanning} />
                <Helper>Milo will try to read your homepage to pre-fill the next steps. You can also skip and fill manually.</Helper>
                {scanning ? (
                  <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Reading your website…
                  </div>
                ) : null}
              </Field>
            )}

            {step === 3 && (
              <>
                {w.scan ? (
                  <div className="rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-foreground/80 inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-gold/80" /> Pre-filled from your website — edit anything below.
                  </div>
                ) : null}
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="Business name *">
                    <Input value={w.businessName} onChange={(e) => set("businessName", e.target.value)} />
                  </Field>
                  <Field label="Business type">
                    <Input value={w.businessType} onChange={(e) => set("businessType", e.target.value)} placeholder="e.g. bakery, law firm" />
                  </Field>
                </div>
                <Field label="Business description">
                  <Textarea rows={3} value={w.description} onChange={(e) => set("description", e.target.value)} />
                </Field>
                <Field label="Target audience">
                  <Textarea rows={2} value={w.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} />
                </Field>
                <div className="grid md:grid-cols-2 gap-5">
                  <Field label="Main location">
                    <Input value={w.mainLocation} onChange={(e) => set("mainLocation", e.target.value)} placeholder="City / area" />
                  </Field>
                  <Field label="Target locations (comma separated)">
                    <Input value={w.targetLocations} onChange={(e) => set("targetLocations", e.target.value)} />
                  </Field>
                </div>
                <Field label="Tone of voice">
                  <Input value={w.toneOfVoice} onChange={(e) => set("toneOfVoice", e.target.value)} placeholder="e.g. warm, expert, concise" />
                </Field>
                <Field label="Brand notes (what to avoid)">
                  <Textarea rows={2} value={w.brandNotes} onChange={(e) => set("brandNotes", e.target.value)} />
                </Field>
              </>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {w.services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add the services or products you sell. You can refine these later.</p>
                ) : null}
                {w.services.map((sv, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input className="flex-1" placeholder="Name" value={sv.name} onChange={(e) => updateServiceRow(i, { name: e.target.value })} />
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeServiceRow(i)} aria-label="Remove">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Select value={sv.kind} onValueChange={(v) => updateServiceRow(i, { kind: v as "Service" | "Product" })}>
                        <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Service">Service</SelectItem>
                          <SelectItem value="Product">Product</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sv.priority} onValueChange={(v) => updateServiceRow(i, { priority: v as Priority })}>
                        <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="flex-1 text-xs" placeholder="Short description (optional)" value={sv.description} onChange={(e) => updateServiceRow(i, { description: e.target.value })} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addServiceRow}><Plus className="h-3.5 w-3.5" /> Add service / product</Button>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Optional but recommended — add up to 3 competitor websites Milo can compare you against.</p>
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    placeholder={`https://competitor${i + 1}.com`}
                    value={w.competitorUrls[i]}
                    onChange={(e) => set("competitorUrls", w.competitorUrls.map((c, idx) => (idx === i ? e.target.value : c)) as [string, string, string])}
                  />
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {GROWTH_GOALS.map((goal) => {
                  const on = w.growthGoals.includes(goal);
                  return (
                    <button
                      key={goal}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleGoal(goal)}
                      className={
                        "text-left rounded-lg border px-4 py-3 text-sm transition-colors " +
                        (on ? "border-accent bg-accent/15 text-foreground" : "border-border hover:border-accent/60 text-foreground/80")
                      }
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className={"h-4 w-4 rounded-sm border flex items-center justify-center " + (on ? "bg-accent border-accent" : "border-border")}>
                          {on ? <Check className="h-3 w-3 text-accent-foreground" /> : null}
                        </span>
                        {goal}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Review your setup. Milo will create your project and generate a first foundation.</p>
                <div className="rounded-lg border border-border bg-card p-5 space-y-2 text-sm">
                  <Summary k="Market" v={`${MARKETS.find((m) => m.value === w.market)?.label ?? w.market} · ${w.currency}`} />
                  <Summary k="Language" v={`App ${w.appLanguage.toUpperCase()} · Content ${w.primaryContentLanguage.toUpperCase()}`} />
                  <Summary k="Website" v={w.websiteUrl || "—"} />
                  <Summary k="Business" v={w.businessName || "—"} />
                  <Summary k="Services / products" v={`${w.services.filter((s) => s.name.trim()).length}`} />
                  <Summary k="Competitors" v={`${w.competitorUrls.filter((c) => c.trim()).length}`} />
                  <Summary k="Goals" v={w.growthGoals.length ? w.growthGoals.join(", ") : "—"} />
                </div>
                {generating ? (
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {genStatus}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-9 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || generating}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 7 ? (
              <Button onClick={handleContinue} disabled={scanning || !canContinue}>
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Generating…" : "Generate my first growth plan"}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-muted-foreground">{children}</p>;
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-40 shrink-0 text-muted-foreground uppercase tracking-[0.14em] text-[11px]">{k}</span>
      <span className="text-foreground/85">{v}</span>
    </div>
  );
}
