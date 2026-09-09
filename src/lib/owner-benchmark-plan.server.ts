import { z } from "zod";
import { CONTENT_LANGUAGES, projectContentLanguage } from "./content-languages";
import type { Project, ServiceItem, Opportunity } from "./types";
const text = z.string().max(4000);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const language = z.enum(CONTENT_LANGUAGES);
const priority = z.enum(["Low", "Medium", "High"]);
export const benchmarkStages = ["scan", "article", "image"] as const;
export type BenchmarkStage = (typeof benchmarkStages)[number];
export const benchmarkSnapshotSchema = z
  .object({
    project: z
      .object({
        id,
        name: text,
        websiteUrl: z.string().url().max(4096),
        businessName: text,
        businessType: text,
        primaryLanguage: language,
        additionalLanguages: z.array(language).max(24),
        mainLocation: text,
        targetLocations: z.array(text).max(30),
        description: text,
        targetAudience: text,
        toneOfVoice: text,
        uniqueSellingPoints: text,
        brandNotes: text,
      })
      .strict(),
    services: z
      .array(
        z
          .object({
            id,
            projectId: id,
            name: text,
            kind: z.enum(["Service", "Product"]),
            description: text,
            targetAudience: text,
            locationRelevance: text,
            priority,
          })
          .strict(),
      )
      .max(30),
    opportunity: z
      .object({
        id,
        projectId: id,
        title: z.string().min(1).max(300),
        language,
        contentType: z.enum([
          "Landing Page",
          "Service Page",
          "Blog Article",
          "Guide",
          "FAQ Page",
          "Comparison",
          "Location Page",
        ]),
        searchIntent: z.enum(["Informational", "Commercial", "Transactional", "Navigational"]),
        targetAudience: text,
        businessValue: text,
        recommendedCta: text,
        priority,
        status: z.literal("captured"),
      })
      .strict(),
    imageConcept: z.string().min(3).max(500),
  })
  .strict();
export type BenchmarkSnapshot = z.infer<typeof benchmarkSnapshotSchema>;
/** Explicit allowlist: never copy publishing credentials, integrations,
 * schedules, account data or arbitrary project/opportunity extension fields. */
export function buildBenchmarkSnapshot(
  project: Project,
  services: ServiceItem[],
  opportunity: Opportunity,
  imageConcept: string,
): BenchmarkSnapshot {
  const p = project,
    o = opportunity;
  const result = benchmarkSnapshotSchema.parse({
    project: {
      id: p.id,
      name: p.name,
      websiteUrl: p.websiteUrl,
      businessName: p.businessName,
      businessType: p.businessType,
      primaryLanguage: projectContentLanguage(p),
      additionalLanguages: p.additionalLanguages,
      mainLocation: p.mainLocation,
      targetLocations: p.targetLocations,
      description: p.description,
      targetAudience: p.targetAudience,
      toneOfVoice: p.toneOfVoice,
      uniqueSellingPoints: p.uniqueSellingPoints,
      brandNotes: p.brandNotes,
    },
    services: services
      .filter((s) => s.projectId === p.id)
      .map((s) => ({
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        kind: s.kind,
        description: s.description,
        targetAudience: s.targetAudience,
        locationRelevance: s.locationRelevance,
        priority: s.priority,
      })),
    opportunity: {
      id: o.id,
      projectId: o.projectId,
      title: o.title,
      language: o.language,
      contentType: o.contentType,
      searchIntent: o.searchIntent,
      targetAudience: o.targetAudience,
      businessValue: o.businessValue,
      recommendedCta: o.recommendedCta,
      priority: o.priority,
      status: "captured",
    },
    imageConcept,
  });
  if (o.projectId !== p.id || Buffer.byteLength(JSON.stringify(result)) > 60000)
    throw new Error("invalid_benchmark_plan");
  return result;
}
export const benchmarkRunSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  project_id: id,
  opportunity_id: id,
  asset_id: z.string().uuid(),
  image_id: z.string().uuid(),
  snapshot: benchmarkSnapshotSchema,
  scan_request: z.string().uuid(),
  article_request: z.string().uuid(),
  image_request: z.string().uuid(),
  stage: z.enum(benchmarkStages),
  state: z.enum(["ready", "running", "completed", "stopped"]),
  claimed_at: z.string().nullable(),
  expires_at: z.string(),
  results: z.record(z.unknown()),
});
export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>;
export function parseBenchmarkRun(raw: unknown): BenchmarkRun {
  const run = benchmarkRunSchema.parse(raw);
  if (
    run.snapshot.project.id !== run.project_id ||
    run.snapshot.opportunity.id !== run.opportunity_id ||
    run.snapshot.opportunity.projectId !== run.project_id ||
    run.snapshot.services.some((s) => s.projectId !== run.project_id) ||
    !Number.isFinite(Date.parse(run.expires_at)) ||
    new Set([run.scan_request, run.article_request, run.image_request]).size !== 3
  )
    throw new Error("invalid_benchmark_plan");
  return run;
}
