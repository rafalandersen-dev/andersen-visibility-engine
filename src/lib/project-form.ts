import type { Project } from "./types";

/** Fields owned by the main form. Connector/brand subforms save independently. */
export function projectFormPatch(form: Project): Partial<Project> {
  return {
    name: form.name,
    websiteUrl: form.websiteUrl,
    businessName: form.businessName,
    businessType: form.businessType,
    description: form.description,
    targetAudience: form.targetAudience,
    toneOfVoice: form.toneOfVoice,
    uniqueSellingPoints: form.uniqueSellingPoints,
    brandNotes: form.brandNotes,
    market: form.market,
    currency: form.currency,
    appLanguage: form.appLanguage,
    primaryLanguage: form.primaryLanguage,
    primaryContentLanguage: form.primaryContentLanguage,
    additionalLanguages: form.additionalLanguages,
    mainLocation: form.mainLocation,
    targetLocations: form.targetLocations,
    growthGoals: form.growthGoals,
    autoScheduler: form.autoScheduler,
  };
}
