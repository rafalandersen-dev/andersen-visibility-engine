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
  saveWorkspaceNow,
} from "@/lib/store";
import { useAuth } from "@/lib/auth";

import type { Language, Project, PublishDestinationType, PublishMode } from "@/lib/types";
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

const LANGS: Language[] = ["Polish", "Swedish", "English"];

function ProjectSetup() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const active = projects.find((p) => p.id === activeProjectId);
  const { isOwner } = useAuth();
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
        toast.success("Project created");
      } catch (e) {
        if (e instanceof ProjectLimitError) {
          toast.error(e.message);
          return;
        }
        throw e;
      }
    } else if (active) {
      updateProject(active.id, form);
      toast.success("Project saved");
    }
    setCreating(false);
  };


  return (
    <AppShell
      title={creating ? "Create new project" : "Project setup"}
      description="The richer this context, the sharper your AI-generated opportunities will be."
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
              New project
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => { setCreating(false); if (active) setForm(active); }}>
              Cancel
            </Button>
          )}
          <Button onClick={save}>{creating ? "Create project" : "Save changes"}</Button>
        </>
      }
    >
      <div className="max-w-4xl space-y-10">
        <Section title="Identity">
          <Field label="Project name">
            {(id) => <Input id={id} value={form.name} onChange={(e) => update("name", e.target.value)} />}
          </Field>
          <Field label="Website URL">
            {(id) => <Input id={id} value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://" />}
          </Field>
          <Field label="Business name">
            {(id) => <Input id={id} value={form.businessName} onChange={(e) => update("businessName", e.target.value)} />}
          </Field>
          <Field label="Business type">
            {(id) => <Input id={id} value={form.businessType} onChange={(e) => update("businessType", e.target.value)} />}
          </Field>
        </Section>

        <Section title="Markets & language">
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
          <Field label="Main location">
            {(id) => <Input id={id} value={form.mainLocation} onChange={(e) => update("mainLocation", e.target.value)} />}
          </Field>
          <Field label="Target locations (comma separated)">
            {(id) => (
              <Input
                id={id}
                value={form.targetLocations.join(", ")}
                onChange={(e) => update("targetLocations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
            )}
          </Field>
        </Section>

        <Section title="Positioning">
          <Field label="Business description" full>
            {(id) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />}
          </Field>
          <Field label="Target audience" full>
            {(id) => <Textarea id={id} rows={2} value={form.targetAudience} onChange={(e) => update("targetAudience", e.target.value)} />}
          </Field>
          <Field label="Tone of voice" full>
            {(id) => <Textarea id={id} rows={2} value={form.toneOfVoice} onChange={(e) => update("toneOfVoice", e.target.value)} />}
          </Field>
          <Field label="Unique selling points" full>
            {(id) => <Textarea id={id} rows={3} value={form.uniqueSellingPoints} onChange={(e) => update("uniqueSellingPoints", e.target.value)} />}
          </Field>
          <Field label="Brand notes (what to avoid, words to never use)" full>
            {(id) => <Textarea id={id} rows={3} value={form.brandNotes} onChange={(e) => update("brandNotes", e.target.value)} />}
          </Field>
        </Section>

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

  const urlOk = (v: string) => !v.trim() || /^https?:\/\/\S+\.\S+/.test(v.trim());

  async function save() {
    if (!urlOk(endpoint)) {
      toast.error("Publish endpoint must start with http:// or https://");
      return;
    }
    if (!urlOk(liveEndpoint)) {
      toast.error("Live publish endpoint must start with http:// or https://");
      return;
    }
    setSaving(true);
    try {
      updateProjectPublishingSettings(project.id, {
        publishingPlatform: "lovableCustomEndpoint",
        publishEndpoint: endpoint.trim(),
        livePublishEndpoint: liveEndpoint.trim(),
        publishSecret: secret,
        defaultPublishMode: "draft",
        defaultDestinationType: destination,
        publishMode: mode,
      });
      await saveWorkspaceNow();
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
      <p className="text-sm text-muted-foreground max-w-2xl">
        Connect a Lovable/custom website endpoint so Milo can send content as website{" "}
        <span className="text-foreground/80">drafts</span> and, when you choose, publish them{" "}
        <span className="text-foreground/80">live</span> — all controlled from Milo. You never need
        to publish from the website itself.
      </p>

      <div className="mt-5 grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Website platform</Label>
          <div className="mt-1.5 flex h-9 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground/80">
            Lovable / Custom endpoint
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Default publish mode</Label>
          <div className="mt-1.5 flex h-9 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground/80">
            Draft
          </div>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={endpointId} className="text-xs font-medium text-muted-foreground">
            Publish endpoint
          </Label>
          <div className="mt-1.5">
            <Input
              id={endpointId}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://yourwebsite.com/api/milo/publish"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor={liveEndpointId} className="text-xs font-medium text-muted-foreground">
            Live publish endpoint
          </Label>
          <div className="mt-1.5">
            <Input
              id={liveEndpointId}
              value={liveEndpoint}
              onChange={(e) => setLiveEndpoint(e.target.value)}
              placeholder="https://yourwebsite.com/api/milo/publish-live"
            />
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
            <Input
              id={secretId}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
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
      </div>

      {mode === "autoPublishApproved" ? (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-foreground/80">
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
