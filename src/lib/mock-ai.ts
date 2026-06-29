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
  addOpportunities,
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
  Project,
  Priority,
} from "./types";
import {
  generateOpportunitiesFn,
  generateCalendarFn,
  generateContentAssetFn,
  generateAuditFn,
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
