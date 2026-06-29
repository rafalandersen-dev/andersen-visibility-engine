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
import {
  getState,
  replaceNewOpportunities,
  replacePlannedCalendar,
  saveWorkspaceNow,
  upsertContent,
  upsertAudit,
  markFindingsConverted,
  upsertCompetitorAnalysis,
  markGapsConverted,
  addOpportunities,
  updateOpportunity,
  updateProject,
  uid,
} from "./store";
import type {
  Opportunity,
  CalendarItem,
  ContentAsset,
  Language,
  AuditResult,
  AuditFinding,
  CompetitorAnalysisResult,
  CompetitorGap,
  Project,
  Priority,
  AssetType,
  ContentSourceType,
} from "./types";
import {
  generateOpportunitiesFn,
  generateCalendarFn,
  generateContentAssetFn,
  generateContentFn,
  generateAuditFn,
  generateCompetitorGapFn,
  regenerateMetadataFn,
  regenerateFaqFn,
  regenerateCtaFn,
} from "./ai.functions";

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

    const items: Opportunity[] = opportunities.map((r) => ({
      ...r,
      id: uid(),
      projectId,
      status: "New",
    }));

    if (items.length === 0) throw new Error("AI returned no opportunities. Please try again.");
    replaceNewOpportunities(projectId, items);
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
    };
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
// Site Audit v1
// ============================================================

const priorityRank: Record<Priority, number> = { High: 3, Medium: 2, Low: 1 };

/** Build a "New"-equivalent Opportunity from an audit finding.
 *  Status is "Linked" so a later opportunities re-generation
 *  (which replaces only "New" items) never wipes audit-derived ones. */
function opportunityFromFinding(finding: AuditFinding, project: Project): Opportunity {
  return {
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
    status: "Linked",
    source: "audit",
  };
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

/** Build a "Linked" Opportunity from a competitor gap (survives opportunity regeneration). */
function opportunityFromGap(gap: CompetitorGap, project: Project): Opportunity {
  return {
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
    status: "Linked",
    source: "competitor",
  };
}

export async function runCompetitorGap(projectId: string, competitorUrls: string[]) {
  return once(`competitors:${projectId}`, async () => {
    const { project, services } = requireProject(projectId);
    const urls = competitorUrls.map((u) => u.trim()).filter(Boolean).slice(0, 3);
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
export async function generateContentForOpportunity(opportunityId: string, assetType: AssetType) {
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
      language: opp.language,
      createdAt: now,
    };

    // Promote fresh opportunities to "Drafting"; never overwrite Linked/other states.
    if (opp.status === "New" || opp.status === "In Brief") {
      updateOpportunity(opp.id, { status: "Drafting" });
    }

    upsertContent(asset);
    await saveWorkspaceNow();
    console.info("[ai.client] content asset created", { projectId: opp.projectId, assetType });
    return asset;
  });
}
