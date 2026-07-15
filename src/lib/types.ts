/**
 * Canonical domain types for the Milo Growth.
 * All store entities, mock-AI generators and UI components import from here.
 */
export type Language = "Polish" | "Swedish" | "English" | "Danish";

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
export type OpportunitySource = "audit" | "competitor" | "manual" | "authority" | "aiVisibility" | "claude" | "backlinks";

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

// ---- Publishing v1 (Lovable / custom website connector) ----
export type PublishingPlatform = "lovableCustomEndpoint";
export type PublishDestinationType = "blogPost" | "servicePage" | "faq" | "landingPage";
export type PublishStatus = "notSent" | "sent" | "failed";

// ---- Publishing v1.1 (manual publish-live + auto-publish) ----
/** How Milo handles publishing for a connected website. */
export type PublishMode = "draftOnly" | "manualLive" | "autoPublishApproved";
export type LivePublishStatus = "notPublished" | "published" | "failed";

// ---- WordPress Connector v1 ----
export type PublishingConnectorType = "custom" | "wordpress" | "shopify";

export interface WordPressPublishingSettings {
  enabled?: boolean;
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
  defaultPostType?: "post" | "page";
  defaultStatus?: "draft";
  lastTestedAt?: string;
  lastTestStatus?: "success" | "error";
  lastTestMessage?: string;
}

export interface WordPressPublishResult {
  success: boolean;
  postId?: number;
  postType?: "post" | "page";
  status?: "draft" | "publish";
  editUrl?: string;
  liveUrl?: string;
  message?: string;
  error?: string;
}

// ---- Shopify Connector v1 ----
export interface ShopifyPublishingSettings {
  enabled?: boolean;
  shopDomain?: string;
  adminAccessToken?: string;
  defaultBlogId?: string;
  defaultBlogHandle?: string;
  defaultAuthorName?: string;
  defaultTags?: string[];
  lastTestedAt?: string;
  lastTestStatus?: "success" | "error";
  lastTestMessage?: string;
}

export interface ShopifyBlogOption {
  gid: string;
  id: string;
  handle: string;
  title: string;
}

export interface ShopifyPublishResult {
  success: boolean;
  articleId?: string;
  articleGid?: string;
  blogId?: string;
  blogGid?: string;
  handle?: string;
  status?: "draft" | "published";
  editUrl?: string;
  liveUrl?: string;
  message?: string;
  error?: string;
}

// ---- Onboarding Wizard v1 ----
export type Market = "PL" | "SE" | "DK" | "UK" | "EU";
export type Currency = "PLN" | "SEK" | "DKK" | "GBP" | "EUR";
export type OnboardingLanguage = "en" | "pl" | "sv" | "da";

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
  // ---- Publishing v1 (all optional → existing projects keep loading) ----
  publishingPlatform?: PublishingPlatform;
  publishEndpoint?: string;
  publishSecret?: string;
  defaultPublishMode?: "draft";
  defaultDestinationType?: PublishDestinationType;
  // ---- Publishing v1.1 ----
  /** Live-publish endpoint (separate route from the draft endpoint). */
  livePublishEndpoint?: string;
  /** Workflow mode: draft only, manual publish-live, or auto-publish on Approve. */
  publishMode?: PublishMode;
  // ---- WordPress Connector v1 (all optional → existing projects keep loading) ----
  /** Which publishing connector this project uses (defaults to "custom"). */
  connectorType?: PublishingConnectorType;
  wordpress?: WordPressPublishingSettings;
  shopify?: ShopifyPublishingSettings;
  // ---- Onboarding Wizard v1 (all optional → existing projects keep loading) ----
  setupComplete?: boolean;
  market?: Market;
  currency?: Currency;
  appLanguage?: OnboardingLanguage;
  primaryContentLanguage?: OnboardingLanguage;
  growthGoals?: string[];
  onboardingCompletedAt?: string;
  onboardingSourceData?: Record<string, unknown>;
  // ---- Phase 1C project setup (optional → existing projects keep loading) ----
  /** Competitor site URLs (https, ≤5) — persisted by the 1C setup proposal flow. */
  competitorUrls?: string[];
  // ---- Brand Intelligence / Content Memory v1 (all optional) ----
  brandIntelligence?: BrandIntelligence;
  // ---- GSC Lite / SEO Proof Import v1 (all optional) ----
  gscLite?: GscLite;
  // ---- GSC OAuth / API Sync v1 (safe metadata only — no tokens) ----
  gscOAuth?: GscOAuthMetadata;
}

// ---- GSC Lite / SEO Proof Import v1 ----
export interface GscRow {
  type: "query" | "page" | "date" | "unknown";
  query?: string;
  page?: string;
  path?: string;
  date?: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0–100
  position: number;
}

export interface GscImportSummary {
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number;
  rowCount: number;
  topQuery?: string;
  topPage?: string;
}

/** Where a GSC import came from. Legacy CSV imports use "manual_csv". */
export type GscImportSource = "manual_csv" | "api";

export interface GscImport {
  id: string;
  importedAt: string;
  source: GscImportSource;
  importType: "queries" | "pages" | "dates" | "mixed" | "unknown";
  fileName?: string;
  dateRange?: { start?: string; end?: string; label?: string };
  rows: GscRow[];
  summary: GscImportSummary;
  /** True when the source had more rows than the per-import cap. */
  truncated?: boolean;
  /** Search Console property this import was synced from (API imports). */
  selectedSiteUrl?: string;
}

export interface GscLite {
  imports: GscImport[];
  latestImportId?: string;
}

// ---- GSC OAuth / API Sync v1 (Sprint 17) ----
// Only SAFE metadata lives here (workspace/project JSONB). Refresh/access tokens
// are NEVER stored in JSONB — they live server-side only (google_connections).
export type GscConnectionStatus =
  | "notConfigured"
  | "disconnected"
  | "connected"
  | "expired"
  | "error";

export interface GscSelectedSite {
  siteUrl: string;
  permissionLevel?: string;
  selectedAt?: string;
}

export interface GscSyncSummary {
  lastSyncedAt?: string;
  lastSyncRange?: "28d" | "90d" | "custom";
  lastSyncStartDate?: string;
  lastSyncEndDate?: string;
  lastRowCount?: number;
  lastError?: string;
}

export interface GscOAuthMetadata {
  status?: GscConnectionStatus;
  googleAccountEmail?: string;
  selectedSite?: GscSelectedSite;
  sync?: GscSyncSummary;
}

/** A verified Search Console property returned by the sites list. */
export interface GscSiteEntry {
  siteUrl: string;
  permissionLevel?: string;
}

export interface MatchedGscPagePerformance {
  assetId: string;
  title: string;
  liveUrl: string;
  path: string;
  publishedAt?: string;
  gscClicks: number;
  gscImpressions: number;
  gscCtr: number;
  gscPosition: number;
  topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  hasGscData: boolean;
}

// ---- Brand Intelligence / Content Memory v1 ----
export interface BrandOffer {
  name: string;
  type: "service" | "product" | "package" | "membership" | "other";
  priority: "high" | "medium" | "low";
  description?: string;
  url?: string;
  targetAudience?: string;
  notes?: string;
}

export interface BrandInternalLink {
  label: string;
  url: string;
  type: "service" | "product" | "article" | "booking" | "contact" | "other";
  priority: "high" | "medium" | "low";
  notes?: string;
}

export interface BrandMarketLanguageRule {
  market?: string;
  language?: string;
  notes?: string;
}

export interface BrandIntelligence {
  voice?: {
    tone?: string;
    styleNotes?: string;
    wordsToUse?: string[];
    wordsToAvoid?: string[];
  };
  claims?: {
    allowedClaims?: string[];
    forbiddenClaims?: string[];
    requiredCaveats?: string[];
  };
  offers?: {
    primaryOffers?: BrandOffer[];
    secondaryOffers?: BrandOffer[];
  };
  proof?: {
    proofPoints?: string[];
    credentials?: string[];
    testimonialsNotes?: string;
    trustSignals?: string[];
  };
  ctas?: {
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
    secondaryCtaLabel?: string;
    secondaryCtaUrl?: string;
    ctaStyleNotes?: string;
  };
  internalLinks?: BrandInternalLink[];
  marketLanguageRules?: BrandMarketLanguageRule[];
  avoid?: string[];
  updatedAt?: string;
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
  /** Idempotency key for connector-created opportunities (Phase 1A). */
  requestId?: string;
  /** Set for connector-created opportunities (Phase 1A). */
  createdAt?: string;
}

/** A lightweight growth task (Phase 1A — created via the Claude connector; UI support follows). */
export interface GrowthTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  dueOn?: string;
  priority?: Priority;
  status: "open" | "done";
  origin: "claude" | "user";
  /** Idempotency key for connector-created tasks. */
  requestId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Proposal types Claude may create. opportunity_update_proposal shipped in
 * Phase 1B; project_setup_proposal is Phase 1C (schema + validator only in
 * 1C.1 — it is NOT creatable until the server apply branch and MCP exposure
 * land in 1C.2/1C.3).
 */
export type PendingActionType = "opportunity_update_proposal" | "project_setup_proposal";

export type PendingActionStatus = "pending" | "approved" | "rejected" | "applied" | "expired";

/** Derived server-side from the action type — never accepted from a caller. */
export type PendingActionRiskLevel = "low" | "medium" | "high";

/** Set when a pending action leaves "pending" (approve/reject/apply/expire). */
export interface PendingActionResolution {
  resolvedAt: string;
  /** Only the workspace owner (via the Milo UI) resolves in Phase 1B. */
  resolvedBy: "owner";
  note?: string;
  appliedEntityIds?: string[];
  appliedAtRev?: number;
  /** Machine reason when an approved action failed apply-time validation. */
  error?: string;
}

/**
 * Phase 1B — a structured change Claude proposed for owner approval. Lives in
 * the workspace `pendingActions[]` array; approval/apply is a Milo UI action,
 * never an MCP one. Payloads are strictly whitelisted per type.
 */
export interface PendingAction {
  id: string;
  type: PendingActionType;
  projectId: string;
  title: string;
  summary: string;
  status: PendingActionStatus;
  source: "claude";
  createdAt: string;
  updatedAt: string;
  /** Lazy expiry horizon (no cron) — checked at read/resolve time. */
  expiresAt?: string;
  /** Idempotency key for connector-created proposals. */
  requestId?: string;
  /** OAuth client_id (public identifier) for UI attribution. */
  proposedByClientId?: string;
  /** The scope that governs proposing this type (informational + enforced at create). */
  requiredScope: string;
  /** Type-specific, strictly validated, ≤16KB serialized. */
  payload: Record<string, unknown>;
  /** Human-readable markdown rendered in the UI before approval (≤4KB). */
  preview: string;
  riskLevel: PendingActionRiskLevel;
  resolution?: PendingActionResolution;
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
  // ---- Publishing v1 (all optional → existing assets keep loading) ----
  publishStatus?: PublishStatus;
  publishDestinationType?: PublishDestinationType;
  publishSlug?: string;
  publishedDraftUrl?: string;
  lastPublishedAt?: string;
  lastPublishError?: string;
  /** Identifier returned by the website when the draft was created (for upsert/publish). */
  publishExternalId?: string;
  // ---- Publishing v1.1 (live publishing — all optional) ----
  livePublishStatus?: LivePublishStatus;
  liveUrl?: string;
  livePublishedAt?: string;
  livePublishError?: string;
  autoPublishAttemptedAt?: string;
  autoPublishError?: string;
  // ---- WordPress Connector v1 (all optional) ----
  /** Which connector last published this asset. */
  publishPlatform?: PublishingConnectorType;
  wordpressPostId?: number;
  wordpressPostType?: "post" | "page";
  // ---- Shopify Connector v1 (all optional) ----
  shopifyArticleId?: string;
  shopifyArticleGid?: string;
  shopifyBlogId?: string;
  shopifyBlogGid?: string;
  shopifyHandle?: string;
  shopifyStatus?: "draft" | "published";
  // ---- Content Quality Engine / Milo Score v1 (all optional) ----
  qualityScore?: QualityScore;
  /** True when the draft changed after the last evaluation (prompts a re-evaluate). */
  qualityScoreStale?: boolean;
}

// ---- Content Quality Engine / Milo Score v1 ----
export type QualityStatus = "strong" | "okay" | "needsWork";
export type PublishingRecommendation = "ready" | "reviewFirst" | "notReady";

export type QualityCategoryKey =
  | "structure"
  | "searchReadiness"
  | "aiAnswerReadiness"
  | "brandFit"
  | "localRelevance"
  | "conversion"
  | "trustSafety"
  | "internalLinks";

export interface QualityCategoryScore {
  score: number; // 0–100
  status: QualityStatus;
  explanation: string;
  suggestions: string[];
}

export interface QualityScore {
  overall: number; // 0–100
  status: QualityStatus;
  evaluatedAt: string;
  model?: string;
  categories: Record<QualityCategoryKey, QualityCategoryScore>;
  topIssues: string[];
  quickWins: string[];
  publishingRecommendation: PublishingRecommendation;
  summary: string;
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

// ---- Authority Builder v2 / Safe Backlinks ----
export type AuthorityOpportunityType =
  | "localDirectory"
  | "industryDirectory"
  | "reviewProfile"
  | "citationNap"
  | "partnerLink"
  | "supplierLink"
  | "association"
  | "localPr"
  | "guestContribution"
  | "resourcePage"
  | "community"
  | "trustSignal"
  | "other";

export type AuthorityStatus =
  | "suggested"
  | "planned"
  | "contacted"
  | "submitted"
  | "live"
  | "rejected"
  | "notRelevant";

export type AuthorityPriority = "high" | "medium" | "low";

export interface AuthorityOpportunity {
  id: string;
  projectId: string;
  type: AuthorityOpportunityType;
  title: string;
  description: string;
  priority: AuthorityPriority;
  status: AuthorityStatus;

  targetUrl?: string;
  contactName?: string;
  contactEmail?: string;
  contactPageUrl?: string;
  submissionUrl?: string;
  liveLinkUrl?: string;

  anchorOrListingText?: string;
  suggestedPageToLink?: string;
  relatedServiceOrOffer?: string;

  outreachNote?: string;
  outreachTemplate?: string;
  requirements?: string[];
  nextStep?: string;

  estimatedValue?: "high" | "medium" | "low";
  difficulty?: "easy" | "medium" | "hard";
  relevanceReason?: string;
  safetyNotes?: string;

  /** Set when this item has been turned into a (Linked) Opportunity. */
  linkedOpportunityId?: string;

  createdAt: string;
  updatedAt?: string;
  liveAt?: string;
}

// ---- AI Provider Router / Evaluation v1 ----
export type AiTaskType =
  | "websiteScan"
  | "opportunityGeneration"
  | "contentGeneration"
  | "contentImprove"
  | "contentQualityScore"
  | "authorityGeneration"
  | "auditAnalysis"
  | "competitorGap"
  | "aiVisibility"
  | "analyticsSummary"
  | "brandIntelligenceSuggestion";

export interface AiEvaluationRating {
  quality?: number;
  brandFit?: number;
  languageQuality?: number;
  usefulness?: number;
  safetyTrust?: number;
}

export interface AiEvaluationRun {
  id: string;
  createdAt: string;
  projectId: string;
  taskType: AiTaskType;
  existingModel: string;
  candidateModel?: string;
  existingStatus: "success" | "error";
  candidateStatus: "success" | "error" | "notConfigured";
  existingLatencyMs?: number;
  candidateLatencyMs?: number;
  existingOutputPreview?: string;
  candidateOutputPreview?: string;
  existingError?: string;
  candidateError?: string;
  ratings?: {
    existing?: AiEvaluationRating;
    candidate?: AiEvaluationRating;
  };
  notes?: string;
}

// ---- Backlinks v1 ----
// Data-driven link profile + link gap powered by an external backlink index
// (DataForSEO). Raw metrics come from the index; AI only interprets them into
// prioritized, white-hat recommendations — it never invents link counts.
export type BacklinkRecommendationCategory =
  | "Link Gap Targets"
  | "Content for Links"
  | "Digital PR"
  | "Partnerships & Sponsorships"
  | "Directories & Profiles"
  | "Link Hygiene";

/** Aggregate backlink metrics for one domain (own site or a competitor). */
export interface BacklinkTargetSummary {
  target: string;
  fetchStatus: "fetched" | "failed";
  /** DataForSEO domain rank (0–1000 scale, higher is stronger). */
  rank: number;
  backlinks: number;
  referringDomains: number;
  referringMainDomains: number;
  brokenBacklinks: number;
  /** 0–100, higher = more spam signals in the link profile. */
  spamScore: number;
  firstSeen?: string;
}

export interface BacklinkReferringDomain {
  domain: string;
  rank: number;
  backlinks: number;
  spamScore: number;
  firstSeen?: string;
}

/** A domain that links to competitors but NOT to the business (link gap). */
export interface BacklinkGapDomain {
  domain: string;
  rank: number;
  /** How many of the analyzed competitors this domain links to. */
  intersections: number;
  competitorsLinked: string[];
  totalCompetitorBacklinks: number;
}

export interface BacklinkRecommendation {
  id: string;
  title: string;
  category: BacklinkRecommendationCategory;
  priority: Priority;
  effort: Priority;
  explanation: string;
  recommendation: string;
  targetDomainOrPlatform: string;
  suggestedApproach: string;
  suggestedOpportunityTitle: string;
  suggestedContentType: ContentType;
  suggestedSearchIntent: SearchIntent;
  suggestedCta: string;
}

export interface BacklinkAnalysisResult {
  id: string;
  projectId: string;
  note?: string;
  ownDomain: string;
  own: BacklinkTargetSummary;
  competitors: BacklinkTargetSummary[];
  topReferringDomains: BacklinkReferringDomain[];
  gapDomains: BacklinkGapDomain[];
  overallLinkScore: number;
  linkProfileScore: number;
  linkGapScore: number;
  linkQualityScore: number;
  summary: string;
  topLinkActions: string[];
  recommendations: BacklinkRecommendation[];
  /** Recommendation ids already turned into Opportunities (dedup for convert). */
  convertedRecommendationIds: string[];
  createdAt: string;
}

// ---- Sponsored publication marketplace v1 ----
export type LinkMarketplaceCurrency = "EUR";
export type LinkMarketplaceOrderStatus = "Requested" | "In Review" | "Accepted" | "Published" | "Cancelled";

export interface LinkMarketplaceOffer {
  id: string;
  provider: "demo" | "linkhouse";
  domain: string;
  title: string;
  description: string;
  categories: string[];
  markets: Market[];
  languages: Language[];
  domainRank: number;
  estimatedMonthlyTraffic: number;
  price: number;
  currency: LinkMarketplaceCurrency;
  turnaroundDays: number;
  linkAttributes: "sponsored";
}

export interface LinkMarketplaceMatch extends LinkMarketplaceOffer {
  matchScore: number;
  matchReasons: string[];
  isGapDomain: boolean;
}

export interface LinkMarketplaceOrder {
  id: string;
  projectId: string;
  offerId: string;
  provider: LinkMarketplaceOffer["provider"];
  domain: string;
  publicationTitle: string;
  targetUrl: string;
  suggestedTopic: string;
  price: number;
  currency: LinkMarketplaceCurrency;
  status: LinkMarketplaceOrderStatus;
  linkAttributes: "sponsored";
  createdAt: string;
  updatedAt: string;
}

// ---- AI Outreach v1 ----
export type OutreachTargetSource = "linkGap" | "marketplace" | "manual";
export type OutreachStatus = "Draft" | "Approved" | "Queued" | "Sent" | "Replied" | "Paused";

export interface OutreachFollowUp {
  delayDays: number;
  subject: string;
  body: string;
}

export interface OutreachDraft {
  id: string;
  projectId: string;
  targetDomain: string;
  contactName: string;
  contactEmail: string;
  source: OutreachTargetSource;
  subject: string;
  body: string;
  suggestedAsset: string;
  rationale: string;
  status: OutreachStatus;
  followUps: OutreachFollowUp[];
  createdAt: string;
  updatedAt: string;
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
