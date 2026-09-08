import { CONTENT_LANGUAGES, projectContentLanguage } from "./content-languages";
import { z } from "zod";
import { newOpportunityRecord } from "./opportunities";
import type { Opportunity, Project } from "./types";

const text = (max: number) => z.string().trim().min(1).max(max);
export const opportunityBatchSchema = z
  .object({
    projectId: text(100),
    requestId: text(100),
    items: z
      .array(
        z
          .object({
            title: text(200),
            rationale: text(2000).optional(),
            contentType: z
              .enum([
                "Landing Page",
                "Service Page",
                "Blog Article",
                "Guide",
                "FAQ Page",
                "Comparison",
                "Location Page",
              ])
              .default("Blog Article"),
            priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
            language: z.enum(CONTENT_LANGUAGES).optional(),
            source: z.enum(["mcp", "competitor"]).default("mcp"),
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict();
export type OpportunityBatchInput = z.infer<typeof opportunityBatchSchema>;
export class OpportunityBatchError extends Error {
  constructor(readonly reason: "not_found" | "conflict" | "capacity") {
    super(reason);
  }
}
export async function prepareOpportunityBatch(input: OpportunityBatchInput) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    input,
    fingerprint,
    ids: input.items.map(() => crypto.randomUUID()),
    now: new Date().toISOString(),
  };
}
/** Pure mutation: complete batch or no change. IDs/hash are minted before retrying. */
export function applyOpportunityBatch(
  data: Record<string, unknown>,
  prepared: Awaited<ReturnType<typeof prepareOpportunityBatch>>,
) {
  const { input, fingerprint, ids, now } = prepared;
  const projects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
  const project = projects.find((p) => p.id === input.projectId);
  if (!project) throw new OpportunityBatchError("not_found");
  if (data.opportunities !== undefined && !Array.isArray(data.opportunities))
    throw new OpportunityBatchError("conflict");
  const opportunities = Array.isArray(data.opportunities)
    ? (data.opportunities as Opportunity[])
    : [];
  const receipts = project.mcpOpportunityBatches ?? [];
  const receipt = receipts.find((r) => r.requestId === input.requestId);
  if (receipt) {
    const ordered = receipt.ids.map((id) =>
      opportunities.find((o) => o.id === id && o.projectId === input.projectId),
    );
    if (
      receipt.fingerprint !== fingerprint ||
      ordered.length !== input.items.length ||
      ordered.some(
        (o, index) =>
          !o ||
          o.mcpBatch?.fingerprint !== fingerprint ||
          o.mcpBatch.index !== index ||
          o.mcpBatch.total !== input.items.length,
      )
    )
      throw new OpportunityBatchError("conflict");
    return {
      data,
      result: {
        opportunityIds: receipt.ids,
        projectId: input.projectId,
        deduped: true,
        status: "stored",
      },
    };
  }
  if (
    receipts.length >= 1000 ||
    opportunities.some(
      (o) => o.projectId === input.projectId && o.mcpBatch?.requestId === input.requestId,
    )
  )
    throw new OpportunityBatchError("capacity");
  if (opportunities.length + input.items.length > 1000) throw new OpportunityBatchError("capacity");
  const language = projectContentLanguage(project);
  const added = input.items.map((item, index) =>
    newOpportunityRecord(
      {
        id: ids[index],
        projectId: input.projectId,
        title: item.title,
        language: item.language ?? language,
        contentType: item.contentType,
        searchIntent: "Informational",
        targetAudience: project.targetAudience ?? "",
        businessValue: item.rationale ?? "Suggested through a connected assistant",
        recommendedCta: "",
        priority: item.priority,
        source: item.source,
        creationMode: "manual",
        mcpBatch: { requestId: input.requestId, fingerprint, index, total: input.items.length },
        createdAt: now,
      },
      now,
    ),
  );
  return {
    data: {
      ...data,
      opportunities: [...opportunities, ...added],
      projects: projects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              mcpOpportunityBatches: [
                ...receipts,
                { requestId: input.requestId, fingerprint, ids },
              ],
            }
          : p,
      ),
    },
    result: { opportunityIds: ids, projectId: input.projectId, deduped: false, status: "stored" },
  };
}
