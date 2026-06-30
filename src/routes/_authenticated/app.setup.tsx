import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
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
  useStore,
  updateProject,
  addProject,
  ProjectLimitError,
  updateProjectPublishingSettings,
  updateProjectConnector,
  saveWorkspaceNow,
} from "@/lib/store";
import { testWordPressConnectionFn } from "@/lib/wordpress.functions";
import { useAuth } from "@/lib/auth";

import type { Language, Project, PublishDestinationType, PublishMode, Market, OnboardingLanguage, PublishingConnectorType } from "@/lib/types";
import { MARKETS, LANGUAGE_OPTIONS, GROWTH_GOALS, GOAL_KEYS, marketKey, marketDefaults } from "@/lib/onboarding";
import { useT } from "@/i18n";
import { BrandIntelligenceCard } from "@/components/BrandIntelligenceCard";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/setup")({
  validateSearch: z.object({ new: z.coerce.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Project Setup — Milo Growth" },
      { name: "description", content: "Define the brand context the AI uses to generate visibility opportunities." },
    ],
  }),
  component: ProjectSetup,
});

const LANGS: Language[] = ["Polish", "Swedish", "English", "Danish"];

function ProjectSetup() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const active = projects.find((p) => p.id === activeProjectId);
  const { isOwner } = useAuth();
  const t = useT();
  const search = Route.useSearch();
  const [form, setForm] = useState<Project>(active ?? blankProject());
  const [creating, setCreating] = useState(Boolean(search.new) || !active);

  useEffect(() => {
    if (!creating && active) setForm(active);
  }, [active?.id, creating]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    if (search.new) {
      setCreating(true);
      setForm(blankProject());
    }
  }, [search.new]);


  const update = <K extends keyof Project>(k: K, v: Project[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleAdditional = (lang: Language) =>
    update(
      "additionalLanguages",
      form.additionalLanguages.includes(lang)
        ? form.additionalLanguages.filter((l) => l !== lang)
        : [...form.additionalLanguages, lang],
    );

  const save = () => {
    const missing: string[] = [];
    if (!form.name.trim()) missing.push("Project name");
    if (!form.businessName.trim()) missing.push("Business name");
    if (!form.description.trim()) missing.push("Business description");
    if (form.websiteUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(form.websiteUrl.trim())) {
      toast.error("Website URL must start with http:// or https://");
      return;
    }
    if (missing.length) {
      toast.error(`Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
      return;
    }
    if (creating) {
      try {
        addProject(form, { isOwner });
        toast.success(t("setup.toast.created"));
      } catch (e) {
        if (e instanceof ProjectLimitError) {
          toast.error(e.message);
          return;
        }
        throw e;
      }
    } else if (active) {
      // Preserve Brand Intelligence (saved separately via its own card) so a
      // plain identity/positioning save never clobbers it with stale form data.
      updateProject(active.id, { ...form, brandIntelligence: active.brandIntelligence ?? form.brandIntelligence });
      toast.success(t("setup.toast.saved"));
    }
    setCreating(false);
  };


  return (
    <AppShell
      title={creating ? t("setup.createTitle") : t("setup.title")}
      description={t("setup.subtitle")}
      actions={
        <>
          {!creating ? (
            <Button
              variant="outline"
              onClick={() => {
                setCreating(true);
                setForm({
                  ...form,
                  id: "",
                  name: "",
                  websiteUrl: "",
                  businessName: "",
                  description: "",
                });
              }}
            >
              {t("setup.newProject")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => { setCreating(false); if (active) setForm(active); }}>
              {t("common.cancel")}
            </Button>
          )}
          <Button onClick={save}>{creating ? t("setup.createProject") : t("setup.saveChanges")}</Button>
        </>
      }
    >
      <div className="max-w-4xl space-y-10">
        <Section title={t("setup.section.identity")}>
          <Field label={t("setup.projectName")}>
            {(id) => <Input id={id} value={form.name} onChange={(e) => update("name", e.target.value)} />}
          </Field>
          <Field label={t("onboarding.websiteUrl")}>
            {(id) => <Input id={id} value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://" />}
          </Field>
          <Field label={t("onboarding.businessName")}>
            {(id) => <Input id={id} value={form.businessName} onChange={(e) => update("businessName", e.target.value)} />}
          </Field>
          <Field label={t("onboarding.businessType")}>
            {(id) => <Input id={id} value={form.businessType} onChange={(e) => update("businessType", e.target.value)} />}
          </Field>
        </Section>

        <Section title={t("setup.section.markets")}>
          <Field label="Primary language">
            {(id) => (
              <Select value={form.primaryLanguage} onValueChange={(v) => update("primaryLanguage", v as Language)}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Additional languages">
            {(id) => (
              <div id={id} role="group" className="flex gap-2 flex-wrap pt-1.5">
                {LANGS.filter((l) => l !== form.primaryLanguage).map((l) => {
                  const on = form.additionalLanguages.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAdditional(l)}
                      className={
                        "px-3 py-1.5 rounded-full text-xs border transition-colors " +
                        (on
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-muted-foreground hover:border-accent")
                      }
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <Field label={t("onboarding.mainLocation")}>
            {(id) => <Input id={id} value={form.mainLocation} onChange={(e) => update("mainLocation", e.target.value)} />}
          </Field>
          <Field label={t("onboarding.targetLocations")}>
            {(id) => (
              <Input
                id={id}
                value={form.targetLocations.join(", ")}
                onChange={(e) => update("targetLocations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
            )}
          </Field>
        </Section>

        <Section title={t("setup.section.positioning")}>
          <Field label={t("onboarding.description")} full>
            {(id) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />}
          </Field>
          <Field label={t("onboarding.targetAudience")} full>
            {(id) => <Textarea id={id} rows={2} value={form.targetAudience} onChange={(e) => update("targetAudience", e.target.value)} />}
          </Field>
          <Field label={t("onboarding.toneOfVoice")} full>
            {(id) => <Textarea id={id} rows={2} value={form.toneOfVoice} onChange={(e) => update("toneOfVoice", e.target.value)} />}
          </Field>
          <Field label="Unique selling points" full>
            {(id) => <Textarea id={id} rows={3} value={form.uniqueSellingPoints} onChange={(e) => update("uniqueSellingPoints", e.target.value)} />}
          </Field>
          <Field label={t("onboarding.brandNotes")} full>
            {(id) => <Textarea id={id} rows={3} value={form.brandNotes} onChange={(e) => update("brandNotes", e.target.value)} />}
          </Field>
        </Section>

        <Section title={t("setup.section.marketsGoals")}>
          <Field label={t("setup.markets.market")}>
            {(id) => (
              <Select
                value={form.market ?? ""}
                onValueChange={(v) => {
                  const d = marketDefaults(v as Market);
                  setForm((f) => ({ ...f, market: v as Market, currency: d.currency, appLanguage: d.appLanguage, primaryContentLanguage: d.primaryContentLanguage }));
                }}
              >
                <SelectTrigger id={id}><SelectValue placeholder={t("setup.markets.selectMarket")} /></SelectTrigger>
                <SelectContent>
                  {MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{t(marketKey(m.value))}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t("setup.markets.currency")}>
            {(id) => (
              <div id={id} className="flex h-9 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground/80">
                {form.currency ?? "—"}
              </div>
            )}
          </Field>
          <Field label={t("setup.markets.appLanguage")}>
            {(id) => (
              <Select value={form.appLanguage ?? ""} onValueChange={(v) => update("appLanguage", v as OnboardingLanguage)}>
                <SelectTrigger id={id}><SelectValue placeholder={t("setup.markets.selectLanguage")} /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((l) => <SelectItem key={l.value} value={l.value}>{t(`lang.${l.value}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t("setup.markets.contentLanguage")}>
            {(id) => (
              <Select value={form.primaryContentLanguage ?? ""} onValueChange={(v) => update("primaryContentLanguage", v as OnboardingLanguage)}>
                <SelectTrigger id={id}><SelectValue placeholder={t("setup.markets.selectLanguage")} /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((l) => <SelectItem key={l.value} value={l.value}>{t(`lang.${l.value}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t("setup.markets.growthGoals")} full>
            {(id) => (
              <div id={id} role="group" className="flex flex-wrap gap-2 pt-1.5">
                {GROWTH_GOALS.map((goal) => {
                  const on = (form.growthGoals ?? []).includes(goal);
                  return (
                    <button
                      key={goal}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          growthGoals: (f.growthGoals ?? []).includes(goal)
                            ? (f.growthGoals ?? []).filter((g) => g !== goal)
                            : [...(f.growthGoals ?? []), goal],
                        }))
                      }
                      className={
                        "px-3 py-1.5 rounded-full text-xs border transition-colors " +
                        (on ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground hover:border-accent")
                      }
                    >
                      {t(GOAL_KEYS[goal] ?? goal)}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </Section>

        {!creating && active ? <BrandIntelligenceCard key={active.id} project={active} /> : null}

        {!creating && active ? <PublishingCard key={active.id} project={active} /> : null}
      </div>
    </AppShell>
  );
}

const DEST_LABELS: { value: PublishDestinationType; label: string }[] = [
  { value: "blogPost", label: "Blog post" },
  { value: "servicePage", label: "Service page" },
  { value: "faq", label: "FAQ section" },
  { value: "landingPage", label: "Landing page" },
];

const MODE_OPTIONS: { value: PublishMode; label: string }[] = [
  { value: "draftOnly", label: "Draft only" },
  { value: "manualLive", label: "Manual publish live" },
  { value: "autoPublishApproved", label: "Auto-publish approved content" },
];

function PublishingCard({ project }: { project: Project }) {
  const t = useT();
  const [connectorType, setConnectorType] = useState<PublishingConnectorType>(project.connectorType ?? "custom");
  const [endpoint, setEndpoint] = useState(project.publishEndpoint ?? "");
  const [liveEndpoint, setLiveEndpoint] = useState(project.livePublishEndpoint ?? "");
  const [secret, setSecret] = useState(project.publishSecret ?? "");
  const [destination, setDestination] = useState<PublishDestinationType>(
    project.defaultDestinationType ?? "blogPost",
  );
  const [mode, setMode] = useState<PublishMode>(project.publishMode ?? "draftOnly");
  const [saving, setSaving] = useState(false);
  const endpointId = useId();
  const liveEndpointId = useId();
  const secretId = useId();

  // ---- WordPress connector state ----
  const [wpSiteUrl, setWpSiteUrl] = useState(project.wordpress?.siteUrl ?? "");
  const [wpUsername, setWpUsername] = useState(project.wordpress?.username ?? "");
  const [wpAppPassword, setWpAppPassword] = useState(""); // never pre-filled
  const [wpPostType, setWpPostType] = useState<"post" | "page">(project.wordpress?.defaultPostType ?? "post");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const hasSavedWpPassword = Boolean(project.wordpress?.applicationPassword);

  const urlOk = (v: string) => !v.trim() || /^https?:\/\/\S+\.\S+/.test(v.trim());

  async function testWp() {
    setTesting(true);
    setTestResult(null);
    try {
      const applicationPassword = wpAppPassword.trim() || project.wordpress?.applicationPassword || "";
      const res = await testWordPressConnectionFn({
        data: { siteUrl: wpSiteUrl.trim(), username: wpUsername.trim(), applicationPassword },
      });
      setTestResult({ ok: res.success, message: res.success ? res.message || t("wp.testOk") : res.error || t("wp.testFail") });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : t("wp.testFail") });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (connectorType === "wordpress") {
        updateProjectConnector(project.id, {
          connectorType: "wordpress",
          wordpress: {
            enabled: true,
            siteUrl: wpSiteUrl.trim(),
            username: wpUsername.trim(),
            defaultPostType: wpPostType,
            defaultStatus: "draft",
            // Only overwrite the saved password when a new one is typed.
            ...(wpAppPassword.trim() ? { applicationPassword: wpAppPassword } : {}),
          },
        });
        updateProjectPublishingSettings(project.id, { publishMode: mode });
      } else {
        if (!urlOk(endpoint)) { toast.error("Publish endpoint must start with http:// or https://"); setSaving(false); return; }
        if (!urlOk(liveEndpoint)) { toast.error("Live publish endpoint must start with http:// or https://"); setSaving(false); return; }
        updateProjectConnector(project.id, { connectorType: "custom" });
        updateProjectPublishingSettings(project.id, {
          publishingPlatform: "lovableCustomEndpoint",
          publishEndpoint: endpoint.trim(),
          livePublishEndpoint: liveEndpoint.trim(),
          publishSecret: secret,
          defaultPublishMode: "draft",
          defaultDestinationType: destination,
          publishMode: mode,
        });
      }
      await saveWorkspaceNow();
      setWpAppPassword("");
      toast.success("Publishing settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save publishing settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Publishing</div>
      <div className="my-4 gold-rule" />
      <p className="text-sm text-muted-foreground max-w-2xl">{t("wp.reviewNote")}</p>

      <div className="mt-5 grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">{t("wp.connectorType")}</Label>
          <div className="mt-1.5">
            <Select value={connectorType} onValueChange={(v) => setConnectorType(v as PublishingConnectorType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">{t("wp.custom")}</SelectItem>
                <SelectItem value="wordpress">{t("wp.wordpress")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Publishing mode</Label>
          <div className="mt-1.5">
            <Select value={mode} onValueChange={(v) => setMode(v as PublishMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {connectorType === "wordpress" ? (
          <>
            <div className="md:col-span-2">
              <Label className="text-xs font-medium text-muted-foreground">{t("wp.siteUrl")}</Label>
              <Input className="mt-1.5" value={wpSiteUrl} onChange={(e) => setWpSiteUrl(e.target.value)} placeholder="https://yourwordpresssite.com" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">{t("wp.username")}</Label>
              <Input className="mt-1.5" value={wpUsername} onChange={(e) => setWpUsername(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">{t("wp.defaultPostType")}</Label>
              <Select value={wpPostType} onValueChange={(v) => setWpPostType(v as "post" | "page")}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="post">{t("wp.post")}</SelectItem>
                  <SelectItem value="page">{t("wp.page")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs font-medium text-muted-foreground">{t("wp.appPassword")}</Label>
              <Input
                className="mt-1.5"
                type="password"
                value={wpAppPassword}
                onChange={(e) => setWpAppPassword(e.target.value)}
                placeholder={hasSavedWpPassword ? t("wp.appPasswordSaved") : "xxxx xxxx xxxx xxxx xxxx xxxx"}
                autoComplete="off"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("wp.appPasswordHelp")}</p>
              <p className="text-xs text-muted-foreground">{t("wp.security")}</p>
              <p className="text-xs text-muted-foreground">{t("wp.minPerms")}</p>
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={testWp} disabled={testing || !wpSiteUrl.trim() || !wpUsername.trim()}>
                {testing ? t("wp.testing") : t("wp.test")}
              </Button>
              {testResult ? (
                <span className={`text-sm ${testResult.ok ? "text-emerald-600" : "text-destructive"}`}>{testResult.message}</span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="md:col-span-2">
              <Label htmlFor={endpointId} className="text-xs font-medium text-muted-foreground">
                Publish endpoint
              </Label>
              <div className="mt-1.5">
                <Input id={endpointId} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://yourwebsite.com/api/milo/publish" />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor={liveEndpointId} className="text-xs font-medium text-muted-foreground">
                Live publish endpoint
              </Label>
              <div className="mt-1.5">
                <Input id={liveEndpointId} value={liveEndpoint} onChange={(e) => setLiveEndpoint(e.target.value)} placeholder="https://yourwebsite.com/api/milo/publish-live" />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Separate route Milo calls to publish a reviewed draft live. Uses the same publish secret.
              </p>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor={secretId} className="text-xs font-medium text-muted-foreground">
                Publish secret
              </Label>
              <div className="mt-1.5">
                <Input id={secretId} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••••" autoComplete="off" />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Stored privately and sent only as a request header. The same secret must be configured on
                your target website.
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Default destination</Label>
              <div className="mt-1.5">
                <Select value={destination} onValueChange={(v) => setDestination(v as PublishDestinationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEST_LABELS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground max-w-2xl">
        Auto-publish is optional. Only enable it when you are comfortable publishing approved content
        automatically. You remain responsible for reviewing content and claims before publishing. See the{" "}
        <a href="/ai-disclaimer" className="underline underline-offset-4 hover:text-foreground">AI Content Disclaimer</a>.
      </p>

      {mode === "autoPublishApproved" ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-foreground/80">
          Auto-publish only publishes content assets marked <span className="font-medium">Approved</span>.
          Draft, In Review and Rejected assets will not be published automatically.
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save publishing settings"}
        </Button>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</div>
      <div className="my-4 gold-rule" />
      <div className="grid md:grid-cols-2 gap-5">{children}</div>
    </section>
  );
}

function blankProject(): Project {
  return {
    id: "",
    name: "",
    websiteUrl: "",
    businessName: "",
    businessType: "",
    primaryLanguage: "English",
    additionalLanguages: [],
    mainLocation: "",
    targetLocations: [],
    description: "",
    targetAudience: "",
    toneOfVoice: "",
    uniqueSellingPoints: "",
    brandNotes: "",
  };
}


function Field({ label, children, full }: { label: string; children: (id: string) => React.ReactNode; full?: boolean }) {
  const id = useId();
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children(id)}</div>
    </div>
  );
}
