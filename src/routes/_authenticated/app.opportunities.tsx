import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, updateOpportunity } from "@/lib/store";
import type {
  ContentType,
  Language,
  OpportunityStatus,
  Priority,
} from "@/lib/types";
import { generateSeoOpportunities } from "@/lib/mock-ai";
import { CreateContentDialog } from "@/components/CreateContentDialog";
import { Sparkles, FilePlus2, X, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/opportunities")({
  head: () => ({
    meta: [
      { title: "SEO Opportunities — Milo Growth" },
      { name: "description", content: "AI-generated visibility opportunities ranked by business value." },
    ],
  }),
  component: OpportunitiesPage,
});

function OpportunitiesPage() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const all = useStore((s) => s.opportunities.filter((o) => o.projectId === activeProjectId));

  const [fLang, setFLang] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPrio, setFPrio] = useState<string>("all");
  const [contentOppId, setContentOppId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const items = useMemo(
    () =>
      all.filter(
        (o) =>
          (fLang === "all" || o.language === fLang) &&
          (fType === "all" || o.contentType === fType) &&
          (fStatus === "all" || o.status === fStatus) &&
          (fPrio === "all" || o.priority === fPrio),
      ),
    [all, fLang, fType, fStatus, fPrio],
  );

  return (
    <AppShell
      title="SEO opportunities"
      description="Ranked by intent, language and business value. Pick one to generate a brief or a draft."
      actions={
        <Button
          onClick={async () => {
            setGenerating(true);
            try {
              await generateSeoOpportunities(activeProjectId);
              toast.success("Generated new opportunities");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Generation failed");
            } finally {
              setGenerating(false);
            }
          }}
          disabled={generating}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate more
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2 mb-6">
        <Filter label="Language" value={fLang} onChange={setFLang} options={["Polish","Swedish","English"]} />
        <Filter label="Content type" value={fType} onChange={setFType} options={["Landing Page","Service Page","Blog Article","Guide","FAQ Page","Comparison","Location Page"]} />
        <Filter label="Status" value={fStatus} onChange={setFStatus} options={["New","In Brief","Drafting","Discarded","Linked"]} />
        <Filter label="Priority" value={fPrio} onChange={setFPrio} options={["High","Medium","Low"]} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-border p-12 text-center">
            {all.length === 0 ? (
              <>
                <div className="font-display text-lg mb-1">No opportunities yet</div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Generate a first batch of structured SEO opportunities, ranked by language, intent and business value for this project.
                </p>
                <Button
                  className="mt-4"
                  onClick={async () => {
                    setGenerating(true);
                    try {
                      await generateSeoOpportunities(activeProjectId);
                      toast.success("Generated opportunities");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Generation failed");
                    } finally {
                      setGenerating(false);
                    }
                  }}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate opportunities
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No opportunities match these filters.</p>
            )}
          </div>
        ) : items.map((o) => (
          <article key={o.id} className="rounded-lg border border-border bg-card p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                <Tag>{o.language as Language}</Tag>
                <Tag>{o.contentType as ContentType}</Tag>
                <Tag tone={o.priority === "High" ? "gold" : "muted"}>{o.priority as Priority}</Tag>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <h3 className="mt-3 font-display text-lg leading-snug text-foreground">{o.title}</h3>
            <dl className="mt-4 space-y-2 text-xs">
              <Row k="Intent" v={o.searchIntent} />
              <Row k="Audience" v={o.targetAudience} />
              <Row k="Value" v={o.businessValue} />
              <Row k="CTA" v={o.recommendedCta} />
            </dl>
            <div className="mt-5 flex gap-2 flex-wrap pt-4 border-t border-border">
              <Button size="sm" onClick={() => setContentOppId(o.id)}>
                <FilePlus2 className="h-3.5 w-3.5" /> Create content
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-muted-foreground"
                onClick={() => { updateOpportunity(o.id, { status: "Discarded" }); toast.success("Discarded"); }}
              >
                <X className="h-3.5 w-3.5" /> Discard
              </Button>
            </div>
          </article>
        ))}
      </div>

      <CreateContentDialog
        opportunityId={contentOppId}
        open={contentOppId !== null}
        onOpenChange={(o) => { if (!o) setContentOppId(null); }}
      />
    </AppShell>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "gold" | "muted" }) {
  const cls = tone === "gold" ? "bg-accent/30 border-accent/40 text-accent-foreground" : tone === "muted" ? "bg-muted text-muted-foreground border-border" : "bg-secondary border-border text-secondary-foreground";
  return <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

function StatusBadge({ status }: { status: OpportunityStatus }) {
  return <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{status}</span>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground uppercase tracking-[0.14em]">{k}</dt>
      <dd className="text-foreground/85">{v}</dd>
    </div>
  );
}
