/**
 * Completeness guard for AI spend metering.
 *
 * The limit is claimed inside each server function rather than inside
 * generateJsonText, because the call sites have wildly different shapes
 * (multi-line template literals) and rewriting their argument lists mechanically
 * in a 2400-line file is how subtle mistakes get made. The cost of that choice
 * is that the compiler can no longer prove every AI function is metered — so
 * this test proves it instead, by reading the source.
 *
 * If it fails, someone added an AI server function and did not decide which
 * advertised limit it draws from. Either meter it, or mark it uncounted with a
 * stated reason; both are fine, silence is not.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(process.cwd(), "src/lib/ai.functions.ts"), "utf8");

/**
 * Split the file into one chunk per exported server function OR exported core.
 * Cores (generateContentCore, …) are the extracted bodies the cron runner calls
 * without a request context — they carry the claimAiUsage themselves, and their
 * *Fn wrappers become thin delegates with no model call of their own.
 */
function serverFunctions(): Array<{ name: string; body: string }> {
  const parts = SOURCE.split(
    /^export (?:const (\w+Fn) = createServerFn|async function (\w+Core)\()/m,
  );
  const out: Array<{ name: string; body: string }> = [];
  // parts = [preamble, fnName?, coreName?, body, fnName?, coreName?, body, ...]
  for (let i = 1; i < parts.length; i += 3) {
    out.push({ name: parts[i] ?? parts[i + 1], body: parts[i + 2] ?? "" });
  }
  return out;
}

describe("every AI server function accounts for its spend", () => {
  const fns = serverFunctions().filter((f) => f.body.includes("generateJsonText("));

  it("finds the AI functions at all (guards against the parser silently matching nothing)", () => {
    expect(fns.length).toBeGreaterThanOrEqual(15);
  });

  it.each(fns.map((f) => f.name))("%s either claims usage or says why it does not", (name) => {
    const fn = fns.find((f) => f.name === name)!;
    const metered = fn.body.includes("claimAiUsage(");
    const deliberatelyUncounted = /NOT metered\.\s+\S/.test(fn.body);
    expect(
      metered || deliberatelyUncounted,
      `${name} calls the model but neither claims a usage bucket nor documents why it is uncounted`,
    ).toBe(true);
  });

  it("claims the limit BEFORE the model call, so a refusal costs nothing", () => {
    for (const fn of fns) {
      if (!fn.body.includes("claimAiUsage(")) continue;
      expect(
        fn.body.indexOf("claimAiUsage("),
        `${fn.name} claims usage after it has already called the model`,
      ).toBeLessThan(fn.body.indexOf("generateJsonText("));
    }
  });

  it("never takes the plan from the request body", () => {
    // The plan is resolved server-side from the caller's own workspace; accepting
    // it as input would let anyone declare themselves Pro.
    expect(SOURCE).not.toMatch(/claimAiUsage\(\{[^}]*data\.(plan|planId)/);
  });
});
