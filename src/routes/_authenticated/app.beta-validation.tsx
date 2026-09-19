import { useT } from "@/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { addOnPrice, formatMoney, MARKET_CURRENCY, type BillingMarket } from "@/lib/billing";
import {
  ClipboardList,
  Copy,
  Download,
  Lock,
  Target,
  MessageSquare,
  ListChecks,
  BarChart3,
  GitBranch,
  HelpCircle,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/beta-validation")({
  head: () => ({
    meta: [
      { title: "Beta validation — Milo Growth" },
      {
        name: "description",
        content: "Internal beta demo & sales validation operating pack (owner only).",
      },
    ],
  }),
  component: BetaValidationPage,
});

// ---- pricing table (derived from the billing module so it never drifts) ----
const BETA_MARKETS: { market: BillingMarket; label: string }[] = [
  { market: "Poland", label: "betaScreen.poland" },
  { market: "Sweden", label: "betaScreen.sweden" },
  { market: "Denmark", label: "betaScreen.denmark" },
  { market: "United Kingdom", label: "betaScreen.uk" },
  { market: "European Union", label: "betaScreen.eu" },
];

// Founding-beta (first pilots only) — validation-specific, not the public catalogue.
const FOUNDING_BETA: Partial<Record<BillingMarket, string>> = {
  Poland: "699 PLN",
  Sweden: "2500 SEK",
  "European Union": "€249",
};

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: typeof Target;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-border bg-card">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="p-5 space-y-4 text-sm text-foreground/85">{children}</div>
    </section>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const t = useT();
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success(t("claude.copied"));
            } catch {
              toast.error(t("betaScreen.copyFailed"));
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" /> {t("common.copy")}
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{text}</p>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold/70 shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const TRACKER_FIELDS = [
  "Business name",
  "Website",
  "Country/market",
  "Segment",
  "Contact person",
  "Contact method",
  "Source",
  "Status",
  "Audit score",
  "Main issue",
  "Proposed offer",
  "Price quoted",
  "Demo date",
  "Follow-up date",
  "Decision",
  "Notes",
  "Next action",
];

const TRACKER_STATUSES = [
  "Identified",
  "Audited",
  "Contacted",
  "Replied",
  "Demo booked",
  "Demo completed",
  "Proposal sent",
  "Accepted beta",
  "Not now",
  "Rejected",
  "Follow-up later",
];

const TRACKER_LABEL_KEYS: Readonly<Record<string, string>> = {
  "Business name": "betaScreen.field.business",
  Website: "betaScreen.field.website",
  "Country/market": "betaScreen.field.market",
  Segment: "betaScreen.field.segment",
  "Contact person": "betaScreen.field.contact",
  "Contact method": "betaScreen.field.method",
  Source: "betaScreen.field.source",
  Status: "betaScreen.field.status",
  "Audit score": "betaScreen.field.audit",
  "Main issue": "betaScreen.field.issue",
  "Proposed offer": "betaScreen.field.offer",
  "Price quoted": "betaScreen.field.price",
  "Demo date": "betaScreen.field.demo",
  "Follow-up date": "betaScreen.field.followup",
  Decision: "betaScreen.field.decision",
  Notes: "betaScreen.field.notes",
  "Next action": "betaScreen.field.next",
  Identified: "betaScreen.status.identified",
  Audited: "betaScreen.status.audited",
  Contacted: "betaScreen.status.contacted",
  Replied: "betaScreen.status.replied",
  "Demo booked": "betaScreen.status.booked",
  "Demo completed": "betaScreen.status.completed",
  "Proposal sent": "betaScreen.status.proposal",
  "Accepted beta": "betaScreen.status.accepted",
  "Not now": "betaScreen.status.notNow",
  Rejected: "betaScreen.status.rejected",
  "Follow-up later": "betaScreen.status.later",
};

function downloadTrackerCsv() {
  const header = TRACKER_FIELDS.join(",");
  const example =
    "Synergy Massage,https://example.com,Sweden,B,Owner,Email,Referral,Identified,,Weak service copy,Founding beta,2500 SEK,,,,,Run free audit";
  const csv = `${header}\n${example}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "milo-prospect-tracker-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function BetaValidationPage() {
  const { isOwner } = useAuth();
  const t = useT();
  const [tab, setTab] = useState<"pl" | "en" | "sv">("en");

  if (!isOwner) {
    return (
      <AppShell title={t("betaScreen.title")} description={t("betaScreen.ownerTools")}>
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center">
          <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t("betaScreen.ownerOnly")}</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/app">{t("betaScreen.back")}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const outreach = {
    en: [
      {
        label: "Cold message",
        text: "Hi {name} — I built a quick tool that checks whether a business website is clear for modern SEO and AI search. It's not about magic ranking promises — more about whether your site clearly shows your offer, location, trust and answers to customer questions. Happy to run a free quick audit and show you 3–5 concrete things to improve.",
      },
      {
        label: "Warm / referral",
        text: "Hi {name} — {referrer} suggested I reach out. I'm running a small assisted beta of Milo Growth, a tool that turns a website into a clearer, more measurable growth system. Could I run a free audit of your site and show you a few practical improvements?",
      },
      {
        label: "Follow-up",
        text: "Hi {name} — just following up on the quick website audit I offered. No pressure — if it's useful I can send 3–5 specific improvements for your site this week.",
      },
      {
        label: "Post-audit",
        text: "Hi {name} — here's your free AI Visibility Readiness audit. Top things to improve: {points}. Want a 15-minute walkthrough of how Milo would help you action these over 30 days?",
      },
      {
        label: "Post-demo follow-up",
        text: "Thanks for your time, {name}. As discussed, the Assisted Beta gets you a 30-day growth plan, prioritized content, publish-ready drafts and early performance tracking. Shall we start with project setup this week?",
      },
    ],
    pl: [
      {
        label: "Wiadomość cold",
        text: "Cześć {name}, zrobiłem krótkie narzędzie, które sprawdza, czy strona firmy jest czytelna dla nowoczesnego SEO i AI search. Nie chodzi o magiczne obietnice rankingów — bardziej o to, czy strona jasno pokazuje ofertę, lokalizację, zaufanie i odpowiedzi na pytania klientów. Mogę zrobić Ci darmowy szybki audit i pokazać 3–5 konkretnych rzeczy do poprawy.",
      },
      {
        label: "Wiadomość z polecenia",
        text: "Cześć {name}, {referrer} podpowiedział, żeby się odezwać. Prowadzę małą asystowaną betę Milo Growth — narzędzia, które zamienia stronę w jaśniejszy i mierzalny system wzrostu. Mogę zrobić darmowy audit Twojej strony i pokazać kilka praktycznych usprawnień?",
      },
      {
        label: "Follow-up",
        text: "Cześć {name}, wracam w sprawie darmowego auditu strony, który proponowałem. Bez presji — jeśli to przydatne, mogę w tym tygodniu przesłać 3–5 konkretnych rzeczy do poprawy.",
      },
      {
        label: "Po audycie",
        text: "Cześć {name}, oto Twój darmowy audit gotowości na AI i SEO. Najważniejsze do poprawy: {points}. Chcesz 15-minutowe omówienie, jak Milo pomoże to wdrożyć w 30 dni?",
      },
      {
        label: "Po demo",
        text: "Dzięki za czas, {name}. Tak jak rozmawialiśmy — Asystowana Beta daje plan wzrostu na 30 dni, priorytety treści, gotowe do publikacji szkice i wczesne śledzenie wyników. Zaczynamy od konfiguracji projektu w tym tygodniu?",
      },
    ],
    sv: [
      {
        label: "Kallt meddelande",
        text: "Hej {name}, jag har byggt ett enkelt verktyg som kollar om en företagswebbplats är tydlig för modern SEO och AI-sökning. Det handlar inte om magiska placeringslöften — mer om huruvida sidan tydligt visar ert erbjudande, plats, förtroende och svar på kundernas frågor. Jag gör gärna en kostnadsfri snabbgranskning och visar 3–5 konkreta saker att förbättra.",
      },
      {
        label: "Varmt / referens",
        text: "Hej {name}, {referrer} tipsade om att höra av mig. Jag kör en liten assisterad beta av Milo Growth — ett verktyg som gör en webbplats till ett tydligare och mer mätbart tillväxtsystem. Får jag göra en kostnadsfri granskning av er sida och visa några praktiska förbättringar?",
      },
      {
        label: "Uppföljning",
        text: "Hej {name}, följer bara upp den kostnadsfria granskningen jag erbjöd. Ingen press — om det är användbart skickar jag 3–5 konkreta förbättringar den här veckan.",
      },
      {
        label: "Efter granskning",
        text: "Hej {name}, här är din kostnadsfria granskning av AI- och SEO-beredskap. Viktigast att förbättra: {points}. Vill du ha en 15-minuters genomgång av hur Milo hjälper er att åtgärda detta på 30 dagar?",
      },
      {
        label: "Efter demo",
        text: "Tack för din tid, {name}. Som vi pratade om ger den assisterade betan en 30-dagars tillväxtplan, prioriterat innehåll, publiceringsklara utkast och tidig resultatuppföljning. Ska vi börja med projektuppsättning den här veckan?",
      },
    ],
  };

  return (
    <AppShell
      title={t("betaScreen.pageTitle")}
      description={t("betaScreen.pageDescription")}
      actions={
        <Button asChild variant="outline">
          <a href="/demo-script" target="_blank" rel="noreferrer">
            {t("betaScreen.publicDemo")}
          </a>
        </Button>
      }
    >
      <p className="mb-4 text-xs text-muted-foreground">{t("betaScreen.languageNote")}</p>
      {/* Quick nav */}
      <div className="rounded-lg border border-gold/40 bg-gold/5 px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">
          {t("betaScreen.validation")}
        </div>
        <p className="mt-1 text-sm text-foreground/85">{t("betaGuide.questions")}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ["goals", t("betaScreen.goals")],
            ["segments", t("betaScreen.segments")],
            ["qualify", t("betaScreen.qualify")],
            ["offer", t("betaScreen.offer")],
            ["pricing", t("betaScreen.pricing")],
            ["demo", t("betaScreen.demo")],
            ["discovery", t("betaScreen.discovery")],
            ["objections", t("betaScreen.objections")],
            ["outreach", t("betaScreen.outreach")],
            ["tracker", t("betaScreen.tracker")],
            ["feedback", t("betaScreen.feedback")],
            ["scorecard", t("betaScreen.scorecard")],
            ["decisions", t("betaScreen.decisions")],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-border bg-card px-3 py-1 hover:border-foreground/30"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <Section id="goals" icon={Target} title={t("betaScreen.goalsTitle")}>
          <p>{t("betaGuide.goalsIntro")}</p>
          <Bullets
            items={[
              t("betaGuide.goalUnderstanding"),
              t("betaGuide.goalMarket"),
              t("betaGuide.goalSegment"),
              t("betaGuide.goalValue"),
              t("betaGuide.goalPrice"),
              t("betaGuide.goalFeedback"),
            ]}
          />
        </Section>

        <Section id="segments" icon={Target} title={t("betaScreen.segmentsTitle")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">{t("betaGuide.segmentPoland")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("betaGuide.segmentPolandDetail")}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">{t("betaGuide.segmentSweden")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("betaGuide.segmentSwedenDetail")}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">{t("betaGuide.segmentCommerce")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("betaGuide.segmentCommerceDetail")}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">{t("betaGuide.segmentAgency")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("betaGuide.segmentAgencyDetail")}
              </p>
            </div>
          </div>
        </Section>

        <Section id="qualify" icon={ListChecks} title={t("betaScreen.qualifyTitle")}>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-emerald-600">{t("betaScreen.required")}</div>
              <Bullets
                items={[
                  t("betaGuide.requireWebsite"),
                  t("betaGuide.requireBusiness"),
                  t("betaGuide.requireDecisionMaker"),
                  t("betaGuide.requireOffer"),
                  t("betaGuide.requireNeed"),
                  t("betaGuide.requireBeta"),
                ]}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">
                {t("betaScreen.niceToHave")}
              </div>
              <Bullets
                items={[
                  t("betaGuide.niceCms"),
                  t("betaGuide.niceGsc"),
                  t("betaGuide.niceGbp"),
                  t("betaGuide.niceCopy"),
                  t("betaGuide.niceLocal"),
                  t("betaGuide.niceTraffic"),
                ]}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-amber-600">{t("betaScreen.avoid")}</div>
              <Bullets
                items={[
                  t("betaGuide.avoidEnterprise"),
                  t("betaGuide.avoidRegulated"),
                  t("betaGuide.avoidGuarantees"),
                  t("betaGuide.avoidMass"),
                  t("betaGuide.avoidCms"),
                  t("betaGuide.avoidNoWebsite"),
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="offer" icon={Shield} title={t("betaScreen.offerTitle")}>
          <p className="text-foreground">
            <span className="font-medium">{t("betaScreen.corePromise")}</span>{" "}
            {t("betaGuide.promise")}
          </p>
          <Bullets
            items={[
              t("betaGuide.offerAudit"),
              t("betaGuide.offerSetup"),
              t("betaGuide.offerReview"),
              t("betaGuide.offerPlan"),
              t("betaGuide.offerPriorities"),
              t("betaGuide.offerDrafts"),
              t("betaGuide.offerPublishing"),
              t("betaGuide.offerAnalytics"),
              t("betaGuide.offerAuthority"),
              t("betaGuide.offerSummary"),
            ]}
          />
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            {t("betaGuide.outcome")}
            <span className="font-medium"> {t("betaGuide.noGuarantees")}</span>
          </div>
        </Section>

        <Section id="pricing" icon={BarChart3} title={t("betaScreen.pricingTitle")}>
          <p className="text-xs text-muted-foreground">{t("betaGuide.pricingReference")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">{t("betaScreen.market")}</th>
                  <th className="py-2 pr-4">{t("betaScreen.assisted")}</th>
                  <th className="py-2 pr-4">{t("betaScreen.monthlyCare")}</th>
                  <th className="py-2">{t("betaScreen.founding")}</th>
                </tr>
              </thead>
              <tbody>
                {BETA_MARKETS.map(({ market, label }) => {
                  const cur = MARKET_CURRENCY[market];
                  return (
                    <tr key={market} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">{t(label)}</td>
                      <td className="py-2 pr-4">
                        {formatMoney(addOnPrice(market, "assistedSetup"), cur)}
                      </td>
                      <td className="py-2 pr-4">
                        {formatMoney(addOnPrice(market, "monthlyCare"), cur)}
                        {t("billing.perMonth")}
                      </td>
                      <td className="py-2 text-muted-foreground">{FOUNDING_BETA[market] ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("betaGuide.paymentHold")}</p>
        </Section>

        <Section id="demo" icon={GitBranch} title={t("betaScreen.demoTitle")}>
          <ol className="space-y-1.5 list-decimal pl-5">
            {[
              t("betaGuide.demoWebsite"),
              t("betaGuide.demoAudit"),
              t("betaGuide.demoScore"),
              t("betaGuide.demoPublic"),
              t("betaGuide.demoApp"),
              t("betaGuide.demoSetup"),
              t("betaGuide.demoBrand"),
              t("betaGuide.demoPlan"),
              t("betaGuide.demoDraft"),
              t("betaGuide.demoQuality"),
              t("betaGuide.demoPublishing"),
              t("betaGuide.demoMeasurement"),
              t("betaGuide.demoClose"),
            ].map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs">
            {t("betaGuide.demoHonesty")}
          </div>
        </Section>

        <Section id="discovery" icon={HelpCircle} title={t("betaScreen.discoveryTitle")}>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-foreground">{t("betaScreen.business")}</div>
              <Bullets
                items={[
                  t("betaGuide.discoveryCustomers"),
                  t("betaGuide.discoveryOffer"),
                  t("betaGuide.discoveryMarket"),
                  t("betaGuide.discoveryLeads"),
                  t("betaGuide.discoveryAds"),
                  t("betaGuide.discoveryGsc"),
                ]}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">
                {t("betaScreen.websiteContent")}
              </div>
              <Bullets
                items={[
                  t("betaGuide.discoveryEditor"),
                  t("betaGuide.discoveryFrequency"),
                  t("betaGuide.discoveryWriting"),
                  t("betaGuide.discoveryPages"),
                  t("betaGuide.discoverySearch"),
                ]}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">{t("betaScreen.decision")}</div>
              <Bullets
                items={[
                  t("betaGuide.discoveryValue"),
                  t("betaGuide.discoverySupport"),
                  t("betaGuide.discoveryPrice"),
                  t("betaGuide.discoveryBarrier"),
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="objections" icon={MessageSquare} title={t("betaScreen.objectionsTitle")}>
          {[
            [t("betaGuide.objectionChatgpt"), t("betaGuide.answerChatgpt")],
            [t("betaGuide.objectionRankings"), t("betaGuide.answerRankings")],
            [t("betaGuide.objectionAgency"), t("betaGuide.answerAgency")],
            [t("betaGuide.objectionTool"), t("betaGuide.answerTool")],
            [t("betaGuide.objectionAds"), t("betaGuide.answerAds")],
            [t("betaGuide.objectionSeo"), t("betaGuide.answerSeo")],
            [t("betaGuide.objectionAi"), t("betaGuide.answerAi")],
          ].map(([q, a]) => (
            <div key={q} className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">{q}</div>
              <p className="mt-1 text-sm text-foreground/80">{a}</p>
            </div>
          ))}
        </Section>

        <Section id="outreach" icon={MessageSquare} title={t("betaScreen.outreachTitle")}>
          <p className="text-xs text-muted-foreground">{t("betaGuide.outreachInstructions")}</p>
          <div className="flex gap-2">
            {(["en", "pl", "sv"] as const).map((l) => (
              <Button
                key={l}
                type="button"
                size="sm"
                variant={tab === l ? "default" : "outline"}
                onClick={() => setTab(l)}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            {outreach[tab].map((m) => (
              <CopyBlock key={m.label} label={m.label} text={m.text} />
            ))}
          </div>
        </Section>

        <Section id="tracker" icon={ClipboardList} title={t("betaScreen.trackerTitle")}>
          <p className="text-xs text-muted-foreground">{t("betaGuide.trackerInstructions")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTrackerCsv}>
              <Download className="h-3.5 w-3.5" /> {t("betaScreen.download")}
            </Button>
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">{t("betaScreen.fields")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRACKER_FIELDS.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-border bg-secondary/30 px-2.5 py-0.5 text-xs"
                >
                  {t(TRACKER_LABEL_KEYS[f])}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">{t("betaScreen.statuses")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRACKER_STATUSES.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-secondary/30 px-2.5 py-0.5 text-xs"
                >
                  {t(TRACKER_LABEL_KEYS[s])}
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section id="feedback" icon={MessageSquare} title={t("betaScreen.feedbackTitle")}>
          <div>
            <div className="text-xs font-medium text-foreground">{t("betaScreen.score")}</div>
            <Bullets
              items={[
                t("betaGuide.feedbackUnderstanding"),
                t("betaGuide.feedbackRelevance"),
                t("betaGuide.feedbackTrust"),
                t("betaGuide.feedbackInterest"),
                t("betaGuide.feedbackWillingness"),
                t("betaGuide.feedbackPricing"),
                t("betaGuide.feedbackRecommend"),
              ]}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">
              {t("betaScreen.openQuestions")}
            </div>
            <Bullets
              items={[
                t("betaGuide.feedbackUseful"),
                t("betaGuide.feedbackConfusing"),
                t("betaGuide.feedbackUnnecessary"),
                t("betaGuide.feedbackFirst"),
                t("betaGuide.feedbackPay"),
                t("betaGuide.feedbackFair"),
                t("betaGuide.feedbackSupport"),
              ]}
            />
          </div>
        </Section>

        <Section id="scorecard" icon={BarChart3} title={t("betaScreen.scorecardTitle")}>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-foreground">{t("betaScreen.awareness")}</div>
              <Bullets
                items={[
                  t("betaGuide.targetProspects"),
                  t("betaGuide.targetAudits"),
                  t("betaGuide.targetOutreach"),
                ]}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">
                {t("betaScreen.engagement")}
              </div>
              <Bullets
                items={[
                  t("betaGuide.targetReplies"),
                  t("betaGuide.targetBookings"),
                  t("betaGuide.targetDemos"),
                ]}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">
                {t("betaScreen.commercial")}
              </div>
              <Bullets
                items={[
                  t("betaGuide.targetCommitment"),
                  t("betaGuide.targetFollowups"),
                  t("betaGuide.targetObjections"),
                  t("betaGuide.targetScreens"),
                  t("betaGuide.targetImprovements"),
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="decisions" icon={GitBranch} title={t("betaScreen.decisionsTitle")}>
          <Bullets
            items={[
              t("betaGuide.decisionPrice"),
              t("betaGuide.decisionOnboarding"),
              t("betaGuide.decisionSupport"),
              t("betaGuide.decisionCms"),
              t("betaGuide.decisionGuarantees"),
              t("betaGuide.decisionClarity"),
            ]}
          />
        </Section>
      </div>
    </AppShell>
  );
}
