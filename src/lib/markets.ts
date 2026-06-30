/**
 * Localized public market pages + region/pricing config (Sprint 13).
 *
 * IMPORTANT: displayRegion is only what the visitor is *viewing*. It is NOT the
 * billing market. Billing eligibility (Sprint 14) is determined by the
 * business/billing country, never by the selected display region — copy here
 * must never imply a visitor can pick a cheaper billing market.
 */

export type DisplayRegion = "pl" | "se" | "dk" | "uk" | "eu";
export type AppLanguage = "en" | "pl" | "sv" | "da";

/** Where the business wants to grow (set in Project Setup, Sprint 14). */
export type TargetMarket =
  | "Poland" | "Sweden" | "Denmark" | "United Kingdom" | "European Union" | "Other";

/** Country/region used for pricing, invoices, VAT/tax (Sprint 14 — billing). */
export type BillingMarket = TargetMarket;

export const DISPLAY_REGIONS: DisplayRegion[] = ["pl", "se", "dk", "uk", "eu"];

export interface MarketConfig {
  region: DisplayRegion;
  route: string;
  /** Page content language. */
  lang: AppLanguage;
  name: string; // short region name in the page language
  title: string;
  metaDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  positioning: string;
  ctaAudit: string;
  ctaBeta: string;
  availabilityNote: string;
  helpsHeading: string;
  helps: string[];
  journeyHeading: string;
  journey: { week: string; items: string[] }[];
  pricingHeading: string;
  betaPrice: string;
  monthlyPrice: string;
  pricingNote: string; // "beta pricing, may change" note
  whoForHeading: string;
  whoFor: string[];
  eligibility: string; // billing-eligibility disclaimer
  trustReview: string;
  trustNoGuarantee: string;
  applyHeading: string;
  applyBody: string;
  moreHeading: string;
}

const EN_HELPS = [
  "Find website growth gaps",
  "Create brand-aware content",
  "Score content before publishing",
  "Publish to your website",
  "Measure visits, clicks and search signals",
  "Build safer authority opportunities",
];
const EN_JOURNEY = [
  { week: "Week 1", items: ["Free audit", "Project setup", "Brand Intelligence", "Tracking check"] },
  { week: "Week 2", items: ["Opportunities", "Content plan", "Milo Score baseline"] },
  { week: "Week 3", items: ["Draft / publish content", "Authority tasks", "Connector setup"] },
  { week: "Week 4", items: ["Analytics & GSC review", "Next actions", "Handover or monthly support"] },
];
const EN_TRUST_REVIEW = "Milo is AI-assisted. Content should be reviewed before publishing, especially claims, pricing, legal, medical, financial or regulated information.";
const EN_TRUST_NOGUARANTEE = "Milo does not guarantee rankings, traffic, revenue or AI citations.";

export const MARKETS: Record<DisplayRegion, MarketConfig> = {
  pl: {
    region: "pl",
    route: "/pl",
    lang: "pl",
    name: "Polska",
    title: "Milo Growth Polska — wzrost strony dla małych firm z pomocą AI",
    metaDescription: "Milo Growth pomaga małym firmom w Polsce planować, tworzyć, publikować i mierzyć wzrost strony — z pomocą AI i kontrolą człowieka.",
    heroTitle: "Milo Growth dla polskich firm",
    heroSubtitle: "Uporządkuj widoczność strony, treści, publikację i mierzenie efektów w 30 dni.",
    positioning: "Milo Growth pomaga małym firmom uporządkować widoczność strony, treści, publikację i mierzenie efektów — bez obietnic magicznego SEO.",
    ctaAudit: "Zrób darmowy audit AI visibility",
    ctaBeta: "Zgłoś firmę do beta",
    availabilityNote: "Liczba miejsc w becie jest ograniczona, gdy Milo jest testowane z pierwszymi firmami.",
    helpsHeading: "W czym pomaga Milo",
    helps: [
      "Znajduje luki w widoczności strony",
      "Tworzy treści zgodne z marką",
      "Ocenia treść przed publikacją",
      "Publikuje na Twojej stronie",
      "Mierzy odwiedziny, kliknięcia i sygnały z wyszukiwania",
      "Buduje bezpieczniejsze możliwości autorytetu",
    ],
    journeyHeading: "30 dni w becie",
    journey: [
      { week: "Tydzień 1", items: ["Darmowy audit", "Konfiguracja projektu", "Inteligencja marki", "Sprawdzenie śledzenia"] },
      { week: "Tydzień 2", items: ["Możliwości", "Plan treści", "Bazowy Milo Score"] },
      { week: "Tydzień 3", items: ["Szkic / publikacja treści", "Zadania autorytetu", "Konfiguracja konektora"] },
      { week: "Tydzień 4", items: ["Przegląd Analytics i GSC", "Następne kroki", "Przekazanie lub wsparcie miesięczne"] },
    ],
    pricingHeading: "Cennik beta",
    betaPrice: "Assisted Beta: 699–1499 PLN jednorazowo",
    monthlyPrice: "Monthly Care: 299–599 PLN / miesiąc",
    pricingNote: "Cennik beta. Finalne plany subskrypcji mogą się zmienić po prywatnej becie.",
    whoForHeading: "Dla kogo to jest",
    whoFor: ["Salony beauty/wellness", "Gabinety i masażyści", "Konsultanci", "Lokalne usługi", "Małe sklepy internetowe"],
    eligibility: "Ceny pokazane na tej stronie dotyczą firm rozliczanych w Polsce. Zmiana języka lub regionu nie zmienia kwalifikacji do rozliczeń. Finalna cena może zależeć od kraju firmy, danych do rozliczeń, wielkości strony, konfiguracji konektora i poziomu wsparcia.",
    trustReview: "Milo działa z pomocą AI. Treść należy sprawdzić przed publikacją — zwłaszcza twierdzenia, ceny oraz kwestie prawne, medyczne, finansowe i regulowane.",
    trustNoGuarantee: "Milo nie gwarantuje pozycji, ruchu, przychodów ani cytowań w narzędziach AI.",
    applyHeading: "Zgłoś firmę do Assisted Beta",
    applyBody: "Zacznij od darmowego auditu lub napisz do nas, aby się zgłosić. Liczba miejsc jest ograniczona.",
    moreHeading: "Więcej",
  },
  se: {
    region: "se",
    route: "/se",
    lang: "sv",
    name: "Sverige",
    title: "Milo Growth Sweden — AI-assisterad webbtillväxt för småföretag",
    metaDescription: "Milo Growth hjälper småföretag i Sverige att planera, skapa, publicera och mäta webbplatstillväxt — med AI-stöd och mänsklig kontroll.",
    heroTitle: "Milo Growth för svenska företag",
    heroSubtitle: "En guidad 30-dagars uppstart för att planera, skapa, publicera och mäta webbplatstillväxt.",
    positioning: "Milo Growth hjälper småföretag i Sverige att planera, skapa, publicera och mäta webbplatstillväxt — med AI-stöd och mänsklig kontroll.",
    ctaAudit: "Gör en gratis AI visibility audit",
    ctaBeta: "Ansök till beta",
    availabilityNote: "Antalet betaplatser är begränsat medan Milo testas med tidiga företag.",
    helpsHeading: "Vad Milo hjälper till med",
    helps: [
      "Hittar luckor i webbplatsens synlighet",
      "Skapar varumärkesanpassat innehåll",
      "Bedömer innehåll före publicering",
      "Publicerar till din webbplats",
      "Mäter besök, klick och söksignaler",
      "Bygger tryggare auktoritetsmöjligheter",
    ],
    journeyHeading: "30 dagar i beta",
    journey: [
      { week: "Vecka 1", items: ["Gratis granskning", "Projektuppsättning", "Varumärkesintelligens", "Spårningskontroll"] },
      { week: "Vecka 2", items: ["Möjligheter", "Innehållsplan", "Milo Score-baslinje"] },
      { week: "Vecka 3", items: ["Utkast / publicera innehåll", "Auktoritetsuppgifter", "Anslutning av kopplare"] },
      { week: "Vecka 4", items: ["Analys- & GSC-genomgång", "Nästa steg", "Överlämning eller månadsstöd"] },
    ],
    pricingHeading: "Betapriser",
    betaPrice: "Assisted Beta: 2500–5000 SEK engångs",
    monthlyPrice: "Monthly Care: 799–1499 SEK/månad",
    pricingNote: "Betapriser. Slutliga abonnemang kan ändras efter den privata betan.",
    whoForHeading: "Vem det passar",
    whoFor: ["Lokala tjänsteföretag", "Wellness/massage/skönhet", "Kliniker", "Konsulter", "Liten e-handel", "Professionella tjänster"],
    eligibility: "Priserna som visas gäller företag som faktureras i Sverige. Att byta visningsregion eller språk ändrar inte faktureringsbehörigheten. Slutpriset kan bero på företagets land, faktureringsuppgifter, webbplatsens storlek, kopplaruppsättning och supportnivå.",
    trustReview: "Milo är AI-assisterat. Innehåll bör granskas före publicering — särskilt påståenden, priser samt juridisk, medicinsk, ekonomisk eller reglerad information.",
    trustNoGuarantee: "Milo garanterar inte placeringar, trafik, intäkter eller AI-citeringar.",
    applyHeading: "Ansök till Assisted Beta",
    applyBody: "Börja med en gratis granskning eller hör av dig för att ansöka. Platserna är begränsade.",
    moreHeading: "Mer",
  },
  dk: {
    region: "dk",
    route: "/dk",
    lang: "da",
    name: "Danmark",
    title: "Milo Growth Denmark — AI-assisteret webvækst for små virksomheder",
    metaDescription: "Milo Growth hjælper små virksomheder i Danmark med at planlægge, skabe, publicere og måle vækst på deres website — med AI-assistance og menneskelig kontrol.",
    heroTitle: "Milo Growth for danske virksomheder",
    heroSubtitle: "En guidet 30-dages opsætning til at planlægge, skabe, publicere og måle webvækst.",
    positioning: "Milo Growth hjælper små virksomheder i Danmark med at planlægge, skabe, publicere og måle vækst på deres website — med AI-assistance og menneskelig kontrol.",
    ctaAudit: "Lav et gratis AI visibility-tjek",
    ctaBeta: "Ansøg til beta",
    availabilityNote: "Antallet af betapladser er begrænset, mens Milo testes med tidlige virksomheder.",
    helpsHeading: "Hvad Milo hjælper med",
    helps: [
      "Finder huller i webstedets synlighed",
      "Skaber brandtro indhold",
      "Vurderer indhold før udgivelse",
      "Udgiver til dit website",
      "Måler besøg, klik og søgesignaler",
      "Bygger sikrere autoritetsmuligheder",
    ],
    journeyHeading: "30 dage i beta",
    journey: [
      { week: "Uge 1", items: ["Gratis tjek", "Projektopsætning", "Brandintelligens", "Sporingstjek"] },
      { week: "Uge 2", items: ["Muligheder", "Indholdsplan", "Milo Score-baseline"] },
      { week: "Uge 3", items: ["Kladde / udgiv indhold", "Autoritetsopgaver", "Opsætning af forbindelse"] },
      { week: "Uge 4", items: ["Analytics- & GSC-gennemgang", "Næste skridt", "Overdragelse eller månedlig support"] },
    ],
    pricingHeading: "Betapriser",
    betaPrice: "Assisted Beta: 1500–3500 DKK engang",
    monthlyPrice: "Monthly Care: 499–999 DKK/måned",
    pricingNote: "Betapriser. De endelige abonnementer kan ændre sig efter den private beta.",
    whoForHeading: "Hvem det er til",
    whoFor: ["Lokale servicevirksomheder", "Wellness/massage/skønhed", "Klinikker", "Konsulenter", "Lille e-handel", "Professionelle tjenester"],
    eligibility: "De viste priser gælder virksomheder, der faktureres i Danmark. At skifte visningsregion eller sprog ændrer ikke faktureringsberettigelsen. Den endelige pris kan afhænge af virksomhedens land, faktureringsoplysninger, webstedets størrelse, forbindelsesopsætning og supportniveau.",
    trustReview: "Milo er AI-assisteret. Indhold bør gennemgås før udgivelse — især påstande, priser samt juridiske, medicinske, finansielle eller regulerede oplysninger.",
    trustNoGuarantee: "Milo garanterer ikke placeringer, trafik, indtægter eller AI-citeringer.",
    applyHeading: "Ansøg til Assisted Beta",
    applyBody: "Start med et gratis tjek, eller kontakt os for at ansøge. Pladserne er begrænsede.",
    moreHeading: "Mere",
  },
  uk: {
    region: "uk",
    route: "/uk",
    lang: "en",
    name: "United Kingdom",
    title: "Milo Growth UK — AI-assisted website growth for small businesses",
    metaDescription: "Milo Growth helps UK small businesses turn website gaps into better content, safer authority tasks, publishing workflows and measurable growth signals.",
    heroTitle: "Milo Growth for UK businesses",
    heroSubtitle: "A guided 30-day setup to plan, create, publish and measure website growth.",
    positioning: "Milo Growth helps UK small businesses turn website gaps into better content, safer authority tasks, publishing workflows and measurable growth signals.",
    ctaAudit: "Run free audit",
    ctaBeta: "Apply for beta",
    availabilityNote: "Beta availability is limited while Milo is being tested with early businesses.",
    helpsHeading: "What Milo helps you do",
    helps: EN_HELPS,
    journeyHeading: "Your 30-day beta journey",
    journey: EN_JOURNEY,
    pricingHeading: "Beta pricing",
    betaPrice: "Assisted Beta: £199–£499 one-time",
    monthlyPrice: "Monthly Care: £79–£149/month",
    pricingNote: "Beta pricing. Final subscription plans may change after the private beta.",
    whoForHeading: "Who this is for",
    whoFor: ["Local service businesses", "Wellness, beauty and clinics", "Consultants", "Small e-commerce brands", "Professional services"],
    eligibility: "Pricing shown is for businesses billed in the United Kingdom. Changing display region or language does not change billing eligibility. If your business is billed elsewhere, local or EU pricing may apply. Final pricing may depend on business country, billing details, website size, connector setup and support level.",
    trustReview: EN_TRUST_REVIEW,
    trustNoGuarantee: EN_TRUST_NOGUARANTEE,
    applyHeading: "Apply for the Assisted Beta",
    applyBody: "Start with a free audit, or get in touch to apply. Beta places are limited.",
    moreHeading: "More",
  },
  eu: {
    region: "eu",
    route: "/eu",
    lang: "en",
    name: "Europe / English",
    title: "Milo Growth Europe — AI-assisted website growth for small businesses",
    metaDescription: "Milo Growth helps European small businesses plan, create, publish and measure website growth with AI-assisted workflows and human review.",
    heroTitle: "Milo Growth for European businesses",
    heroSubtitle: "A guided 30-day setup to plan, create, publish and measure website growth.",
    positioning: "Milo Growth helps European small businesses plan, create, publish and measure website growth with AI-assisted workflows and human review.",
    ctaAudit: "Run free audit",
    ctaBeta: "Apply for beta",
    availabilityNote: "Beta availability is limited while Milo is being tested with early businesses.",
    helpsHeading: "What Milo helps you do",
    helps: EN_HELPS,
    journeyHeading: "Your 30-day beta journey",
    journey: EN_JOURNEY,
    pricingHeading: "Beta pricing",
    betaPrice: "Assisted Beta: €249–€499 one-time",
    monthlyPrice: "Monthly Care: €79–€149/month",
    pricingNote: "Beta pricing. Final subscription plans may change after the private beta.",
    whoForHeading: "Who this is for",
    whoFor: ["Local service businesses", "Wellness, beauty and clinics", "Consultants", "Small e-commerce brands", "Professional services"],
    eligibility: "Generic EU pricing applies to businesses outside listed local markets or where no local pricing is available. Changing display region or language does not change billing eligibility. Final pricing may depend on business country, website size, connector setup and support level.",
    trustReview: EN_TRUST_REVIEW,
    trustNoGuarantee: EN_TRUST_NOGUARANTEE,
    applyHeading: "Apply for the Assisted Beta",
    applyBody: "Start with a free audit, or get in touch to apply. Beta places are limited.",
    moreHeading: "More",
  },
};

/** UI labels for the region selector (always shown in English for consistency). */
export const REGION_SELECTOR_LABELS: Record<DisplayRegion, string> = {
  pl: "Poland",
  se: "Sweden",
  dk: "Denmark",
  uk: "United Kingdom",
  eu: "EU / English",
};

/** Map a display region to its billing market (for displaying local plan prices). */
export function regionToBillingMarket(region: DisplayRegion): "Poland" | "Sweden" | "Denmark" | "United Kingdom" | "European Union" {
  if (region === "pl") return "Poland";
  if (region === "se") return "Sweden";
  if (region === "dk") return "Denmark";
  if (region === "uk") return "United Kingdom";
  return "European Union";
}

/** Suggest a display region from a browser language code. Defaults to "eu". */
export function suggestRegionFromLanguage(navLang: string | undefined): DisplayRegion {
  const l = (navLang || "").slice(0, 2).toLowerCase();
  if (l === "pl") return "pl";
  if (l === "sv") return "se";
  if (l === "da") return "dk";
  if (l === "en") return "uk";
  return "eu";
}
