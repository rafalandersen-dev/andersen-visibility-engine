import { z } from "zod";

export const evidenceProjectId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
// No network resolution or fetching. Public-looking DNS names only, never IPs or credentials.
export function evidenceUrl(value: string): string | null {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(h) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|home|lan)$/.test(h)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
const url = z
  .string()
  .max(2048)
  .refine((v) => evidenceUrl(v) !== null, "Use a public HTTP(S) URL without credentials or ports");
export const evidencePromptSchema = z
  .object({
    prompt: text(2000),
    intent: text(100),
    source: z.enum(["manual", "gsc", "service", "readiness"]),
    market: text(80),
    language: text(40),
    brand: text(120),
    websiteUrl: url,
    competitorUrls: z.array(url).max(10),
    active: z.boolean(),
  })
  .strict();
export const evidencePromptRowSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    createdAt: z.string(),
    data: evidencePromptSchema,
  })
  .strict();
export type EvidencePrompt = z.infer<typeof evidencePromptRowSchema>;
export const answerEvidenceSchema = z
  .object({
    promptId: z.string().uuid(),
    promptRevision: z.number().int().min(1).max(1000),
    surface: text(100),
    mode: z.enum(["consumer-web", "api", "search"]),
    method: text(120),
    modelVersion: text(120).nullable(),
    capturedAt: z.string().datetime({ offset: true }),
    status: z.enum(["complete", "failed", "truncated"]),
    rawAnswer: z.string().max(50000),
    citations: z.array(url).max(100),
    citationsComplete: z.boolean(),
    failure: z.string().trim().max(2000).nullable(),
    reportedCostUsd: z.number().finite().min(0).max(10000).nullable(),
    sourceUrl: url.nullable(),
    supersedesId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const capturedAt = Date.parse(v.capturedAt);
    if (
      !Number.isFinite(capturedAt) ||
      capturedAt > Date.now() ||
      capturedAt < Date.UTC(2020, 0, 1)
    )
      ctx.addIssue({
        code: "custom",
        path: ["capturedAt"],
        message: "Use an actual capture date from 2020 through now",
      });
    if (v.status === "complete" && !v.rawAnswer.trim())
      ctx.addIssue({
        code: "custom",
        path: ["rawAnswer"],
        message: "A complete answer cannot be empty",
      });
    if (v.status !== "complete" && !v.failure?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Describe the failure or truncation",
      });
    if (v.status === "complete" && v.failure !== null)
      ctx.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Complete answers must have null failure",
      });
  });
export type AnswerEvidence = z.infer<typeof answerEvidenceSchema>;
function belongs(host: string, domain: string) {
  return host === domain || host.endsWith("." + domain);
}
export function analyzeAnswer(input: AnswerEvidence, prompt: EvidencePrompt) {
  const own = new URL(prompt.data.websiteUrl).hostname.replace(/^www\./, "");
  const competitors = prompt.data.competitorUrls.map((v) =>
    new URL(v).hostname.replace(/^www\./, ""),
  );
  // Only supplied citation metadata is classified. Prose URLs are not assumed to be citations.
  const citations = [...new Set(input.citations.map((v) => evidenceUrl(v)!))].map((url) => {
    const host = new URL(url).hostname;
    return {
      url,
      kind: belongs(host, own)
        ? ("own" as const)
        : competitors.some((c) => belongs(host, c))
          ? ("competitor" as const)
          : ("third-party" as const),
    };
  });
  const needle = prompt.data.brand
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mention =
    input.status === "complete"
      ? new RegExp(`(?<![\\p{L}\\p{N}])${needle}(?![\\p{L}\\p{N}])`, "u").test(
          input.rawAnswer.normalize("NFKC").toLocaleLowerCase("und"),
        )
      : null;
  return {
    algorithm: "literal-mention-supplied-citations-v1" as const,
    verified: false as const,
    mention,
    ownCitation:
      input.status === "complete" && input.citationsComplete
        ? citations.some((c) => c.kind === "own")
        : null,
    citations,
    cohort: JSON.stringify([
      prompt.id,
      prompt.revision,
      prompt.data.market,
      prompt.data.language,
      input.surface,
      input.mode,
      input.method,
      input.modelVersion,
    ]),
  };
}
export const evidenceAnalysisSchema = z.object({
  algorithm: z.literal("literal-mention-supplied-citations-v1"),
  verified: z.literal(false),
  mention: z.boolean().nullable(),
  ownCitation: z.boolean().nullable(),
  citations: z
    .array(z.object({ url, kind: z.enum(["own", "competitor", "third-party"]) }))
    .max(100),
  cohort: z.string().max(1000),
});
export const evidenceRowSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string(),
    hash: z.string(),
    input: answerEvidenceSchema,
    prompt: evidencePromptRowSchema,
    analysis: evidenceAnalysisSchema,
  })
  .strict();
export type EvidenceRow = z.infer<typeof evidenceRowSchema>;
export function evidenceCohorts(rows: EvidenceRow[], start: string, end: string) {
  const after = Date.parse(start),
    before = Date.parse(end);
  if (!Number.isFinite(after) || !Number.isFinite(before) || after >= before)
    throw Error("invalid_evidence_window");
  const superseded = new Set(rows.map((r) => r.input.supersedesId).filter(Boolean));
  const groups = new Map<
    string,
    {
      key: string;
      sample: EvidenceRow;
      total: number;
      mentionSamples: number;
      mentions: number;
      citationSamples: number;
      ownCitations: number;
    }
  >();
  for (const r of rows) {
    const at = Date.parse(r.input.capturedAt);
    if (superseded.has(r.id) || at < after || at >= before) continue;
    // Unknown is not evidence of a shared model version. Keep each such
    // observation independent even when all other declared dimensions match.
    const key =
      r.input.modelVersion === null ? JSON.stringify([r.analysis.cohort, r.id]) : r.analysis.cohort;
    const g = groups.get(key) ?? {
      key,
      sample: r,
      total: 0,
      mentionSamples: 0,
      mentions: 0,
      citationSamples: 0,
      ownCitations: 0,
    };
    g.total++;
    if (r.analysis.mention !== null) {
      g.mentionSamples++;
      if (r.analysis.mention) g.mentions++;
    }
    if (r.analysis.ownCitation !== null) {
      g.citationSamples++;
      if (r.analysis.ownCitation) g.ownCitations++;
    }
    groups.set(key, g);
  }
  return [...groups.values()];
}
