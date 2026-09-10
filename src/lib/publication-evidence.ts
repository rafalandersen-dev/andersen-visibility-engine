import { gscPageUrl, gscPageInProperty } from "./gsc";
import { z } from "zod";
import { assembleContentAsset } from "./content-assembler";
import { publicationVersion } from "./publication-version";
import type { ContentAsset, Project, GscImport } from "./types";

/** No query strings, credentials or active protocols enter the evidence UI. */
export function evidencePublicUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search)
      return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}
export async function capturePublicationSnapshot(
  asset: ContentAsset,
  project: Project,
  paths: string[],
) {
  const version = await publicationVersion(asset, project, paths);
  const output = assembleContentAsset(asset, project, { activeInternalPaths: new Set(paths) });
  const snapshot = {
    version,
    assetId: asset.id,
    projectId: project.id,
    title: asset.title,
    slug: asset.publishSlug || asset.slug || "",
    actionId: asset.sourceOpportunityId || asset.opportunityId || null,
    markdown: output.markdown,
    html: output.html,
    jsonLd: output.jsonLd,
    metaTitle: asset.metaTitle ?? "",
    metaDescription: asset.metaDescription ?? "",
    knowledgeReferences: asset.knowledgeReferences ?? [],
    sourceDependencies: asset.sourceDependencies ?? [],
    sources: asset.sources ?? [],
    imageEvidence: (asset.images ?? []).map((image) => ({
      id: image.id,
      knowledgeReferences: image.knowledgeReferences ?? [],
      sourceDependencies: image.sourceDependencies ?? [],
    })),
    destination: {
      connector: project.connectorType ?? "custom",
      websiteUrl: evidencePublicUrl(project.websiteUrl),
      type: asset.publishDestinationType ?? project.defaultDestinationType ?? "blogPost",
    },
  };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 1900000)
    throw Error("publication_evidence_too_large");
  return snapshot;
}
const instant = z.string().datetime({ offset: true });
export const outcomeDataSchema = z
  .object({
    liveUrl: z.string().max(2000),
    externalId: z.string().max(500),
    publishedAt: instant.nullable(),
    verification: z.literal("connector_response_only"),
  })
  .strict();
export type OutcomeData = z.infer<typeof outcomeDataSchema>;
const sourceDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
      new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s,
  );
const metrics = z
  .object({
    clicks: z.number().finite().nonnegative(),
    impressions: z.number().finite().nonnegative(),
    ctr: z.number().finite().min(0).max(100),
    position: z.number().finite().nonnegative(),
  })
  .strict();
export const observationSchema = z
  .object({
    source: z.literal("saved_project_gsc_import"),
    declaredImportSource: z.enum(["api", "manual_csv"]),
    selectedSiteUrl: z.string().max(2000).nullable(),
    independentlyVerified: z.literal(false),
    importedAt: instant,
    windowStart: sourceDay,
    windowEnd: sourceDay,
    windowDays: z.number().int().min(1).max(366),
    relation: z.enum(["before", "later"]),
    page: z.string().max(2000),
    metrics,
    truncated: z.boolean(),
    publicationTimeBasis: z.literal("UTC_day_excluded;source_timezone_unspecified"),
  })
  .strict();
export type PublicationObservation = z.infer<typeof observationSchema>;
export const evidenceRowSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string(),
  versionHash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string(),
  startedAt: instant,
  finishedAt: instant.nullable(),
  outcome: z.enum(["started", "published", "rejected", "unknown"]),
  outcomeData: outcomeDataSchema.nullable(),
  action: z
    .object({
      id: z.string(),
      title: z.string().nullable(),
      businessValue: z.string().nullable(),
      source: z.string().nullable(),
      capturedAt: instant,
    })
    .nullable(),
  stages: z
    .array(
      z.object({
        requestId: z.string().uuid(),
        outputId: z.string().uuid(),
        stage: z.enum(["research", "content", "image"]),
        inputHash: z.string(),
        publishAt: instant,
        state: z.string(),
      }),
    )
    .max(3000),
  otherPublicationAttemptsAt: z.array(instant).max(1000),
  sourceCount: z.number().int().nonnegative(),
  knowledgeCount: z.number().int().nonnegative(),
  observations: z
    .array(
      z.object({
        importId: z.string(),
        importHash: z.string(),
        recordedAt: instant,
        data: observationSchema,
      }),
    )
    .max(20),
});
export type PublicationEvidence = z.infer<typeof evidenceRowSchema>;
export function observationFromImport(
  imp: GscImport,
  publication: Pick<PublicationEvidence, "outcome" | "outcomeData">,
  now = new Date(),
): PublicationObservation {
  if (publication.outcome !== "published" || !publication.outcomeData?.publishedAt)
    throw Error("publication_unconfirmed");
  if (imp.integrityVersion !== 2) throw Error("observation_legacy_import");
  const page = gscPageUrl(publication.outcomeData.liveUrl);
  if (!page) throw Error("publication_url_unavailable");
  const start = sourceDay.parse(imp.dateRange?.start),
    end = sourceDay.parse(imp.dateRange?.end);
  const publishedDay = new Date(publication.outcomeData.publishedAt).toISOString().slice(0, 10);
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (
    start > end ||
    end >= now.toISOString().slice(0, 10) ||
    Date.parse(imp.importedAt) < Date.parse(end) + 86400000 ||
    !Number.isFinite(Date.parse(imp.importedAt)) ||
    Date.parse(imp.importedAt) > now.getTime()
  )
    throw Error("observation_window_unavailable");
  const relation = end < publishedDay ? "before" : start > publishedDay ? "later" : null;
  if (!relation) throw Error("observation_window_overlaps_publication");
  if (imp.selectedSiteUrl && !gscPageInProperty(page, imp.selectedSiteUrl))
    throw Error("observation_property_mismatch");
  const rows = imp.rows.filter(
    (r) => r.type === "page" && !r.query && !r.date && gscPageUrl(r.page) === page,
  );
  // Absent page is unknown, not zero; duplicate rows cannot be safely summed.
  if (rows.length !== 1) throw Error("observation_page_missing_or_ambiguous");
  const { clicks, impressions, ctr, position } = rows[0];
  return observationSchema.parse({
    source: "saved_project_gsc_import",
    declaredImportSource: imp.source,
    selectedSiteUrl: imp.selectedSiteUrl ?? null,
    independentlyVerified: false,
    importedAt: imp.importedAt,
    windowStart: start,
    windowEnd: end,
    windowDays: days,
    relation,
    page,
    metrics: { clicks, impressions, ctr, position },
    truncated: !!imp.truncated,
    publicationTimeBasis: "UTC_day_excluded;source_timezone_unspecified",
  });
}
export function comparePublicationObservations(
  before: PublicationObservation,
  after: PublicationObservation,
  otherPublicationAt: string[],
) {
  if (
    before.relation !== "before" ||
    after.relation !== "later" ||
    before.page !== after.page ||
    before.windowDays !== after.windowDays ||
    before.windowEnd >= after.windowStart ||
    before.declaredImportSource !== after.declaredImportSource ||
    // CSV exports do not retain their property/search filters. Keep individual
    // observations, but do not infer comparability from matching page names.
    before.declaredImportSource !== "api" ||
    !before.selectedSiteUrl ||
    before.selectedSiteUrl !== after.selectedSiteUrl ||
    before.truncated ||
    after.truncated
  )
    return { comparable: false as const, reason: "incomparable_windows" };
  if (
    otherPublicationAt.some(
      (at) => at.slice(0, 10) >= before.windowStart && at.slice(0, 10) <= after.windowEnd,
    )
  )
    return { comparable: false as const, reason: "another_publication" };
  return {
    comparable: true as const,
    causal: false as const,
    tentative: true as const,
    clickChange: after.metrics.clicks - before.metrics.clicks,
    impressionChange: after.metrics.impressions - before.metrics.impressions,
    lowVolume: before.metrics.impressions < 100 || after.metrics.impressions < 100,
  };
}
