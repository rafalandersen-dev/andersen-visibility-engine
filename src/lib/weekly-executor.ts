import { z } from "zod";
import { knowledgeReferencesSchema } from "./project-knowledge";
import { outputDependencySchema } from "./source-refresh";
import type { Opportunity } from "./types";
export async function weeklyInputHash(value: unknown): Promise<string> {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, canonical(x)]),
      );
    return v;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  if (bytes.byteLength > 64000) throw new Error("weekly_input_too_large");
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** Whitelist the brief fields: provider responses cannot add execution authority. */
export const weeklyOpportunitySchema = z.object({
  id: identity,
  projectId: identity,
  title: z.string().min(1).max(300),
  language: z.string().max(100).optional(),
  contentType: z.string().max(100),
  searchIntent: z.string().max(100),
  targetAudience: z.string().max(1000),
  businessValue: z.string().max(1000),
  recommendedCta: z.string().max(1000),
  priority: z.string().max(30),
});
export const weeklyResearchSchema = z
  .object({
    opportunity: weeklyOpportunitySchema,
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    origin: z.enum(["owner-plan", "generated-hypothesis"]),
    knowledgeReferences: knowledgeReferencesSchema,
    sourceDependencies: z.array(outputDependencySchema).max(100),
    knowledgeHash: z.string().regex(/^[a-f0-9]{64}$/),
    // Scoped version identities only. The actual factual context stays in P1/P2.
    provenance: z
      .array(
        z.object({
          sourceId: z.string().uuid(),
          sourceRevision: z.number().int().positive(),
          lastAttempt: z.string().max(100),
        }),
      )
      .max(10),
  })
  .strict();
export const weeklyReceiptSchema = z.object({ receiptId: z.string().uuid() }).strict();
export function pinnedOpportunity(value: unknown): Opportunity {
  return { ...weeklyOpportunitySchema.parse(value), status: "captured" } as Opportunity;
}
export const weeklySummarySchema = z
  .object({
    slots: z.number().int().min(0).max(7),
    drafted: z.number().int().min(0).max(7),
    queued: z.number().int().min(0).max(7),
    uncovered: z.number().int().min(0).max(7),
    action: z.enum([
      "waiting",
      "research-retained",
      "content-retained",
      "image-retained",
      "review-required",
      "queued",
      "recovery-required",
      "capacity-required",
      "context-changed",
    ]),
  })
  .strict();
