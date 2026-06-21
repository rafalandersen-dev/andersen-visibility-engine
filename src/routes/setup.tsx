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
import { useStore, updateProject, addProject } from "@/lib/store";
import type { Language, Project } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/setup")({
  validateSearch: z.object({ new: z.coerce.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Project Setup — Andersen Visibility Engine" },
      { name: "description", content: "Define the brand context the AI uses to generate visibility opportunities." },
    ],
  }),
  component: ProjectSetup,
});

const LANGS: Language[] = ["Polish", "Swedish", "English"];

function ProjectSetup() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const active = projects.find((p) => p.id === activeProjectId)!;
  const search = Route.useSearch();
  const [form, setForm] = useState<Project>(active);
  const [creating, setCreating] = useState(Boolean(search.new));

  useEffect(() => {
    if (!creating) setForm(active);
  }, [active.id, creating]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (search.new) {
      setCreating(true);
      setForm({
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
      });
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
      addProject(form);
      toast.success("Project created");
    } else {
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
            <Button variant="ghost" onClick={() => { setCreating(false); setForm(active); }}>
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
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
          </Field>
          <Field label="Website URL">
            <Input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Business name">
            <Input value={form.businessName} onChange={(e) => update("businessName", e.target.value)} />
          </Field>
          <Field label="Business type">
            <Input value={form.businessType} onChange={(e) => update("businessType", e.target.value)} />
          </Field>
        </Section>

        <Section title="Markets & language">
          <Field label="Primary language">
            <Select value={form.primaryLanguage} onValueChange={(v) => update("primaryLanguage", v as Language)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Additional languages">
            <div className="flex gap-2 flex-wrap pt-1.5">
              {LANGS.filter((l) => l !== form.primaryLanguage).map((l) => {
                const on = form.additionalLanguages.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
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
          </Field>
          <Field label="Main location">
            <Input value={form.mainLocation} onChange={(e) => update("mainLocation", e.target.value)} />
          </Field>
          <Field label="Target locations (comma separated)">
            <Input
              value={form.targetLocations.join(", ")}
              onChange={(e) => update("targetLocations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            />
          </Field>
        </Section>

        <Section title="Positioning">
          <Field label="Business description" full>
            <Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
          </Field>
          <Field label="Target audience" full>
            <Textarea rows={2} value={form.targetAudience} onChange={(e) => update("targetAudience", e.target.value)} />
          </Field>
          <Field label="Tone of voice" full>
            <Textarea rows={2} value={form.toneOfVoice} onChange={(e) => update("toneOfVoice", e.target.value)} />
          </Field>
          <Field label="Unique selling points" full>
            <Textarea rows={3} value={form.uniqueSellingPoints} onChange={(e) => update("uniqueSellingPoints", e.target.value)} />
          </Field>
          <Field label="Brand notes (what to avoid, words to never use)" full>
            <Textarea rows={3} value={form.brandNotes} onChange={(e) => update("brandNotes", e.target.value)} />
          </Field>
        </Section>
      </div>
    </AppShell>
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
