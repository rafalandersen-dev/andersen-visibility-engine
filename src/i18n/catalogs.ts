/** Browser-independent UI catalogs. English is the fallback for every product area.
 * Content and email languages use their separate registries and preferences. */
import { backlinkRecurringCopy } from "./backlink-recurring";
import { emailSettingsCopy } from "./email-settings";
import { technicalPerformanceCopy } from "./technical-performance";
import { googleIndexCopy } from "./google-index";
import { technicalCrawlCopy } from "./technical-crawl";
import { backlinkDetailsCopy } from "./backlink-details";
import { backlinkMonitoringCopy } from "./backlink-monitoring";
import { projectTeams } from "./project-teams";
import { locationCoverage } from "./location-coverage";
import { publishingFidelity } from "./publishing-fidelity";
import { backlinkIntegrity } from "./backlink-integrity";
import { gscIntegrity } from "./gsc-integrity";
import { outreachIntegrityCopy } from "./outreach-integrity";
import { logEvidenceCopy } from "./log-evidence";
import { answerEvidenceCopy } from "./answer-evidence";
import { en } from "./en";
import { pl } from "./pl";
import { sv } from "./sv";
import { da } from "./da";
import { premium } from "./premium";
import { notifications } from "./notifications";
import { projectKnowledge } from "./project-knowledge";
import { proofEvidence } from "./proof-evidence";
import { specialistTeam } from "./specialist-team";
import { generationResults } from "./generation-results";
import type { OnboardingLanguage } from "@/lib/types";

type Dictionary = Readonly<Record<string, string>>;
const BASE: Record<OnboardingLanguage, Dictionary> = { en, pl, sv, da };
// Lowest to highest priority; later product-specific copy retains its existing override.
const OVERRIDES: readonly Record<OnboardingLanguage, Dictionary>[] = [
  premium,
  notifications,
  generationResults,
  projectKnowledge,
  specialistTeam,
  proofEvidence,
  answerEvidenceCopy,
  logEvidenceCopy,
  outreachIntegrityCopy,
  gscIntegrity,
  backlinkIntegrity,
  backlinkMonitoringCopy,
  backlinkDetailsCopy,
  backlinkRecurringCopy,
  publishingFidelity,
  locationCoverage,
  projectTeams,
  technicalCrawlCopy,
  googleIndexCopy,
  technicalPerformanceCopy,
  emailSettingsCopy,
];
export const UI_LANGUAGE_CODES = ["en", "pl", "sv", "da"] as const;
export function isUiLanguage(value: unknown): value is OnboardingLanguage {
  return typeof value === "string" && (UI_LANGUAGE_CODES as readonly string[]).includes(value);
}
export const UI_CATALOGS: Readonly<Record<OnboardingLanguage, Dictionary>> = Object.freeze(
  Object.fromEntries(
    UI_LANGUAGE_CODES.map((locale) => [
      locale,
      Object.freeze(
        Object.assign(
          Object.create(null),
          BASE[locale],
          ...OVERRIDES.map((source) => source[locale]),
        ),
      ),
    ]),
  ) as Record<OnboardingLanguage, Dictionary>,
);
