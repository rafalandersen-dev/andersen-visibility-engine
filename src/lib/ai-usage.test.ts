/**
 * Metering rules that are decided in code rather than in Postgres.
 *
 * The atomic claim itself lives in the `claim_ai_usage` SQL function and was
 * verified against the live database (cap 2: two claims allowed, third refused
 * at used=2; cap -1: accumulates and always allows). What is asserted here is
 * the part TypeScript owns — which advertised limit a bucket draws from, how the
 * owner ceiling is applied, and the period key.
 */
import { describe, it, expect } from "vitest";
import { capFor, usagePeriod, OWNER_MULTIPLIER, UsageLimitError } from "./ai-usage.server";
import { PLAN_LIMITS } from "./billing";

describe("capFor", () => {
  it("draws from the limit the pricing page actually advertises", () => {
    expect(capFor("starter", "contentGeneration")).toBe(
      PLAN_LIMITS.starter.monthlyContentGenerations,
    );
    expect(capFor("pro", "miloScore")).toBe(PLAN_LIMITS.pro.monthlyMiloScores);
    expect(capFor("freePreview", "audit")).toBe(PLAN_LIMITS.freePreview.monthlyAudits);
  });

  it("raises the owner ceiling instead of removing it", () => {
    // canUseFeature starts with `if (isOwner) return true`. Copying that here
    // would leave the one account with five projects and the MCP connector
    // attached with no wall at all, while its spend can 402 the gateway for
    // every paying customer at once.
    const base = PLAN_LIMITS.pro.monthlyContentGenerations;
    expect(capFor("pro", "contentGeneration", true)).toBe(base * OWNER_MULTIPLIER);
    expect(capFor("pro", "contentGeneration", true)).toBeGreaterThan(0);
  });

  it("passes an unlimited cap straight through, for both owners and users", () => {
    // -1 still records usage, so spend stays visible even where it is uncapped.
    const unlimited = Object.keys(PLAN_LIMITS).find(
      (p) => PLAN_LIMITS[p as keyof typeof PLAN_LIMITS].monthlyAiCredits < 0,
    );
    if (!unlimited) return; // no unlimited tier configured — nothing to assert
    expect(capFor(unlimited as never, "aiCredits")).toBe(-1);
    expect(capFor(unlimited as never, "aiCredits", true)).toBe(-1);
  });

  it("covers every bucket for every plan without producing NaN", () => {
    const buckets = [
      "contentGeneration",
      "improveDraft",
      "miloScore",
      "audit",
      "authority",
      "gscImport",
      "aiCredits",
    ] as const;
    for (const plan of Object.keys(PLAN_LIMITS) as Array<keyof typeof PLAN_LIMITS>) {
      for (const bucket of buckets) {
        const cap = capFor(plan, bucket);
        expect(Number.isFinite(cap), `${plan}/${bucket}`).toBe(true);
      }
    }
  });
});

describe("usagePeriod", () => {
  it("is a UTC calendar month, zero-padded", () => {
    expect(usagePeriod(new Date("2026-07-19T23:30:00Z"))).toBe("2026-07");
    expect(usagePeriod(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  it("does not roll over early for a timezone ahead of UTC", () => {
    // 2026-07-31T23:00Z is already August in Warsaw. Bucketing on local time
    // would silently hand the user a fresh month a day early.
    expect(usagePeriod(new Date("2026-07-31T23:00:00Z"))).toBe("2026-07");
  });
});

describe("UsageLimitError", () => {
  it("carries the numbers the UI needs to explain itself", () => {
    const e = new UsageLimitError("miloScore", 10, 10, "out of runs");
    expect(e.code).toBe("usage_limit");
    expect(e.bucket).toBe("miloScore");
    expect(e.used).toBe(10);
    expect(e.cap).toBe(10);
  });
});
