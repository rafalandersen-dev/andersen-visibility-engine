import type {
  BacklinkAnalysisResult,
  LinkMarketplaceMatch,
  LinkMarketplaceOffer,
  LinkMarketplaceQuote,
  Market,
  Project,
} from "./types";

export interface LinkMarketplaceProvider {
  readonly id: LinkMarketplaceOffer["provider"];
  listOffers(): Promise<LinkMarketplaceOffer[]>;
  createQuote(input: { offerId: string; targetUrl: string }): Promise<LinkMarketplaceProviderQuote>;
  createOrder(input: {
    providerQuoteId: string;
    offerId: string;
    targetUrl: string;
    confirmedProviderPrice: number;
    idempotencyKey: string;
  }): Promise<{
    providerOrderId: string;
    providerStatus: string;
  }>;
  getOrder(input: { providerOrderId: string }): Promise<{ providerStatus: string }>;
}

export interface LinkMarketplaceProviderQuote {
  providerQuoteId: string;
  offerId: string;
  domain: string;
  publicationTitle: string;
  basePrice: number;
  currency: LinkMarketplaceQuote["currency"];
  expiresAt?: string;
}

export const MARKETPLACE_QUOTE_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_MARKETPLACE_MARGIN_PERCENT = 20;

export const DEMO_MARKETPLACE_OFFERS: LinkMarketplaceOffer[] = [
  offer(
    "eu-business-review.com",
    "European business feature",
    ["business", "consulting", "software"],
    ["EU", "UK"],
    58,
    74000,
    390,
    12,
  ),
  offer(
    "nordicfounders.com",
    "Nordic founder story",
    ["startup", "software", "technology"],
    ["SE", "DK", "EU"],
    54,
    46000,
    340,
    10,
  ),
  offer(
    "digitalcommerce.today",
    "Commerce expert article",
    ["ecommerce", "retail", "marketing"],
    ["EU", "UK"],
    51,
    61000,
    290,
    9,
  ),
  offer(
    "polishbusinessjournal.pl",
    "Polish company profile",
    ["business", "finance", "services"],
    ["PL"],
    47,
    38000,
    220,
    8,
  ),
  offer(
    "scandidesignjournal.com",
    "Scandinavian design case study",
    ["design", "architecture", "home"],
    ["SE", "DK", "EU"],
    49,
    42000,
    310,
    11,
  ),
  offer(
    "sustainablefuture.media",
    "Sustainability insight",
    ["sustainability", "energy", "manufacturing"],
    ["EU", "UK", "SE", "DK"],
    63,
    97000,
    480,
    14,
  ),
  offer(
    "healthpractice.news",
    "Health practice guide",
    ["health", "wellness", "medical"],
    ["EU", "UK", "PL"],
    56,
    88000,
    440,
    13,
  ),
  offer(
    "localserviceguide.eu",
    "Local services spotlight",
    ["local", "services", "hospitality"],
    ["EU", "PL", "SE", "DK"],
    41,
    27000,
    180,
    7,
  ),
];

function offer(
  domain: string,
  title: string,
  categories: string[],
  markets: Market[],
  domainRank: number,
  estimatedMonthlyTraffic: number,
  price: number,
  turnaroundDays: number,
): LinkMarketplaceOffer {
  return {
    id: `demo-${domain}`,
    provider: "demo",
    domain,
    title,
    description: "Editorially reviewed sponsored publication with clear commercial disclosure.",
    categories,
    markets,
    languages: ["English"],
    domainRank,
    estimatedMonthlyTraffic,
    price,
    currency: "EUR",
    turnaroundDays,
    linkAttributes: "sponsored",
  };
}

export const demoMarketplaceProvider: LinkMarketplaceProvider = {
  id: "demo",
  async listOffers() {
    return DEMO_MARKETPLACE_OFFERS;
  },
  async createQuote() {
    throw new Error("Demo quotes are created by the authenticated marketplace backend.");
  },
  async createOrder() {
    throw new Error("Demo mode never creates a provider order.");
  },
  async getOrder() {
    throw new Error("Demo mode has no provider order to sync.");
  },
};

export function calculateMarketplacePricing(basePrice: number, marginPercent: number) {
  const safeBasePrice = Math.round(Math.max(0, basePrice) * 100) / 100;
  const safeMarginPercent = Math.min(100, Math.max(0, marginPercent));
  const serviceFee = Math.round(safeBasePrice * (safeMarginPercent / 100) * 100) / 100;
  return {
    basePrice: safeBasePrice,
    serviceFee,
    marginPercent: safeMarginPercent,
    totalPrice: Math.round((safeBasePrice + serviceFee) * 100) / 100,
  };
}

export function isMarketplaceQuoteExpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

export function isExactMarketplaceTotal(expected: number, confirmed: number): boolean {
  return Number.isFinite(confirmed) && Math.round(expected * 100) === Math.round(confirmed * 100);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length > 2);
}

export function matchMarketplaceOffers(
  offers: LinkMarketplaceOffer[],
  project: Project,
  analysis?: BacklinkAnalysisResult,
): LinkMarketplaceMatch[] {
  const context = new Set(
    tokens([project.businessType, project.description, project.targetAudience].join(" ")),
  );
  const gapDomains = new Set((analysis?.gapDomains ?? []).map((gap) => gap.domain.toLowerCase()));

  return offers
    .map((item) => {
      const categoryHits = item.categories.filter((category) =>
        tokens(category).some((token) => context.has(token)),
      );
      const marketMatch = !!project.market && item.markets.includes(project.market);
      const languageMatch = item.languages.includes(project.primaryLanguage);
      const isGapDomain = gapDomains.has(item.domain.toLowerCase());
      const matchScore = Math.min(
        100,
        25 +
          categoryHits.length * 18 +
          (marketMatch ? 20 : 0) +
          (languageMatch ? 12 : 0) +
          (isGapDomain ? 30 : 0) +
          Math.round(item.domainRank / 10),
      );
      const matchReasons = [
        ...(isGapDomain ? ["linkGap"] : []),
        ...(categoryHits.length ? ["topic"] : []),
        ...(marketMatch ? ["market"] : []),
        ...(languageMatch ? ["language"] : []),
        ...(item.domainRank >= 50 ? ["authority"] : []),
      ];
      return { ...item, matchScore, matchReasons, isGapDomain };
    })
    .sort((a, b) => b.matchScore - a.matchScore || b.domainRank - a.domainRank);
}

export function buildSuggestedTopic(project: Project, offer: LinkMarketplaceOffer): string {
  const subject = project.businessType || project.businessName;
  return `${subject}: practical insights for ${offer.categories[0] ?? "business"} readers`;
}
