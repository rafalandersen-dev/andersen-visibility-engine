import type {
  ContentAsset,
  Opportunity,
  OpportunityLifecycleStatus,
  OpportunityPrimarySource,
  OpportunitySource,
  Priority,
} from "./types";

export const OPPORTUNITY_STAGES: OpportunityLifecycleStatus[] = [
  "captured",
  "prioritized",
  "scheduled",
  "drafting",
  "in_review",
  "approved",
  "published",
];

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityLifecycleStatus, string> = {
  captured: "Captured",
  prioritized: "Prioritized",
  scheduled: "Scheduled",
  drafting: "Drafting",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

const CANONICAL_STATUSES = new Set<OpportunityLifecycleStatus>([...OPPORTUNITY_STAGES, "archived"]);

const ALLOWED_TRANSITIONS: Record<OpportunityLifecycleStatus, OpportunityLifecycleStatus[]> = {
  captured: ["prioritized", "archived"],
  prioritized: ["scheduled", "archived"],
  scheduled: ["prioritized", "drafting", "archived"],
  drafting: ["scheduled", "in_review", "archived"],
  in_review: ["drafting", "approved", "archived"],
  approved: ["drafting", "published", "archived"],
  published: ["archived"],
  archived: [],
};

export class InvalidOpportunityTransitionError extends Error {
  constructor(
    public readonly from: OpportunityLifecycleStatus,
    public readonly to: OpportunityLifecycleStatus,
    message?: string,
  ) {
    super(message ?? `Cannot move an opportunity from ${from} to ${to}.`);
    this.name = "InvalidOpportunityTransitionError";
  }
}

export function isCanonicalOpportunityStatus(value: string): value is OpportunityLifecycleStatus {
  return CANONICAL_STATUSES.has(value as OpportunityLifecycleStatus);
}

function sourceToPrimary(source?: OpportunitySource): OpportunityPrimarySource {
  switch (source) {
    case "audit":
      return "site_audit";
    case "competitor":
      return "competitor";
    case "authority":
      return "authority";
    case "aiVisibility":
      return "ai_visibility";
    case "backlinks":
      return "backlinks";
    case "claude":
      return "claude";
    case "manual":
      return "manual";
    default:
      return "manual";
  }
}

export function opportunitySourceLabel(opportunity: Opportunity): string {
  const source = opportunity.primarySource ?? sourceToPrimary(opportunity.source);
  const labels: Record<OpportunityPrimarySource, string> = {
    site_audit: "Site audit",
    search_console: "Search Console",
    competitor: "Competitors",
    ai_visibility: "AI visibility",
    analytics: "Analytics",
    services_products: "Services & products",
    authority: "Authority",
    backlinks: "Backlinks",
    claude: "Claude",
    manual: opportunity.creationMode === "milo_discovery" ? "Milo discovery" : "Manual",
  };
  return labels[source];
}

function priorityToImpact(priority: Priority): "low" | "medium" | "high" {
  return priority.toLowerCase() as "low" | "medium" | "high";
}

function contentStatus(asset?: ContentAsset): OpportunityLifecycleStatus | undefined {
  if (!asset) return undefined;
  if (asset.livePublishStatus === "published" || asset.liveUrl) return "published";
  if (asset.status === "Approved" || asset.status === "Exported") return "approved";
  if (asset.status === "In Review") return "in_review";
  return "drafting";
}

/**
 * Read-safe lifecycle derivation. It understands every legacy status and can
 * derive the later content stages from the linked asset without mutating the
 * workspace during render.
 */
export function opportunityLifecycleStatus(
  opportunity: Opportunity,
  linkedAsset?: ContentAsset,
): OpportunityLifecycleStatus {
  if (opportunity.status === "archived" || opportunity.status === "Discarded") return "archived";
  if (opportunity.publishedAt || opportunity.canonicalUrl) return "published";

  const fromContent = contentStatus(linkedAsset);
  if (fromContent) return fromContent;
  if (isCanonicalOpportunityStatus(opportunity.status)) return opportunity.status;
  if (opportunity.dueAt) return "scheduled";

  switch (opportunity.status) {
    case "In Brief":
      return "prioritized";
    case "Drafting":
      return "drafting";
    case "New":
    case "Linked":
    default:
      return "captured";
  }
}

/** Adds safe v2 defaults in memory. Existing persisted records are untouched. */
export function opportunityView(
  opportunity: Opportunity,
  linkedAsset?: ContentAsset,
): Opportunity & { status: OpportunityLifecycleStatus } {
  const createdAt = opportunity.createdAt ?? opportunity.updatedAt ?? "1970-01-01T00:00:00.000Z";
  const primarySource = opportunity.primarySource ?? sourceToPrimary(opportunity.source);
  return {
    ...opportunity,
    status: opportunityLifecycleStatus(opportunity, linkedAsset),
    creationMode:
      opportunity.creationMode ?? (primarySource === "manual" ? "manual" : "milo_discovery"),
    primarySource,
    sourceRefs: opportunity.sourceRefs ?? [
      { sourceType: primarySource, sourceRecordId: opportunity.requestId, capturedAt: createdAt },
    ],
    reasonDiscovered: opportunity.reasonDiscovered ?? opportunity.businessValue,
    evidence: opportunity.evidence ?? [],
    businessImpact: opportunity.businessImpact ?? priorityToImpact(opportunity.priority),
    createdAt,
    updatedAt: opportunity.updatedAt ?? createdAt,
    version: opportunity.version ?? 1,
    currentContentAssetId: opportunity.currentContentAssetId ?? linkedAsset?.id,
    canonicalUrl: opportunity.canonicalUrl ?? linkedAsset?.liveUrl,
    publishedAt: opportunity.publishedAt ?? linkedAsset?.livePublishedAt,
    measurementStatus:
      opportunity.measurementStatus ??
      (linkedAsset?.livePublishStatus === "published" ? "collecting" : "not_started"),
    measurementWindowDays: opportunity.measurementWindowDays ?? 28,
  };
}

export function canTransitionOpportunity(
  from: OpportunityLifecycleStatus,
  to: OpportunityLifecycleStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionOpportunityRecord(
  opportunity: Opportunity,
  to: OpportunityLifecycleStatus,
  fields: Partial<Opportunity> = {},
  linkedAsset?: ContentAsset,
  now = new Date().toISOString(),
): Opportunity {
  const current = opportunityView(opportunity, linkedAsset);
  const from = current.status;
  if (!canTransitionOpportunity(from, to)) {
    throw new InvalidOpportunityTransitionError(from, to);
  }
  if (to === "prioritized" && !(fields.priority ?? current.priority)) {
    throw new InvalidOpportunityTransitionError(
      from,
      to,
      "Choose a priority before moving this opportunity forward.",
    );
  }
  if (to === "scheduled" && !(fields.dueAt ?? current.dueAt)) {
    throw new InvalidOpportunityTransitionError(
      from,
      to,
      "Choose a due date before scheduling this opportunity.",
    );
  }
  if (
    to === "published" &&
    !(fields.canonicalUrl ?? current.canonicalUrl ?? linkedAsset?.liveUrl)
  ) {
    throw new InvalidOpportunityTransitionError(
      from,
      to,
      "A published opportunity needs its canonical live URL.",
    );
  }

  return {
    ...current,
    ...fields,
    status: to,
    previousStatus: to === "archived" ? from : current.previousStatus,
    archivedAt: to === "archived" ? now : undefined,
    updatedAt: now,
    version: (current.version ?? 1) + 1,
  };
}

export function restoreOpportunityRecord(
  opportunity: Opportunity,
  now = new Date().toISOString(),
): Opportunity {
  const current = opportunityView(opportunity);
  if (current.status !== "archived") {
    throw new InvalidOpportunityTransitionError(
      current.status,
      current.previousStatus ?? "captured",
    );
  }
  const restored =
    current.previousStatus && current.previousStatus !== "archived"
      ? current.previousStatus
      : "captured";
  return {
    ...current,
    status: restored,
    previousStatus: undefined,
    archivedAt: undefined,
    updatedAt: now,
    version: (current.version ?? 1) + 1,
  };
}

export function newOpportunityRecord(
  opportunity: Omit<Opportunity, "status"> & { status?: Opportunity["status"] },
  now = new Date().toISOString(),
): Opportunity {
  const primarySource = opportunity.primarySource ?? sourceToPrimary(opportunity.source);
  return {
    ...opportunity,
    // New writes always use the canonical lifecycle. Legacy labels remain
    // read-compatible through opportunityView, but are never persisted again.
    status:
      opportunity.status && isCanonicalOpportunityStatus(opportunity.status)
        ? opportunity.status
        : "captured",
    creationMode:
      opportunity.creationMode ?? (primarySource === "manual" ? "manual" : "milo_discovery"),
    primarySource,
    sourceRefs: opportunity.sourceRefs ?? [
      { sourceType: primarySource, sourceRecordId: opportunity.requestId, capturedAt: now },
    ],
    reasonDiscovered: opportunity.reasonDiscovered ?? opportunity.businessValue,
    evidence: opportunity.evidence ?? [],
    businessImpact: opportunity.businessImpact ?? priorityToImpact(opportunity.priority),
    createdAt: opportunity.createdAt ?? now,
    updatedAt: opportunity.updatedAt ?? now,
    measurementStatus: opportunity.measurementStatus ?? "not_started",
    measurementWindowDays: opportunity.measurementWindowDays ?? 28,
    version: opportunity.version ?? 1,
  };
}

export function opportunityDeduplicationKey(opportunity: Opportunity): string {
  const title = opportunity.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return `${opportunity.projectId}:${opportunity.primarySource ?? sourceToPrimary(opportunity.source)}:${title}`;
}
