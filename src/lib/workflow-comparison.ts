import { z } from "zod";
const name = z.string().trim().min(1).max(100);
const score = z.number().finite().min(0).max(5);
const result = z
  .object({
    output: z.string().min(1).max(32000),
    reviewer: z.literal("owner"),
    scores: z
      .object({
        factualSupport: score,
        brandFit: score,
        usefulness: score,
        language: score,
        visualFidelity: score,
      })
      .strict(),
    regressions: z
      .array(
        z.enum([
          "isolation",
          "authority",
          "budget",
          "factuality",
          "links",
          "duplicate_work",
          "missing_output",
        ]),
      )
      .max(7),
    steps: z
      .array(
        z
          .object({
            name,
            costUsd: z.number().finite().min(0).max(1000).nullable(),
            costBasis: z.enum(["recorded", "estimated", "unknown"]),
            receiptReference: z.string().trim().min(1).max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export const workflowComparisonSchema = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    suiteName: name,
    baselineVersion: name,
    candidateVersion: name,
    reviewedAt: z.string().datetime({ offset: true }),
    cases: z
      .array(
        z
          .object({
            id: name,
            brief: z.string().min(1).max(4000),
            language: name,
            baseline: result,
            candidate: result,
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.baselineVersion === v.candidateVersion)
      ctx.addIssue({ code: "custom", message: "Distinct workflow versions required" });
    if (new Set(v.cases.map((c) => c.id)).size !== v.cases.length)
      ctx.addIssue({ code: "custom", message: "Duplicate fixed case id" });
  });
export type WorkflowComparisonInput = z.infer<typeof workflowComparisonSchema>;
const dimensions = [
  "factualSupport",
  "brandFit",
  "usefulness",
  "language",
  "visualFidelity",
] as const;
async function hash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
/** No model calls, auto-promotion or cross-project datasets. Human evidence is labelled, not independently certified. */
export async function compareWorkflows(raw: unknown) {
  const input = workflowComparisonSchema.parse(raw);
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 250000)
    throw Error("workflow_comparison_too_large");
  const fixedBriefHash = await hash(
    input.cases.map(({ id, brief, language }) => ({ id, brief, language })),
  );
  const unknownCost = input.cases.some((c) =>
    [c.baseline, c.candidate].some((r) =>
      r.steps.some((s) => s.costUsd === null || s.costBasis !== "recorded" || !s.receiptReference),
    ),
  );
  const costs = (side: "baseline" | "candidate") =>
    unknownCost
      ? null
      : input.cases.reduce(
          (sum, c) =>
            sum + c[side].steps.reduce((n, s) => n + Math.round((s.costUsd ?? 0) * 1e9), 0),
          0,
        ) / 1e9;
  const regressions = input.cases.flatMap((c) =>
    c.candidate.regressions.map((reason) => ({ caseId: c.id, reason })),
  );
  const scoreRegressions = input.cases.flatMap((c) =>
    dimensions
      .filter((d) => c.candidate.scores[d] < c.baseline.scores[d])
      .map((d) => ({ caseId: c.id, dimension: d })),
  );
  const qualityImproved = input.cases.some((c) =>
    dimensions.some((d) => c.candidate.scores[d] > c.baseline.scores[d]),
  );
  const baselineCost = costs("baseline"),
    candidateCost = costs("candidate");
  let verdict:
    | "regression"
    | "incomplete_cost_evidence"
    | "higher_cost_review"
    | "eligible_for_development_review"
    | "no_demonstrated_improvement";
  if (regressions.length || scoreRegressions.length) verdict = "regression";
  else if (baselineCost === null || candidateCost === null) verdict = "incomplete_cost_evidence";
  else if (candidateCost > baselineCost) verdict = "higher_cost_review";
  else if (qualityImproved || candidateCost < baselineCost)
    verdict = "eligible_for_development_review";
  else verdict = "no_demonstrated_improvement";
  return {
    input,
    fixedBriefHash,
    baselineCost,
    candidateCost,
    regressions,
    scoreRegressions,
    verdict,
    independentlyVerified: false as const,
    autoRelease: false as const,
  };
}
