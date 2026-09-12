import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/case-studies")({
  head: () => ({
    meta: [
      { title: "Case studies — Milo Growth" },
      {
        name: "description",
        content:
          "Early implementations and workflow examples of Milo Growth — no performance guarantees.",
      },
    ],
  }),
  component: CaseStudiesPage,
});

type Block = { heading: string; body: string };
type Study = { id: string; name: string; tag: string; position: string; blocks: Block[] };

const STUDIES: Study[] = [
  {
    id: "synergy-massage",
    name: "Synergy Massage",
    tag: "Early implementation",
    position: "Local massage and recovery studio in Limhamn / Malmö.",
    blocks: [
      {
        heading: "Challenge",
        body: "Synergy needed a clearer way to plan and publish growth content while keeping the brand focused on Swedish massage, relaxation, recovery and premium wellbeing.",
      },
      {
        heading: "Milo setup",
        body: "Project setup, brand positioning and Brand Intelligence (allowed and avoided claims), with content planning aligned to relaxation and recovery rather than medical or sports-injury positioning.",
      },
      {
        heading: "What was built",
        body: "Publishing connector and analytics tracking foundations were prepared, alongside booking/CTA and published-page tracking support and an authority-planning starter list. Live destination and measurement acceptance are still unverified.",
      },
      {
        heading: "Current status",
        body: "Setup example only: live connector, publication and measurement acceptance remain incomplete. No observed growth outcome is claimed.",
      },
      {
        heading: "Next actions",
        body: "Verify the destination and measurement setup, review saved brand-aware drafts, and obtain approval before any live publication. Review visit, booking and Search Console evidence when available, with its source and period.",
      },
    ],
  },
  {
    id: "andersen-innovations",
    name: "Andersen Innovations",
    tag: "Internal example",
    position: "Business innovation studio using Milo to plan and structure its own growth content.",
    blocks: [
      {
        heading: "Challenge",
        body: "Make the studio’s own services and value clearer for modern search and AI-assisted discovery, across multiple languages.",
      },
      {
        heading: "How Milo helps",
        body: "AI visibility readiness, service clarity, multilingual content planning, authority opportunities and analytics proof — also used to shape this beta offer.",
      },
      {
        heading: "Current status",
        body: "Used internally to develop the planning workflow. End-to-end live publishing and measurement acceptance remain incomplete; this is not a verified customer outcome.",
      },
    ],
  },
  {
    id: "si-longevity-demo",
    name: "SI Longevity",
    tag: "Demo workflow",
    position:
      "Longevity and wellness brand example used to test content planning, brand intelligence and website growth workflows.",
    blocks: [
      {
        heading: "Purpose",
        body: "A demo / partner-style workflow example for testing content planning, Brand Intelligence and the website growth workflow.",
      },
      {
        heading: "Note",
        body: "Used as a workflow example. No live performance results are claimed.",
      },
    ],
  },
];

function CaseStudiesPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-6 py-14">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">Case studies</div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">How businesses use Milo</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Early implementations and workflow examples. These describe what was set up and planned —
          they are not performance guarantees, and no traffic, ranking or revenue numbers are
          claimed.
        </p>

        <div className="mt-10 space-y-10">
          {STUDIES.map((s) => (
            <article key={s.id} id={s.id} className="rounded-lg border border-border bg-card p-6">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {s.tag}
              </div>
              <h2 className="mt-1 font-display text-2xl">{s.name}</h2>
              <p className="mt-1 text-sm text-foreground/80">{s.position}</p>
              <div className="mt-4 space-y-3">
                {s.blocks.map((b) => (
                  <div key={b.heading}>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {b.heading}
                    </div>
                    <p className="mt-0.5 text-sm text-foreground/85">{b.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-gold/40 bg-gold/5 p-6 text-center">
          <h2 className="font-display text-xl">Want this for your website?</h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/free-ai-visibility-audit">
              <Button>
                Run free audit <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/beta">
              <Button variant="outline">See the Assisted Beta</Button>
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Milo does not guarantee rankings, traffic, revenue or AI citations. Content is AI-assisted
          and should be reviewed before publishing.
        </p>
      </section>
    </MarketingShell>
  );
}
