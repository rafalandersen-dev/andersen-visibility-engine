import { publicationVersion } from "@/lib/publication-version";
import { buildActiveInternalPaths } from "@/lib/publish-targets";

const listeners = new Set();
let approvalSeed = null;
const approvalReads = new Map();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const notify = () => {
  fixture.revision++;
  listeners.forEach((fn) => fn());
};
export const fixture = (window.miloFixture = {
  screen: "today",
  search: {},
  scenario: "ready",
  approvalMode: "needed",
  locale: "en",
  revision: 0,
  routeRevision: 0,
  events: [],
  errors: [],
  blockedRequests: [],
  state: null,
  saved: null,
  failSave: false,
  failRead: false,
  approvals: {},
});
export function record(type, payload) {
  fixture.events.push({ at: new Date().toISOString(), type, payload });
  if (fixture.events.length > 150) fixture.events.shift();
  notify();
}
const deny = (kind, target) => {
  const row = { kind, target: String(target) };
  fixture.blockedRequests.push(row);
  record("blocked-network", row);
  throw Error("Fixture denies " + kind + ": " + String(target));
};
globalThis.fetch = window.fetch = async (input) =>
  deny("fetch", typeof input === "string" ? input : input?.url);
window.XMLHttpRequest = class {
  open(method, url) {
    deny("XMLHttpRequest", url);
  }
};
window.WebSocket = class {
  constructor(url) {
    deny("WebSocket", url);
  }
};
window.EventSource = class {
  constructor(url) {
    deny("EventSource", url);
  }
};
try {
  Object.defineProperty(navigator, "sendBeacon", { value: (url) => deny("sendBeacon", url) });
} catch {}
window.open = (url) => deny("window.open", url);
try {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async (text) => record("clipboard-intent-only", { text }) },
  });
} catch {}
window.addEventListener("error", (event) => {
  fixture.errors.push(String(event.error?.stack || event.message));
  notify();
});
window.addEventListener("unhandledrejection", (event) => {
  fixture.errors.push(String(event.reason?.stack || event.reason));
  notify();
});
document.addEventListener("click", (event) => {
  const anchor = event.target.closest?.("a");
  if (anchor && !event.defaultPrevented) {
    const href = anchor.getAttribute("href") || "";
    if (!href.startsWith("blob:") && !href.startsWith("#")) {
      event.preventDefault();
      record("blocked-navigation", { href });
    }
  }
});
try {
  localStorage.removeItem("milo.uiLocale");
} catch {}

const project = {
  id: "fixture-project",
  name: "Local fixture business",
  websiteUrl: "https://business.example.invalid",
  businessName: "Local fixture business",
  businessType: "Massage studio",
  primaryLanguage: "English",
  primaryContentLanguage: "sv",
  additionalLanguages: ["Polish"],
  mainLocation: "Malmö",
  targetLocations: ["Malmö"],
  description: "Synthetic local business for UI checks. All content and metrics are fabricated.",
  targetAudience: "Local adults looking for relaxation",
  toneOfVoice: "Clear and friendly",
  uniqueSellingPoints: "Simple booking and individual attention",
  brandNotes: "No medical guarantees.",
  market: "SE",
  currency: "SEK",
  appLanguage: "en",
  growthGoals: ["moreTraffic"],
  connectorType: "custom",
  publishEndpoint: "https://publish.example.invalid/api/articles",
  hasPublishSecret: true,
  publishSecretConfigured: true,
  publishSecretSet: true,
  publishMode: "manualLive",
  defaultDestinationType: "blogPost",
  approvedInternalPaths: [],
  autoScheduler: { enabled: false },
  brandIntelligence: {},
  createdAt: "2026-10-23T08:00:00Z",
};
function asset(id = "fixture-article", over = {}) {
  return {
    id,
    projectId: project.id,
    opportunityId: "fixture-opportunity",
    title: "A useful relaxation guide — synthetic draft",
    slug: "synthetic-relaxation-guide",
    metaTitle: "A useful relaxation guide",
    metaDescription:
      "A synthetic article for local browser verification of the Milo editor. This is not real client content.",
    h1: "A useful relaxation guide",
    outline: ["Before your visit", "What to expect"],
    faq: [{ q: "How do I prepare?", a: "Bring comfortable clothes." }],
    cta: "Review the available appointment times.",
    markdown:
      "## Before your visit\n\nThis is synthetic text used only to test editing and saving. It contains no real customer information.\n\n## What to expect\n\nChoose the service that fits your preferences and ask the business for details before booking.\n\n### Practical details\n\nThis draft is for a local fixture and will never be sent to a website.",
    internalLinks: [],
    schemaSuggestions: ["Synthetic note: structured data follows the article."],
    editorNotes: "Fixture-only draft.",
    status: "Approved",
    updatedAt: "2026-10-23T09:00:00Z",
    createdAt: "2026-10-23T08:00:00Z",
    assetType: "article",
    language: "Swedish",
    images: [],
    sources: [],
    keyTakeaways: [],
    breadcrumbs: [],
    author: {
      name: "Fixture Author",
      role: "Business owner",
      verified: true,
      consentConfirmed: true,
    },
    ...over,
  };
}
export function reset(scenario = fixture.scenario) {
  fixture.scenario = scenario;
  fixture.search = fixture.screen === "editor" ? { id: "fixture-article" } : {};
  fixture.routeRevision++;
  fixture.failSave = false;
  fixture.failRead = false;
  fixture.approvals = {};
  approvalReads.clear();
  const base = asset();
  let content = [base];
  let opportunities = [
    {
      id: "fixture-opportunity",
      projectId: project.id,
      title: base.title,
      language: "Swedish",
      contentType: "blogPost",
      searchIntent: "informational",
      targetAudience: "Local adults",
      businessValue: "Useful service information",
      recommendedCta: "Book an appointment",
      priority: "High",
      status: "approved",
      currentContentAssetId: base.id,
      createdAt: "2026-10-23T08:00:00Z",
    },
  ];
  if (scenario === "review") {
    content = [asset(undefined, { status: "In Review" })];
    opportunities[0].status = "in_review";
  }
  if (scenario === "draft") {
    content = [asset(undefined, { status: "Draft" })];
    opportunities[0].status = "drafting";
  }
  if (scenario === "armed") {
    content = [
      asset(undefined, {
        scheduledPublishAt: new Date(Date.now() + 86400000).toISOString(),
        scheduledPublishStatus: "pending",
      }),
    ];
  }
  if (scenario === "blocked") {
    content = [
      asset(undefined, {
        scheduledPublishAt: new Date(Date.now() - 86400000).toISOString(),
        scheduledPublishStatus: "failed",
        scheduledPublishError: "Synthetic destination refusal",
      }),
    ];
  }
  if (scenario === "empty") {
    content = [];
    opportunities = [];
  }
  fixture.state = {
    userId: "fixture-owner",
    hydrated: true,
    activeProjectId: project.id,
    projects: [{ ...project, appLanguage: fixture.locale }],
    content,
    opportunities,
    services: [
      {
        id: "fixture-service",
        projectId: project.id,
        name: "Relaxation massage",
        kind: "Service",
        priority: "High",
        description: "Synthetic service",
      },
    ],
    calendar: [],
    calendarItems: [],
    discoverySuggestions: [],
    pendingActions: [],
    audits: [],
    authorityOpportunities: [],
    notifications: [],
    competitorAnalyses: [],
    authorityAnalyses: [],
    aiVisibilityAnalyses: [],
    backlinkAnalyses: [],
    aiEvaluationRuns: [],
    outreachDrafts: [],
    subscription: {
      planId: "pro",
      status: "manualBeta",
      billingMarket: "Sweden",
      currency: "SEK",
      priceMonthly: 0,
    },
    billingProfile: {
      billingEmail: "owner@example.invalid",
      billingCountry: "SE",
      customerType: "business",
    },
  };
  fixture.saved = structuredClone(fixture.state);
  // A receipt belongs to the reset-time snapshot. Never silently recompute it
  // after editing: that would conceal the stale-approval behavior under review.
  approvalSeed = structuredClone(fixture.state);
  fixture.storeEmit?.();
  notify();
}
const summary = {
  hasData: true,
  growthSummary: {
    visitsLast30: 3,
    visitsPrevious30: 2,
    visitsGrowthPercent: 50,
    ctaClicksLast30: 1,
    bookingClicksLast30: 0,
    conversionRateLast30: 33.3,
    aiSignalsLast30: 1,
    publishedPagesCount: 1,
    activePublishedPagesCount: 1,
    miloPageViews: 3,
    bestPerformingPage: {
      title: "Synthetic guide",
      path: "/synthetic-guide",
      views: 3,
      bookingClicks: 0,
      ctaClicks: 1,
    },
    summaryText: "Synthetic activity only; no real growth is claimed.",
  },
  dailyTrend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    views: i > 26 ? 1 : 0,
  })),
  publishedContentPerformance: [],
  topGrowingPages: [],
  underperformingPages: [],
  aiSignals: [
    { type: "ai_referrer", source: "chatgpt.com", count: 1, samplePath: "/synthetic-guide" },
  ],
  nextActionKey: "keepMonitoring",
  topPages: [],
  referrers: [],
  devices: [],
};
fixture.invoke = async (name, args) => {
  record("server-mock." + name, { args });
  const data = args[0]?.data || {};
  if (name === "getAnalyticsSummaryFn") return structuredClone(summary);
  if (name === "readLogEvidenceFn") return [];
  if (name === "readPublicationApprovalFn") {
    if (fixture.approvalMode === "unavailable") throw Error("Synthetic approval read unavailable");
    if (fixture.approvals[data.assetId]) return fixture.approvals[data.assetId];
    if (fixture.approvalMode === "needed") return { approved: false, version: null };
    const seed = approvalSeed;
    const seedProject = seed.projects.find((p) => p.id === data.projectId);
    const seedAsset = seed.content.find(
      (a) => a.id === data.assetId && a.projectId === data.projectId,
    );
    if (!seedProject || !seedAsset) throw Error("Synthetic approval scope mismatch");
    if (!approvalReads.has(data.assetId)) {
      const mode = fixture.approvalMode;
      approvalReads.set(
        data.assetId,
        publicationVersion(
          mode === "stale"
            ? { ...seedAsset, title: seedAsset.title + " — earlier version" }
            : seedAsset,
          seedProject,
          buildActiveInternalPaths(
            seedProject,
            seed.content.filter((a) => a.projectId === seedProject.id),
          ),
        ).then((version) => {
          const receipt = { approved: true, version };
          // A reset can happen while the local digest is pending. It must not
          // overwrite a new scenario's receipt or a subsequent explicit write.
          if (approvalSeed === seed && !fixture.approvals[data.assetId])
            fixture.approvals[data.assetId] = receipt;
          return receipt;
        }),
      );
    }
    return approvalReads.get(data.assetId);
  }
  if (name === "setPublicationApprovalFn") {
    fixture.approvals[data.assetId] = { approved: data.approved, version: data.expectedVersion };
    return { approved: data.approved, version: data.expectedVersion };
  }
  if (name === "cancelScheduledPublishFn") {
    fixture.state = {
      ...fixture.state,
      content: fixture.state.content.map((a) =>
        a.id === data.assetId ? { ...a, scheduledPublishStatus: "cancelled" } : a,
      ),
    };
    fixture.storeEmit?.();
    return { cancelled: true };
  }
  if (name === "scheduleContentPublishFn") {
    record("schedule-intent-only", data);
    throw Error("Fixture records scheduling intent only; no queue is created.");
  }
  throw Error("Fixture blocks unsupported operation: " + name);
};
fixture.reset = reset;
fixture.snapshot = () => ({
  screen: fixture.screen,
  scenario: fixture.scenario,
  approvalMode: fixture.approvalMode,
  search: fixture.search,
  state: fixture.state,
  approvals: fixture.approvals,
  events: fixture.events,
  errors: fixture.errors,
  blockedRequests: fixture.blockedRequests,
});
reset("ready");
