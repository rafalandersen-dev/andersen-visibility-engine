import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { generateSeoOpportunities } from "@/lib/mock-ai";
import { ArrowUpRight, Plus, Sparkles, FileText, CheckCircle2, Upload, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Andersen Visibility Engine" },
      {
        name: "description",
        content:
          "Overview of your active project, SEO opportunities, drafts, approvals and exported content.",
      },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: typeof Sparkles;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-accent" strokeWidth={1.6} />
      </div>
      <div className="mt-3 font-display text-3xl text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const activeProjectId = useStore((s) => s.activeProjectId);
  const projects = useStore((s) => s.projects);
  const opportunities = useStore((s) =>
    s.opportunities.filter((o) => o.projectId === activeProjectId),
  );
  const content = useStore((s) =>
    s.content.filter((c) => c.projectId === activeProjectId),
  );
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const [busy, setBusy] = useState(false);

  if (!active) {
    return (
      <AppShell
        title="Welcome"
        description="Your workspace is ready. Create your first visibility project to get started."
      >
        <div className="mx-auto max-w-2xl mt-10 rounded-xl border border-border bg-card p-10 text-center">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Get started
          </div>
          <h2 className="mt-2 font-display text-3xl">
            Create your first visibility project
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Set up your business, services and monthly AI SEO workflow. You can run up to five
            projects on a single account.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate({ to: "/app/setup", search: { new: true } })}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
            <Button variant="outline" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                View demo preview
              </a>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const drafts = content.filter((c) => c.status === "Draft" || c.status === "In Review").length;
  const approved = content.filter((c) => c.status === "Approved").length;
  const exported = content.filter((c) => c.status === "Exported").length;

  const recent = [...content].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <AppShell
      title="Dashboard"
      description={`Visibility programme for ${active.businessName} · ${active.mainLocation}`}
      actions={
        <>
          <Button
            variant="outline"
            onClick={async () => {
              setBusy(true);
              try {
                await generateSeoOpportunities(activeProjectId);
                toast.success("New SEO opportunities generated");
                navigate({ to: "/app/opportunities" });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Generation failed");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            <Sparkles className="h-4 w-4" />
            Generate SEO Opportunities
          </Button>
          <Button onClick={() => navigate({ to: "/app/setup", search: { new: true } })}>
            <Plus className="h-4 w-4" />
            Create New Project
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Active project" value={active.name} icon={Sparkles} hint={active.primaryLanguage} />
        <StatCard label="SEO opportunities" value={opportunities.length} icon={Sparkles} hint={`${opportunities.filter(o => o.priority === "High").length} high priority`} />
        <StatCard label="Drafts in progress" value={drafts} icon={FileEdit} />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} />
        <StatCard label="Exported" value={exported} icon={Upload} />
      </div>

      <section className="mt-10 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Recent content</div>
              <h2 className="font-display text-lg mt-0.5">Latest assets</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/editor" })}>
              Open editor <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {recent.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted-foreground">
                No content yet. Generate an opportunity and create a brief or draft to get started.
              </li>
            ) : (
              recent.map((c) => (
                <li key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{c.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.status} · updated {formatDate(c.updatedAt)}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/editor", search: { id: c.id } as never })}>
                    Open
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Programme snapshot
          </div>
          <h2 className="mt-0.5 font-display text-lg">This week</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Languages</span>
              <span>{[active.primaryLanguage, ...active.additionalLanguages].join(", ")}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Target locations</span>
              <span className="text-right">{active.targetLocations.slice(0, 3).join(", ")}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Tone</span>
              <span className="text-right">{active.toneOfVoice.split(".")[0]}</span>
            </li>
          </ul>
          <div className="my-5 gold-rule" />
          <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/app/calendar" })}>
            <FileText className="h-4 w-4" /> Review content calendar
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
