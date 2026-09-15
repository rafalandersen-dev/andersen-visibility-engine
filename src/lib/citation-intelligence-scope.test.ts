import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
/** CI11-T01 (product/CITATION_INTELLIGENCE_SPEC.md §12): the old minimum-three-provider /
 * three-surface gate may survive in active plans only as dated history marked superseded.
 * Documentation is data here; this guards wording, not behaviour. */
const active = [
  "product/ROADMAP.md",
  "product/CURRENT_STATE.md",
  "product/PLAN_REVIEW_2026_09_07.md",
  "product/STRATEGY_2026_2027.md",
  "product/CONVERSATIONAL_WORKSPACE_2026_09_13.md",
  "product/HANDOFF_CLAUDE_2026_09_13.md",
  "product/CLAUDE_CONTINUATION_PROGRESS_2026_09_13.md",
  "docs/AI-ANSWER-EVIDENCE.md",
  "docs/TRACEABILITY-MATRIX.md",
];
const oldGate =
  /(?:at least|minimum(?: of)?|≥ ?|>= ?)\s*(?:three|3)\s+(?:trustworthy |initial |high-quality |observed-AI |verified )*(?:surfaces?|providers?|services)/i;
describe("Citation Intelligence v1 scope (D03, 14 September 2026)", () => {
  it("keeps the specification at its canonical path with the v1 milestone and no three-surface gate", () => {
    const spec = readFileSync("product/CITATION_INTELLIGENCE_SPEC.md", "utf8");
    expect(spec).toContain("product/CITATION_INTELLIGENCE_SPEC.md");
    expect(spec).toContain(
      "There is no minimum-three-provider or minimum-three-surface gate for v1.",
    );
    expect(spec).toContain("10 questions × 1 surface × 1 round/week × 4 weeks = 40");
  });
  it.each(active)("%s carries the old gate only as wording marked superseded", (file) => {
    expect(existsSync(file), file).toBe(true);
    const offending = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => oldGate.test(line) && !/supersed|historical/i.test(line));
    expect(offending).toEqual([]);
  });
  it("marks the monitor design baseline as superseded for v1 at the top of the file", () => {
    const monitor = readFileSync("docs/AI-VISIBILITY-MONITOR.md", "utf8");
    expect(monitor.slice(0, 1200)).toContain("Supersession note (14 September 2026)");
  });
  it("records D03 as decided in the plan review and the decision log", () => {
    expect(readFileSync("product/PLAN_REVIEW_2026_09_07.md", "utf8")).toContain(
      "**D03 (decided 14 September 2026):**",
    );
    expect(readFileSync("product/DECISIONS.md", "utf8")).toContain(
      "D03 decided: Citation Intelligence v1",
    );
  });
});
