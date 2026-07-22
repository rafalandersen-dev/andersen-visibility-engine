/**
 * AI generation layer for the Milo Growth.
 *
 * Real generation via the Lovable AI Gateway (see src/lib/ai.functions.ts).
 * This module is the single import surface the UI uses; it handles store
 * updates and surfaces a normalized error message on failure.
 *
 *   generateSeoOpportunities(projectId)
 *   generateContentCalendar(projectId)
 *   generateLandingPageBrief(opportunityId)
 *   generateArticleDraft(opportunityId)
 *   generateMetadata(contentAssetId)
 *   generateFaq(contentAssetId)
 *   generateCta(contentAssetId)
 *
 * Filename retained as "mock-ai.ts" so existing call sites and history
 * keep working — the behavior is no longer mocked.
 */
import { contentLangToProjectLanguage } from "./onboarding";
import {
  getState,
  replaceDiscoverySuggestions,
  replacePlannedCalendar,
  saveWorkspaceNow,
  upsertContent,
  upsertAudit,
  markFindingsConverted,
  upsertCompetitorAnalysis,
  markGapsConverted,
  upsertAuthorityAnalysis,
  markAuthorityItemsConverted,
  addAuthorityOpportunities,
  updateAuthorityOpportunity,
  upsertAiVisibilityAnalysis,
  markVisibilityGapsConverted,
  upsertBacklinkAnalysis,
  markBacklinkRecommendationsConverted,
  markContentAssetSent,
  markContentAssetPublishFailed,
  markContentAssetPublishedLive,
  markContentAssetLivePublishFailed,
  addOpportunities,
  updateOpportunity,
  updateProject,
  updateProjectConnector,
  addOutreachDraft,
  uid,
} from "./store";
import {
  isWordPress,
  isShopify,
  wpCreds,
  wpPostTypeFor,
  shopifyCreds,
  shopifyArticleArgs,
  buildActiveInternalPaths,
} from "./publish-targets";
import { assembleContentAsset } from "./content-assembler";
import { validateSourceUrlsFn } from "./sources.functions";
import { selectSourcesToValidate, normalizeSourceUrl } from "./sources";
import { fetchSitemapInventoryFn } from "./sitemap.functions";
import { isSitemapInventoryFresh } from "./sitemap";
import { assessReadiness, toReadinessScore } from "./readiness";
import { publishBlockers } from "./checklist";
import { reconcileHookOnRegeneration } from "./hook";
import { isArticleLikeAssetType } from "./visual-model";
import type {
  Opportunity,
  DiscoverySuggestion,
  CalendarItem,
  ContentAsset,
  Language,
  AuditResult,
  AuditFinding,
  CompetitorAnalysisResult,
  CompetitorGap,
  AuthorityAnalysisResult,
  AuthorityItem,
  AuthorityOpportunity,
  AuthorityOpportunityType,
  AuthorityCategory,
  AiVisibilityAnalysisResult,
  AiVisibilityGap,
  BacklinkAnalysisResult,
  BacklinkRecommendation,
  OutreachDraft,
  OutreachTargetSource,
  PublishDestinationType,
  Project,
  Priority,
  AssetType,
  ContentSourceType,
  HookProposal,
} from "./types";
import { newOpportunityRecord, opportunityDeduplicationKey } from "./opportunities";
import {
  generateOpportunitiesFn,
  generateCalendarFn,
  generateContentAssetFn,
  generateContentFn,
  generateAuditFn,
  generateCompetitorGapFn,
  generateAuthorityFn,
  generateAuthorityOpportunitiesFn,
  generateAiVisibilityFn,
  generateBacklinksFn,
  getBacklinksStatusFn,
  regenerateMetadataFn,
  regenerateFaqFn,
  regenerateCtaFn,
  evaluateContentQualityFn,
  improveContentDraftFn,
  generateOutreachDraftFn,
} from "./ai.functions";
import { resolveBacklinkCompetitors } from "./backlinks";
import { publishContentFn, publishLiveFn } from "./publish.functions";
import {
  testWordPressConnectionFn,
  sendContentToWordPressDraftFn,
  publishWordPressContentFn,
} from "./wordpress.functions";
import {
  testShopifyConnectionFn,
  listShopifyBlogsFn,
  sendContentToShopifyDraftFn,
  publishShopifyContentFn,
} from "./shopify.functions";
import { tooShortScore, draftWordCount, MIN_EVALUABLE_WORDS } from "./quality";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function requireProject(projectId: string) {
  const s = getState();
  const project = s.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");
  const services = s.services.filter((sv) => sv.projectId === projectId);
  return { project, services };
}

// ---- Concurrency guard: prevent duplicate clicks per (project, action) ----
const inflight = new Set<string>();
async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) throw new Error("Already generating — please wait.");
  inflight.add(key);
  try {
    return await fn();
  } finally {
    inflight.delete(key);
  }
}

// ============================================================
// Opportunities
// ============================================================
export async function generateSeoOpportunities(projectId: string) {
  return once(`opps:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);
    const existingTitles = getState()
      .opportunities.filter((o) => o.projectId === projectId)
      .map((o) => o.title);

    const { opportunities } = await generateOpportunitiesFn({
      data: { project, services, existingTitles },
    });
    console.info("[ai.client] opportunities received", {
      projectId,
      count: opportunities.length,
    });

    const generatedAt = new Date().toISOString();
    const items: DiscoverySuggestion[] = opportunities.map((r) => {
      const opportunity = newOpportunityRecord(
        {
          ...r,
          id: uid(),
          projectId,
          status: "captured",
          creationMode: "milo_discovery",
          primarySource: "services_products",
          reasonDiscovered: r.businessValue,
        },
        generatedAt,
      );
      return {
        ...opportunity,
        status: "suggested",
        deduplicationKey: opportunityDeduplicationKey(opportunity),
        generatedAt,
      };
    });

    if (items.length === 0) throw new Error("AI returned no opportunities. Please try again.");
    replaceDiscoverySuggestions(projectId, items);
    await saveWorkspaceNow();
    console.info("[ai.client] opportunities saved", { projectId, count: items.length });
    return items;
  });
}

// ============================================================
// Calendar
// ============================================================
export async function generateContentCalendar(projectId: string) {
  return once(`cal:${projectId}`, async () => {
    const { project } = requireProject(projectId);
    const opps = getState().opportunities.filter(
      (o) => o.projectId === projectId && o.status !== "Discarded",
    );
    if (opps.length === 0) {
      throw new Error("Generate opportunities first — the calendar builds on them.");
    }

    const { calendarItems } = await generateCalendarFn({
      data: { project, opportunities: opps },
    });
    console.info("[ai.client] calendar received", {
      projectId,
      count: calendarItems.length,
    });

    const today = new Date();
    const items: CalendarItem[] = calendarItems.map((r) => {
      const source = opps[Math.max(0, Math.min(opps.length - 1, (r.opportunityIndex ?? 1) - 1))];
      const d = new Date(today);
      d.setDate(d.getDate() + Math.max(1, r.daysFromToday));
      return {
        id: uid(),
        projectId,
        opportunityId: source?.id,
        plannedDate: d.toISOString().slice(0, 10),
        topicTitle: r.topicTitle,
        language: r.language,
        contentType: r.contentType,
        searchIntent: r.searchIntent,
        recommendedCta: r.recommendedCta,
        status: "Planned",
      };
    });

    if (items.length === 0) throw new Error("AI returned no calendar items. Please try again.");
    replacePlannedCalendar(projectId, items);
    await saveWorkspaceNow();
    console.info("[ai.client] calendar saved", { projectId, count: items.length });
    return items;
  });
}

// ============================================================
// Content assets (landing brief / article draft)
// ============================================================
type AssetResult = {
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
  hookProposals?: HookProposal[];
};

async function generateAsset(opportunityId: string, kind: "landing" | "article") {
  return once(`asset:${opportunityId}:${kind}`, async () => {
    const s = getState();
    const opp = s.opportunities.find((o) => o.id === opportunityId);
    if (!opp) throw new Error("Opportunity not found.");
    const { project, services } = requireProject(opp.projectId);

    const result = (await generateContentAssetFn({
      data: { project, services, opportunity: opp, kind },
    })) as AssetResult;

    const asset: ContentAsset = {
      id: uid(),
      projectId: opp.projectId,
      opportunityId: opp.id,
      title: opp.title,
      slug: slugify(opp.title),
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      h1: result.h1 || opp.title,
      outline: result.outline ?? [],
      faq: result.faq ?? [],
      cta: result.cta || opp.recommendedCta,
      markdown: result.markdown,
      internalLinks: result.internalLinks ?? [],
      schemaSuggestions: result.schemaSuggestions ?? [],
      editorNotes: result.editorNotes ?? "",
      status: "Draft",
      updatedAt: new Date().toISOString(),
      // Article Studio 3.0 / P1.2A — a newly generated long-form article/landing
      // is a v3 asset: it needs an approved opening hook before publishing.
      // Generation may offer up to three proposals; none is auto-selected or
      // auto-approved (the editor's Hook panel drives selection + approval).
      visualModelVersion: 3,
      ...(result.hookProposals?.length ? { hookProposals: result.hookProposals } : {}),
    };
    updateOpportunity(opp.id, {
      status: "drafting",
      currentContentAssetId: asset.id,
    });
    upsertContent(asset);
    await saveWorkspaceNow();
    return asset;
  });
}

export async function generateLandingPageBrief(opportunityId: string) {
  return generateAsset(opportunityId, "landing");
}

export async function generateArticleDraft(opportunityId: string) {
  return generateAsset(opportunityId, "article");
}

// ============================================================
// Editor regenerations
// ============================================================
export async function generateMetadata(contentAssetId: string) {
  return once(`meta:${contentAssetId}`, async () => {
    const a = getState().content.find((c) => c.id === contentAssetId);
    if (!a) throw new Error("Content not found.");
    const project = getState().projects.find((p) => p.id === a.projectId);
    const lang = (project?.primaryLanguage ?? "English") as Language;
    const result = (await regenerateMetadataFn({
      data: {
        title: a.title,
        language: lang,
        topic: a.title,
        cta: a.cta || "Get in touch",
        businessName: project?.businessName || project?.name || "the business",
      },
    })) as { metaTitle: string; metaDescription: string };
    upsertContent({
      ...a,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      updatedAt: new Date().toISOString(),
    });
    await saveWorkspaceNow();
  });
}

export async function generateFaq(contentAssetId: string) {
  return once(`faq:${contentAssetId}`, async () => {
    const a = getState().content.find((c) => c.id === contentAssetId);
    if (!a) throw new Error("Content not found.");
    const project = getState().projects.find((p) => p.id === a.projectId);
    const lang = (project?.primaryLanguage ?? "English") as Language;
    const result = (await regenerateFaqFn({
      data: {
        title: a.title,
        language: lang,
        topic: a.title,
        businessName: project?.businessName || project?.name || "the business",
      },
    })) as { q: string; a: string }[];
    upsertContent({ ...a, faq: result, updatedAt: new Date().toISOString() });
    await saveWorkspaceNow();
  });
}

export async function generateCta(contentAssetId: string) {
  return once(`cta:${contentAssetId}`, async () => {
    const a = getState().content.find((c) => c.id === contentAssetId);
    if (!a) throw new Error("Content not found.");
    const project = getState().projects.find((p) => p.id === a.projectId);
    const opp = a.opportunityId
      ? getState().opportunities.find((o) => o.id === a.opportunityId)
      : undefined;
    const lang = (project?.primaryLanguage ?? "English") as Language;
    const cta = (await regenerateCtaFn({
      data: {
        language: lang,
        topic: a.title,
        businessName: project?.businessName || project?.name || "the business",
        intent: opp?.searchIntent ?? "Commercial",
      },
    })) as string;
    upsertContent({ ...a, cta, updatedAt: new Date().toISOString() });
    await saveWorkspaceNow();
  });
}

// ============================================================
// Content Quality Engine / Milo Score v1
// ============================================================

/** Human label for the content/explanation language. */
function languageLabel(lang: Language | undefined, fallback: Language): Language {
  return lang ?? fallback;
}

/**
 * Evaluate a content asset and store its Milo Score. Empty/too-short drafts get
 * a conservative low score without an AI call. Failures throw a friendly error
 * and leave any existing score intact (the caller keeps the editor alive).
 */
export async function evaluateContentQuality(contentAssetId: string) {
  return once(`quality:${contentAssetId}`, async () => {
    const a = getState().content.find((c) => c.id === contentAssetId);
    if (!a) throw new Error("Content not found.");
    const { project, services } = requireProject(a.projectId);

    const evaluatedAt = new Date().toISOString();
    // Score the CANONICAL assembled asset (P1.1 B), so scoring, publishing and
    // schema all judge one artifact. Identical to `a.markdown` for a legacy asset.
    const canonicalMarkdown = assembleContentAsset(a, project).markdown;

    // Short-circuit empty/too-short drafts — conservative score, no AI call.
    if (draftWordCount(canonicalMarkdown) < MIN_EVALUABLE_WORDS) {
      upsertContent({
        ...a,
        qualityScore: tooShortScore(evaluatedAt),
        qualityScoreStale: false,
        updatedAt: evaluatedAt,
      });
      await saveWorkspaceNow();
      return;
    }

    const contentLanguage = languageLabel(
      a.language,
      contentLangToProjectLanguage(project.primaryContentLanguage ?? "en"),
    );
    const explanationLanguage = contentLangToProjectLanguage(project.appLanguage ?? "en");

    // P0.2 — the evaluator receives ONLY the canonical evaluated asset
    // (CANONICAL_EVALUATED_FIELDS in quality.ts): title + markdown body + meta.
    // It must NOT receive faq[]/cta/internalLinks[] — those side-fields do not
    // publish, and grading them would award points for unpublished information.
    // The FAQ/CTA/internal-link components are graded from the article body.
    const score = await evaluateContentQualityFn({
      data: {
        project,
        services,
        title: a.title,
        markdown: canonicalMarkdown,
        assetType: a.assetType ?? "article",
        destinationType: a.publishDestinationType ?? "",
        metaTitle: a.metaTitle ?? "",
        metaDescription: a.metaDescription ?? "",
        contentLanguage,
        explanationLanguage,
      },
    });

    upsertContent({ ...a, qualityScore: score, qualityScoreStale: false, updatedAt: evaluatedAt });
    await saveWorkspaceNow();
    console.info("[ai.client] milo score evaluated", {
      assetId: contentAssetId,
      overall: score.overall,
    });
    return score;
  });
}

/**
 * Reachability-validate an asset's attached sources (P1.1 C). Marks each source
 * `verified` (URL resolves) or `unreachable`, never fabricating one and never
 * silently dropping an unreachable one — it stays on the asset, labelled, so the
 * editor can surface it. A human "unsupported" verdict is preserved, not
 * overwritten by reachability.
 */
export async function validateAssetSources(assetId: string, force = false) {
  return once(`validate-sources:${assetId}`, async () => {
    const a = getState().content.find((c) => c.id === assetId);
    if (!a) throw new Error("Content not found.");
    const sources = a.sources ?? [];
    // Cooldown + dedupe + per-run fan-out cap (C follow-up abuse controls).
    const toCheck = selectSourcesToValidate(sources, Date.now(), force);
    if (!toCheck.length) return sources;
    const results = await validateSourceUrlsFn({ data: { urls: toCheck.map((s) => s.url) } });
    const byUrl = new Map(results.map((r) => [normalizeSourceUrl(r.url), r]));
    const checkedAt = new Date().toISOString();
    const next = sources.map((s) => {
      const r = byUrl.get(normalizeSourceUrl(s.url));
      // Never count an unreachable source as verified; keep an explicit note.
      return r ? { ...s, status: r.status, checkNote: r.note, checkedAt } : s;
    });
    upsertContent({ ...a, sources: next, updatedAt: checkedAt });
    await saveWorkspaceNow();
    console.info("[ai.client] sources validated", { assetId, checked: toCheck.length });
    return next;
  });
}

/**
 * Compute the DETERMINISTIC readiness assessment (P1.1 I) over the canonical
 * assembled asset and the project corpus, and store the compact summary. No AI
 * call, no metering. Duplication/cannibalisation compare against the real corpus
 * and expose the conflicting assets + confidence + limitations to the caller.
 */
export async function assessAssetReadiness(assetId: string) {
  const a = getState().content.find((c) => c.id === assetId);
  if (!a) throw new Error("Content not found.");
  const { project } = requireProject(a.projectId);
  const assessment = assessReadiness(a, project, getState().content);
  const evaluatedAt = new Date().toISOString();
  upsertContent({
    ...a,
    readiness: toReadinessScore(assessment, evaluatedAt),
    updatedAt: evaluatedAt,
  });
  await saveWorkspaceNow();
  return assessment;
}

/**
 * Refresh a project's cached sitemap URL inventory (P1.1 D). Bounded + cached:
 * returns the cached inventory untouched while still fresh (a cooldown), else
 * re-fetches under the server fn's strict caps. Stores only the compact paths +
 * metadata on the project (no raw XML).
 */
export async function refreshSitemapInventory(projectId: string, force = false) {
  return once(`sitemap:${projectId}`, async () => {
    const project = getState().projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found.");
    if (!force && isSitemapInventoryFresh(project.sitemapInventory, Date.now())) {
      return project.sitemapInventory ?? null;
    }
    const siteUrl = (project.websiteUrl || "").trim();
    if (!siteUrl) throw new Error("Add your website URL in Project Setup first.");
    const inv = await fetchSitemapInventoryFn({ data: { siteUrl } });
    if (inv) {
      updateProject(projectId, { sitemapInventory: inv });
      await saveWorkspaceNow();
    }
    return inv;
  });
}

/**
 * Improve the draft markdown using the current score suggestions. Updates only
 * the markdown body, marks the score stale (publish/live status untouched).
 */
export async function improveContentDraft(contentAssetId: string) {
  return once(`improve:${contentAssetId}`, async () => {
    const a = getState().content.find((c) => c.id === contentAssetId);
    if (!a) throw new Error("Content not found.");
    const { project, services } = requireProject(a.projectId);

    const suggestions = [
      ...(a.qualityScore?.topIssues ?? []),
      ...(a.qualityScore?.quickWins ?? []),
      ...Object.values(a.qualityScore?.categories ?? {}).flatMap((c) => c.suggestions),
    ];
    const contentLanguage = languageLabel(
      a.language,
      contentLangToProjectLanguage(project.primaryContentLanguage ?? "en"),
    );

    const { markdown } = await improveContentDraftFn({
      data: {
        project,
        services,
        title: a.title,
        markdown: a.markdown || "",
        assetType: a.assetType ?? "article",
        contentLanguage,
        suggestions,
      },
    });

    if (!markdown || !markdown.trim())
      throw new Error("AI returned empty content. Please try again.");
    // Keep title/metadata/publish status; only the body changes. Score becomes stale.
    upsertContent({
      ...a,
      markdown,
      // Article Studio 3.0 / P1.2A — this is the in-place BODY regeneration path.
      // reconcile preserves an approved / user-edited / non-empty hook across the
      // regeneration; only an empty hook slot could take a fresh proposal, and this
      // path produces none (the improve fn regenerates the body only, and is given
      // the hook-free body, so it cannot reintroduce the hook).
      hook: reconcileHookOnRegeneration(a.hook, undefined, a.hook?.id ?? uid()),
      qualityScoreStale: a.qualityScore ? true : a.qualityScoreStale,
      updatedAt: new Date().toISOString(),
    });
    await saveWorkspaceNow();
    console.info("[ai.client] draft improved", { assetId: contentAssetId });
    return markdown;
  });
}

// ============================================================
// Site Audit v1
// ============================================================

const priorityRank: Record<Priority, number> = { High: 3, Medium: 2, Low: 1 };

/** Build a "New"-equivalent Opportunity from an audit finding.
 *  Built through newOpportunityRecord so the record carries the canonical
 *  lifecycle and its provenance fields. Regeneration no longer touches
 *  opportunities at all (it replaces discoverySuggestions), so nothing here
 *  depends on the old "Linked survives" trick. */
function opportunityFromFinding(finding: AuditFinding, project: Project): Opportunity {
  return newOpportunityRecord({
    id: uid(),
    projectId: project.id,
    title: finding.suggestedOpportunityTitle || finding.title,
    language: project.primaryLanguage,
    contentType: finding.suggestedContentType,
    searchIntent: finding.suggestedSearchIntent,
    targetAudience: project.targetAudience || "Potential customers",
    businessValue: finding.recommendation || finding.explanation,
    recommendedCta: finding.suggestedCta || "Contact us",
    priority: finding.priority,
    source: "audit",
  });
}

export async function runSiteAudit(projectId: string, websiteUrl?: string) {
  return once(`audit:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);
    const url = (websiteUrl ?? project.websiteUrl ?? "").trim();

    const res = await generateAuditFn({ data: { project, services, websiteUrl: url } });
    if (!res || !Array.isArray(res.findings) || res.findings.length === 0) {
      throw new Error("AI returned no audit findings. Please try again.");
    }
    console.info("[ai.client] audit received", {
      projectId,
      findings: res.findings.length,
      fetched: res.fetchedWebsite,
    });

    // Persist a confirmed/edited URL back onto the project so it sticks.
    if (url && url !== project.websiteUrl) {
      updateProject(projectId, { websiteUrl: url });
    }

    const audit: AuditResult = {
      id: uid(),
      projectId,
      websiteUrl: url,
      fetchedWebsite: Boolean(res.fetchedWebsite),
      note: res.note || undefined,
      overallScore: res.overallScore,
      seoScore: res.seoScore,
      localScore: res.localScore,
      aiReadinessScore: res.aiReadinessScore,
      conversionScore: res.conversionScore,
      summary: res.summary,
      topFixes: Array.isArray(res.topFixes) ? res.topFixes : [],
      findings: res.findings.map((f) => ({ ...f, id: uid() })),
      convertedFindingIds: [],
      createdAt: new Date().toISOString(),
    };
    upsertAudit(audit);
    await saveWorkspaceNow();
    console.info("[ai.client] audit saved", { projectId, findings: audit.findings.length });
    return audit;
  });
}

/** Convert a single finding into an Opportunity (idempotent per finding). */
export async function createOpportunityFromFinding(projectId: string, findingId: string) {
  const s = getState();
  const audit = s.audits.find((a) => a.projectId === projectId);
  if (!audit) throw new Error("Run a site audit first.");
  const finding = audit.findings.find((f) => f.id === findingId);
  if (!finding) throw new Error("Finding not found.");
  if (audit.convertedFindingIds.includes(findingId)) {
    throw new Error("This finding is already an opportunity.");
  }
  const { project } = requireProject(projectId);
  const opp = opportunityFromFinding(finding, project);
  addOpportunities([opp]);
  markFindingsConverted(audit.id, [findingId]);
  await saveWorkspaceNow();
  return opp;
}

/** Bulk: create opportunities from the top 3–5 High/Medium findings not yet converted. */
export async function createOpportunitiesFromTopFixes(projectId: string) {
  return once(`audit-bulk:${projectId}`, async () => {
    const s = getState();
    const audit = s.audits.find((a) => a.projectId === projectId);
    if (!audit) throw new Error("Run a site audit first.");
    const { project } = requireProject(projectId);

    const candidates = audit.findings
      .filter((f) => !audit.convertedFindingIds.includes(f.id))
      .filter((f) => f.priority === "High" || f.priority === "Medium")
      .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
      .slice(0, 5);

    if (candidates.length === 0) {
      throw new Error("No remaining high or medium priority findings to convert.");
    }

    const opps = candidates.map((f) => opportunityFromFinding(f, project));
    addOpportunities(opps);
    markFindingsConverted(
      audit.id,
      candidates.map((f) => f.id),
    );
    await saveWorkspaceNow();
    console.info("[ai.client] top-fix opportunities created", { projectId, count: opps.length });
    return opps;
  });
}

// ============================================================
// Competitor Gap v1
// ============================================================

/** Build an Opportunity from a competitor gap, with canonical lifecycle + provenance. */
function opportunityFromGap(gap: CompetitorGap, project: Project): Opportunity {
  return newOpportunityRecord({
    id: uid(),
    projectId: project.id,
    title: gap.suggestedOpportunityTitle || gap.title,
    language: project.primaryLanguage,
    contentType: gap.suggestedContentType,
    searchIntent: gap.suggestedSearchIntent,
    targetAudience: project.targetAudience || "Potential customers",
    businessValue: gap.recommendation || gap.explanation,
    recommendedCta: gap.suggestedCta || "Contact us",
    priority: gap.priority,
    source: "competitor",
  });
}

export async function runCompetitorGap(projectId: string, competitorUrls: string[]) {
  return once(`competitors:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);
    const urls = competitorUrls
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (urls.length === 0) throw new Error("Add at least one competitor URL.");

    // Pass the existing Site Audit summary (if any) for richer comparison context.
    const audit = getState().audits.find((a) => a.projectId === projectId);

    const res = await generateCompetitorGapFn({
      data: { project, services, competitorUrls: urls, auditSummary: audit?.summary ?? "" },
    });
    if (!res || !Array.isArray(res.gaps) || res.gaps.length === 0) {
      throw new Error("AI returned no competitor gaps. Please try again.");
    }
    console.info("[ai.client] competitor-gap received", { projectId, gaps: res.gaps.length });

    const analysis: CompetitorAnalysisResult = {
      id: uid(),
      projectId,
      competitorUrls: urls,
      note: res.note || undefined,
      overallGapScore: res.overallGapScore,
      serviceGapScore: res.serviceGapScore,
      contentGapScore: res.contentGapScore,
      localGapScore: res.localGapScore,
      trustGapScore: res.trustGapScore,
      conversionGapScore: res.conversionGapScore,
      summary: res.summary,
      competitorSnapshots: Array.isArray(res.competitorSnapshots) ? res.competitorSnapshots : [],
      topGaps: Array.isArray(res.topGaps) ? res.topGaps : [],
      gaps: res.gaps.map((g) => ({ ...g, id: uid() })),
      convertedGapIds: [],
      createdAt: new Date().toISOString(),
    };
    upsertCompetitorAnalysis(analysis);
    await saveWorkspaceNow();
    console.info("[ai.client] competitor-gap saved", { projectId, gaps: analysis.gaps.length });
    return analysis;
  });
}

/** Convert a single competitor gap into an Opportunity (idempotent per gap). */
export async function createOpportunityFromGap(projectId: string, gapId: string) {
  const s = getState();
  const analysis = s.competitorAnalyses.find((a) => a.projectId === projectId);
  if (!analysis) throw new Error("Run a competitor analysis first.");
  const gap = analysis.gaps.find((g) => g.id === gapId);
  if (!gap) throw new Error("Gap not found.");
  if (analysis.convertedGapIds.includes(gapId)) {
    throw new Error("This gap is already an opportunity.");
  }
  const { project } = requireProject(projectId);
  const opp = opportunityFromGap(gap, project);
  addOpportunities([opp]);
  markGapsConverted(analysis.id, [gapId]);
  await saveWorkspaceNow();
  return opp;
}

/** Bulk: create opportunities from the top 3–5 High/Medium gaps not yet converted. */
export async function createOpportunitiesFromTopGaps(projectId: string) {
  return once(`competitors-bulk:${projectId}`, async () => {
    const s = getState();
    const analysis = s.competitorAnalyses.find((a) => a.projectId === projectId);
    if (!analysis) throw new Error("Run a competitor analysis first.");
    const { project } = requireProject(projectId);

    const candidates = analysis.gaps
      .filter((g) => !analysis.convertedGapIds.includes(g.id))
      .filter((g) => g.priority === "High" || g.priority === "Medium")
      .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
      .slice(0, 5);

    if (candidates.length === 0) {
      throw new Error("No remaining high or medium priority gaps to convert.");
    }

    const opps = candidates.map((g) => opportunityFromGap(g, project));
    addOpportunities(opps);
    markGapsConverted(
      analysis.id,
      candidates.map((g) => g.id),
    );
    await saveWorkspaceNow();
    console.info("[ai.client] top-gap opportunities created", { projectId, count: opps.length });
    return opps;
  });
}

// ============================================================
// Authority v1
// ============================================================

/** Build an Opportunity from an authority item, with canonical lifecycle + provenance. */
function opportunityFromAuthorityItem(item: AuthorityItem, project: Project): Opportunity {
  return newOpportunityRecord({
    id: uid(),
    projectId: project.id,
    title: item.suggestedOpportunityTitle || item.title,
    language: project.primaryLanguage,
    contentType: item.suggestedContentType,
    searchIntent: item.suggestedSearchIntent,
    targetAudience: project.targetAudience || "Potential customers",
    businessValue: item.recommendation || item.explanation,
    recommendedCta: item.suggestedCta || "Contact us",
    priority: item.priority,
    source: "authority",
  });
}

export async function runAuthorityAnalysis(projectId: string) {
  return once(`authority:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);

    // Reuse existing audit / competitor context (if any) for a richer plan.
    const s = getState();
    const audit = s.audits.find((a) => a.projectId === projectId);
    const competitor = s.competitorAnalyses.find((a) => a.projectId === projectId);
    const competitorStrengths = (competitor?.competitorSnapshots ?? []).flatMap(
      (c) => c.notableStrengths ?? [],
    );
    const existingOpportunityTitles = s.opportunities
      .filter((o) => o.projectId === projectId)
      .map((o) => o.title);

    const res = await generateAuthorityFn({
      data: {
        project,
        services,
        auditSummary: audit?.summary ?? "",
        competitorSummary: competitor?.summary ?? "",
        competitorStrengths,
        existingOpportunityTitles,
      },
    });
    if (!res || !Array.isArray(res.authorityItems) || res.authorityItems.length === 0) {
      throw new Error("AI returned no authority opportunities. Please try again.");
    }
    console.info("[ai.client] authority received", { projectId, items: res.authorityItems.length });

    const analysis: AuthorityAnalysisResult = {
      id: uid(),
      projectId,
      overallAuthorityScore: res.overallAuthorityScore,
      localCitationScore: res.localCitationScore,
      industryPresenceScore: res.industryPresenceScore,
      reputationScore: res.reputationScore,
      partnerLinkScore: res.partnerLinkScore,
      prOpportunityScore: res.prOpportunityScore,
      trustSignalScore: res.trustSignalScore,
      summary: res.summary,
      topAuthorityActions: Array.isArray(res.topAuthorityActions) ? res.topAuthorityActions : [],
      authorityItems: res.authorityItems.map((it) => ({ ...it, id: uid() })),
      convertedItemIds: [],
      createdAt: new Date().toISOString(),
    };
    upsertAuthorityAnalysis(analysis);
    await saveWorkspaceNow();
    console.info("[ai.client] authority saved", {
      projectId,
      items: analysis.authorityItems.length,
    });
    return analysis;
  });
}

/** Convert a single authority item into an Opportunity (idempotent per item). */
export async function createOpportunityFromAuthorityItem(projectId: string, itemId: string) {
  const s = getState();
  const analysis = s.authorityAnalyses.find((a) => a.projectId === projectId);
  if (!analysis) throw new Error("Run an authority analysis first.");
  const item = analysis.authorityItems.find((i) => i.id === itemId);
  if (!item) throw new Error("Authority item not found.");
  if (analysis.convertedItemIds.includes(itemId)) {
    throw new Error("This authority item is already an opportunity.");
  }
  const { project } = requireProject(projectId);
  const opp = opportunityFromAuthorityItem(item, project);
  addOpportunities([opp]);
  markAuthorityItemsConverted(analysis.id, [itemId]);
  await saveWorkspaceNow();
  return opp;
}

/** Bulk: create opportunities from the top 3–5 High/Medium authority items not yet converted. */
export async function createOpportunitiesFromTopAuthority(projectId: string) {
  return once(`authority-bulk:${projectId}`, async () => {
    const s = getState();
    const analysis = s.authorityAnalyses.find((a) => a.projectId === projectId);
    if (!analysis) throw new Error("Run an authority analysis first.");
    const { project } = requireProject(projectId);

    const candidates = analysis.authorityItems
      .filter((i) => !analysis.convertedItemIds.includes(i.id))
      .filter((i) => i.priority === "High" || i.priority === "Medium")
      .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
      .slice(0, 5);

    if (candidates.length === 0) {
      throw new Error("No remaining high or medium priority authority items to convert.");
    }

    const opps = candidates.map((i) => opportunityFromAuthorityItem(i, project));
    addOpportunities(opps);
    markAuthorityItemsConverted(
      analysis.id,
      candidates.map((i) => i.id),
    );
    await saveWorkspaceNow();
    console.info("[ai.client] top-authority opportunities created", {
      projectId,
      count: opps.length,
    });
    return opps;
  });
}

// ============================================================
// Authority Builder v2 / Safe Backlinks
// ============================================================

const LEGACY_CATEGORY_TO_TYPE: Record<AuthorityCategory, AuthorityOpportunityType> = {
  "Local Directories & Citations": "localDirectory",
  "Industry Directories": "industryDirectory",
  "Review & Reputation": "reviewProfile",
  "Partner & Supplier Links": "partnerLink",
  "Associations & Communities": "association",
  "PR & Story": "localPr",
  "Trust Signals": "trustSignal",
  Outreach: "other",
};

function legacyToAuthorityOpportunity(
  item: AuthorityItem,
  projectId: string,
): AuthorityOpportunity {
  const prio = item.priority === "High" ? "high" : item.priority === "Low" ? "low" : "medium";
  return {
    id: uid(),
    projectId,
    type: LEGACY_CATEGORY_TO_TYPE[item.category] ?? "other",
    title: item.title,
    description: item.explanation || item.recommendation || "",
    priority: prio,
    status: "suggested",
    relatedServiceOrOffer: item.suggestedPlatformOrTarget || undefined,
    outreachNote: item.outreachAngle || undefined,
    nextStep: item.recommendation || undefined,
    estimatedValue:
      item.expectedImpact === "High" ? "high" : item.expectedImpact === "Low" ? "low" : "medium",
    difficulty: item.effort === "High" ? "hard" : item.effort === "Low" ? "easy" : "medium",
    createdAt: new Date().toISOString(),
  };
}

/**
 * One-time, lossless migration of legacy Authority v1 items into the v2 tracker.
 * Runs only when the project has a legacy analysis but no v2 opportunities yet,
 * so existing data shows up without a DB migration. Old analysis is left intact.
 */
export async function migrateLegacyAuthority(projectId: string): Promise<number> {
  const s = getState();
  const already = s.authorityOpportunities.some((a) => a.projectId === projectId);
  if (already) return 0;
  const analysis = s.authorityAnalyses.find((a) => a.projectId === projectId);
  if (!analysis || !analysis.authorityItems.length) return 0;
  const migrated = analysis.authorityItems.map((it) => legacyToAuthorityOpportunity(it, projectId));
  addAuthorityOpportunities(migrated);
  await saveWorkspaceNow();
  console.info("[ai.client] authority legacy migrated", { projectId, count: migrated.length });
  return migrated.length;
}

const normKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Generate v2 authority opportunities (Brand-Intelligence aware), deduped + appended. */
export async function generateAuthorityOpportunities(projectId: string) {
  return once(`authority2:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);
    const s = getState();
    const existing = s.authorityOpportunities.filter((a) => a.projectId === projectId);
    const existingTitles = existing.map((a) => a.title);
    const livePages = s.content
      .filter((c) => c.projectId === projectId && c.livePublishStatus === "published" && c.liveUrl)
      .map((c) => c.liveUrl as string);
    const explanationLanguage = contentLangToProjectLanguage(project.appLanguage ?? "en");

    const { opportunities } = await generateAuthorityOpportunitiesFn({
      data: { project, services, existingTitles, livePages, explanationLanguage },
    });
    if (!opportunities.length)
      throw new Error("AI returned no authority opportunities. Please try again.");

    // Dedup against existing (title+type, or shared target/live URL).
    const seenTitleType = new Set(existing.map((a) => `${normKey(a.title)}|${a.type}`));
    const seenUrl = new Set(
      existing.flatMap((a) =>
        [a.targetUrl, a.liveLinkUrl].filter(Boolean).map((u) => normKey(u as string)),
      ),
    );
    const fresh: AuthorityOpportunity[] = [];
    for (const o of opportunities) {
      const tt = `${normKey(o.title)}|${o.type}`;
      const url = o.targetUrl ? normKey(o.targetUrl) : "";
      if (seenTitleType.has(tt)) continue;
      if (url && seenUrl.has(url)) continue;
      seenTitleType.add(tt);
      if (url) seenUrl.add(url);
      fresh.push({
        ...o,
        id: uid(),
        projectId,
        status: "suggested",
        targetUrl: o.targetUrl || undefined,
        suggestedPageToLink: o.suggestedPageToLink || undefined,
        relatedServiceOrOffer: o.relatedServiceOrOffer || undefined,
        anchorOrListingText: o.anchorOrListingText || undefined,
        outreachNote: o.outreachNote || undefined,
        outreachTemplate: o.outreachTemplate || undefined,
        relevanceReason: o.relevanceReason || undefined,
        nextStep: o.nextStep || undefined,
        safetyNotes: o.safetyNotes || undefined,
        requirements: o.requirements.length ? o.requirements : undefined,
        createdAt: new Date().toISOString(),
      });
    }
    if (!fresh.length)
      throw new Error("No new authority opportunities — all suggestions already exist.");
    addAuthorityOpportunities(fresh);
    await saveWorkspaceNow();
    console.info("[ai.client] authority v2 generated", { projectId, added: fresh.length });
    return fresh;
  });
}

/** Convert a v2 authority opportunity into an Opportunity (idempotent per item). */
export async function convertAuthorityOpportunityToOpportunity(projectId: string, id: string) {
  const s = getState();
  const item = s.authorityOpportunities.find((a) => a.id === id);
  if (!item) throw new Error("Authority opportunity not found.");
  if (item.linkedOpportunityId) throw new Error("This item is already an opportunity.");
  const { project } = requireProject(projectId);
  const opp: Opportunity = newOpportunityRecord({
    id: uid(),
    projectId,
    title: `Create/submit listing for ${item.title}`,
    language: project.primaryLanguage,
    contentType: "Service Page",
    searchIntent: "Navigational",
    targetAudience: project.targetAudience || "Potential customers",
    businessValue: item.description || item.relevanceReason || "Build trust and authority signals.",
    recommendedCta: "Contact us",
    priority: item.priority === "high" ? "High" : item.priority === "low" ? "Low" : "Medium",
    source: "authority",
  });
  addOpportunities([opp]);
  updateAuthorityOpportunity(id, { linkedOpportunityId: opp.id });
  await saveWorkspaceNow();
  return opp;
}

// ============================================================
// AI Visibility v1 (planning/readiness — no live AI checks)
// ============================================================

/** Build an Opportunity from an AI-visibility gap, with canonical lifecycle + provenance. */
function opportunityFromVisibilityGap(gap: AiVisibilityGap, project: Project): Opportunity {
  return newOpportunityRecord({
    id: uid(),
    projectId: project.id,
    title: gap.suggestedOpportunityTitle || gap.title,
    language: project.primaryLanguage,
    contentType: gap.suggestedContentType,
    searchIntent: gap.suggestedSearchIntent,
    targetAudience: project.targetAudience || "Potential customers",
    businessValue: gap.recommendation || gap.explanation,
    recommendedCta: gap.suggestedCta || "Contact us",
    priority: gap.priority,
    source: "aiVisibility",
  });
}

export async function runAiVisibilityAnalysis(projectId: string) {
  return once(`aivis:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);

    // Reuse existing audit / competitor / authority context (if any).
    const s = getState();
    const audit = s.audits.find((a) => a.projectId === projectId);
    const competitor = s.competitorAnalyses.find((a) => a.projectId === projectId);
    const authority = s.authorityAnalyses.find((a) => a.projectId === projectId);
    const existingOpportunityTitles = s.opportunities
      .filter((o) => o.projectId === projectId)
      .map((o) => o.title);

    const res = await generateAiVisibilityFn({
      data: {
        project,
        services,
        auditSummary: audit?.summary ?? "",
        competitorSummary: competitor?.summary ?? "",
        authoritySummary: authority?.summary ?? "",
        existingOpportunityTitles,
      },
    });
    if (
      !res ||
      ((!Array.isArray(res.promptSets) || res.promptSets.length === 0) &&
        (!Array.isArray(res.visibilityGaps) || res.visibilityGaps.length === 0))
    ) {
      throw new Error("AI returned no AI-visibility results. Please try again.");
    }
    console.info("[ai.client] ai-visibility received", {
      projectId,
      prompts: res.promptSets?.length ?? 0,
      gaps: res.visibilityGaps?.length ?? 0,
    });

    const analysis: AiVisibilityAnalysisResult = {
      id: uid(),
      projectId,
      overallAiVisibilityScore: res.overallAiVisibilityScore,
      promptCoverageScore: res.promptCoverageScore,
      answerReadinessScore: res.answerReadinessScore,
      localAiReadinessScore: res.localAiReadinessScore,
      trustCitationScore: res.trustCitationScore,
      contentGapScore: res.contentGapScore,
      authorityGapScore: res.authorityGapScore,
      summary: res.summary,
      topAiVisibilityActions: Array.isArray(res.topAiVisibilityActions)
        ? res.topAiVisibilityActions
        : [],
      promptSets: (Array.isArray(res.promptSets) ? res.promptSets : []).map((p) => ({
        ...p,
        id: uid(),
      })),
      visibilityGaps: (Array.isArray(res.visibilityGaps) ? res.visibilityGaps : []).map((g) => ({
        ...g,
        id: uid(),
      })),
      convertedGapIds: [],
      createdAt: new Date().toISOString(),
    };
    upsertAiVisibilityAnalysis(analysis);
    await saveWorkspaceNow();
    console.info("[ai.client] ai-visibility saved", {
      projectId,
      prompts: analysis.promptSets.length,
      gaps: analysis.visibilityGaps.length,
    });
    return analysis;
  });
}

/** Convert a single AI-visibility gap into an Opportunity (idempotent per gap). */
export async function createOpportunityFromVisibilityGap(projectId: string, gapId: string) {
  const s = getState();
  const analysis = s.aiVisibilityAnalyses.find((a) => a.projectId === projectId);
  if (!analysis) throw new Error("Run an AI visibility analysis first.");
  const gap = analysis.visibilityGaps.find((g) => g.id === gapId);
  if (!gap) throw new Error("AI visibility gap not found.");
  if (analysis.convertedGapIds.includes(gapId)) {
    throw new Error("This AI visibility gap is already an opportunity.");
  }
  const { project } = requireProject(projectId);
  const opp = opportunityFromVisibilityGap(gap, project);
  addOpportunities([opp]);
  markVisibilityGapsConverted(analysis.id, [gapId]);
  await saveWorkspaceNow();
  return opp;
}

/** Bulk: create opportunities from the top 3–5 High/Medium visibility gaps not yet converted. */
export async function createOpportunitiesFromTopAiActions(projectId: string) {
  return once(`aivis-bulk:${projectId}`, async () => {
    const s = getState();
    const analysis = s.aiVisibilityAnalyses.find((a) => a.projectId === projectId);
    if (!analysis) throw new Error("Run an AI visibility analysis first.");
    const { project } = requireProject(projectId);

    const candidates = analysis.visibilityGaps
      .filter((g) => !analysis.convertedGapIds.includes(g.id))
      .filter((g) => g.priority === "High" || g.priority === "Medium")
      .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
      .slice(0, 5);

    if (candidates.length === 0) {
      throw new Error("No remaining high or medium priority AI visibility gaps to convert.");
    }

    const opps = candidates.map((g) => opportunityFromVisibilityGap(g, project));
    addOpportunities(opps);
    markVisibilityGapsConverted(
      analysis.id,
      candidates.map((g) => g.id),
    );
    await saveWorkspaceNow();
    console.info("[ai.client] top-ai-visibility opportunities created", {
      projectId,
      count: opps.length,
    });
    return opps;
  });
}

// ============================================================
// Backlinks v1 (DataForSEO link profile + link gap)
// ============================================================

/** Build an Opportunity from a backlink recommendation, with canonical lifecycle + provenance. */
function opportunityFromBacklinkRecommendation(
  rec: BacklinkRecommendation,
  project: Project,
): Opportunity {
  return newOpportunityRecord({
    id: uid(),
    projectId: project.id,
    title: rec.suggestedOpportunityTitle || rec.title,
    language: project.primaryLanguage,
    contentType: rec.suggestedContentType,
    searchIntent: rec.suggestedSearchIntent,
    targetAudience: project.targetAudience || "Potential customers",
    businessValue: rec.recommendation || rec.explanation,
    recommendedCta: rec.suggestedCta || "Contact us",
    priority: rec.priority,
    source: "backlinks",
  });
}

/** UI-safe check: configuration, account health and remaining provider balance. */
export async function getBacklinksStatus() {
  return getBacklinksStatusFn();
}

export async function runBacklinkAnalysis(projectId: string) {
  return once(`backlinks:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);

    // Competitor domains: project setup first, then the latest competitor analysis.
    const s = getState();
    const competitorUrls = resolveBacklinkCompetitors(
      project.competitorUrls,
      s.competitorAnalyses.find((a) => a.projectId === projectId)?.competitorUrls,
    ).urls;
    const explanationLanguage = contentLangToProjectLanguage(project.appLanguage ?? "en");

    const res = await generateBacklinksFn({
      data: { project, services, competitorUrls, explanationLanguage },
    });
    if (!res || !Array.isArray(res.recommendations) || res.recommendations.length === 0) {
      throw new Error("AI returned no backlink recommendations. Please try again.");
    }
    console.info("[ai.client] backlinks received", {
      projectId,
      recommendations: res.recommendations.length,
      gapDomains: res.gapDomains?.length ?? 0,
    });

    const analysis: BacklinkAnalysisResult = {
      id: uid(),
      projectId,
      note: res.note || undefined,
      ownDomain: res.ownDomain,
      own: res.own,
      competitors: Array.isArray(res.competitors) ? res.competitors : [],
      topReferringDomains: Array.isArray(res.topReferringDomains) ? res.topReferringDomains : [],
      gapDomains: Array.isArray(res.gapDomains) ? res.gapDomains : [],
      overallLinkScore: res.overallLinkScore,
      linkProfileScore: res.linkProfileScore,
      linkGapScore: res.linkGapScore,
      linkQualityScore: res.linkQualityScore,
      summary: res.summary,
      topLinkActions: Array.isArray(res.topLinkActions) ? res.topLinkActions : [],
      recommendations: res.recommendations.map((r) => ({ ...r, id: uid() })),
      convertedRecommendationIds: [],
      createdAt: new Date().toISOString(),
    };
    upsertBacklinkAnalysis(analysis);
    await saveWorkspaceNow();
    console.info("[ai.client] backlinks saved", {
      projectId,
      recommendations: analysis.recommendations.length,
    });
    return analysis;
  });
}

/** Convert a single backlink recommendation into an Opportunity (idempotent per item). */
export async function createOpportunityFromBacklinkRecommendation(
  projectId: string,
  recommendationId: string,
) {
  const s = getState();
  const analysis = s.backlinkAnalyses.find((a) => a.projectId === projectId);
  if (!analysis) throw new Error("Run a backlink analysis first.");
  const rec = analysis.recommendations.find((r) => r.id === recommendationId);
  if (!rec) throw new Error("Backlink recommendation not found.");
  if (analysis.convertedRecommendationIds.includes(recommendationId)) {
    throw new Error("This recommendation is already an opportunity.");
  }
  const { project } = requireProject(projectId);
  const opp = opportunityFromBacklinkRecommendation(rec, project);
  addOpportunities([opp]);
  markBacklinkRecommendationsConverted(analysis.id, [recommendationId]);
  await saveWorkspaceNow();
  return opp;
}

/** Bulk: create opportunities from the top 3–5 High/Medium recommendations not yet converted. */
export async function createOpportunitiesFromTopBacklinkActions(projectId: string) {
  return once(`backlinks-bulk:${projectId}`, async () => {
    const s = getState();
    const analysis = s.backlinkAnalyses.find((a) => a.projectId === projectId);
    if (!analysis) throw new Error("Run a backlink analysis first.");
    const { project } = requireProject(projectId);

    const candidates = analysis.recommendations
      .filter((r) => !analysis.convertedRecommendationIds.includes(r.id))
      .filter((r) => r.priority === "High" || r.priority === "Medium")
      .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
      .slice(0, 5);

    if (candidates.length === 0) {
      throw new Error("No remaining high or medium priority recommendations to convert.");
    }

    const opps = candidates.map((r) => opportunityFromBacklinkRecommendation(r, project));
    addOpportunities(opps);
    markBacklinkRecommendationsConverted(
      analysis.id,
      candidates.map((r) => r.id),
    );
    await saveWorkspaceNow();
    console.info("[ai.client] top-backlink opportunities created", {
      projectId,
      count: opps.length,
    });
    return opps;
  });
}

// ============================================================
// AI Outreach v1 (draft-only; no external send)
// ============================================================

export async function generateOutreachDraft(
  projectId: string,
  input: {
    targetDomain: string;
    contactName?: string;
    contactEmail?: string;
    reason?: string;
    suggestedAsset?: string;
    source: OutreachTargetSource;
  },
) {
  return once(`outreach:${projectId}:${input.targetDomain.toLowerCase()}`, async () => {
    const { project, services } = requireProject(projectId);
    const generated = await generateOutreachDraftFn({
      data: {
        project,
        services,
        targetDomain: input.targetDomain,
        contactName: input.contactName ?? "",
        reason: input.reason ?? "",
        suggestedAsset: input.suggestedAsset ?? "",
        language: contentLangToProjectLanguage(project.appLanguage ?? "en"),
      },
    });
    const now = new Date().toISOString();
    const draft: OutreachDraft = {
      id: uid(),
      projectId,
      targetDomain: input.targetDomain,
      contactName: input.contactName?.trim() ?? "",
      contactEmail: input.contactEmail?.trim() ?? "",
      source: input.source,
      subject: generated.subject,
      body: generated.body,
      suggestedAsset: generated.suggestedAsset,
      rationale: generated.rationale,
      status: "Draft",
      followUps: generated.followUps,
      createdAt: now,
      updatedAt: now,
    };
    addOutreachDraft(draft);
    await saveWorkspaceNow();
    return draft;
  });
}

// ============================================================
// Content Engine 2.0
// ============================================================

function sourceTypeForOpportunity(opp: Opportunity): ContentSourceType {
  if (opp.source === "audit") return "audit";
  if (opp.source === "competitor") return "competitor";
  if (opp.source === "manual") return "manual";
  return "opportunity";
}

type GeneratedContent = {
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
};

/**
 * Generate a content asset of `assetType` from an opportunity (Content Engine 2.0).
 * Reuses the existing content-asset shape so the current editor renders/edits it
 * unchanged; adds asset-type + source metadata.
 */
export async function generateContentForOpportunity(
  opportunityId: string,
  assetType: AssetType,
  /**
   * Rewrite seed. When a live page's draft was lost, the prior URL is carried in
   * republishTargetUrl (+ publishSlug) so the connector updates in place. Limited
   * by Pick to fields pipelineStage ignores — never liveUrl — so the fresh draft
   * still correctly derives to "writing".
   */
  seed?: Pick<ContentAsset, "publishSlug" | "republishTargetUrl">,
) {
  return once(`content:${opportunityId}:${assetType}`, async () => {
    const s = getState();
    const opp = s.opportunities.find((o) => o.id === opportunityId);
    if (!opp) throw new Error("Opportunity not found.");
    const { project, services } = requireProject(opp.projectId);

    const result = (await generateContentFn({
      data: { project, services, opportunity: opp, assetType },
    })) as GeneratedContent;

    if (!result || !result.markdown) {
      throw new Error("AI returned empty content. Please try again.");
    }

    const now = new Date().toISOString();
    const asset: ContentAsset = {
      id: uid(),
      projectId: opp.projectId,
      opportunityId: opp.id,
      title: opp.title,
      slug: slugify(opp.title),
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      h1: result.h1 || opp.title,
      outline: result.outline ?? [],
      faq: result.faq ?? [],
      cta: result.cta || opp.recommendedCta,
      markdown: result.markdown,
      internalLinks: result.internalLinks ?? [],
      schemaSuggestions: result.schemaSuggestions ?? [],
      editorNotes: result.editorNotes ?? "",
      status: "Draft",
      updatedAt: now,
      assetType,
      sourceOpportunityId: opp.id,
      sourceOpportunityTitle: opp.title,
      sourceType: sourceTypeForOpportunity(opp),
      // Store the asset's language: prefer the project's primary content language
      // (what we now generate in), falling back to the opportunity's language.
      language: project.primaryContentLanguage
        ? contentLangToProjectLanguage(project.primaryContentLanguage)
        : opp.language,
      createdAt: now,
      // Article Studio 3.0 / P1.2A — a newly generated long-form article is a v3
      // asset (needs an approved opening hook before publishing). Short-form types
      // (faq/meta/gbpPost/socialPack/brief) stay legacy and are never hook-gated.
      ...(isArticleLikeAssetType(assetType) ? { visualModelVersion: 3 as const } : {}),
      // Rewrite provenance, if any. Pick keeps this to publishSlug +
      // republishTargetUrl — never a field pipelineStage reads.
      ...(seed ?? {}),
    };

    updateOpportunity(opp.id, {
      status: "drafting",
      currentContentAssetId: asset.id,
    });

    upsertContent(asset);
    await saveWorkspaceNow();
    console.info("[ai.client] content asset created", { projectId: opp.projectId, assetType });
    return asset;
  });
}

// ============================================================
// WordPress Connector v1
// ============================================================

/** Test the project's WordPress connection and persist the result (no secrets stored beyond settings). */
export async function testWordPressConnection(projectId: string) {
  const s = getState();
  const project = s.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");
  const creds = wpCreds(project);
  const res = await testWordPressConnectionFn({ data: creds });
  updateProjectConnector(projectId, {
    wordpress: {
      lastTestedAt: new Date().toISOString(),
      lastTestStatus: res.success ? "success" : "error",
      lastTestMessage: res.success ? res.message : res.error,
    },
  });
  await saveWorkspaceNow();
  return res;
}

/** The project's deterministic internal-path inventory (Milo-published + root). */
function knownPathsForProject(project: Project): string[] {
  return buildActiveInternalPaths(
    project,
    getState().content.filter((c) => c.projectId === project.id),
  );
}

/**
 * Refuse to send OR publish while ANY deterministic hard blocker fails —
 * unresolved internal links, an invalid cited source, a missing image alt /
 * required image, or a schema inconsistency (P1.1 J). The
 * editor also disables the buttons, but the store path must refuse too so nothing
 * unsafe publishes on any connector — mirrored by the server/cron guard in
 * publish.server.ts.
 */
function assertPublishable(asset: ContentAsset, project: Project): void {
  const blockers = publishBlockers(asset, project, getState().content);
  if (blockers.length) {
    throw new Error(
      `Resolve before publishing: ${blockers.map((b) => b.detail || b.label).join(" ")}`,
    );
  }
}

async function sendToWordPressDraft(asset: ContentAsset, project: Project, slug: string) {
  const creds = wpCreds(project);
  const postType = wpPostTypeFor(asset, project);
  // Manual == scheduled: body markdown + structured data both come from the ONE
  // canonical assembler (P1.1 B), resolving links against the same active
  // inventory as the cron path.
  const activePaths = knownPathsForProject(project);
  const assembled = assembleContentAsset(asset, project, {
    activeInternalPaths: new Set(activePaths),
  });
  const res = await sendContentToWordPressDraftFn({
    data: {
      // Connector identity — the server re-derives content + creds from this asset
      // and enforces the checklist; the fields below are what a legit send passes.
      projectId: project.id,
      assetId: asset.id,
      ...creds,
      postType,
      postId: asset.wordpressPostId,
      title: asset.title,
      contentMarkdown: assembled.markdown,
      jsonLd: assembled.jsonLdScript,
      knownInternalPaths: activePaths,
      slug: (slug || asset.slug || "").trim(),
      excerpt: asset.metaDescription ?? "",
    },
  });
  if (!res.success) {
    const msg = res.error || "WordPress draft failed. Please try again.";
    markContentAssetPublishFailed(asset.id, msg, new Date().toISOString());
    await saveWorkspaceNow();
    throw new Error(msg);
  }
  markContentAssetSent(asset.id, {
    publishDestinationType: asset.publishDestinationType ?? "blogPost",
    publishSlug: (slug || asset.slug || "").trim(),
    publishedDraftUrl: res.editUrl || res.liveUrl || undefined,
    publishExternalId: res.postId ? String(res.postId) : undefined,
    lastPublishedAt: new Date().toISOString(),
    publishPlatform: "wordpress",
    wordpressPostId: res.postId,
    wordpressPostType: res.postType,
  });
  await saveWorkspaceNow();
  console.info("[ai.client] WordPress draft sent", { projectId: project.id, postType });
  return res;
}

async function publishToWordPressLive(asset: ContentAsset, project: Project) {
  const creds = wpCreds(project);
  const postType = wpPostTypeFor(asset, project);
  const activePaths = knownPathsForProject(project);
  const assembled = assembleContentAsset(asset, project, {
    activeInternalPaths: new Set(activePaths),
  });
  const res = await publishWordPressContentFn({
    data: {
      // Connector identity — the server re-derives content + creds from this asset
      // and enforces the checklist; the fields below are what a legit publish passes.
      projectId: project.id,
      assetId: asset.id,
      ...creds,
      postType,
      postId: asset.wordpressPostId,
      title: asset.title,
      contentMarkdown: assembled.markdown,
      // Manual == scheduled: body + structured data from the ONE canonical
      // assembler (P1.1 B), links resolved against the same active inventory.
      jsonLd: assembled.jsonLdScript,
      knownInternalPaths: activePaths,
      slug: (asset.publishSlug || asset.slug || "").trim(),
      excerpt: asset.metaDescription ?? "",
    },
  });
  if (!res.success || !res.liveUrl) {
    const msg = res.error || "WordPress published but did not return a live URL.";
    markContentAssetLivePublishFailed(asset.id, msg, new Date().toISOString());
    await saveWorkspaceNow();
    throw new Error(msg);
  }
  markContentAssetPublishedLive(asset.id, {
    liveUrl: res.liveUrl,
    livePublishedAt: new Date().toISOString(),
    publishExternalId: res.postId ? String(res.postId) : undefined,
    publishPlatform: "wordpress",
    wordpressPostId: res.postId,
    wordpressPostType: res.postType,
  });
  await saveWorkspaceNow();
  console.info("[ai.client] WordPress published live", { projectId: project.id, postType });
  return res;
}

// ============================================================
// Shopify Connector v1
// ============================================================

/** Test the project's Shopify connection and persist the result. */
export async function testShopifyConnection(projectId: string) {
  const s = getState();
  const project = s.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");
  const creds = shopifyCreds(project);
  const res = await testShopifyConnectionFn({ data: creds });
  updateProjectConnector(projectId, {
    shopify: {
      lastTestedAt: new Date().toISOString(),
      lastTestStatus: res.success ? "success" : "error",
      lastTestMessage: res.success ? res.message : res.error,
    },
  });
  await saveWorkspaceNow();
  return res;
}

/** Fetch the store's blogs for the blog selector. */
export async function listShopifyBlogs(projectId: string) {
  const s = getState();
  const project = s.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found.");
  const creds = shopifyCreds(project);
  return listShopifyBlogsFn({ data: creds });
}

async function sendToShopifyDraft(asset: ContentAsset, project: Project) {
  const res = await sendContentToShopifyDraftFn({
    data: shopifyArticleArgs(asset, project, knownPathsForProject(project)),
  });
  if (!res.success) {
    const msg = res.error || "Shopify article failed. Please try again.";
    markContentAssetPublishFailed(asset.id, msg, new Date().toISOString());
    await saveWorkspaceNow();
    throw new Error(msg);
  }
  markContentAssetSent(asset.id, {
    publishDestinationType: asset.publishDestinationType ?? "blogPost",
    publishSlug: res.handle || asset.slug || "",
    publishedDraftUrl: res.editUrl || res.liveUrl || undefined,
    publishExternalId: res.articleId || undefined,
    lastPublishedAt: new Date().toISOString(),
    publishPlatform: "shopify",
    shopify: {
      shopifyArticleId: res.articleId,
      shopifyArticleGid: res.articleGid,
      shopifyBlogId: res.blogId,
      shopifyBlogGid: res.blogGid,
      shopifyHandle: res.handle,
      shopifyStatus: res.status,
    },
  });
  await saveWorkspaceNow();
  console.info("[ai.client] Shopify article draft sent", { projectId: project.id });
  return res;
}

async function publishToShopifyLive(asset: ContentAsset, project: Project) {
  const res = await publishShopifyContentFn({
    data: shopifyArticleArgs(asset, project, knownPathsForProject(project)),
  });
  if (!res.success || !res.liveUrl) {
    const msg = res.error || "Shopify published but did not return a live URL.";
    markContentAssetLivePublishFailed(asset.id, msg, new Date().toISOString());
    await saveWorkspaceNow();
    throw new Error(msg);
  }
  markContentAssetPublishedLive(asset.id, {
    liveUrl: res.liveUrl,
    livePublishedAt: new Date().toISOString(),
    publishExternalId: res.articleId || undefined,
    publishPlatform: "shopify",
    shopify: {
      shopifyArticleId: res.articleId,
      shopifyArticleGid: res.articleGid,
      shopifyBlogId: res.blogId,
      shopifyBlogGid: res.blogGid,
      shopifyHandle: res.handle,
      shopifyStatus: "published",
    },
  });
  await saveWorkspaceNow();
  console.info("[ai.client] Shopify published live", { projectId: project.id });
  return res;
}

// ============================================================
// Publishing v1 — send a content asset to the connected website as a draft
// ============================================================

/**
 * Send a content asset to the project's connected website endpoint as a DRAFT.
 * The secret never leaves the server function (it is forwarded as a header
 * there, not from the browser). On failure the asset content is preserved and a
 * "failed" status + error message are stored.
 */
export async function sendContentToWebsite(
  assetId: string,
  destinationType: PublishDestinationType,
  slug: string,
) {
  return once(`publish:${assetId}`, async () => {
    const s = getState();
    const asset = s.content.find((c) => c.id === assetId);
    if (!asset) throw new Error("Content asset not found.");
    const project = s.projects.find((p) => p.id === asset.projectId);
    if (!project) throw new Error("Project not found.");
    assertPublishable(asset, project);

    // WordPress connector branch — create/update a WordPress draft.
    if (isWordPress(project)) {
      return sendToWordPressDraft(asset, project, slug);
    }
    // Shopify connector branch — create/update an unpublished article.
    if (isShopify(project)) {
      return sendToShopifyDraft(asset, project);
    }

    const endpoint = (project.publishEndpoint ?? "").trim();
    const secret = (project.publishSecret ?? "").trim();
    if (!endpoint || !secret) {
      throw new Error("Connect a website in Project Setup before sending drafts.");
    }

    const finalSlug = (slug || asset.slug || "").trim();

    try {
      const res = await publishContentFn({
        data: {
          // endpoint/secret intentionally not sent: resolved server-side from
          // this user's own workspace, so the browser cannot retarget a publish.
          projectId: project.id,
          assetId: asset.id,
          title: asset.title,
          slug: finalSlug,
          assetType: asset.assetType ?? "article",
          destinationType,
          language: asset.language ?? project.primaryLanguage,
          // Custom endpoint publishes the same canonical assembled body (P1.1 B)
          // as WordPress/Shopify. Payload shape is unchanged (still `markdown`);
          // identical to `asset.markdown` for a legacy asset.
          markdown: assembleContentAsset(asset, project).markdown,
          metaTitle: asset.metaTitle,
          metaDescription: asset.metaDescription,
          sourceOpportunityTitle: asset.sourceOpportunityTitle ?? asset.title,
          sourceType: asset.sourceType ?? "unknown",
          createdAt: asset.createdAt ?? asset.updatedAt,
        },
      });

      markContentAssetSent(assetId, {
        publishDestinationType: destinationType,
        publishSlug: finalSlug,
        publishedDraftUrl: res.draftUrl || undefined,
        publishExternalId: res.externalId || undefined,
        lastPublishedAt: res.sentAt,
      });
      await saveWorkspaceNow();
      console.info("[ai.client] draft sent to website", { projectId: project.id, destinationType });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Publishing failed. Please try again.";
      markContentAssetPublishFailed(assetId, msg, new Date().toISOString());
      await saveWorkspaceNow();
      throw e instanceof Error ? e : new Error(msg);
    }
  });
}

/**
 * Publish an already-sent draft LIVE on the connected website (Publishing v1.1).
 * Requires the draft to have been sent first and a live-publish endpoint + secret.
 * Stores published/failed status; preserves draft state + content on failure.
 */
export async function publishContentLive(assetId: string) {
  return once(`publish-live:${assetId}`, async () => {
    const s = getState();
    const asset = s.content.find((c) => c.id === assetId);
    if (!asset) throw new Error("Content asset not found.");
    const project = s.projects.find((p) => p.id === asset.projectId);
    if (!project) throw new Error("Project not found.");
    assertPublishable(asset, project);

    // WordPress connector branch — publish/update the post live (create if needed).
    if (isWordPress(project)) {
      return publishToWordPressLive(asset, project);
    }
    // Shopify connector branch — publish/update the article live (create if needed).
    if (isShopify(project)) {
      return publishToShopifyLive(asset, project);
    }

    const liveEndpoint = (project.livePublishEndpoint ?? "").trim();
    const secret = (project.publishSecret ?? "").trim();
    if (!liveEndpoint) throw new Error("Add a live-publish endpoint in Project Setup first.");
    if (!secret) throw new Error("Add a publish secret in Project Setup first.");
    if (asset.publishStatus !== "sent") {
      throw new Error("Send the draft to the website before publishing it live.");
    }

    try {
      const res = await publishLiveFn({
        data: {
          // endpoint/secret intentionally not sent — see publishContentFn above.
          projectId: project.id,
          assetId: asset.id,
          externalId: asset.publishExternalId ?? "",
          slug: asset.publishSlug ?? asset.slug,
          destinationType:
            asset.publishDestinationType ?? project.defaultDestinationType ?? "blogPost",
        },
      });
      markContentAssetPublishedLive(assetId, {
        liveUrl: res.liveUrl,
        livePublishedAt: res.publishedAt,
        publishExternalId: res.externalId || undefined,
      });
      await saveWorkspaceNow();
      console.info("[ai.client] published live", { projectId: project.id });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Live publish failed. Please try again.";
      markContentAssetLivePublishFailed(assetId, msg, new Date().toISOString());
      await saveWorkspaceNow();
      throw e instanceof Error ? e : new Error(msg);
    }
  });
}
