/**
 * Seed data for the demo brands (Synergy Massage, Andersen Innovations,
 * SI Longevity). All timestamps are pinned to `SEED_ANCHOR` so SSR and
 * client snapshots match. This file is the single source of fixtures —
 * no other module should hard-code demo content.
 */
import type { Project, ServiceItem, Opportunity, CalendarItem, ContentAsset } from "./types";

export const seedProjects: Project[] = [
  {
    id: "synergy",
    name: "Synergy Massage",
    websiteUrl: "https://synergymassage.se",
    businessName: "Synergy Massage",
    businessType: "Premium massage studio",
    primaryLanguage: "Swedish",
    additionalLanguages: ["English", "Polish"],
    mainLocation: "Malmö, Sweden",
    targetLocations: ["Malmö", "Lund", "Limhamn", "Hyllie"],
    description:
      "A premium massage studio in central Malmö specialising in deep tissue, sports recovery and stress-relief treatments for professionals and athletes.",
    targetAudience: "Professionals 30–55, athletes, expats in Skåne",
    toneOfVoice: "Calm, confident, expert. Warm but not casual.",
    uniqueSellingPoints:
      "Therapists with 10+ years clinical experience, quiet design-led studio, evening bookings, multilingual staff.",
    brandNotes: "Avoid spa/wellness clichés. No emojis. Focus on outcomes, not pampering.",
  },
  {
    id: "andersen",
    name: "Andersen Innovations",
    websiteUrl: "https://andersen-innovations.com",
    businessName: "Andersen Innovations",
    businessType: "Business innovation studio",
    primaryLanguage: "English",
    additionalLanguages: ["Swedish"],
    mainLocation: "Malmö, Sweden",
    targetLocations: ["Nordics", "EU", "UK"],
    description:
      "An innovation studio that helps founders and operators turn validated ideas into shipped products — strategy, design, and lean engineering under one roof.",
    targetAudience: "Founders, CPOs and innovation leads at scaling SMBs",
    toneOfVoice: "Precise, calm, senior. No hype.",
    uniqueSellingPoints:
      "Operator-led team, in-house strategy + build, transparent weekly delivery cadence.",
    brandNotes: "Never use the word 'disrupt'. Plain English over jargon.",
  },
  {
    id: "si-longevity",
    name: "SI Longevity",
    websiteUrl: "https://silongevity.com",
    businessName: "SI Longevity",
    businessType: "Longevity & hydrogen wellness e-commerce",
    primaryLanguage: "English",
    additionalLanguages: ["Swedish", "Polish"],
    mainLocation: "EU (ships from Sweden)",
    targetLocations: ["Sweden", "Germany", "Poland", "United Kingdom"],
    description:
      "Direct-to-consumer brand selling portable molecular hydrogen bottles and longevity-focused supplements, backed by published research.",
    targetAudience: "Health-conscious adults 35–65, biohackers, endurance athletes",
    toneOfVoice: "Evidence-led, optimistic, measured. Never miracle claims.",
    uniqueSellingPoints:
      "Third-party tested, medical-grade titanium electrolysis, 2-year warranty, EU shipping.",
    brandNotes: "Cite mechanism, not hype. Compliant with EU health claims regulation.",
  },
];

export const seedServices: ServiceItem[] = [
  { id: "s1", projectId: "synergy", name: "Deep Tissue Massage", kind: "Service", description: "60/90 min deep tissue session targeting chronic tension.", targetAudience: "Desk-bound professionals", locationRelevance: "Malmö centrum", priority: "High" },
  { id: "s2", projectId: "synergy", name: "Sports Recovery", kind: "Service", description: "Recovery protocol for runners and cyclists.", targetAudience: "Amateur and semi-pro athletes", locationRelevance: "Malmö, Lund", priority: "High" },
  { id: "s3", projectId: "synergy", name: "Pregnancy Massage", kind: "Service", description: "Gentle prenatal treatment from trimester 2.", targetAudience: "Expecting mothers", locationRelevance: "Malmö", priority: "Medium" },
  { id: "a1", projectId: "andersen", name: "Product Discovery Sprint", kind: "Service", description: "Two-week sprint to de-risk a new product bet.", targetAudience: "Founders pre-build", locationRelevance: "Remote / Nordics", priority: "High" },
  { id: "a2", projectId: "andersen", name: "MVP Build", kind: "Service", description: "8–12 week lean engineering build of a launchable MVP.", targetAudience: "Funded startups", locationRelevance: "EU", priority: "High" },
  { id: "l1", projectId: "si-longevity", name: "H2 Hydrogen Bottle Pro", kind: "Product", description: "Portable molecular hydrogen bottle, 3-min cycle.", targetAudience: "Daily wellness users", locationRelevance: "EU", priority: "High" },
  { id: "l2", projectId: "si-longevity", name: "NMN Capsules 500mg", kind: "Product", description: "Pharmaceutical-grade NMN, 60 capsules.", targetAudience: "Longevity-focused 40+", locationRelevance: "EU", priority: "Medium" },
];

// Fixed seed anchor so SSR and client snapshots match (no Date.now() at module init).
const SEED_ANCHOR = "2026-06-21T09:00:00.000Z";
const dayOffset = (n: number) => {
  const d = new Date(SEED_ANCHOR);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const seedOpportunities: Opportunity[] = [
  { id: "o1", projectId: "synergy", title: "Djupgående massage Malmö — för stelhet i nacke och axlar", language: "Swedish", contentType: "Service Page", searchIntent: "Commercial", targetAudience: "Kontorsarbetare i Malmö", businessValue: "Hög konvertering, lokal kommersiell sökning", recommendedCta: "Boka 60-minuters behandling", priority: "High", status: "New" },
  { id: "o2", projectId: "synergy", title: "Sports massage in Malmö for runners training for Copenhagen Marathon", language: "English", contentType: "Landing Page", searchIntent: "Commercial", targetAudience: "Expat runners in Öresund region", businessValue: "Captures English-speaking athlete segment", recommendedCta: "Book recovery session", priority: "High", status: "New" },
  { id: "o3", projectId: "synergy", title: "Hur ofta bör man gå på massage? Guide från legitimerad terapeut", language: "Swedish", contentType: "Blog Article", searchIntent: "Informational", targetAudience: "Första-gångs-kunder", businessValue: "Top-of-funnel trust, AI overview eligible", recommendedCta: "Boka konsultation", priority: "Medium", status: "New" },
  { id: "o4", projectId: "andersen", title: "How to validate a B2B product idea in 14 days", language: "English", contentType: "Guide", searchIntent: "Informational", targetAudience: "Pre-seed founders", businessValue: "Authority + lead magnet for Discovery Sprint", recommendedCta: "Book a discovery call", priority: "High", status: "New" },
  { id: "o5", projectId: "andersen", title: "Innovation studio vs agency vs in-house: how to choose", language: "English", contentType: "Comparison", searchIntent: "Commercial", targetAudience: "CPOs evaluating partners", businessValue: "Bottom-of-funnel decision content", recommendedCta: "Compare your options", priority: "High", status: "New" },
  { id: "o6", projectId: "si-longevity", title: "Molecular hydrogen water: what the 2024 research actually shows", language: "English", contentType: "Guide", searchIntent: "Informational", targetAudience: "Skeptical biohackers", businessValue: "Trust-building cornerstone content", recommendedCta: "Explore the H2 Pro bottle", priority: "High", status: "New" },
  { id: "o7", projectId: "si-longevity", title: "Wodór cząsteczkowy — czy butelka H2 naprawdę działa?", language: "Polish", contentType: "Blog Article", searchIntent: "Informational", targetAudience: "Polski rynek wellness", businessValue: "Otwiera kanał PL z niską konkurencją", recommendedCta: "Zobacz butelkę H2 Pro", priority: "Medium", status: "New" },
  { id: "o8", projectId: "si-longevity", title: "NMN vs NR: which longevity supplement is right for you?", language: "English", contentType: "Comparison", searchIntent: "Commercial", targetAudience: "Longevity-curious 40+", businessValue: "Drives NMN product page conversions", recommendedCta: "Shop NMN 500mg", priority: "Medium", status: "New" },
];

export const seedCalendar: CalendarItem[] = seedOpportunities.slice(0, 8).map((o, i) => ({
  id: "c" + (i + 1),
  projectId: o.projectId,
  opportunityId: o.id,
  plannedDate: dayOffset(i * 3 + 2),
  topicTitle: o.title,
  language: o.language,
  contentType: o.contentType,
  searchIntent: o.searchIntent,
  recommendedCta: o.recommendedCta,
  status: i === 0 ? "In Progress" : "Planned",
}));

export const seedContent: ContentAsset[] = [
  {
    id: "ca1",
    projectId: "synergy",
    opportunityId: "o1",
    title: "Djupgående massage i Malmö",
    slug: "djupgaende-massage-malmo",
    metaTitle: "Djupgående massage i Malmö — Synergy Massage",
    metaDescription: "Legitimerade terapeuter i centrala Malmö. Djupgående behandlingar för nacke, axlar och rygg. Boka kvällstid samma vecka.",
    h1: "Djupgående massage i Malmö för stelhet i nacke och axlar",
    outline: [
      "När djupgående massage är rätt val",
      "Vår metod — steg för steg",
      "Vanliga besvär vi behandlar",
      "Pris, längd och bokning",
      "Vanliga frågor",
    ],
    faq: [
      { q: "Hur länge sitter effekten i?", a: "De flesta klienter upplever lättnad i 5–10 dagar efter en 60-minuters behandling, längre med en serie om 3–4 tillfällen." },
      { q: "Gör det ont?", a: "Trycket anpassas alltid efter din tolerans. En djup behandling kan kännas intensiv men ska aldrig vara smärtsam." },
    ],
    cta: "Boka 60-minuters behandling",
    markdown: "# Djupgående massage i Malmö\n\nSynergy Massage erbjuder djupgående behandlingar i en lugn, designad studio mitt i Malmö...",
    internalLinks: ["/sportmassage", "/priser", "/boka"],
    schemaSuggestions: ["LocalBusiness", "Service", "FAQPage"],
    editorNotes: "Lägg till bild från behandlingsrum innan publicering.",
    status: "In Review",
    updatedAt: SEED_ANCHOR,
  },
];
