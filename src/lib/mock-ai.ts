import {
  getState,
  replaceNewOpportunities,
  replacePlannedCalendar,
  upsertContent,
  uid,
} from "./store";
import type {
  Opportunity,
  CalendarItem,
  ContentAsset,
  Language,
} from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const opportunityLibrary: Record<string, Omit<Opportunity, "id" | "projectId" | "status">[]> = {
  synergy: [
    { title: "Massage för löpare i Malmö — återhämtning efter långpass", language: "Swedish", contentType: "Landing Page", searchIntent: "Commercial", targetAudience: "Löpare i Skåne", businessValue: "Säsongsbaserad efterfrågan, hög intent", recommendedCta: "Boka återhämtningssession", priority: "High" },
    { title: "Triggerpunktsmassage vs djupgående — vad är skillnaden?", language: "Swedish", contentType: "Blog Article", searchIntent: "Informational", targetAudience: "Forskande klienter", businessValue: "AI overview-vänligt jämförelseinnehåll", recommendedCta: "Hitta rätt behandling", priority: "Medium" },
    { title: "Massage near Triangeln station — evening appointments", language: "English", contentType: "Location Page", searchIntent: "Transactional", targetAudience: "Pendlare och expats", businessValue: "Hyperlokal kommersiell sökning", recommendedCta: "See tonight's slots", priority: "High" },
  ],
  andersen: [
    { title: "What is a fractional product team and when do you need one?", language: "English", contentType: "Guide", searchIntent: "Informational", targetAudience: "Seed-stage founders", businessValue: "Builds authority for senior buyers", recommendedCta: "Talk to the studio", priority: "High" },
    { title: "Discovery sprint: a 14-day playbook (with template)", language: "English", contentType: "Landing Page", searchIntent: "Commercial", targetAudience: "Founders ready to commit", priority: "High", businessValue: "Direct service conversion", recommendedCta: "Book a discovery sprint" },
    { title: "Bygga MVP i Norden — vad det kostar 2026", language: "Swedish", contentType: "Blog Article", searchIntent: "Commercial", targetAudience: "Svenska grundare", businessValue: "Öppnar svensk marknad", recommendedCta: "Boka introsamtal", priority: "Medium" },
  ],
  "si-longevity": [
    { title: "Hydrogen water bottle EU guide: certifications that actually matter", language: "English", contentType: "Guide", searchIntent: "Commercial", targetAudience: "EU consumers vetting brands", businessValue: "Differentiation by trust signals", recommendedCta: "See the H2 Pro spec sheet", priority: "High" },
    { title: "NMN dosering — vad säger forskningen från 2024?", language: "Swedish", contentType: "Blog Article", searchIntent: "Informational", targetAudience: "Svenska longevity-konsumenter", businessValue: "Top-of-funnel SE-marknad", recommendedCta: "Utforska NMN 500mg", priority: "Medium" },
    { title: "Suplementacja długowieczności — od czego zacząć", language: "Polish", contentType: "Guide", searchIntent: "Informational", targetAudience: "Polski rynek premium wellness", businessValue: "Pierwszeństwo w nowej kategorii PL", recommendedCta: "Zobacz katalog", priority: "Medium" },
  ],
};

export async function generateSeoOpportunities(projectId: string) {
  await wait(900);
  const seeds = opportunityLibrary[projectId] ?? opportunityLibrary["andersen"];
  const items: Opportunity[] = seeds.map((s) => ({
    ...s,
    id: uid(),
    projectId,
    status: "New",
  }));
  replaceNewOpportunities(projectId, items);
  return items;
}

export async function generateContentCalendar(projectId: string) {
  await wait(800);
  // Prefer high-priority opportunities first, then medium, then others; cap at 8.
  const ranked = getState()
    .opportunities.filter((o) => o.projectId === projectId && o.status !== "Discarded")
    .slice()
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 } as const;
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 8);
  const today = new Date();
  const items: CalendarItem[] = ranked.map((o, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + (i + 1) * 3);
    return {
      id: uid(),
      projectId,
      opportunityId: o.id,
      plannedDate: d.toISOString().slice(0, 10),
      topicTitle: o.title,
      language: o.language,
      contentType: o.contentType,
      searchIntent: o.searchIntent,
      recommendedCta: o.recommendedCta,
      status: "Planned",
    };
  });
  replacePlannedCalendar(projectId, items);
  return items;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function exampleFaq(lang: Language) {
  if (lang === "Swedish")
    return [
      { q: "Hur snabbt kan jag se resultat?", a: "De flesta klienter märker skillnad efter första besöket; varaktig effekt brukar komma efter 3–4 tillfällen." },
      { q: "Vad ingår i priset?", a: "Konsultation, behandling och en kort återhämtningsplan att ta med hem." },
    ];
  if (lang === "Polish")
    return [
      { q: "Czy produkt jest bezpieczny przy codziennym użyciu?", a: "Tak, produkt jest przebadany pod kątem codziennego stosowania i posiada certyfikaty UE." },
      { q: "Jak długo trwa dostawa do Polski?", a: "Standardowa dostawa do Polski zajmuje 3–5 dni roboczych." },
    ];
  return [
    { q: "How quickly can I expect results?", a: "Most clients see a measurable difference within the first two weeks of consistent use." },
    { q: "Do you offer a guarantee?", a: "Yes — every order ships with a 30-day satisfaction guarantee and a 2-year hardware warranty." },
  ];
}

export async function generateLandingPageBrief(opportunityId: string) {
  await wait(700);
  const opp = getState().opportunities.find((o) => o.id === opportunityId)!;
  const asset: ContentAsset = {
    id: uid(),
    projectId: opp.projectId,
    opportunityId: opp.id,
    title: opp.title,
    slug: slugify(opp.title),
    metaTitle: opp.title.slice(0, 58),
    metaDescription:
      "Brief overview that addresses the search intent in one calm sentence and points to a single clear next step.",
    h1: opp.title,
    outline: [
      "Hook: the specific problem in the reader's words",
      "Why this matters now (2026 context)",
      "Our approach — what makes it different",
      "What you get, step by step",
      "Pricing, timing & guarantees",
      "FAQ",
      "Single CTA",
    ],
    faq: exampleFaq(opp.language),
    cta: opp.recommendedCta,
    markdown: `# ${opp.title}\n\n_Draft landing page brief — replace each section with finalized copy._\n\n## The problem\nWrite the problem in the customer's own language.\n\n## Our approach\nThree to five sentences. No fluff.\n\n## What you get\n- Outcome 1\n- Outcome 2\n- Outcome 3\n\n## Pricing & next step\nState the price band and a single call to action.\n`,
    internalLinks: ["/about", "/pricing", "/contact"],
    schemaSuggestions: ["WebPage", "Service", "FAQPage", "BreadcrumbList"],
    editorNotes: "Brief generated. Add proof points and one hero image before review.",
    status: "Draft",
    updatedAt: new Date().toISOString(),
  };
  upsertContent(asset);
  return asset;
}

export async function generateArticleDraft(opportunityId: string) {
  await wait(1100);
  const opp = getState().opportunities.find((o) => o.id === opportunityId)!;
  const asset: ContentAsset = {
    id: uid(),
    projectId: opp.projectId,
    opportunityId: opp.id,
    title: opp.title,
    slug: slugify(opp.title),
    metaTitle: opp.title.slice(0, 58),
    metaDescription:
      "Calm, evidence-led answer to the reader's question, structured for AI overviews and human scanning.",
    h1: opp.title,
    outline: [
      "Short, direct answer in 2–3 sentences",
      "Why the question matters",
      "Key factors, with examples",
      "What to do next",
      "Sources & further reading",
      "FAQ",
    ],
    faq: exampleFaq(opp.language),
    cta: opp.recommendedCta,
    markdown: `# ${opp.title}\n\n**Short answer.** Two or three sentences that directly answer the query so an AI overview can cite it cleanly.\n\n## Why it matters\nContext paragraph — keep it grounded in the reader's situation.\n\n## What to consider\n1. Factor one — explain in plain language.\n2. Factor two — back with one concrete example.\n3. Factor three — note common mistakes.\n\n## What to do next\nOne sentence pointing to ${opp.recommendedCta}.\n\n## Sources\n- Replace with linked, dated citations.\n`,
    internalLinks: ["/blog", "/services"],
    schemaSuggestions: ["Article", "FAQPage", "BreadcrumbList"],
    editorNotes: "Draft generated. Add two citations and a featured image with descriptive alt text.",
    status: "Draft",
    updatedAt: new Date().toISOString(),
  };
  upsertContent(asset);
  return asset;
}

export async function generateMetadata(contentAssetId: string) {
  await wait(500);
  const a = getState().content.find((c) => c.id === contentAssetId)!;
  upsertContent({
    ...a,
    metaTitle: (a.title + " | Andersen").slice(0, 58),
    metaDescription:
      "Regenerated meta description — one calm sentence covering primary keyword, value and a soft next step. Under 158 characters.",
    updatedAt: new Date().toISOString(),
  });
}

export async function generateFaq(contentAssetId: string) {
  await wait(500);
  const a = getState().content.find((c) => c.id === contentAssetId)!;
  upsertContent({ ...a, faq: exampleFaq("English"), updatedAt: new Date().toISOString() });
}

export async function generateCta(contentAssetId: string) {
  await wait(400);
  const a = getState().content.find((c) => c.id === contentAssetId)!;
  const variants = ["Start the conversation", "Book a 20-minute intro", "See the next steps", "Reserve your slot"];
  upsertContent({
    ...a,
    cta: variants[Math.floor(Math.random() * variants.length)],
    updatedAt: new Date().toISOString(),
  });
}
