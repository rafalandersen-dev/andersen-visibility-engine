import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";

export const Route = createFileRoute("/demo-script")({
  head: () => ({
    meta: [
      { title: "Demo script — Milo Growth" },
      { name: "description", content: "An 8–10 minute walkthrough of the Milo Growth workflow for assisted-beta demos." },
    ],
  }),
  component: DemoScriptPage,
});

const STEPS: { step: string; say: string }[] = [
  { step: "Start with the free audit", say: "Enter the prospect’s website and run the free AI Visibility Readiness Audit live." },
  { step: "Show score + issues", say: "Walk through the overall score, top issues and quick wins — concrete, not magic ranking promises." },
  { step: "Create project / onboarding", say: "Show how fast onboarding turns the audit into a real project." },
  { step: "Show Brand Intelligence", say: "Explain how allowed/forbidden claims and tone keep content on-brand and safe." },
  { step: "Show opportunities", say: "Generated, prioritized content opportunities grounded in the business." },
  { step: "Generate content", say: "Produce a draft from an opportunity in the business’s language." },
  { step: "Show Milo Score", say: "Score the draft before publishing — structure, brand fit, trust, search readiness." },
  { step: "Send / publish content", say: "Send to the website as a draft, then publish live — all from Milo." },
  { step: "Show Analytics v2", say: "Growth proof: visits, CTA/booking clicks, published-content performance." },
  { step: "Show GSC Lite", say: "Import a Search Console CSV to connect impressions/clicks to Milo content." },
  { step: "Show Authority Builder", say: "Safe, relevant authority opportunities with an outreach tracker." },
  { step: "Close with the beta offer", say: "Summarize the 30-day Assisted Beta and the next step." },
];

function DemoScriptPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">Demo script</div>
        <h1 className="mt-3 font-display text-4xl">Milo demo — 8–10 minutes</h1>
        <p className="mt-3 text-muted-foreground">
          A simple walkthrough for assisted-beta demos. Core talk track:{" "}
          <span className="text-foreground/85">“Milo does not just write content. It connects planning, publishing and measurement.”</span>
        </p>

        <ol className="mt-8 space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="rounded-lg border border-border bg-card p-4 flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-[11px] font-medium text-gold">{i + 1}</span>
              <div>
                <div className="font-medium">{s.step}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{s.say}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/free-ai-visibility-audit"><Button>Start with the free audit</Button></Link>
          <Link to="/beta"><Button variant="outline">See the beta offer</Button></Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Milo is AI-assisted and human-reviewed. It does not guarantee rankings, traffic, revenue or AI citations.
        </p>
      </section>
    </MarketingShell>
  );
}
