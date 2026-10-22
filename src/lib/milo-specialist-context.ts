import { clipUtf8 } from "./milo-specialist";
import {
  MAX_ROWS_PER_IMPORT,
  gscImportSummary,
  gscSummaryBasis,
  safeGscRow,
  sortGscRows,
} from "./gsc";
import type {
  AiVisibilityAnalysisResult,
  BrandIntelligence,
  BrandOffer,
  ContentAsset,
  GscImport,
  GscRow,
  Opportunity,
  ServiceItem,
} from "./types";

/** Structured specialist evidence bounded by its FINAL serialized size. Every field
 * is copied from an explicit allowlist (never a spread Project/workspace object,
 * which also carries connector/publishing metadata). Lists shrink from their
 * least useful end until the evidence fits, and each trimmed list reports how many
 * entries it omitted, so the JSON is always complete and parseable.
 *
 * Completeness is reported truthfully from the start: every per-field text cap and
 * per-list count cap is tallied, and the evidence's `partial` flag is true whenever
 * anything was omitted or shortened — before or during fitting — so a specialist is
 * never shown a cut rule set or list as if it were complete. */
export const BRIEF_EVIDENCE_MAX_BYTES = 10000;
export const READER_EVIDENCE_MAX_BYTES = 6000;

const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
/** Counts what the caps removed: list entries omitted and text fields shortened. */
type Tally = { omitted: number; shortened: number };
const tally = (): Tally => ({ omitted: 0, shortened: 0 });
const clipper =
  (t: Tally) =>
  (value: unknown, max: number): string => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    const clipped = clipUtf8(trimmed, max);
    if (clipped !== trimmed) t.shortened += 1;
    return clipped;
  };
const lister = (t: Tally) => {
  const clip = clipper(t);
  return (value: unknown, count: number, max: number): string[] => {
    const all = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
      : [];
    t.omitted += Math.max(0, all.length - count);
    return all.slice(0, count).map((item) => clip(item, max));
  };
};
const cut = (t: Tally) => t.omitted > 0 || t.shortened > 0;
const metric = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const rank = { high: 0, High: 0, medium: 1, Medium: 1, low: 2, Low: 2 } as Record<string, number>;
const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

/** One shrink step: a list that may lose entries from its end (never below `min`),
 * or a text field that may be halved (down to empty). Text steps exist because JSON
 * escaping of the final evidence can inflate fixed text far beyond its byte cap. */
type Trimmable =
  | { list: unknown[]; omitted: () => void; min?: number }
  | { text: Record<string, unknown>; key: string; shortened: () => void; counted?: boolean };

const textStep = (
  text: Record<string, unknown>,
  key: string,
  shortened: () => void,
): Trimmable => ({ text, key, shortened });

/** Applies one step; false when that step cannot shrink further. A shortened text
 * field is counted once, however many times it is halved. */
function shrink(step: Trimmable): boolean {
  if ("list" in step) {
    if (step.list.length <= (step.min ?? 0)) return false;
    step.list.pop();
    step.omitted();
    return true;
  }
  const value = step.text[step.key];
  if (typeof value !== "string" || !value) return false;
  const half = Math.floor(bytes(value) / 2);
  step.text[step.key] = half > 0 ? clipUtf8(value, half) : "";
  if (!step.counted) {
    step.counted = true;
    step.shortened();
  }
  return true;
}

/** Serializes `content`, applying shrink steps in priority order (the first step
 * that can still shrink goes first) until the FINAL serialized evidence, including
 * all escaping, fits `max`. `partial` starts as the caller's already-known
 * omissions/shortening and becomes true on any step. Every variable-length string
 * has a step, so only fixed keys, numbers and tiny labels remain at the end; the
 * throw is a defensive invariant, not an expected outcome. */
function fitted(
  content: Record<string, unknown>,
  steps: Trimmable[],
  max: number,
  initiallyPartial: boolean,
): { evidence: string; partial: boolean } {
  let partial = initiallyPartial;
  for (;;) {
    const evidence = JSON.stringify({ content, partial });
    if (bytes(evidence) <= max) return { evidence, partial };
    if (!steps.find(shrink)) throw new Error("Specialist evidence exceeds its processing limit.");
    partial = true;
  }
}

/** The owner's saved Brand Intelligence, limited to what specialists need to
 * describe the business truthfully. Offers are ordered high priority first. Claim
 * boundaries (forbidden claims, required caveats) get the widest caps and their own
 * completeness flag; every other cap is counted in omittedBrandEntries /
 * shortenedBrandText. */
export function brandFacts(brand: BrandIntelligence | undefined, provenance: string) {
  if (!brand || typeof brand !== "object") return null;
  const general = tally(),
    rules = tally();
  const clip = clipper(general),
    strings = lister(general),
    ruleStrings = lister(rules);
  const allOffers = [
    ...(brand.offers?.primaryOffers ?? []),
    ...(brand.offers?.secondaryOffers ?? []),
  ].filter((offer): offer is BrandOffer => !!offer && typeof offer.name === "string");
  const offers = allOffers
    .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3))
    .slice(0, 40)
    .map((offer) => ({
      name: clip(offer.name, 160),
      type: clip(offer.type, 20),
      priority: clip(offer.priority, 10),
      ...(offer.description ? { description: clip(offer.description, 300) } : {}),
      ...(offer.url ? { url: clip(offer.url, 300) } : {}),
      ...(offer.targetAudience ? { audience: clip(offer.targetAudience, 160) } : {}),
    }));
  return {
    provenance,
    ...(brand.updatedAt ? { updatedAt: clip(brand.updatedAt, 40) } : {}),
    voice: {
      tone: clip(brand.voice?.tone, 300),
      styleNotes: clip(brand.voice?.styleNotes, 500),
      wordsToUse: strings(brand.voice?.wordsToUse, 12, 60),
      wordsToAvoid: strings(brand.voice?.wordsToAvoid, 12, 60),
    },
    claims: {
      allowed: strings(brand.claims?.allowedClaims, 10, 200),
      forbidden: ruleStrings(brand.claims?.forbiddenClaims, 40, 300),
      requiredCaveats: ruleStrings(brand.claims?.requiredCaveats, 40, 300),
    },
    avoid: strings(brand.avoid, 8, 200),
    ctas: {
      primary: clip(brand.ctas?.primaryCtaLabel, 120),
      primaryUrl: clip(brand.ctas?.primaryCtaUrl, 300),
      secondary: clip(brand.ctas?.secondaryCtaLabel, 120),
      secondaryUrl: clip(brand.ctas?.secondaryCtaUrl, 300),
    },
    offers,
    omittedOffers: allOffers.length - offers.length,
    omittedBrandEntries: general.omitted + rules.omitted,
    shortenedBrandText: general.shortened + rules.shortened,
    /** False when any forbidden claim or required caveat was omitted or shortened:
     * the rules shown are then NOT the complete saved rule set. */
    claimRulesComplete: !cut(rules),
  };
}
const brandCut = (brand: BrandFacts) =>
  brand.omittedOffers > 0 ||
  brand.omittedBrandEntries > 0 ||
  brand.shortenedBrandText > 0 ||
  !brand.claimRulesComplete;
type BrandFacts = NonNullable<ReturnType<typeof brandFacts>>;

/** Brand lists in shrink order: optional style lists first, offers next; claim
 * boundaries (forbidden claims, required caveats) shrink only as a last resort. */
function brandLists(brand: BrandFacts) {
  const entry = (list: unknown[], rule = false): Trimmable => ({
    list,
    omitted: () => {
      brand.omittedBrandEntries += 1;
      if (rule) brand.claimRulesComplete = false;
    },
  });
  const offers = (min: number): Trimmable => ({
    list: brand.offers,
    omitted: () => (brand.omittedOffers += 1),
    min,
  });
  const text = (holder: Record<string, unknown>, key: string) =>
    textStep(holder, key, () => (brand.shortenedBrandText += 1));
  return {
    style: [
      entry(brand.voice.wordsToUse),
      entry(brand.voice.wordsToAvoid),
      entry(brand.avoid),
      entry(brand.claims.allowed),
    ],
    offers,
    /** Free-text brand fields, halved only after the lists above. */
    texts: [
      text(brand.voice, "styleNotes"),
      text(brand.ctas, "secondaryUrl"),
      text(brand.ctas, "primaryUrl"),
      text(brand.ctas, "secondary"),
      text(brand.ctas, "primary"),
      text(brand.voice, "tone"),
    ],
    late: [entry(brand.claims.requiredCaveats, true), entry(brand.claims.forbidden, true)],
  };
}

/** The CURRENT saved workspace draft for an opportunity, within the same project.
 * The opportunity's explicit currentContentAssetId wins whenever that draft still
 * exists. Otherwise, among drafts linked by opportunityId / sourceOpportunityId, the
 * newest valid updatedAt wins (invalid or missing timestamps sort last), then the
 * smallest id — deterministic regardless of workspace order. */
export function findOpportunityDraft(
  content: ContentAsset[],
  projectId: string,
  opportunity: Pick<Opportunity, "id" | "currentContentAssetId">,
) {
  const same = content.filter(
    (asset) => asset?.projectId === projectId && typeof asset.id === "string",
  );
  if (opportunity.currentContentAssetId) {
    const current = same.find((asset) => asset.id === opportunity.currentContentAssetId);
    if (current) return current;
  }
  return (
    same
      .filter(
        (asset) =>
          asset.opportunityId === opportunity.id || asset.sourceOpportunityId === opportunity.id,
      )
      .sort(
        (a, b) => time(b.updatedAt) - time(a.updatedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )[0] ?? null
  );
}

const closed = new Set(["published", "archived", "Discarded"]);

export type BriefInput = {
  project: {
    id: string;
    name: string;
    businessName?: string;
    description?: string;
    primaryLanguage?: string;
  };
  /** Safe team draft summaries (collaborators and owners). */
  drafts: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  omittedDrafts: number;
  /** Owner-only context; absent for collaborators (D07). */
  owner?: {
    brand?: BrandIntelligence;
    services: ServiceItem[];
    opportunities: Opportunity[];
    content: ContentAsset[];
  };
};

/** The project brief every specialist receives. Drafts shrink first, then
 * opportunities down to a floor of 12, optional brand style lists, offers down to
 * 5, services, the remaining offers and opportunities; claim boundaries last.
 * Nothing is clipped mid-structure. */
export function projectBriefEvidence(input: BriefInput): string {
  const projectId = input.project.id;
  const shortened = tally(),
    clip = clipper(shortened);
  const drafts = [...input.drafts]
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .map((draft) => ({
      id: draft.id,
      title: clip(draft.title, 200),
      status: clip(draft.status, 20),
      updatedAt: clip(draft.updatedAt, 40),
    }));
  const content: Record<string, unknown> = {
    source: "saved_project_context",
    fetchedWebsite: false,
    project: {
      id: projectId,
      name: clip(input.project.name, 200),
      businessName: clip(input.project.businessName, 200),
      description: clip(input.project.description, 1200),
      primaryLanguage: clip(input.project.primaryLanguage, 60),
    },
    drafts,
    omittedDrafts: input.omittedDrafts,
  };
  const lists: Trimmable[] = [
    {
      list: drafts,
      omitted: () => (content.omittedDrafts = (content.omittedDrafts as number) + 1),
    },
  ];
  const lateSteps: Trimmable[] = [];
  const owner = input.owner;
  if (owner) {
    const brand = brandFacts(owner.brand, "owner_saved_brand_intelligence");
    const services = owner.services
      .filter((service) => service?.projectId === projectId)
      .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3))
      .slice(0, 40)
      .map((service) => ({
        name: clip(service.name, 160),
        kind: clip(service.kind, 20),
        priority: clip(service.priority, 10),
        description: clip(service.description, 300),
      }));
    const opportunities = owner.opportunities
      .filter((o) => o?.projectId === projectId && !o.deletedAt && !o.archivedAt)
      .sort(
        (a, b) =>
          Number(closed.has(a.status)) - Number(closed.has(b.status)) ||
          (a.dueAt ? time(a.dueAt) : Infinity) - (b.dueAt ? time(b.dueAt) : Infinity) ||
          (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) ||
          time(b.updatedAt ?? b.createdAt) - time(a.updatedAt ?? a.createdAt),
      )
      .slice(0, 60)
      .map((o) => {
        const draft = findOpportunityDraft(owner.content, projectId, o);
        return {
          id: o.id,
          title: clip(o.title, 200),
          status: clip(o.status, 20),
          language: clip(o.language, 40),
          ...(o.dueAt ? { dueAt: clip(o.dueAt, 40) } : {}),
          existingDraft: draft ? { id: draft.id, status: clip(draft.status, 20) } : null,
        };
      });
    const totalOpportunities = owner.opportunities.filter(
      (o) => o?.projectId === projectId && !o.deletedAt && !o.archivedAt,
    ).length;
    const totalServices = owner.services.filter((s) => s?.projectId === projectId).length;
    content.brand = brand;
    content.services = services;
    content.omittedServices = totalServices - services.length;
    content.opportunities = opportunities;
    content.omittedOpportunities = totalOpportunities - opportunities.length;
    const brandTrim = brand ? brandLists(brand) : null;
    const opportunityList = (min: number): Trimmable => ({
      list: opportunities,
      omitted: () => (content.omittedOpportunities = (content.omittedOpportunities as number) + 1),
      min,
    });
    // After drafts: keep at least 12 open opportunities and 5 offers while optional
    // style lists, then services, give way; claim boundaries go last.
    lists.push(
      opportunityList(12),
      ...(brandTrim?.style ?? []),
      ...(brandTrim ? [brandTrim.offers(5)] : []),
      {
        list: services,
        omitted: () => (content.omittedServices = (content.omittedServices as number) + 1),
      },
      ...(brandTrim ? [brandTrim.offers(0)] : []),
      opportunityList(0),
      ...(brandTrim?.texts ?? []),
    );
    lateSteps.push(...(brandTrim?.late ?? []));
    content.note =
      "Brand facts are the owner's saved Brand Intelligence, not independently verified. existingDraft links an opportunity to its current saved workspace draft. If partial is true or brand.claimRulesComplete is false, some saved entries or rules are not shown: do not treat the lists as complete.";
  }
  content.shortenedFields = shortened.shortened;
  const projectText = content.project as Record<string, unknown>;
  const projectStep = (key: string) =>
    textStep(projectText, key, () => {
      content.shortenedFields = (content.shortenedFields as number) + 1;
    });
  // Project free text gives way after every list, before claim rules (last).
  lists.push(
    projectStep("description"),
    projectStep("businessName"),
    projectStep("name"),
    ...lateSteps,
  );
  const brand = content.brand as BrandFacts | null | undefined;
  return fitted(
    content,
    lists,
    BRIEF_EVIDENCE_MAX_BYTES,
    input.omittedDrafts > 0 ||
      ((content.omittedServices as number | undefined) ?? 0) > 0 ||
      ((content.omittedOpportunities as number | undefined) ?? 0) > 0 ||
      cut(shortened) ||
      (!!brand && brandCut(brand)),
  ).evidence;
}

/** Owner knowledge result; any resolved brand context is labelled by provenance. */
export function knowledgeEvidence(knowledge: {
  context: string;
  references: unknown;
  conflicts: unknown;
  omitted: unknown;
  sourceDependencies: unknown;
  brandIntelligence?: BrandIntelligence;
}) {
  const full = JSON.stringify({
    context: knowledge.context,
    references: knowledge.references,
    conflicts: knowledge.conflicts,
    omitted: knowledge.omitted,
    sourceDependencies: knowledge.sourceDependencies,
  });
  const text = clipUtf8(full, 5000);
  const content: Record<string, unknown> = { records: text, recordsPartial: text !== full };
  const brand = brandFacts(knowledge.brandIntelligence, "accepted_knowledge_brand_records");
  // The records text is already JSON; escaping it again can double its size, so it
  // is halved by the final-byte loop like any other free text (and flagged).
  const records = textStep(content, "records", () => (content.recordsPartial = true));
  const lists: Trimmable[] = [];
  if (brand) {
    content.brand = brand;
    const brandTrim = brandLists(brand);
    lists.push(
      ...brandTrim.style,
      brandTrim.offers(0),
      records,
      ...brandTrim.texts,
      ...brandTrim.late,
    );
  } else lists.push(records);
  return fitted(
    content,
    lists,
    BRIEF_EVIDENCE_MAX_BYTES,
    text !== full || (!!brand && brandCut(brand)),
  ).evidence;
}

const gscRow = (clip: (value: unknown, max: number) => string) => (row: GscRow) => ({
  type: row.type,
  ...(row.query ? { query: clip(row.query, 160) } : {}),
  ...(row.page ? { page: clip(row.path || row.page, 200) } : {}),
  ...(row.date ? { date: clip(row.date, 20) } : {}),
  clicks: row.clicks,
  impressions: row.impressions,
  ctr: row.ctr,
  position: row.position,
});

/** Saved Search Console imports for this project only, newest first. Uses the same
 * integrity rules as Analytics (gsc.ts): totals are recomputed by gscImportSummary,
 * never the cached summary; rows and metrics are exposed only for integrityVersion 2
 * imports within the row cap, normalized by safeGscRow. A legacy import exposes no
 * numeric basis at all — its stored metrics and row count are withheld, not
 * reported as measurements. */
export function searchConsoleEvidence(imports: unknown): string {
  const shortened = tally(),
    clip = clipper(shortened);
  const all = (Array.isArray(imports) ? (imports as GscImport[]) : [])
    .filter((item) => item && typeof item.id === "string" && Array.isArray(item.rows))
    .sort((a, b) => time(b.importedAt) - time(a.importedAt));
  const included = all.slice(0, 3).map((item) => {
    const basis = gscSummaryBasis(item);
    const trusted = item.integrityVersion === 2 && item.rows.length <= MAX_ROWS_PER_IMPORT;
    const valid = trusted ? item.rows.map(safeGscRow).sort(sortGscRows) : [];
    const rows = valid.slice(0, 12).map(gscRow(clip));
    const summary = trusted ? gscImportSummary(item) : null;
    return {
      id: clip(item.id, 64),
      importedAt: clip(item.importedAt, 40),
      source: item.source === "api" ? "api_sync" : "manual_csv",
      importType: clip(item.importType, 20),
      dateRange: {
        start: clip(item.dateRange?.start, 20),
        end: clip(item.dateRange?.end, 20),
        label: clip(item.dateRange?.label, 60),
      },
      ...(item.selectedSiteUrl ? { property: clip(item.selectedSiteUrl, 200) } : {}),
      sourceTruncated: item.truncated === true,
      basis,
      ...(trusted
        ? {}
        : {
            numericBasisUnavailable:
              basis === "legacy"
                ? "Legacy import: its numeric basis cannot be recovered reliably, so no totals or rows are given."
                : "Import exceeds the supported row cap; no totals or rows are given.",
          }),
      summary: {
        clicks: summary?.totalClicks ?? null,
        impressions: summary?.totalImpressions ?? null,
        averageCtr: summary?.averageCtr ?? null,
        averagePosition: summary?.averagePosition ?? null,
        savedRows: trusted ? item.rows.length : null,
      },
      topRowsByClicks: rows,
      omittedRows: valid.length - rows.length,
    };
  });
  const content: Record<string, unknown> = {
    source: "saved_search_console_imports",
    fetched: false,
    imports: included,
    omittedImports: all.length - included.length,
    limitations:
      "Past exports or syncs as saved; null means unknown or not reported, never zero. Legacy imports have no usable numeric basis. No live Search Console request was made.",
  };
  content.shortenedFields = shortened.shortened;
  const lists: Trimmable[] = [
    ...included.map((item) => ({
      list: item.topRowsByClicks as unknown[],
      omitted: () => (item.omittedRows += 1),
    })),
    {
      list: included as unknown[],
      omitted: () => (content.omittedImports = (content.omittedImports as number) + 1),
    },
  ];
  return fitted(
    content,
    lists,
    READER_EVIDENCE_MAX_BYTES,
    all.length > included.length || included.some((item) => item.omittedRows > 0) || cut(shortened),
  ).evidence;
}

/** The latest saved AI readiness advice for this project, labelled as estimates. */
export function aiAdviceEvidence(analyses: unknown, projectId: string): string {
  const latest = (Array.isArray(analyses) ? (analyses as AiVisibilityAnalysisResult[]) : [])
    .filter((item) => item?.projectId === projectId && typeof item.id === "string")
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  if (!latest)
    return JSON.stringify({
      content: { advice: null, note: "No saved AI readiness advice. This is missing evidence." },
      partial: false,
    });
  const capped = tally(),
    clip = clipper(capped),
    strings = lister(capped);
  const gaps = (Array.isArray(latest.visibilityGaps) ? latest.visibilityGaps : [])
    .slice(0, 10)
    .map((gap) => ({
      title: clip(gap?.title, 200),
      category: clip(gap?.category, 40),
      priority: clip(gap?.priority, 10),
      recommendation: clip(gap?.recommendation, 300),
    }));
  const content: Record<string, unknown> = {
    source: "saved_ai_readiness_advice",
    id: clip(latest.id, 64),
    createdAt: clip(latest.createdAt, 40),
    estimatedScores: {
      overall: metric(latest.overallAiVisibilityScore),
      promptCoverage: metric(latest.promptCoverageScore),
      answerReadiness: metric(latest.answerReadinessScore),
      localReadiness: metric(latest.localAiReadinessScore),
      trustCitation: metric(latest.trustCitationScore),
      contentGap: metric(latest.contentGapScore),
      authorityGap: metric(latest.authorityGapScore),
    },
    summary: clip(latest.summary, 1200),
    topActions: strings(latest.topAiVisibilityActions, 8, 300),
    gaps,
    omittedGaps: Math.max(
      0,
      (Array.isArray(latest.visibilityGaps) ? latest.visibilityGaps.length : 0) - gaps.length,
    ),
    limitations:
      "Historical model-estimated readiness advice. Not observed AI answers, citations or visibility.",
  };
  const cutCounts = { entries: capped.omitted, textFields: capped.shortened };
  content.omittedOrShortened = cutCounts;
  return fitted(
    content,
    [
      {
        list: gaps,
        omitted: () => (content.omittedGaps = (content.omittedGaps as number) + 1),
      },
      {
        list: content.topActions as string[],
        omitted: () => (cutCounts.entries += 1),
      },
      textStep(content, "summary", () => (cutCounts.textFields += 1)),
    ],
    READER_EVIDENCE_MAX_BYTES,
    (content.omittedGaps as number) > 0 || cut(capped),
  ).evidence;
}
