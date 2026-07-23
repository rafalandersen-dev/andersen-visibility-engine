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

/**
 * Opportunity lifecycle used by the redesigned Plan workspace. Legacy values
 * remain in the union so existing JSONB workspaces can be read and migrated on
 * first edit without a destructive, all-at-once data rewrite.
 */
export type OpportunityLifecycleStatus =
  | "captured"
  | "prioritized"
  | "scheduled"
  | "drafting"
  | "in_review"
  | "approved"
  | "published"
  | "archived";

export type LegacyOpportunityStatus = "New" | "In Brief" | "Drafting" | "Discarded" | "Linked";

export type OpportunityStatus = OpportunityLifecycleStatus | LegacyOpportunityStatus;

export type ContentStatus = "Draft" | "In Review" | "Approved" | "Rejected" | "Exported";

/** Where a Linked opportunity originated (Content Engine 2.0 source context). */
export type OpportunitySource =
  "audit" | "competitor" | "manual" | "authority" | "aiVisibility" | "claude" | "backlinks";

export type OpportunityCreationMode = "milo_discovery" | "manual" | "system_follow_up";

export type OpportunityPrimarySource =
  | "site_audit"
  | "search_console"
  | "competitor"
  | "ai_visibility"
  | "analytics"
  | "services_products"
  | "authority"
  | "backlinks"
  | "claude"
  | "manual";

export interface OpportunitySourceRef {
  sourceType: OpportunityPrimarySource | string;
  sourceRecordId?: string;
  capturedAt: string;
}

export interface OpportunityEvidence {
  label: string;
  value: string | number;
  unit?: string;
}

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

/**
 * Lifecycle of a row in the `scheduled_publishes` queue.
 * `publishing` is a claimed-but-unfinished state owned by the cron runner; it
 * is never retried blindly, because the WordPress and Shopify connectors create
 * a new post when no external id is supplied. An interrupted run is parked as
 * `failed` for a human decision instead of risking a duplicate live post.
 */
export type ScheduledPublishStatus =
  "pending" | "publishing" | "published" | "failed" | "cancelled";

/** One queued publish. Mirrors a `scheduled_publishes` row. */
export interface ScheduledPublish {
  id: string;
  projectId: string;
  assetId: string;
  /** ISO timestamp — when the runner should publish. */
  publishAt: string;
  status: ScheduledPublishStatus;
  attempts: number;
  lastError?: string;
  publishedAt?: string;
  createdAt: string;
}

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
  /**
   * Set when the call failed and we could PROVE nothing was created on the
   * site, so another attempt is safe. Absent or false means the outcome is
   * unknown and the scheduled runner must park rather than republish.
   */
  retryable?: boolean;
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
  /** See WordPressPublishResult.retryable — same contract. */
  retryable?: boolean;
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
  /**
   * Internal paths the user has explicitly approved as real pages on their site,
   * so a relative in-body link to one publishes as an active link (link-safety
   * P0). Normalised paths (e.g. "/services"). Lives in the project JSONB — no
   * migration. The deterministic verified set (root + Milo-published) is derived,
   * never stored here.
   */
  approvedInternalPaths?: string[];
  /**
   * Compact, cached inventory of the site's own URLs discovered from its
   * sitemap(s) (P1.1 D). Feeds the VERIFIED internal-path set. Only the
   * normalised same-origin paths + metadata are stored — never the raw XML —
   * and it is re-fetched once stale. JSONB, no migration.
   */
  sitemapInventory?: SitemapInventory;
  /**
   * Monthly Auto-Scheduler opt-in (owner spec 2026-07-23). When enabled, the
   * ~25th cron fills next month's calendar for this project within plan quota.
   * Shape defined in auto-scheduler.ts (kept loose here to avoid a cycle).
   */
  autoScheduler?: {
    enabled: boolean;
    weekdays: number[];
    publishTime: string;
    timeZone: string;
    mode: "auto_publish" | "approve_first";
    summaryEmail?: string;
  };
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
  "notConfigured" | "disconnected" | "connected" | "expired" | "error";

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
  topQueries: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
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
  // ---- Opportunity System v2 (all optional for legacy workspace safety) ----
  summary?: string;
  previousStatus?: OpportunityLifecycleStatus;
  creationMode?: OpportunityCreationMode;
  primarySource?: OpportunityPrimarySource;
  sourceRefs?: OpportunitySourceRef[];
  reasonDiscovered?: string;
  evidence?: OpportunityEvidence[];
  discoveryRunId?: string;
  businessImpact?: "low" | "medium" | "high";
  priorityReason?: string;
  ownerUserId?: string;
  ownerName?: string;
  /** ISO date or timestamp. Calendar views use the local calendar day. */
  dueAt?: string;
  topicId?: string;
  targetQuery?: string;
  currentContentAssetId?: string;
  approvedContentVersionId?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  measurementStatus?: "not_started" | "collecting" | "ready" | "insufficient_data";
  measurementWindowDays?: number;
  baselineSnapshotId?: string;
  resultSnapshotId?: string;
  parentOpportunityId?: string;
  createdByUserId?: string;
  updatedAt?: string;
  archivedAt?: string;
  deletedAt?: string;
  version?: number;
}

/**
 * A Milo discovery result is deliberately not an Opportunity yet. It becomes
 * one canonical `captured` record only after the user accepts it in Discover.
 */
export type DiscoverySuggestion = Omit<Opportunity, "status"> & {
  status: "suggested" | "accepted" | "dismissed";
  deduplicationKey: string;
  generatedAt: string;
  acceptedOpportunityId?: string;
};

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
  // ---- Scheduled publishing v1 (all optional) ----
  /**
   * UI mirror of the asset's row in the `scheduled_publishes` queue. The table
   * is the source of truth for the cron runner; these fields exist so the
   * editor can render "Scheduled for …" without a round-trip. Both are written
   * together by the scheduling server fn and by the runner.
   */
  scheduledPublishAt?: string;
  scheduledPublishStatus?: ScheduledPublishStatus;
  scheduledPublishError?: string;
  /**
   * Set when this draft is a rewrite of a page already live whose original asset
   * was lost. Carries the prior canonical URL forward so the connector UPDATES the
   * page in place instead of CREATING a duplicate. Deliberately NOT `liveUrl`:
   * pipelineStage and contentStatus both read liveUrl and would mis-derive an
   * empty rewrite draft as already-live, hiding the writing-in-progress.
   */
  republishTargetUrl?: string;
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
  // ---- Article Studio 2.0 / P1.1 — canonical assembled asset (all optional, JSONB, no migration) ----
  //
  // Field roles (Article Studio 2.0 §4; the governing principle is that the
  // assembled output — and ONLY it — publishes):
  //   • generated  (AI proposes): tldr, keyTakeaways, sources[], images[].concept,
  //                 breadcrumbs, and a *suggested* author (never auto-trusted — C22).
  //   • user-edited (human owns):  title, metaTitle, metaDescription, markdown body,
  //                 author (must be a real, consenting person), images[].alt/caption.
  //   • validated  (checked before publish): sources[].status (fetch-validated),
  //                 internal links (link-safety three-state), images[] (alt present),
  //                 checklist[] (publish gate), readiness (scores over the asset).
  //   • publishable (the ONLY thing sent to any connector): assembled.{markdown,html,jsonLd}.
  //
  /** Visible short summary composed at the top of the canonical body (the visible TL;DR — D11). */
  tldr?: string;
  /** Visible "key takeaways" bullets, composed into the canonical body. */
  keyTakeaways?: string[];
  /** E-E-A-T author entity. A named byline must be a real, consenting person (C22). */
  author?: ContentAuthor;
  /** Cited sources. Never fabricated; unreachable/unsupported are labelled, not dropped (C9). */
  sources?: ContentSource[];
  /** Images. No hotlinking; alt text is a hard publish gate (C18/C19). */
  images?: ContentImage[];
  /** Breadcrumb trail for BreadcrumbList JSON-LD (H). */
  breadcrumbs?: BreadcrumbItem[];
  /**
   * The canonical rendered output, cached for preview/publish parity. DERIVED by
   * the single assembler (`assembleContentAsset`) — never hand-edited. This is the
   * sole source for publishing; a stale cache is re-derived, never published blind.
   */
  assembled?: AssembledContent;
  /** Publishing-checklist results (J). A failed blocking item prevents publish. */
  checklist?: ChecklistItem[];
  /** Publication-readiness scores over the canonical asset (I) — sibling of qualityScore. */
  readiness?: ReadinessScore;
  // ---- Article Studio 3.0 / P1.2A — Hook + visual-model marker (all optional, JSONB, no migration) ----
  /**
   * Article Studio visual model. ABSENT → Article Studio 2.0 (legacy): the hook
   * hard blockers do NOT apply. `3` → Article Studio 3.0. The publishing policy is
   * driven by THIS marker (+ `visualState`), NEVER inferred from whether a `hook`
   * exists — so a brand-new v3 article that has not been given a hook yet is still
   * classified v3 (never mis-read as legacy), and a legacy article is never
   * retroactively blocked. See `visual-model.ts`.
   */
  visualModelVersion?: VisualModelVersion;
  /**
   * Lifecycle of the 3.0 visual upgrade. `upgrading`/`current` → v3 rules apply
   * (including to a former legacy asset the author explicitly upgraded);
   * `legacy`/`needsVisualUpgrade` → legacy policy. The upgrade is forward-only in
   * the UI — no user-facing revert ships in the P1.2 MVP (D-AS3-5).
   */
  visualState?: VisualState;
  /** First-class opening hook, composed exactly once before the TL;DR (P1.2A). */
  hook?: ArticleHook;
  /**
   * First-class featured image (P1.2B): one Storage object, hero/mobile/social
   * crops as metadata variants. When present + approved, the assembler renders
   * the compiled hero at the top INSTEAD of the legacy placement:"featured"
   * image; absent → the Article Studio 2.0 rendering is byte-identical.
   */
  featuredImage?: FeaturedImage;
  /**
   * Persisted section identities for stable image anchors (P1.2C). Derived from the
   * body headings + reconciled on edit; the ONLY persisted section state (no derived
   * resolved/broken status is stored). See `section-index.ts`.
   */
  sectionIndex?: SectionRef[];
  /**
   * Up to three opening-hook options returned by article generation (P1.2A). The
   * editor's proposal selector reads these; selecting one creates a `generated`/
   * `draft` hook. Never auto-selected or auto-approved.
   */
  hookProposals?: HookProposal[];
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

// ---- Article Studio 2.0 / P1.1 — canonical assembled asset ----

/** E-E-A-T author entity. A named byline MUST be a real, consenting person (C22). */
export interface ContentAuthor {
  name: string;
  bio?: string;
  role?: string;
  credentials?: string;
  /** Author profile / bio page. */
  url?: string;
  /** Authoritative profiles for `sameAs` in author JSON-LD (LinkedIn, ORCID, …). */
  sameAs?: string[];
  /** A Milo-controlled / CMS-hosted origin only — never hotlinked. */
  imageUrl?: string;
}

/**
 * The verification state of a cited source. `unchecked` = attached but not yet
 * validated; `unreachable`/`unsupported` are LABELLED, never silently dropped and
 * never treated as verified (C9).
 */
export type ContentSourceStatus = "verified" | "unreachable" | "unsupported" | "unchecked";

/** A source the article cites. Never fabricated (C9). */
export interface ContentSource {
  url: string;
  title?: string;
  /** The specific factual claim this source supports. */
  claim?: string;
  status: ContentSourceStatus;
  checkedAt?: string;
  /** Why a check produced its status: "ok" | "blocked" | "timeout" | "http_<code>" | "network". */
  checkNote?: string;
  /** True for a Your-Money-Your-Life claim that must trace to a source (C25). */
  ymyl?: boolean;
}

export type ContentImagePlacement = "featured" | "inline";
export type ContentImageStatus = "proposed" | "accepted" | "generated" | "missing";
export type ContentImageSource = "uploaded" | "existing" | "generated";

/** An image for the article. No hotlinking; alt text is a hard publish gate (C18/C19). */
export interface ContentImage {
  id: string;
  /** What the image should convey (the visual concept). */
  concept: string;
  /** A Milo-controlled / CMS-uploaded origin only — never a hotlinked third-party URL. */
  url?: string;
  /** Required before publish; a missing alt blocks publishing (C19). */
  alt: string;
  caption?: string;
  placement: ContentImagePlacement;
  source?: ContentImageSource;
  status: ContentImageStatus;
  /**
   * True for a REQUIRED content image (its absence blocks publishing). Optional /
   * decorative images (false or unset) never block publishing (C19).
   */
  required?: boolean;
  /** Storage object path (`<uid>/<projectId>/<assetId>/<id>.<ext>`) — for promote/remove. */
  storagePath?: string;
  /** Short-lived signed URL for the editor thumbnail before the image is approved/public. */
  previewUrl?: string;
  // ---- Article Studio 3.0 / P1.2C — stable anchors (all optional, JSONB, no migration) ----
  /**
   * Serialized placement anchor for an INLINE image (`before-hook` … `article-end`,
   * `before-section:<sectionId>` / `after-section:<sectionId>`). Parsed to a typed
   * anchor by `anchors.parseAnchor`. Only valid on `placement:"inline"`. Absent → a
   * legacy un-anchored image (keeps the Article Studio 2.0 append-after-body render).
   * The derived resolved/broken/ambiguous/unplaced state is NEVER persisted — it is
   * recomputed at assembly/checklist time from the current body.
   */
  anchor?: string;
  /** Ordering among images sharing one anchor (ascending; ties broken by image id). */
  order?: number;
  // ---- Article Studio 3.0 / P1.2D — bounded presentation (all optional, JSONB, no migration) ----
  /** Bounded desktop/base presentation preset. Absent → today's default rendering. */
  presentation?: ImagePresentation;
  /** Mobile overrides; unset fields inherit `presentation` (validated partial). */
  mobilePresentation?: ImagePresentationOverride;
  /**
   * Set when a human has acknowledged the placement of a legacy/unplaced image
   * during the controlled visual upgrade. Authored state — not a derived status.
   */
  placementReviewedAt?: string;
}

// ---- Article Studio 3.0 / P1.2B — featured image (one object, many variants) ----

/**
 * A per-context crop over the SAME stored object (spec §4.3). METADATA ONLY —
 * never a new Storage object. Compiled at render time to the P1.2D allow-listed
 * figure (clamped `object-position` + aspect box); no other styling surface.
 */
export interface PresentationVariant {
  aspectRatio: ImageAspect;
  fit: ImageFit;
  focalPoint?: FocalPoint;
}

/**
 * First-class featured/article image (spec §4/§4.3): ONE controlled-origin
 * Storage object (`storagePath`) with hero/mobile/social presentation VARIANTS
 * over it. Alt is a hard publish gate for v3 articles; approval is deliberate,
 * never automatic. Connector identity fields are DORMANT until P1.2G — they are
 * recorded so republish can be idempotent later, but no connector media
 * behaviour ships in P1.2B (approval-gated, document-first).
 */
export interface FeaturedImage {
  /** References the approved ContentImage this was picked from. */
  imageId: string;
  /** THE single stored object identity — never duplicated per variant. */
  storagePath: string;
  /** Stable PUBLIC url once approved (never a signed url). */
  url?: string;
  /** Short-lived signed preview before approval. */
  previewUrl?: string;
  /** Required for publish on v3 articles (hard gate). */
  alt: string;
  caption?: string;
  /** Article/hero crop — the one the assembler renders at the top. */
  hero: PresentationVariant;
  /** Optional mobile crop; falls back to hero. */
  mobile?: PresentationVariant;
  /** Social / Open Graph crop; a DISTINCT physical asset is optional, never required. */
  social?: {
    variant?: PresentationVariant;
    physicalUrl?: string;
    alt?: string;
  };
  approval: "draft" | "approved";
  // Connector identity (set on publish/republish once P1.2G lands — dormant now):
  wordpressMediaId?: number;
  shopifyImageMapped?: boolean;
  publishedObjectHash?: string;
}

/**
 * A persisted section identity (Article Studio 3.0 / P1.2C). `id` is an opaque token
 * allocated once; `heading`/`normalized`/`level`/`order`/`fingerprint`/`excerpt` are
 * reconciliation SIGNALS refreshed on each body edit, never the identity itself. No
 * derived status is stored here (resolved/ambiguous/missing is computed at read time).
 */
export interface SectionRef {
  id: string;
  heading: string;
  normalized: string;
  level: number;
  order: number;
  /** FNV-1a fingerprint of the section's immediate normalized content (exact-equality signal). */
  fingerprint?: string;
  /** Normalized content excerpt (similarity signal). */
  excerpt?: string;
}

// ---- Article Studio 3.0 / P1.2D — bounded image presentation ----

export type ImageSize = "small" | "medium" | "large" | "wide" | "full";
/** Alignment is left/center/right only — `full` is a SIZE, never an alignment. */
export type ImageAlign = "left" | "center" | "right";
export type ImageAspect = "original" | "square" | "portrait" | "landscape" | "wide";
export type ImageFit = "cover" | "contain";
export type ImageVisualStyle = "plain" | "rounded" | "card";

/** Normalized focal point (0..1 each). Active only when `fit:"cover"`. */
export interface FocalPoint {
  x: number;
  y: number;
}

/** Bounded, additive presentation preset. Enums only — no arbitrary CSS/classes/HTML. */
export interface ImagePresentation {
  size: ImageSize;
  alignment: ImageAlign;
  aspectRatio: ImageAspect;
  fit: ImageFit;
  visualStyle: ImageVisualStyle;
  focalPoint?: FocalPoint;
  captionVisible?: boolean;
}

/**
 * A validated mobile override. Every field is optional and inherits the base
 * `ImagePresentation` when unset; `focalPoint` must be a complete `{x,y}` or absent
 * (no partial coordinate). Never a free-form `Partial` of an invalid nested shape.
 */
export interface ImagePresentationOverride {
  size?: ImageSize;
  alignment?: ImageAlign;
  aspectRatio?: ImageAspect;
  fit?: ImageFit;
  visualStyle?: ImageVisualStyle;
  focalPoint?: FocalPoint;
  captionVisible?: boolean;
}

/** A breadcrumb trail item for BreadcrumbList JSON-LD (H). */
export interface BreadcrumbItem {
  name: string;
  url: string;
}

// ---- Article Studio 3.0 / P1.2A — Hook model & visual-model marker ----

export type VisualModelVersion = 2 | 3;
export type VisualState = "legacy" | "needsVisualUpgrade" | "upgrading" | "current";

/** The seven supported opening-hook rhetorical types. */
export type HookType =
  | "question"
  | "problem-to-solution"
  | "surprising-fact"
  | "contrarian"
  | "story"
  | "result"
  | "promise";

/**
 * PROVENANCE — how the current hook text came to be. Deliberately SEPARATE from
 * approval (D-AS3-9): a generated hook can be approved, an edited hook can still
 * be a draft. The two are never conflated in one field.
 */
export type HookProvenance = "generated" | "user-edited";

/** APPROVAL — a deliberate human gate, never auto-set. Separate from provenance. */
export type HookApproval = "draft" | "approved";

export type HookWarningCode =
  | "generic-filler"
  | "title-repetition"
  | "weak-relevance"
  | "excessive-clickbait"
  | "excessive-length"
  | "testimonial-like"
  | "overly-broad-promise";

export type HookBlockerCode =
  "unsupported-statistic" | "explicit-guarantee" | "ymyl-unsupported" | "unsupported-testimonial";

/** A deterministic resolution action the editor can offer for a finding. */
export type HookResolutionAction =
  | "edit-hook"
  | "attach-evidence"
  | "change-hook-type"
  | "remove-unsupported-claim"
  | "request-human-confirmation";

/**
 * One validation finding (warning or blocker). Messages say "unsupported" /
 * "needs a source" — NEVER "fabricated": the system has no evidence a claim is
 * false, only that it is unsupported (D-AS3-9).
 */
export interface HookFinding {
  code: HookWarningCode | HookBlockerCode;
  message: string;
  actions: HookResolutionAction[];
}

/** An evidence/source reference backing a factual claim in the hook. */
export interface HookEvidenceRef {
  /** A source URL (may match a ContentSource.url the asset already cites). */
  url: string;
  /** The specific claim this evidence supports. */
  claim?: string;
}

/**
 * First-class opening hook (P1.2A). Emitted exactly once by the canonical
 * assembler, before the TL;DR. All fields additive/optional on ContentAsset.
 */
export interface ArticleHook {
  /** Stable id, allocated once at creation (mirrors ContentImage.id). */
  id: string;
  text: string;
  type: HookType;
  /** Author intent for this hook. */
  purpose?: string;
  /** Provenance — SEPARATE from approval. */
  provenance: HookProvenance;
  /** Deliberate approval — never auto-approved. */
  approval: HookApproval;
  /** Optional evidence backing a factual claim in the hook. */
  evidence?: HookEvidenceRef[];
  /**
   * Cached validation findings for the editor. ADVISORY only — the publish gate
   * ALWAYS recomputes via `validateHook` and never trusts these, so a stale
   * cached finding can neither block a safe publish nor unblock an unsafe one.
   */
  warnings?: HookFinding[];
  blockers?: HookFinding[];
  /** ISO timestamps, consistent with the asset's existing conventions. */
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A hook option returned by article generation. Never auto-approved: the selected
 * proposal becomes a `generated`/`draft` ArticleHook (see hook.ts).
 */
export interface HookProposal {
  text: string;
  type: HookType;
  purpose?: string;
}

/**
 * The canonical rendered output, cached for preview/publish parity. DERIVED by the
 * single assembler — never hand-edited. `markdown` is the composed canonical body;
 * `html` is `markdownToHtml(markdown)`; `jsonLd` is the deterministic schema.org set.
 */
export interface AssembledContent {
  markdown: string;
  html: string;
  jsonLd: Record<string, unknown>[];
  assembledAt: string;
}

/** One publishing-checklist result (J). A failed BLOCKING item prevents publish. */
export interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  /** Blocking → a fail prevents publish; non-blocking → advisory only (C23). */
  blocking: boolean;
  detail?: string;
}

/** pass / review / fail for the rule-or-AI readiness dimensions (I). */
export type ReadinessLevel = "pass" | "review" | "fail";

/**
 * Publication-readiness scores over the canonical assembled asset (I). A SIBLING of
 * `QualityScore` — kept separate so the 8-category weighted Milo Score stays intact
 * (weights must sum to 1.0). Duplication/cannibalisation are deterministic corpus
 * passes over the project's other assets, not AI calls.
 */
export interface ReadinessScore {
  /** 0–100; rule-based (title/meta/H1 lengths, keyword-in-title) + AI. */
  seoReadiness?: number;
  /** 0–100; sentence length, heading density, answer-first structure. */
  aiReadability?: number;
  /** YMYL risk; `fail` requires a human gate before publish (C25). */
  ymylRisk?: ReadinessLevel;
  /** Deterministic similarity vs the project's other assets. */
  duplicationRisk?: ReadinessLevel;
  /** Deterministic same-intent/same-query overlap vs other assets (C28). */
  cannibalisationRisk?: ReadinessLevel;
  /** 0–100 derived from the publishing checklist (J). */
  publishingReadiness?: number;
  evaluatedAt?: string;
}

/**
 * Compact cached inventory of a site's own URLs from its sitemap(s) (P1.1 D).
 * Stores ONLY normalised same-origin paths + metadata — never the raw XML — and
 * is re-fetched when stale. Feeds the VERIFIED internal-path set.
 */
export interface SitemapInventory {
  /** Normalised same-origin paths (e.g. "/services", "/blog/post"). */
  paths: string[];
  fetchedAt: string;
  /** Distinct URLs kept (== paths.length). */
  urlCount: number;
  /** How many sitemap documents were fetched. */
  sitemapCount: number;
  /** True when a cap (URL count / file count) truncated the crawl. */
  truncated: boolean;
}

// ---- Site Audit v1 ----
export type AuditCategory =
  "Business Clarity" | "SEO Basics" | "Local Visibility" | "AI Readiness" | "Conversion & Trust";

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
  "suggested" | "planned" | "contacted" | "submitted" | "live" | "rejected" | "notRelevant";

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
export type BacklinkProviderState = "not_configured" | "ready" | "low_balance" | "paused" | "error";

/** Safe, client-visible health summary for the server-side backlink provider. */
export interface BacklinkProviderStatus {
  configured: boolean;
  state: BacklinkProviderState;
  balanceUsd?: number;
  checkedAt?: string;
}

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
export type LinkMarketplaceOrderStatus =
  "Requested" | "In Review" | "Submitted" | "Accepted" | "Published" | "Failed" | "Cancelled";

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

export interface LinkMarketplaceIntegrationStatus {
  mode: "demo" | "live";
  provider: "linkhouse";
  credentialsPresent: boolean;
  signingReady: boolean;
  marginConfigured: boolean;
  catalogConnected: boolean;
  orderingEnabled: boolean;
  documentationPending: boolean;
}

export interface LinkMarketplaceQuote {
  id: string;
  offerId: string;
  provider: LinkMarketplaceOffer["provider"];
  domain: string;
  publicationTitle: string;
  basePrice: number;
  serviceFee: number;
  marginPercent: number;
  totalPrice: number;
  currency: LinkMarketplaceCurrency;
  linkAttributes: "sponsored";
  createdAt: string;
  expiresAt: string;
  confirmationToken: string;
  live: boolean;
}

export interface LinkMarketplaceOrderEvent {
  status: LinkMarketplaceOrderStatus;
  at: string;
  note: string;
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
  basePrice?: number;
  serviceFee?: number;
  marginPercent?: number;
  price: number;
  currency: LinkMarketplaceCurrency;
  status: LinkMarketplaceOrderStatus;
  linkAttributes: "sponsored";
  quoteId?: string;
  quoteExpiresAt?: string;
  confirmedAt?: string;
  providerOrderId?: string;
  providerStatus?: string;
  lastSyncedAt?: string;
  events?: LinkMarketplaceOrderEvent[];
  createdAt: string;
  updatedAt: string;
}

// ---- AI Outreach v1 ----
export type OutreachTargetSource = "linkGap" | "marketplace" | "manual";
export type OutreachStatus =
  "Draft" | "Approved" | "Queued" | "Sent" | "Replied" | "Paused" | "Failed" | "Suppressed";

export interface OutreachFollowUp {
  delayDays: number;
  subject: string;
  body: string;
}

export interface OutreachDeliveryEvent {
  kind: "initial" | "followUp";
  followUpIndex?: number;
  status: "accepted" | "failed" | "suppressed";
  at: string;
  provider: "resend";
  providerMessageId?: string;
  note: string;
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
  approvedAt?: string;
  sentAt?: string;
  provider?: "resend";
  providerMessageId?: string;
  deliveryEvents?: OutreachDeliveryEvent[];
  lastDeliveryError?: string;
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
