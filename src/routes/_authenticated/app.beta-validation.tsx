import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { addOnPrice, formatMoney, MARKET_CURRENCY, type BillingMarket } from "@/lib/billing";
import { ClipboardList, Copy, Download, Lock, Target, MessageSquare, ListChecks, BarChart3, GitBranch, HelpCircle, Shield } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/beta-validation")({
  head: () => ({
    meta: [
      { title: "Beta validation — Milo Growth" },
      { name: "description", content: "Internal beta demo & sales validation operating pack (owner only)." },
    ],
  }),
  component: BetaValidationPage,
});

// ---- pricing table (derived from the billing module so it never drifts) ----
const BETA_MARKETS: { market: BillingMarket; label: string }[] = [
  { market: "Poland", label: "Poland" },
  { market: "Sweden", label: "Sweden" },
  { market: "Denmark", label: "Denmark" },
  { market: "United Kingdom", label: "UK" },
  { market: "European Union", label: "EU" },
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
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</span>
      </div>
      <div className="p-5 space-y-4 text-sm text-foreground/85">{children}</div>
    </section>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
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
              toast.success("Copied");
            } catch {
              toast.error("Could not copy");
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copy
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

function downloadTrackerCsv() {
  const header = TRACKER_FIELDS.join(",");
  const example =
    'Synergy Massage,https://example.com,Sweden,B,Owner,Email,Referral,Identified,,Weak service copy,Founding beta,2500 SEK,,,,,Run free audit';
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
  const [tab, setTab] = useState<"pl" | "en" | "sv">("en");

  if (!isOwner) {
    return (
      <AppShell title="Beta validation" description="Internal owner tools">
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center">
          <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            This page is an internal sales & validation playbook, available to the workspace owner only.
          </p>
          <Link to="/app">
            <Button className="mt-4" variant="outline">Back to dashboard</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const outreach = {
    en: [
      { label: "Cold message", text: "Hi {name} — I built a quick tool that checks whether a business website is clear for modern SEO and AI search. It's not about magic ranking promises — more about whether your site clearly shows your offer, location, trust and answers to customer questions. Happy to run a free quick audit and show you 3–5 concrete things to improve." },
      { label: "Warm / referral", text: "Hi {name} — {referrer} suggested I reach out. I'm running a small assisted beta of Milo Growth, a tool that turns a website into a clearer, more measurable growth system. Could I run a free audit of your site and show you a few practical improvements?" },
      { label: "Follow-up", text: "Hi {name} — just following up on the quick website audit I offered. No pressure — if it's useful I can send 3–5 specific improvements for your site this week." },
      { label: "Post-audit", text: "Hi {name} — here's your free AI Visibility Readiness audit. Top things to improve: {points}. Want a 15-minute walkthrough of how Milo would help you action these over 30 days?" },
      { label: "Post-demo follow-up", text: "Thanks for your time, {name}. As discussed, the Assisted Beta gets you a 30-day growth plan, prioritized content, publish-ready drafts and early performance tracking. Shall we start with project setup this week?" },
    ],
    pl: [
      { label: "Wiadomość cold", text: "Cześć {name}, zrobiłem krótkie narzędzie, które sprawdza, czy strona firmy jest czytelna dla nowoczesnego SEO i AI search. Nie chodzi o magiczne obietnice rankingów — bardziej o to, czy strona jasno pokazuje ofertę, lokalizację, zaufanie i odpowiedzi na pytania klientów. Mogę zrobić Ci darmowy szybki audit i pokazać 3–5 konkretnych rzeczy do poprawy." },
      { label: "Wiadomość z polecenia", text: "Cześć {name}, {referrer} podpowiedział, żeby się odezwać. Prowadzę małą asystowaną betę Milo Growth — narzędzia, które zamienia stronę w jaśniejszy i mierzalny system wzrostu. Mogę zrobić darmowy audit Twojej strony i pokazać kilka praktycznych usprawnień?" },
      { label: "Follow-up", text: "Cześć {name}, wracam w sprawie darmowego auditu strony, który proponowałem. Bez presji — jeśli to przydatne, mogę w tym tygodniu przesłać 3–5 konkretnych rzeczy do poprawy." },
      { label: "Po audycie", text: "Cześć {name}, oto Twój darmowy audit gotowości na AI i SEO. Najważniejsze do poprawy: {points}. Chcesz 15-minutowe omówienie, jak Milo pomoże to wdrożyć w 30 dni?" },
      { label: "Po demo", text: "Dzięki za czas, {name}. Tak jak rozmawialiśmy — Asystowana Beta daje plan wzrostu na 30 dni, priorytety treści, gotowe do publikacji szkice i wczesne śledzenie wyników. Zaczynamy od konfiguracji projektu w tym tygodniu?" },
    ],
    sv: [
      { label: "Kallt meddelande", text: "Hej {name}, jag har byggt ett enkelt verktyg som kollar om en företagswebbplats är tydlig för modern SEO och AI-sökning. Det handlar inte om magiska placeringslöften — mer om huruvida sidan tydligt visar ert erbjudande, plats, förtroende och svar på kundernas frågor. Jag gör gärna en kostnadsfri snabbgranskning och visar 3–5 konkreta saker att förbättra." },
      { label: "Varmt / referens", text: "Hej {name}, {referrer} tipsade om att höra av mig. Jag kör en liten assisterad beta av Milo Growth — ett verktyg som gör en webbplats till ett tydligare och mer mätbart tillväxtsystem. Får jag göra en kostnadsfri granskning av er sida och visa några praktiska förbättringar?" },
      { label: "Uppföljning", text: "Hej {name}, följer bara upp den kostnadsfria granskningen jag erbjöd. Ingen press — om det är användbart skickar jag 3–5 konkreta förbättringar den här veckan." },
      { label: "Efter granskning", text: "Hej {name}, här är din kostnadsfria granskning av AI- och SEO-beredskap. Viktigast att förbättra: {points}. Vill du ha en 15-minuters genomgång av hur Milo hjälper er att åtgärda detta på 30 dagar?" },
      { label: "Efter demo", text: "Tack för din tid, {name}. Som vi pratade om ger den assisterade betan en 30-dagars tillväxtplan, prioriterat innehåll, publiceringsklara utkast och tidig resultatuppföljning. Ska vi börja med projektuppsättning den här veckan?" },
    ],
  };

  return (
    <AppShell
      title="Beta demo & sales validation"
      description="Internal operating pack for running the Milo Growth assisted beta. Owner only."
      actions={
        <a href="/demo-script" target="_blank" rel="noreferrer">
          <Button variant="outline">Public demo script</Button>
        </a>
      }
    >
      {/* Quick nav */}
      <div className="rounded-lg border border-gold/40 bg-gold/5 px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-gold">Validation questions</div>
        <p className="mt-1 text-sm text-foreground/85">
          This sprint answers: do owners understand Milo quickly · which market reacts best (PL/SE/DK/UK/EU) ·
          which segment (wellness, local services, consultants, clinics, e-commerce) · which promise resonates
          (audit, publishing, analytics proof, connectors, authority) · are people willing to pay · what to improve next.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ["goals", "Goals"],
            ["segments", "Segments"],
            ["qualify", "Qualification"],
            ["offer", "Beta offer"],
            ["pricing", "Pricing"],
            ["demo", "Demo flow"],
            ["discovery", "Discovery"],
            ["objections", "Objections"],
            ["outreach", "Outreach"],
            ["tracker", "Tracker"],
            ["feedback", "Feedback"],
            ["scorecard", "Scorecard"],
            ["decisions", "Decision rules"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-border bg-card px-3 py-1 hover:border-foreground/30">
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <Section id="goals" icon={Target} title="Beta goals">
          <p>Run a structured validation with the first 20–30 prospects to learn what to improve before a wider, paid, self-service launch. This is a sales/demo/readiness process — not a product-feature sprint.</p>
          <Bullets items={[
            "Confirm small business owners understand Milo within the first few minutes.",
            "Identify the strongest market (Poland, Sweden, Denmark, UK/EU).",
            "Identify the strongest segment (wellness/beauty, local services, consultants, clinics, e-commerce).",
            "Find the promise that resonates most (audit / publishing / analytics proof / connectors / authority).",
            "Test real willingness to pay and acceptable price points.",
            "Capture the top objections, confusing screens and requested improvements.",
          ]} />
        </Section>

        <Section id="segments" icon={Target} title="Target segments">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">A — Poland wellness / local service</div>
              <p className="mt-1 text-xs text-muted-foreground">Beauty salons, massage therapists, physiotherapists, wellness/longevity studios, small clinics, local services. Lower friction, owner's Polish network, accessible pricing, strong pain around weak websites.</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">B — Sweden wellness / local service</div>
              <p className="mt-1 text-xs text-muted-foreground">Massage/wellness studios, clinics, consultants, premium local service brands. Owner is local, higher pricing potential, Synergy Massage demo relevance, trust/premium positioning.</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">C — Small e-commerce</div>
              <p className="mt-1 text-xs text-muted-foreground">Shopify/Woo/WordPress stores, wellness products, local product brands, niche e-commerce. Shopify connector + content/GSC/authority workflow; can justify Growth/Pro later.</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">D — Agencies / freelancers</div>
              <p className="mt-1 text-xs text-muted-foreground">Web designers, small SEO freelancers, marketing consultants. Pro-plan potential and multi-client use, but more critical and harder to convince — test last.</p>
            </div>
          </div>
        </Section>

        <Section id="qualify" icon={ListChecks} title="Qualification criteria">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-emerald-600">Required</div>
              <Bullets items={["Existing website", "Active business", "Accessible decision-maker", "Visible service/product offer", "Need for better content/visibility", "Willing to try a guided beta"]} />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Nice to have</div>
              <Bullets items={["WordPress or Shopify site", "Google Search Console access", "Google Business Profile", "Weak/unclear website copy", "Local market focus", "Existing traffic or ad spend"]} />
            </div>
            <div>
              <div className="text-xs font-medium text-amber-600">Avoid (first beta)</div>
              <Bullets items={["Enterprise companies", "Heavily regulated medical/legal/finance claims", "Demands of guaranteed rankings", "Wanting cheap mass AI articles", "Complex custom CMS", "No website at all"]} />
            </div>
          </div>
        </Section>

        <Section id="offer" icon={Shield} title="Beta offer — Milo Growth Assisted Beta">
          <p className="text-foreground"><span className="font-medium">Core promise:</span> In 30 days, we help you turn your website into a clearer, more measurable growth system.</p>
          <Bullets items={[
            "Free AI Visibility Readiness Audit",
            "Milo project setup + Brand Intelligence setup",
            "Website/content gap review",
            "First 30-day growth plan",
            "3–5 prioritized content opportunities",
            "1–2 publish-ready drafts with Milo Score",
            "Publishing support if technically possible",
            "Analytics setup guidance + GSC Lite import support if available",
            "Authority Builder starter list",
            "Review summary and next actions",
          ]} />
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            Safe outcome: the client leaves with a clearer growth plan, better content priorities, a publishing workflow and early performance tracking.
            <span className="font-medium"> Never promise rankings, revenue, traffic or AI citations.</span>
          </div>
        </Section>

        <Section id="pricing" icon={BarChart3} title="Pricing for validation">
          <p className="text-xs text-muted-foreground">Assisted Beta = one-time Assisted Setup price; Monthly Care = recurring. Figures mirror the live billing catalogue (Sprint 14). Founding-beta is for the first pilots only.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Market</th>
                  <th className="py-2 pr-4">Assisted Beta (one-time)</th>
                  <th className="py-2 pr-4">Monthly Care</th>
                  <th className="py-2">Founding beta (pilots)</th>
                </tr>
              </thead>
              <tbody>
                {BETA_MARKETS.map(({ market, label }) => {
                  const cur = MARKET_CURRENCY[market];
                  return (
                    <tr key={market} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">{label}</td>
                      <td className="py-2 pr-4">{formatMoney(addOnPrice(market, "assistedSetup"), cur)}</td>
                      <td className="py-2 pr-4">{formatMoney(addOnPrice(market, "monthlyCare"), cur)}/mo</td>
                      <td className="py-2 text-muted-foreground">{FOUNDING_BETA[market] ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Label founding pricing clearly: "Founding beta price for first pilot businesses only." Do not make the product look cheap. Live card payments are pending company/Paddle setup — for beta, activation is manual (owner-set status in Billing).</p>
        </Section>

        <Section id="demo" icon={GitBranch} title="Demo flow (12–13 steps)">
          <ol className="space-y-1.5 list-decimal pl-5">
            {[
              "Start with their website (or a known demo site).",
              "Run the Free AI Visibility Audit live.",
              "Explain the score: readiness, not rankings.",
              "Show the public beta/market page briefly.",
              "Open the Milo app.",
              "Show onboarding / project setup.",
              "Show Brand Intelligence.",
              "Show Opportunities.",
              "Generate or show a content draft.",
              "Show Milo Score and Improve Draft.",
              "Show the publishing connector path.",
              "Show Analytics v2 + GSC Lite + Authority Builder.",
              "Close with the 30-day beta offer and the next step.",
            ].map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs">
            Talk track: "Milo does not just write content. It connects planning, content, publishing and measurement." If a connector or live payment isn't ready in the demo, say: "This part is architecture-ready. For assisted beta, setup is guided and we confirm connector/payment details before going live."
          </div>
        </Section>

        <Section id="discovery" icon={HelpCircle} title="Discovery questions">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-foreground">Business</div>
              <Bullets items={["What customers do you want more of?", "Which services/products matter most now?", "Which market/location matters most?", "Is your website bringing inquiries/sales?", "Running Google/social ads?", "Do you have Search Console?"]} />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Website / content</div>
              <Bullets items={["Who updates your website now?", "How often do you publish?", "What's hard about writing content?", "Do you know which pages perform best?", "Do you know what people search before contacting you?"]} />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Decision</div>
              <Bullets items={["What would make this worth paying for?", "Self-service, guided setup, or monthly help?", "What monthly price would feel acceptable?", "What would stop you from using this?"]} />
            </div>
          </div>
        </Section>

        <Section id="objections" icon={MessageSquare} title="Objection handling">
          {[
            ["“Is this just ChatGPT writing blogs?”", "No. Milo connects the whole workflow: audit, planning, brand rules, content generation, quality scoring, publishing, analytics, GSC import and authority tasks. The goal is a repeatable growth system, not just text."],
            ["“Can you guarantee rankings?”", "No — and Milo deliberately avoids that promise. It improves readiness, clarity, content quality, publishing consistency and measurement. Rankings and traffic depend on many external factors."],
            ["“I already have a website agency.”", "Great — Milo works alongside them. It identifies content/visibility opportunities, prepares drafts and tracks what happens after publishing. Your agency still handles design, technical work and approvals."],
            ["“I don't want another tool.”", "That's why the beta is assisted. We set up the project, prepare the first plan and guide the first content/publishing cycle — you don't learn it all alone."],
            ["“Why not just use Google Ads?”", "Ads stop when spending stops. Milo improves the underlying website content and visibility system, so the site becomes clearer and more measurable over time."],
            ["“Is this SEO?”", "Partly. Milo includes SEO readiness, AI visibility readiness, content planning, publishing and measurement — more a website growth workflow than a traditional SEO tool."],
            ["“Is AI content safe?”", "Milo treats AI output as a draft. Brand Intelligence, Milo Score and review notes reduce risk, but the business reviews content before publishing."],
          ].map(([q, a]) => (
            <div key={q} className="rounded-md border border-border p-3">
              <div className="font-medium text-foreground">{q}</div>
              <p className="mt-1 text-sm text-foreground/80">{a}</p>
            </div>
          ))}
        </Section>

        <Section id="outreach" icon={MessageSquare} title="Outreach templates (PL / EN / SV)">
          <p className="text-xs text-muted-foreground">Human, not spammy. No fake urgency, no ranking guarantees. Lead with the free audit and 3–5 practical improvements. Replace {"{name}"}, {"{referrer}"} and {"{points}"}.</p>
          <div className="flex gap-2">
            {(["en", "pl", "sv"] as const).map((l) => (
              <Button key={l} type="button" size="sm" variant={tab === l ? "default" : "outline"} onClick={() => setTab(l)}>
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

        <Section id="tracker" icon={ClipboardList} title="Prospect tracker template">
          <p className="text-xs text-muted-foreground">A lightweight template, not a CRM. Track in a spreadsheet — download the CSV header below. Do not store prospect data in the app.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTrackerCsv}>
              <Download className="h-3.5 w-3.5" /> Download CSV template
            </Button>
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">Fields</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRACKER_FIELDS.map((f) => (
                <span key={f} className="rounded-full border border-border bg-secondary/30 px-2.5 py-0.5 text-xs">{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">Statuses</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRACKER_STATUSES.map((s) => (
                <span key={s} className="rounded-full border border-border bg-secondary/30 px-2.5 py-0.5 text-xs">{s}</span>
              ))}
            </div>
          </div>
        </Section>

        <Section id="feedback" icon={MessageSquare} title="Post-demo feedback template">
          <div>
            <div className="text-xs font-medium text-foreground">Score 1–5</div>
            <Bullets items={["Understood value", "Relevance to business", "Trust in AI output", "Interest in assisted beta", "Willingness to pay", "Clarity of pricing", "Likelihood to recommend"]} />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">Open questions</div>
            <Bullets items={["What part was most useful?", "What was confusing?", "What felt unnecessary?", "What would you want first?", "What would make you pay?", "What price feels fair?", "Self-service or guided support?"]} />
          </div>
        </Section>

        <Section id="scorecard" icon={BarChart3} title="Validation scorecard (first 20 prospects)">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-foreground">Awareness</div>
              <Bullets items={["20 prospects identified", "10 free audits run", "10 outreach messages sent"]} />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Engagement</div>
              <Bullets items={["5 replies", "3 demos booked", "2 demos completed"]} />
            </div>
            <div>
              <div className="text-xs font-medium text-foreground">Commercial + learning</div>
              <Bullets items={["1 paid/committed beta", "2 warm follow-ups", "Top 5 objections collected", "Top 5 confusing screens", "Top 5 requested improvements"]} />
            </div>
          </div>
        </Section>

        <Section id="decisions" icon={GitBranch} title="Decision rules for what to improve next">
          <Bullets items={[
            "Understand Milo but don't pay → refine pricing/offer.",
            "Like the audit but not the app → improve the audit-to-onboarding handoff.",
            "Want done-for-you → emphasize Assisted Beta / Monthly Care.",
            "Ask for WordPress/Shopify → prioritize live E2E testing and docs.",
            "Ask for guarantees → strengthen safe expectation-setting.",
            "Are confused → simplify public/beta messaging.",
          ]} />
        </Section>
      </div>
    </AppShell>
  );
}
