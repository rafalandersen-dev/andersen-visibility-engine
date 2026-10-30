import { z } from "zod";
import { canonicalUuid } from "./pg-uuid";

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
// `captureContext` (below) carries optional CI-2 manual-capture provenance opaquely on the answer
// record. The citation-protocol layer owns its exact shape (captureContextSchema) and re-parses it
// strictly before use; this module never interprets it, and importing that schema here would be
// circular (citation-panel.ts already imports this module). It must nonetheless be a concrete,
// JSON-serializable type — never `unknown`, which the TanStack Start server-function return
// serializer cannot represent (readAnswerEvidenceFn feeds AnswerEvidencePanel). It is therefore a
// bounded, finite-depth JSON object: scalars, arrays of scalars, and one level of nested
// objects/arrays. Every captureContextSchema value round-trips through it (its longest strings and
// largest arrays are far smaller than these bounds and its nesting is shallower), while the type
// stays finite so the serialized shape is well-defined.
const captureContextScalar = z.union([z.string().max(4096), z.number(), z.boolean(), z.null()]);
const captureContextLeaf = z.union([captureContextScalar, z.array(captureContextScalar).max(256)]);
const captureContextValue = z.record(
  z.union([captureContextLeaf, z.array(captureContextLeaf).max(256), z.record(captureContextLeaf)]),
);
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
    // Optional CI-2 manual-capture provenance (product/CITATION_INTELLIGENCE_SPEC.md §5.2, §8).
    // Left opaque here so the existing read path tolerates capture-bound records without this
    // module depending on the citation layer; the citation-protocol layer validates its exact
    // shape (captureContextSchema) and, crucially, resolves it against the stored, owner-locked
    // panel and any approved brand run. Legacy intake never carries it (see importAnswerEvidence);
    // a capture context is authorized only through the panel-aware save path, so its mere presence
    // in a document is never authority. Being inside `input` keeps it in the dedup hash, so genuine
    // captures with identical answer text but different slot/time provenance stay distinct. Its type
    // is a bounded, finite-depth serializable JSON object (captureContextValue above), not `unknown`,
    // so the answer read path stays serializable for the TanStack server functions.
    captureContext: captureContextValue.optional(),
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
/** A declared domain as compared everywhere in this module: lowercase hostname without one leading `www.`. */
export function declaredHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}
/**
 * Mutually exclusive quality of one saved answer for citation coverage. Only a complete answer whose supplied
 * citation list is declared complete is eligible (an empty complete list is a measured zero). The others stay
 * visible as exclusions, never as zeros.
 */
export type EvidenceQuality = "eligible" | "incompleteCitations" | "failed" | "truncated";
export const EVIDENCE_QUALITIES: readonly EvidenceQuality[] = [
  "eligible",
  "incompleteCitations",
  "failed",
  "truncated",
];
export function evidenceQuality(input: AnswerEvidence): EvidenceQuality {
  if (input.status === "failed") return "failed";
  if (input.status === "truncated") return "truncated";
  return input.citationsComplete ? "eligible" : "incompleteCitations";
}
/** One declared domain of a cohort. `presentAnswerIds` ⊆ the cohort's `eligibleAnswerIds` (its x of n). */
export type DomainCoverage = {
  host: string;
  role: "own" | "competitor";
  /** Own row only: a declared competitor had exactly the own host, so the two cannot be told apart. */
  alsoCompetitor: boolean;
  /** Other declared hosts that are a parent or subdomain of this one: one citation can count for both. */
  overlaps: string[];
  presentAnswerIds: string[];
};
/** The declared rows of a prompt snapshot, in declared order: own first, identical hosts collapsed. */
export function declaredDomains(
  prompt: EvidencePrompt,
): Omit<DomainCoverage, "presentAnswerIds">[] {
  const own = declaredHost(prompt.data.websiteUrl);
  const competitors = [...new Set(prompt.data.competitorUrls.map(declaredHost))];
  const rows = [
    { host: own, role: "own" as const, alsoCompetitor: competitors.includes(own) },
    ...competitors
      .filter((host) => host !== own)
      .map((host) => ({ host, role: "competitor" as const, alsoCompetitor: false })),
  ];
  return rows.map((r) => ({
    ...r,
    overlaps: rows
      .filter((o) => o.host !== r.host && (belongs(o.host, r.host) || belongs(r.host, o.host)))
      .map((o) => o.host),
  }));
}
/** Hosts of the SUPPLIED citation metadata only; prose URLs and brand mentions are never citation evidence. */
function citedHosts(input: AnswerEvidence): string[] {
  return input.citations.flatMap((v) => {
    const u = evidenceUrl(v);
    return u ? [new URL(u).hostname.toLowerCase()] : [];
  });
}
/** Ids of every answer superseded by a loaded correction, compared as canonical UUIDs (any stored spelling). */
export function supersededAnswerIds(rows: readonly EvidenceRow[]): Set<string> {
  return new Set(
    rows.flatMap((r) => (r.input.supersedesId ? [canonicalUuid(r.input.supersedesId)] : [])),
  );
}
export type EvidenceCohort = {
  key: string;
  sample: EvidenceRow;
  total: number;
  mentionSamples: number;
  mentions: number;
  citationSamples: number;
  ownCitations: number;
  /** Original (immutable) ids of every current answer of this cohort in the window. */
  answerIds: string[];
  /** The same answers split by mutually exclusive quality; the lists add up to `answerIds`. */
  quality: Record<EvidenceQuality, string[]>;
  /** The shared denominator (n) of every domain row: `quality.eligible`. */
  eligibleAnswerIds: string[];
  domains: DomainCoverage[];
};
export function evidenceCohorts(rows: EvidenceRow[], start: string, end: string): EvidenceCohort[] {
  const after = Date.parse(start),
    before = Date.parse(end);
  if (!Number.isFinite(after) || !Number.isFinite(before) || after >= before)
    throw Error("invalid_evidence_window");
  // Every loaded correction removes its predecessor BEFORE the window applies, so a correction captured
  // outside the window still retires the original inside it.
  const superseded = supersededAnswerIds(rows);
  const groups = new Map<string, EvidenceCohort>();
  for (const r of rows) {
    const at = Date.parse(r.input.capturedAt);
    if (superseded.has(canonicalUuid(r.id)) || at < after || at >= before) continue;
    // Declared comparable dimensions of the immutable prompt snapshot and capture (half-open UTC window).
    const cohort = JSON.stringify([
      canonicalUuid(r.prompt.id),
      r.prompt.revision,
      r.prompt.data.market,
      r.prompt.data.language,
      r.input.surface,
      r.input.mode,
      r.input.method,
      r.input.modelVersion,
    ]);
    // Unknown is not evidence of a shared model version. Keep each such
    // observation independent even when all other declared dimensions match.
    const key =
      r.input.modelVersion === null ? JSON.stringify([cohort, canonicalUuid(r.id)]) : cohort;
    const g = groups.get(key) ?? {
      key,
      sample: r,
      total: 0,
      mentionSamples: 0,
      mentions: 0,
      citationSamples: 0,
      ownCitations: 0,
      answerIds: [],
      quality: { eligible: [], incompleteCitations: [], failed: [], truncated: [] },
      eligibleAnswerIds: [],
      domains: declaredDomains(r.prompt).map((d) => ({ ...d, presentAnswerIds: [] })),
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
    g.answerIds.push(r.id);
    const quality = evidenceQuality(r.input);
    g.quality[quality].push(r.id);
    if (quality === "eligible") {
      g.eligibleAnswerIds.push(r.id);
      // Each domain counts an answer once, however many of its citations fall inside that domain.
      const hosts = citedHosts(r.input);
      for (const d of g.domains)
        if (hosts.some((h) => belongs(h, d.host))) d.presentAnswerIds.push(r.id);
    }
    groups.set(key, g);
  }
  return [...groups.values()];
}
/** A drill-down selection: one domain's citing answers, or one quality list, of one cohort. */
export type EvidenceFocus =
  { key: string; kind: "present"; host: string } | { key: string; kind: EvidenceQuality };
/**
 * The exact answer ids behind a selection, recomputed from the CURRENT cohorts. A selection whose cohort or
 * domain is no longer in the result (another window, another scope) resolves to null, never to stale ids.
 */
export function evidenceFocusIds(
  cohorts: readonly EvidenceCohort[],
  focus: EvidenceFocus,
): string[] | null {
  const g = cohorts.find((c) => c.key === focus.key);
  if (!g) return null;
  if (focus.kind !== "present") return g.quality[focus.kind];
  return g.domains.find((d) => d.host === focus.host)?.presentAnswerIds ?? null;
}
