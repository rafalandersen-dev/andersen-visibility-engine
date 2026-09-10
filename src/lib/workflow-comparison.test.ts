import { describe, it, expect } from "vitest";
import { compareWorkflows, workflowComparisonSchema } from "./workflow-comparison";
const result = () => ({
  output: "Complete sample answer",
  reviewer: "owner",
  scores: { factualSupport: 4, brandFit: 4, usefulness: 4, language: 4, visualFidelity: 4 },
  regressions: [],
  steps: [
    {
      name: "writing",
      costUsd: 0.2,
      costBasis: "recorded",
      receiptReference: "synthetic-test-receipt",
    },
  ],
});
const input = () => ({
  projectId: "p",
  suiteName: "Synthetic fixed brief",
  baselineVersion: "v1",
  candidateVersion: "v2",
  reviewedAt: "2026-09-10T00:00:00Z",
  cases: [
    {
      id: "one",
      brief: "Use the supplied facts only",
      language: "English",
      baseline: result(),
      candidate: result(),
    },
  ],
});
describe("fixed workflow comparison without provider execution", () => {
  it("does not claim improvement from equal results or auto-release anything", async () => {
    const report = await compareWorkflows(input());
    expect(report.verdict).toBe("no_demonstrated_improvement");
    expect(report.autoRelease).toBe(false);
    expect(report.independentlyVerified).toBe(false);
  });
  it("compares total cost across all steps, including revisions", async () => {
    const data = input();
    data.cases[0].candidate.steps.push({
      name: "revision",
      costUsd: 0.5,
      costBasis: "recorded",
      receiptReference: "synthetic-test-2",
    });
    expect((await compareWorkflows(data)).verdict).toBe("higher_cost_review");
  });
  it("never counts unknown or estimated expense as zero", async () => {
    const data = input();
    data.cases[0].candidate.steps[0].costBasis = "estimated";
    const report = await compareWorkflows(data);
    expect(report.verdict).toBe("incomplete_cost_evidence");
    expect(report.candidateCost).toBeNull();
  });
  it("blocks a quality regression even when overall averages or cost improve", async () => {
    const data = input();
    data.cases[0].candidate.scores.factualSupport = 3;
    data.cases[0].candidate.scores.usefulness = 5;
    data.cases[0].candidate.steps[0].costUsd = 0.1;
    expect((await compareWorkflows(data)).verdict).toBe("regression");
  });
  it("binds both workflows to one fixed manifest and never reuses foreign project scope implicitly", async () => {
    const data = input();
    const first = await compareWorkflows(data);
    data.cases[0].brief = "Different facts";
    expect((await compareWorkflows(data)).fixedBriefHash).not.toBe(first.fixedBriefHash);
    expect(
      workflowComparisonSchema.safeParse({ ...data, cases: [...data.cases, ...data.cases] })
        .success,
    ).toBe(false);
  });
  it("only marks an evidenced improvement eligible for development review", async () => {
    const data = input();
    data.cases[0].candidate.scores.brandFit = 5;
    const report = await compareWorkflows(data);
    expect(report.verdict).toBe("eligible_for_development_review");
    expect(report.autoRelease).toBe(false);
  });
});

it("does not mistake floating point addition noise for an expense increase", async () => {
  const data = input();
  data.cases[0].baseline.steps[0].costUsd = 0.3;
  data.cases[0].candidate.steps[0].costUsd = 0.1;
  data.cases[0].candidate.steps.push({
    name: "revision",
    costUsd: 0.2,
    costBasis: "recorded",
    receiptReference: "synthetic-receipt",
  });
  expect((await compareWorkflows(data)).verdict).toBe("no_demonstrated_improvement");
});
