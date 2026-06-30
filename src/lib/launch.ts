/**
 * Beta Launch Hardening (Sprint 16) — pure, client+server safe computation of
 * the launch checklist and connector/setup status from current workspace data.
 *
 * No env, no secrets, no network. UI strings are returned as i18n keys so the
 * caller can localise them. Status is computed from the active project + its
 * related workspace slices; live-data items (analytics events) are optional and
 * resolved by the caller where available.
 */
import type {
  Project,
  ServiceItem,
  Opportunity,
  ContentAsset,
  AuditResult,
  AuthorityOpportunity,
} from "./types";
import type { BillingProfile, SubscriptionPlan } from "./billing";

export type ChecklistState = "done" | "missing" | "optional";

export interface ChecklistItem {
  key: string;
  state: ChecklistState;
  labelKey: string;
  descKey: string;
  /** App route this item links to (optional). */
  to?: string;
}

export interface ChecklistSection {
  key: string;
  titleKey: string;
  items: ChecklistItem[];
}

export interface ChecklistProgress {
  requiredDone: number;
  requiredTotal: number;
  doneCount: number;
  optionalDone: number;
  total: number;
  /** 0–100 across required (done|missing) items only. */
  percent: number;
}

export interface LaunchChecklist {
  sections: ChecklistSection[];
  progress: ChecklistProgress;
}

export interface ConnectionStatusCard {
  key: string;
  labelKey: string;
  /** "ok" | "partial" | "none" — drives the colour/icon. */
  level: "ok" | "partial" | "none";
  /** Detail line as an i18n key. */
  detailKey: string;
  to?: string;
}

export interface LaunchInputs {
  project: Project;
  services: ServiceItem[];
  opportunities: Opportunity[];
  content: ContentAsset[];
  audits: AuditResult[];
  authorityOpportunities: AuthorityOpportunity[];
  billingProfile?: BillingProfile;
  subscription?: SubscriptionPlan;
  isOwner: boolean;
  /** Optional live analytics event count (caller may resolve server-side). */
  analyticsEventCount?: number;
}

// ---- small predicates ----

function brandIntelligenceStarted(p: Project): boolean {
  const bi = p.brandIntelligence;
  if (!bi) return false;
  return Boolean(
    bi.updatedAt ||
      bi.voice?.tone ||
      (bi.offers?.primaryOffers?.length ?? 0) > 0 ||
      (bi.claims?.allowedClaims?.length ?? 0) > 0,
  );
}

/** Has the publishing connector got enough config to attempt a send? */
export function connectorConfigured(p: Project): boolean {
  const type = p.connectorType ?? "custom";
  if (type === "wordpress") {
    const w = p.wordpress ?? {};
    return Boolean(w.siteUrl && w.username && w.applicationPassword);
  }
  if (type === "shopify") {
    const s = p.shopify ?? {};
    return Boolean(s.shopDomain && s.adminAccessToken && s.defaultBlogId);
  }
  // custom
  return Boolean(p.publishEndpoint && p.publishSecret);
}

/** Connector test status — only meaningful for WordPress/Shopify. */
function connectorTested(p: Project): ChecklistState {
  const type = p.connectorType ?? "custom";
  if (type === "wordpress") return p.wordpress?.lastTestStatus === "success" ? "done" : "missing";
  if (type === "shopify") return p.shopify?.lastTestStatus === "success" ? "done" : "missing";
  return "optional"; // custom connector has no in-app test
}

const PUBLISHED_STATUSES = new Set(["planned", "contacted", "submitted", "live"]);

// ---- checklist ----

export function computeLaunchChecklist(input: LaunchInputs): LaunchChecklist {
  const { project: p, services, opportunities, content, audits, authorityOpportunities } = input;
  const sub = input.subscription;
  const billing = input.billingProfile;

  const bool = (v: boolean): ChecklistState => (v ? "done" : "missing");

  const hasScore = content.some((c) => Boolean(c.qualityScore));
  const hasReviewed = content.some((c) =>
    c.status === "In Review" || c.status === "Approved" || c.status === "Exported" || c.status === "Rejected",
  );
  const hasDraftSent = content.some((c) => c.publishStatus === "sent");
  const hasLive = content.some((c) => c.livePublishStatus === "published" || Boolean(c.liveUrl));
  const hasAuthority = authorityOpportunities.length > 0;
  const hasAuthorityProgress = authorityOpportunities.some((a) => PUBLISHED_STATUSES.has(a.status));
  const gscImports = p.gscLite?.imports?.length ?? 0;
  const connType = p.connectorType ?? "custom";
  const isCustom = connType === "custom";

  const billingStatusVisible =
    input.isOwner ||
    (!!sub &&
      (sub.status === "manualBeta" ||
        sub.status === "manualComped" ||
        sub.status === "checkoutPending" ||
        sub.status === "active"));

  const analyticsEvents =
    typeof input.analyticsEventCount === "number"
      ? input.analyticsEventCount > 0
        ? "done"
        : "optional"
      : "optional";

  const sections: ChecklistSection[] = [
    {
      key: "foundation",
      titleKey: "launch.section.foundation",
      items: [
        {
          key: "businessProfile",
          state: bool(Boolean(p.businessName?.trim() && p.description?.trim())),
          labelKey: "launch.item.businessProfile",
          descKey: "launch.item.businessProfile.desc",
          to: "/app/setup",
        },
        {
          key: "websiteUrl",
          state: bool(Boolean(p.websiteUrl?.trim())),
          labelKey: "launch.item.websiteUrl",
          descKey: "launch.item.websiteUrl.desc",
          to: "/app/setup",
        },
        {
          key: "marketLanguage",
          state: bool(Boolean(p.market || p.primaryContentLanguage || p.primaryLanguage)),
          labelKey: "launch.item.marketLanguage",
          descKey: "launch.item.marketLanguage.desc",
          to: "/app/setup",
        },
        {
          key: "services",
          state: bool(services.length > 0),
          labelKey: "launch.item.services",
          descKey: "launch.item.services.desc",
          to: "/app/services",
        },
        {
          key: "brandIntelligence",
          state: bool(brandIntelligenceStarted(p)),
          labelKey: "launch.item.brandIntelligence",
          descKey: "launch.item.brandIntelligence.desc",
          to: "/app/setup",
        },
      ],
    },
    {
      key: "content",
      titleKey: "launch.section.content",
      items: [
        {
          key: "opportunity",
          state: bool(opportunities.length > 0),
          labelKey: "launch.item.opportunity",
          descKey: "launch.item.opportunity.desc",
          to: "/app/opportunities",
        },
        {
          key: "contentAsset",
          state: bool(content.length > 0),
          labelKey: "launch.item.contentAsset",
          descKey: "launch.item.contentAsset.desc",
          to: "/app/opportunities",
        },
        {
          key: "miloScore",
          state: bool(hasScore),
          labelKey: "launch.item.miloScore",
          descKey: "launch.item.miloScore.desc",
          to: "/app/editor",
        },
        {
          key: "reviewed",
          state: hasReviewed ? "done" : "optional",
          labelKey: "launch.item.reviewed",
          descKey: "launch.item.reviewed.desc",
          to: "/app/editor",
        },
      ],
    },
    {
      key: "publishing",
      titleKey: "launch.section.publishing",
      items: [
        {
          key: "connectorSelected",
          state: bool(Boolean(p.connectorType)),
          labelKey: "launch.item.connectorSelected",
          descKey: "launch.item.connectorSelected.desc",
          to: "/app/setup",
        },
        {
          key: "connectorConfigured",
          state: bool(connectorConfigured(p)),
          labelKey: "launch.item.connectorConfigured",
          descKey: "launch.item.connectorConfigured.desc",
          to: "/app/setup",
        },
        {
          key: "connectorTested",
          state: isCustom ? "optional" : connectorTested(p),
          labelKey: "launch.item.connectorTested",
          descKey: "launch.item.connectorTested.desc",
          to: "/app/setup",
        },
        {
          key: "draftSent",
          state: hasDraftSent ? "done" : "optional",
          labelKey: "launch.item.draftSent",
          descKey: "launch.item.draftSent.desc",
          to: "/app/editor",
        },
        {
          key: "publishedLive",
          state: hasLive ? "done" : "optional",
          labelKey: "launch.item.publishedLive",
          descKey: "launch.item.publishedLive.desc",
          to: "/app/editor",
        },
      ],
    },
    {
      key: "measurement",
      titleKey: "launch.section.measurement",
      items: [
        {
          key: "analyticsSnippet",
          state: "done",
          labelKey: "launch.item.analyticsSnippet",
          descKey: "launch.item.analyticsSnippet.desc",
          to: "/app/analytics",
        },
        {
          key: "analyticsEvents",
          state: analyticsEvents,
          labelKey: "launch.item.analyticsEvents",
          descKey: "launch.item.analyticsEvents.desc",
          to: "/app/analytics",
        },
        {
          key: "gscImport",
          state: gscImports > 0 ? "done" : "optional",
          labelKey: "launch.item.gscImport",
          descKey: "launch.item.gscImport.desc",
          to: "/app/analytics",
        },
        {
          key: "publishedByMilo",
          state: hasLive && gscImports > 0 ? "done" : "optional",
          labelKey: "launch.item.publishedByMilo",
          descKey: "launch.item.publishedByMilo.desc",
          to: "/app/analytics",
        },
      ],
    },
    {
      key: "authority",
      titleKey: "launch.section.authority",
      items: [
        {
          key: "authorityGenerated",
          state: hasAuthority ? "done" : "optional",
          labelKey: "launch.item.authorityGenerated",
          descKey: "launch.item.authorityGenerated.desc",
          to: "/app/authority",
        },
        {
          key: "authorityProgress",
          state: hasAuthorityProgress ? "done" : "optional",
          labelKey: "launch.item.authorityProgress",
          descKey: "launch.item.authorityProgress.desc",
          to: "/app/authority",
        },
      ],
    },
    {
      key: "billing",
      titleKey: "launch.section.billing",
      items: [
        {
          key: "billingProfile",
          state: bool(Boolean(billing?.billingCountry)),
          labelKey: "launch.item.billingProfile",
          descKey: "launch.item.billingProfile.desc",
          to: "/app/billing",
        },
        {
          key: "planSelected",
          state: "done", // Free Preview is the default plan
          labelKey: "launch.item.planSelected",
          descKey: "launch.item.planSelected.desc",
          to: "/app/billing",
        },
        {
          key: "betaStatus",
          state: billingStatusVisible ? "done" : "optional",
          labelKey: "launch.item.betaStatus",
          descKey: "launch.item.betaStatus.desc",
          to: "/app/billing",
        },
        {
          key: "paddlePending",
          state: "optional",
          labelKey: "launch.item.paddlePending",
          descKey: "launch.item.paddlePending.desc",
          to: "/app/beta-notes",
        },
      ],
    },
  ];

  // Progress counts required (done|missing) items only; optional items excluded.
  let requiredDone = 0;
  let requiredTotal = 0;
  let doneCount = 0;
  let optionalDone = 0;
  let total = 0;
  for (const s of sections) {
    for (const it of s.items) {
      total++;
      if (it.state === "done") doneCount++;
      if (it.state === "optional") {
        // optional items don't gate launch readiness
        continue;
      }
      requiredTotal++;
      if (it.state === "done") requiredDone++;
    }
  }
  optionalDone = doneCount - requiredDone;
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100);

  return {
    sections,
    progress: { requiredDone, requiredTotal, doneCount, optionalDone, total, percent },
  };
}

// ---- connection / setup status cards ----

export function computeConnectionStatuses(input: LaunchInputs): ConnectionStatusCard[] {
  const { project: p } = input;
  const connType = p.connectorType ?? "custom";
  const gscImports = p.gscLite?.imports?.length ?? 0;
  const hasAuthority = input.authorityOpportunities.length > 0;
  const billing = input.billingProfile;

  // GSC: distinguish CSV-only / OAuth connected / synced / not configured.
  const oauthStatus = p.gscOAuth?.status;
  const hasApiImport = (p.gscLite?.imports ?? []).some((i) => i.source === "api");
  let gscLevel: ConnectionStatusCard["level"];
  let gscDetailKey: string;
  if (gscImports > 0) {
    gscLevel = "ok";
    gscDetailKey = hasApiImport ? "launch.conn.gsc.synced" : "launch.conn.gsc.csvOnly";
  } else if (oauthStatus === "connected") {
    gscLevel = "partial";
    gscDetailKey = "launch.conn.gsc.connectedNotSynced";
  } else if (oauthStatus === "expired" || oauthStatus === "error") {
    gscLevel = "partial";
    gscDetailKey = "launch.conn.gsc.reconnect";
  } else {
    gscLevel = "none";
    gscDetailKey = "launch.conn.gsc.none";
  }

  // Publishing connector
  let connLevel: ConnectionStatusCard["level"] = "none";
  let connDetailKey = "launch.conn.connector.none";
  if (p.connectorType) {
    if (connectorConfigured(p)) {
      if (connType === "wordpress") {
        connLevel = p.wordpress?.lastTestStatus === "success" ? "ok" : "partial";
        connDetailKey =
          p.wordpress?.lastTestStatus === "success"
            ? "launch.conn.connector.wpOk"
            : "launch.conn.connector.wpUntested";
      } else if (connType === "shopify") {
        connLevel = p.shopify?.lastTestStatus === "success" ? "ok" : "partial";
        connDetailKey =
          p.shopify?.lastTestStatus === "success"
            ? "launch.conn.connector.shopifyOk"
            : "launch.conn.connector.shopifyUntested";
      } else {
        connLevel = "ok";
        connDetailKey = "launch.conn.connector.customOk";
      }
    } else {
      connLevel = "partial";
      connDetailKey = "launch.conn.connector.partial";
    }
  }

  return [
    {
      key: "website",
      labelKey: "launch.conn.website",
      level: p.websiteUrl?.trim() ? "ok" : "none",
      detailKey: p.websiteUrl?.trim() ? "launch.conn.website.ok" : "launch.conn.website.none",
      to: "/app/setup",
    },
    {
      key: "brand",
      labelKey: "launch.conn.brand",
      level: brandIntelligenceStarted(p) ? "ok" : "none",
      detailKey: brandIntelligenceStarted(p) ? "launch.conn.brand.ok" : "launch.conn.brand.none",
      to: "/app/setup",
    },
    {
      key: "connector",
      labelKey: "launch.conn.connector",
      level: connLevel,
      detailKey: connDetailKey,
      to: "/app/setup",
    },
    {
      key: "analytics",
      labelKey: "launch.conn.analytics",
      level:
        typeof input.analyticsEventCount === "number"
          ? input.analyticsEventCount > 0
            ? "ok"
            : "partial"
          : "partial",
      detailKey:
        typeof input.analyticsEventCount === "number" && input.analyticsEventCount > 0
          ? "launch.conn.analytics.ok"
          : "launch.conn.analytics.pending",
      to: "/app/analytics",
    },
    {
      key: "gsc",
      labelKey: "launch.conn.gsc",
      level: gscLevel,
      detailKey: gscDetailKey,
      to: "/app/analytics",
    },
    {
      key: "authority",
      labelKey: "launch.conn.authority",
      level: hasAuthority ? "ok" : "none",
      detailKey: hasAuthority ? "launch.conn.authority.ok" : "launch.conn.authority.none",
      to: "/app/authority",
    },
    {
      key: "billing",
      labelKey: "launch.conn.billing",
      level: billing?.billingCountry ? "ok" : "partial",
      detailKey: billing?.billingCountry ? "launch.conn.billing.ok" : "launch.conn.billing.pending",
      to: "/app/billing",
    },
  ];
}
