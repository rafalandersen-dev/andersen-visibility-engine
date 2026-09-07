import type { Project, ServiceItem } from "./types";

const filled = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): boolean => Array.isArray(value) && value.some(filled);

/** Stored profile completeness only; never a provider, publication or launch check. */
export function projectReadiness(project: Project, services: ServiceItem[]) {
  const brand = project.brandIntelligence;
  const section = (id: string, fields: Record<string, boolean>) => {
    const present = Object.keys(fields).filter((key) => fields[key]);
    const missing = Object.keys(fields).filter((key) => !fields[key]);
    return {
      id,
      status: present.length === 0 ? "empty" : missing.length ? "partial" : "filled",
      present,
      missing,
    };
  };
  const catalog = services.filter((s) => s.projectId === project.id);
  const usableCatalog = catalog.filter((s) => filled(s.name) && filled(s.description));
  return {
    projectId: project.id,
    assessment: "stored_profile_fields",
    limitation:
      "Filled fields are not verified facts. Empty fields may be intentional. This does not verify integrations, content quality, costs or readiness to publish.",
    sections: [
      section("business", {
        businessName: filled(project.businessName),
        websiteUrl: filled(project.websiteUrl),
        businessType: filled(project.businessType),
        description: filled(project.description),
      }),
      section("audience_and_market", {
        targetAudience: filled(project.targetAudience),
        market: filled(project.market),
        primaryLanguage: filled(project.primaryContentLanguage) || filled(project.primaryLanguage),
        targetLocations: strings(project.targetLocations) || filled(project.mainLocation),
      }),
      section("positioning", {
        uniqueSellingPoints: filled(project.uniqueSellingPoints),
        growthGoals: strings(project.growthGoals),
        toneOfVoice: filled(project.toneOfVoice),
      }),
      section("catalog", { describedServicesOrProducts: usableCatalog.length > 0 }),
      section("competitors", { competitorUrls: strings(project.competitorUrls) }),
      section("brand_voice", {
        tone: filled(brand?.voice?.tone),
        styleNotes: filled(brand?.voice?.styleNotes),
        wordsToUse: strings(brand?.voice?.wordsToUse),
        wordsToAvoid: strings(brand?.voice?.wordsToAvoid),
      }),
      section("brand_claims", {
        allowedClaims: strings(brand?.claims?.allowedClaims),
        forbiddenClaims: strings(brand?.claims?.forbiddenClaims),
        requiredCaveats: strings(brand?.claims?.requiredCaveats),
      }),
      section("brand_proof", {
        proofPoints: strings(brand?.proof?.proofPoints),
        credentials: strings(brand?.proof?.credentials),
        trustSignals: strings(brand?.proof?.trustSignals),
      }),
      section("brand_offers", {
        primaryOffers:
          Array.isArray(brand?.offers?.primaryOffers) &&
          brand.offers.primaryOffers.some((o) => filled(o?.name)),
      }),
      section("brand_cta", {
        label: filled(brand?.ctas?.primaryCtaLabel),
        url: filled(brand?.ctas?.primaryCtaUrl),
      }),
      section("brand_links", {
        internalLinks:
          Array.isArray(brand?.internalLinks) &&
          brand.internalLinks.some((l) => filled(l?.label) && filled(l?.url)),
      }),
    ],
    catalog: { total: catalog.length, withNameAndDescription: usableCatalog.length },
    integrations: "not_checked",
    publication: "not_checked",
    nextStep:
      "Use get_project_brief for existing values. Ask the owner about intentional gaps; propose profile changes through create_pending_action when authorized. Preserve owner-set values and publication controls.",
  };
}
