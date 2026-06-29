/**
 * Canonical domain types for the Milo Growth.
 * All store entities, mock-AI generators and UI components import from here.
 */
export type Language = "Polish" | "Swedish" | "English";

export type ContentType =
  | "Landing Page"
  | "Service Page"
  | "Blog Article"
  | "Guide"
  | "FAQ Page"
  | "Comparison"
  | "Location Page";

export type SearchIntent = "Informational" | "Commercial" | "Transactional" | "Navigational";

export type Priority = "Low" | "Medium" | "High";

export type OpportunityStatus = "New" | "In Brief" | "Drafting" | "Discarded" | "Linked";

export type ContentStatus = "Draft" | "In Review" | "Approved" | "Rejected" | "Exported";

/** Where a Linked opportunity originated (Content Engine 2.0 source context). */
export type OpportunitySource = "audit" | "competitor" | "manual" | "authority" | "aiVisibility";

/** Content asset types Milo can generate from an opportunity (Content Engine 2.0). */
export type AssetType =
  | "brief"
  | "article"
  | "servicePage"
  | "landingPage"
  | "faq"
  | "comparison"
  | "gbpPost"
  | "meta"
  | "socialPack";

export type ContentSourceType = "opportunity" | "audit" | "competitor" | "manual" | "unknown";

export interface Project {
  id: string;
  name: string;
  websiteUrl: string;
  businessName: string;
  businessType: string;
  primaryLanguage: Language;
  additionalLanguages: Language[];
  mainLocation: string;
  targetLocations: string[];
  description: string;
  targetAudience: string;
  toneOfVoice: string;
  uniqueSellingPoints: string;
  brandNotes: string;
}

export interface ServiceItem {
  id: string;
  projectId: string;
  name: string;
  kind: "Service" | "Product";
  description: string;
  targetAudience: string;
  locationRelevance: string;
  priority: Priority;
}

export interface Opportunity {
  id: string;
  projectId: string;
  title: string;
  language: Language;
  contentType: ContentType;
  searchIntent: SearchIntent;
  targetAudience: string;
  businessValue: string;
  recommendedCta: string;
  priority: Priority;
  status: OpportunityStatus;
  /** Origin of the opportunity (set for audit/competitor-derived ones). */
  source?: OpportunitySource;
}

export interface CalendarItem {
  id: string;
  projectId: string;
  opportunityId?: string;
  plannedDate: string; // ISO date
  topicTitle: string;
  language: Language;
  contentType: ContentType;
  searchIntent: SearchIntent;
  recommendedCta: string;
  status: "Planned" | "In Progress" | "Done";
}

export interface ContentAsset {
  id: string;
  projectId: string;
  opportunityId?: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  outline: string[];
  faq: { q: string; a: string }[];
  cta: string;
  markdown: string;
  internalLinks: string[];
  schemaSuggestions: string[];
  editorNotes: string;
  status: ContentStatus;
  updatedAt: string;
  // ---- Content Engine 2.0 (all optional → existing assets keep loading) ----
  assetType?: AssetType;
  sourceOpportunityId?: string;
  sourceOpportunityTitle?: string;
  sourceType?: ContentSourceType;
  language?: Language;
  createdAt?: string;
}

// ---- Site Audit v1 ----
export type AuditCategory =
  | "Business Clarity"
  | "SEO Basics"
  | "Local Visibility"
  | "AI Readiness"
  | "Conversion & Trust";

export interface AuditFinding {
  id: string;
  title: string;
  category: AuditCategory;
  severity: Priority;
  explanation: string;
  recommendation: string;
  suggestedOpportunityTitle: string;
  suggestedContentType: ContentType;
  suggestedSearchIntent: SearchIntent;
  suggestedCta: string;
  priority: Priority;
}

export interface AuditResult {
  id: string;
  projectId: string;
  websiteUrl: string;
  /** false when the homepage could not be fetched (audit then uses project context only). */
  fetchedWebsite: boolean;
  note?: string;
  overallScore: number;
  seoScore: number;
  localScore: number;
  aiReadinessScore: number;
  conversionScore: number;
  summary: string;
  topFixes: string[];
  findings: AuditFinding[];
  /** Finding ids already turned into Opportunities (dedup for the convert action). */
  convertedFindingIds: string[];
  createdAt: string;
}

// ---- Competitor Gap v1 ----
export type CompetitorGapCategory =
  | "Service Coverage"
  | "FAQ & Answers"
  | "Local Positioning"
  | "Trust & Authority"
  | "Conversion & Offer"
  | "Content Themes";

export interface CompetitorSnapshot {
  competitorUrl: string;
  title: string;
  detectedPositioning: string;
  notableStrengths: string[];
  fetchStatus: "fetched" | "failed";
}

export interface CompetitorGap {
  id: string;
  title: string;
  category: CompetitorGapCategory;
  severity: Priority;
  competitorEvidence: string;
  explanation: string;
  recommendation: string;
  suggestedOpportunityTitle: string;
  suggestedContentType: ContentType;
  suggestedSearchIntent: SearchIntent;
  suggestedCta: string;
  priority: Priority;
}

export interface CompetitorAnalysisResult {
  id: string;
  projectId: string;
  competitorUrls: string[];
  note?: string;
  overallGapScore: number;
  serviceGapScore: number;
  contentGapScore: number;
  localGapScore: number;
  trustGapScore: number;
  conversionGapScore: number;
  summary: string;
  competitorSnapshots: CompetitorSnapshot[];
  topGaps: string[];
  gaps: CompetitorGap[];
  /** Gap ids already turned into Opportunities (dedup for the convert action). */
  convertedGapIds: string[];
  createdAt: string;
}

// ---- Authority v1 ----
export type AuthorityCategory =
  | "Local Directories & Citations"
  | "Industry Directories"
  | "Review & Reputation"
  | "Partner & Supplier Links"
  | "Associations & Communities"
  | "PR & Story"
  | "Trust Signals"
  | "Outreach";

export interface AuthorityItem {
  id: string;
  title: string;
  category: AuthorityCategory;
  priority: Priority;
  effort: Priority;
  expectedImpact: Priority;
  explanation: string;
  recommendation: string;
  suggestedPlatformOrTarget: string;
  outreachAngle: string;
  suggestedOpportunityTitle: string;
  suggestedContentType: ContentType;
  suggestedSearchIntent: SearchIntent;
  suggestedCta: string;
}

export interface AuthorityAnalysisResult {
  id: string;
  projectId: string;
  note?: string;
  overallAuthorityScore: number;
  localCitationScore: number;
  industryPresenceScore: number;
  reputationScore: number;
  partnerLinkScore: number;
  prOpportunityScore: number;
  trustSignalScore: number;
  summary: string;
  topAuthorityActions: string[];
  authorityItems: AuthorityItem[];
  /** Item ids already turned into Opportunities (dedup for the convert action). */
  convertedItemIds: string[];
  createdAt: string;
}

// ---- AI Visibility v1 ----
// Planning / readiness module — NOT live AI rank tracking. No external AI engine
// is queried; everything is framed as likely gaps and readiness, not live results.
export type AiVisibilityCategory =
  | "Discovery Prompts"
  | "Comparison Prompts"
  | "Problem / Solution Prompts"
  | "Local-Intent Prompts"
  | "Trust & Citation Readiness"
  | "Content Gaps for AI Answers"
  | "Authority Gaps for AI Answers";

export interface AiVisibilityPromptSet {
  id: string;
  category: AiVisibilityCategory;
  prompt: string;
  language: Language;
  intent: SearchIntent;
  targetAudience: string;
  whyItMatters: string;
  /** How ready the business likely is to be cited for this prompt today. */
  readiness: Priority;
  recommendedSourcePageOrAsset: string;
}

export interface AiVisibilityGap {
  id: string;
  title: string;
  category: AiVisibilityCategory;
  priority: Priority;
  explanation: string;
  likelyReason: string;
  recommendation: string;
  suggestedPrompt: string;
  suggestedOpportunityTitle: string;
  suggestedContentType: ContentType;
  suggestedSearchIntent: SearchIntent;
  suggestedCta: string;
}

export interface AiVisibilityAnalysisResult {
  id: string;
  projectId: string;
  note?: string;
  overallAiVisibilityScore: number;
  promptCoverageScore: number;
  answerReadinessScore: number;
  localAiReadinessScore: number;
  trustCitationScore: number;
  contentGapScore: number;
  authorityGapScore: number;
  summary: string;
  topAiVisibilityActions: string[];
  promptSets: AiVisibilityPromptSet[];
  visibilityGaps: AiVisibilityGap[];
  /** Gap ids already turned into Opportunities (dedup for the convert action). */
  convertedGapIds: string[];
  createdAt: string;
}
