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
  uid,
} from "./store";
import type { Opportunity, CalendarItem, ContentAsset, Language } from "./types";
import {
  generateOpportunitiesFn,
  generateCalendarFn,
  generateContentAssetFn,
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

    const result = await generateOpportunitiesFn({
      data: { project, services, existingTitles },
    });
    console.info("[ai.client] opportunities received", {
      projectId,
      count: Array.isArray(result) ? result.length : 0,
    });

    const items: Opportunity[] = (result as Array<Omit<Opportunity, "id" | "projectId" | "status">>).map((r) => ({
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

    const result = (await generateCalendarFn({
      data: { project, opportunities: opps },
    })) as Array<{
      opportunityIndex: number;
      daysFromToday: number;
      topicTitle: string;
      language: Language;
      contentType: CalendarItem["contentType"];
      searchIntent: CalendarItem["searchIntent"];
      recommendedCta: string;
    }>;
    console.info("[ai.client] calendar received", {
      projectId,
      count: Array.isArray(result) ? result.length : 0,
    });

    const today = new Date();
    const items: CalendarItem[] = result.map((r) => {
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
