import { z } from "zod";
/**
 * Citation Intelligence v1, CI-2 record design (product/CITATION_INTELLIGENCE_SPEC.md §4, §7).
 *
 * Human-reviewed findings in two equal-priority families, five-state source support that
 * is separate from factual truth, dated owner-confirmed business facts, and the receipt
 * that turns a change into a verified improvement. Human review is the v1 classifier; no
 * model, API or automated grading is involved here.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const instant = z.string().datetime({ offset: true });
const uuid = z.string().uuid();
export const GAP_FAMILIES = ["citation_source", "recommendation_accuracy"] as const;
export const SUPPORT_STATES = [
  "supports",
  "partly_supports",
  "contradicts",
  "unclear",
  "not_checked",
] as const;
export const RECOMMENDATION_STATES = [
  "recommended",
  "mentioned_only",
  "explicitly_not_recommended",
  "not_present",
  "unclear",
] as const;
export const ACCURACY_STATES = [
  "accurate_at_capture",
  "incorrect_at_capture",
  "outdated_now",
  "unclear",
  "not_checked",
] as const;
const reviewer = z.object({ reviewer: uuid, reviewedAt: instant }).strict();
/** Attribution is not support (§4.2). Assessed states carry the inspected passage and its date. */
export const sourceSupportSchema = z
  .object({
    claimSpan: text(4000),
    citedUrl: text(2048),
    answerCapturedAt: instant,
    status: z.enum(SUPPORT_STATES),
    sourcePassage: z.string().trim().max(4000).nullable(),
    sourceCapturedAt: instant.nullable(),
    reason: z.string().trim().max(500).nullable(),
    review: reviewer.nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.status === "not_checked") {
      if (s.sourcePassage !== null)
        ctx.addIssue({
          code: "custom",
          path: ["sourcePassage"],
          message: "Not checked carries no passage",
        });
      return;
    }
    if (!s.sourcePassage || !s.sourceCapturedAt || !s.review)
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message:
          "An assessed support state needs the source passage, its capture date and the reviewer",
      });
  });
/** Whether the passage was captured after the answer, in which case it may reflect a changed page. */
export function passageAfterAnswer(support: z.infer<typeof sourceSupportSchema>) {
  return (
    support.sourceCapturedAt !== null &&
    Date.parse(support.sourceCapturedAt) > Date.parse(support.answerCapturedAt)
  );
}
export const businessFactSchema = z
  .object({
    factId: uuid,
    kind: z.enum([
      "entity",
      "location",
      "service",
      "duration",
      "price",
      "offer",
      "hours",
      "booking",
      "cancellation",
      "credential",
    ]),
    value: text(1000),
    confirmedBy: uuid,
    confirmedAt: instant,
    validFrom: instant,
    validUntil: instant.nullable(),
  })
  .strict();
export type BusinessFact = z.infer<typeof businessFactSchema>;
/** The owner-confirmed fact of a kind that was valid at a given instant, or null. */
export function factAt(facts: BusinessFact[], kind: BusinessFact["kind"], at: string) {
  const t = Date.parse(at);
  return (
    facts.find(
      (f) =>
        f.kind === kind &&
        Date.parse(f.validFrom) <= t &&
        (f.validUntil === null || Date.parse(f.validUntil) > t),
    ) ?? null
  );
}
export const accuracySchema = z
  .object({
    claimSpan: text(4000),
    factKind: businessFactSchema.shape.kind,
    status: z.enum(ACCURACY_STATES),
    /** The dated fact the claim was compared with; required for assessed states. */
    factId: uuid.nullable(),
    review: reviewer.nullable(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (["not_checked", "unclear"].includes(a.status)) return;
    if (!a.factId || !a.review)
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "An assessed accuracy state needs a dated fact and a reviewer",
      });
  });
export const recommendationSchema = z
  .object({
    status: z.enum(RECOMMENDATION_STATES),
    passage: z.string().trim().max(4000).nullable(),
    target: text(300).nullable(),
    /** Whether the business actually fits the question; unknown is allowed. */
    suitability: z.enum(["fits", "does_not_fit", "unknown"]),
    review: reviewer,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      ["recommended", "mentioned_only", "explicitly_not_recommended"].includes(r.status) &&
      !r.passage
    )
      ctx.addIssue({
        code: "custom",
        path: ["passage"],
        message: "Record the exact passage for an observed state",
      });
  });
export const findingSchema = z
  .object({
    findingId: uuid,
    family: z.enum(GAP_FAMILIES),
    evidence: z
      .array(z.object({ kind: z.enum(["answer", "native", "source"]), id: text(200) }).strict())
      .min(1)
      .max(20),
    /** Human confirmation that the answer refers to this business; ambiguity stays visible. */
    entityMatch: z.enum(["confirmed", "ambiguous", "not_this_business"]),
    /** Completeness facts copied from the reviewed capture. */
    capture: z.object({ answerComplete: z.boolean(), citationsComplete: z.boolean() }).strict(),
    observation: text(4000),
    hypothesis: z.string().trim().max(2000).nullable(),
    competitorCited: z.boolean().nullable(),
    ownCited: z.boolean().nullable(),
    recommendation: recommendationSchema.nullable(),
    support: z.array(sourceSupportSchema).max(20),
    accuracy: z.array(accuracySchema).max(20),
    /** Priority inputs rather than a family default (§4.4). */
    priority: z
      .object({
        harm: z.enum(["low", "medium", "high"]),
        relevance: z.enum(["low", "medium", "high"]),
        fixability: z.enum(["low", "medium", "high"]),
      })
      .strict(),
    decision: z.enum(["accepted", "dismissed", "needs_second_review"]),
    review: reviewer,
    secondReview: reviewer.nullable(),
    linkedTaskId: uuid.nullable(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.decision === "accepted" && f.entityMatch !== "confirmed")
      ctx.addIssue({
        code: "custom",
        path: ["entityMatch"],
        message: "Only a confirmed entity can be accepted",
      });
    if (f.family === "recommendation_accuracy" && !f.recommendation && !f.accuracy.length)
      ctx.addIssue({
        code: "custom",
        path: ["family"],
        message:
          "A recommendation/accuracy finding records a recommendation state or an accuracy assessment",
      });
    if (f.recommendation?.status === "not_present" && !f.capture.answerComplete)
      ctx.addIssue({
        code: "custom",
        path: ["recommendation"],
        message: "not_present needs a complete answer",
      });
    if (f.ownCited === false && !(f.capture.answerComplete && f.capture.citationsComplete))
      ctx.addIssue({
        code: "custom",
        path: ["ownCited"],
        message: "Own-citation absence needs a complete answer and a complete citation list",
      });
  });
export type Finding = z.infer<typeof findingSchema>;
/** A competitor-only citation gap is a confident negative comparison (§4.3). */
export function isCompetitorOnlyCitationGap(f: Finding) {
  return (
    f.family === "citation_source" &&
    f.entityMatch === "confirmed" &&
    f.capture.answerComplete &&
    f.capture.citationsComplete &&
    f.competitorCited === true &&
    f.ownCited === false
  );
}
/** Priority from harm, relevance and fixability only; both families share this scale. */
export function findingPriority(f: Finding): "low" | "medium" | "high" {
  const score = (["harm", "relevance", "fixability"] as const)
    .map((k) => ({ low: 0, medium: 1, high: 2 })[f.priority[k]])
    .reduce((a, b) => a + b, 0);
  return score >= 5 ? "high" : score >= 3 ? "medium" : "low";
}
export const improvementSchema = z
  .object({
    improvementId: uuid,
    findingIds: z.array(uuid).min(1).max(20),
    taskId: uuid,
    /** The approved change and its version-bound approval under existing permissions. */
    change: z
      .object({
        description: text(2000),
        approvedVersion: text(200),
        approvedBy: uuid,
        approvedAt: instant,
      })
      .strict(),
    destination: z
      .object({ kind: z.enum(["public_url", "listing", "configuration"]), reference: text(2048) })
      .strict(),
    baselineCaptureIds: z.array(uuid).max(50),
    /** Live verification at the destination; a draft or request acknowledgement is not one. */
    verification: z
      .object({
        method: z.enum(["publication_receipt", "owner_inspection", "index_inspection"]),
        receipt: text(500),
        verifiedAt: instant,
        reviewer: uuid,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((imp, ctx) => {
    // A verified improvement is a before/after claim: it can only be verified against the
    // baseline captures it improves on. An unverified draft may still be recorded without
    // baseline captures while its evidence is being assembled.
    if (imp.verification && imp.baselineCaptureIds.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["baselineCaptureIds"],
        message: "A verified improvement needs the baseline captures it improves on",
      });
  });
export type Improvement = z.infer<typeof improvementSchema>;
export function isVerifiedImprovement(i: Improvement) {
  return (
    i.verification !== null &&
    // No baseline captures means no before/after evidence, so the change is not yet a verified
    // improvement even if a receipt exists (defence in depth alongside the schema refinement).
    i.baselineCaptureIds.length > 0 &&
    Date.parse(i.verification.verifiedAt) >= Date.parse(i.change.approvedAt)
  );
}
/**
 * Canonical identity of an improvement's destination, so two records that point at the *same*
 * change are keyed identically regardless of cosmetic reference differences. A `public_url` is
 * reduced to standard URL resource identity: the scheme and host are case-folded and the default
 * port is dropped (both done by the URL parser), and the fragment — which never reaches the
 * server — is discarded, while the path and query stay exact so a meaningful path/query
 * difference is preserved (spec §8, "do not silently collapse meaningful query/path
 * differences"). A reference that is not a valid http(s) URL fails closed: it throws rather than
 * silently colliding with, or masquerading as distinct from, another destination. Other
 * destination kinds (`listing`, `configuration`) are opaque contract identifiers compared exactly,
 * never URL-folded.
 */
function canonicalDestinationReference(destination: Improvement["destination"]): string {
  if (destination.kind !== "public_url") return destination.reference;
  let url: URL;
  try {
    url = new URL(destination.reference);
  } catch {
    throw new Error(
      `substantiveChangeKeys: a public_url destination is not a valid URL: ${destination.reference}`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error(
      `substantiveChangeKeys: a public_url destination must be an http(s) URL: ${destination.reference}`,
    );
  // host is the already-lower-cased hostname plus a non-default port only; pathname and search
  // keep their exact (case-sensitive) text; the fragment is deliberately excluded.
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
}
/**
 * Domain keys that identify the *substantive* change an improvement records, independent of its
 * surrogate `improvementId`. Two records are the same change when they share the task, or share
 * the destination together with the approved version. The destination is compared by its
 * canonical identity (URL identity for a `public_url`, exact reference otherwise), so a clone with
 * a fresh UUID — or one that only re-cases the host, adds the default port or a fragment — cannot
 * pose as a second change. An invalid public URL fails closed via `canonicalDestinationReference`.
 */
export function substantiveChangeKeys(i: Improvement): { taskKey: string; destinationKey: string } {
  return {
    taskKey: `task:${i.taskId}`,
    destinationKey: `dest:${JSON.stringify([
      i.destination.kind,
      canonicalDestinationReference(i.destination),
      i.change.approvedVersion,
    ])}`,
  };
}
/** Count distinct substantive changes: union the task and destination/version keys so any shared
 * key merges records into one change, then count the connected components. */
export function countDistinctSubstantiveChanges(improvements: Improvement[]): number {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let node = key;
    if (!parent.has(node)) parent.set(node, node);
    while (parent.get(node) !== node) {
      const grandparent = parent.get(parent.get(node)!)!;
      parent.set(node, grandparent);
      node = grandparent;
    }
    return node;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const i of improvements) {
    const { taskKey, destinationKey } = substantiveChangeKeys(i);
    union(taskKey, destinationKey);
  }
  const components = new Set<string>();
  for (const i of improvements) components.add(find(substantiveChangeKeys(i).taskKey));
  return components.size;
}
/** CI-3 numeric threshold: distinct substantive, verified changes; drafts, acknowledgements and
 * clones with fresh UUIDs do not count. Panel/client binding of the evidence is enforced by the
 * retest gate in `comparablePairs`, which resolves each improvement's findings and baseline
 * captures against actual records for the exact panel and client before calling this. */
export function verifiedImprovementCount(improvements: Improvement[]) {
  return countDistinctSubstantiveChanges(improvements.filter(isVerifiedImprovement));
}
