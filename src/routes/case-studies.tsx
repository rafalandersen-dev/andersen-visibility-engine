import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/MarketingShell";
import { useAuthLanguage } from "@/hooks/use-auth-language";
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
    tag: "publicStudies.synergy.tag",
    position: "publicStudies.synergy.position",
    blocks: [
      {
        heading: "publicStudies.challenge",
        body: "publicStudies.synergy.challenge",
      },
      {
        heading: "publicStudies.setup",
        body: "publicStudies.synergy.setup",
      },
      {
        heading: "publicStudies.built",
        body: "publicStudies.synergy.built",
      },
      {
        heading: "publicStudies.status",
        body: "publicStudies.synergy.status",
      },
      {
        heading: "publicStudies.next",
        body: "publicStudies.synergy.next",
      },
    ],
  },
  {
    id: "andersen-innovations",
    name: "Andersen Innovations",
    tag: "publicStudies.andersen.tag",
    position: "publicStudies.andersen.position",
    blocks: [
      {
        heading: "publicStudies.challenge",
        body: "publicStudies.andersen.challenge",
      },
      {
        heading: "publicStudies.helps",
        body: "publicStudies.andersen.helps",
      },
      {
        heading: "publicStudies.status",
        body: "publicStudies.andersen.status",
      },
    ],
  },
  {
    id: "si-longevity-demo",
    name: "SI Longevity",
    tag: "publicStudies.si.tag",
    position: "publicStudies.si.position",
    blocks: [
      {
        heading: "publicStudies.purpose",
        body: "publicStudies.si.purpose",
      },
      {
        heading: "publicStudies.note",
        body: "publicStudies.si.note",
      },
    ],
  },
];

function CaseStudiesPage() {
  const { language, chooseLanguage, t } = useAuthLanguage();
  return (
    <MarketingShell languageControls={{ language, chooseLanguage }}>
      <section className="mx-auto max-w-4xl px-6 py-14">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">
          {t("publicBeta.caseStudies")}
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">{t("publicStudies.title")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("publicStudies.intro")}</p>

        <div className="mt-10 space-y-10">
          {STUDIES.map((s) => (
            <article key={s.id} id={s.id} className="rounded-lg border border-border bg-card p-6">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t(s.tag)}
              </div>
              <h2 className="mt-1 font-display text-2xl">{s.name}</h2>
              <p className="mt-1 text-sm text-foreground/80">{t(s.position)}</p>
              <div className="mt-4 space-y-3">
                {s.blocks.map((b) => (
                  <div key={b.heading}>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {t(b.heading)}
                    </div>
                    <p className="mt-0.5 text-sm text-foreground/85">{t(b.body)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-gold/40 bg-gold/5 p-6 text-center">
          <h2 className="font-display text-xl">{t("publicStudies.cta")}</h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/free-ai-visibility-audit">
                {t("publicStudies.audit")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/beta">{t("publicStudies.beta")}</Link>
            </Button>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{t("publicStudies.disclaimer")}</p>
      </section>
    </MarketingShell>
  );
}
