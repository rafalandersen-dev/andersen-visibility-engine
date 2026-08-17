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
import {
  assertImageGenerationAllowed,
  capFor,
  usagePeriod,
  ImageGenerationGateError,
  OWNER_MULTIPLIER,
  UsageLimitError,
} from "./ai-usage.server";
import { PLAN_LIMITS, type PlanId, isActivePaid } from "./billing";

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

describe("resolvePlan honours only active-paid subscriptions", () => {
  // resolvePlan is not exported (it reads the DB), but its rule is the important
  // part: isActivePaid must gate the plan. These assert the billing predicate the
  // gate depends on, so a change to it can't silently re-open the escalation.
  it("isActivePaid rejects a pending checkout and a self-declared active-free", () => {
    // Documented in the code: the billing page writes checkoutPending on Choose
    // Pro before Paddle confirms, and that must not grant paid caps.
    expect(isActivePaid({ planId: "pro", status: "checkoutPending" } as never)).toBe(false);
    expect(isActivePaid({ planId: "freePreview", status: "active" } as never)).toBe(false);
    expect(isActivePaid(undefined)).toBe(false);
  });

  it("isActivePaid accepts a genuinely active paid plan", () => {
    expect(isActivePaid({ planId: "pro", status: "active" } as never)).toBe(true);
    expect(isActivePaid({ planId: "starter", status: "manualBeta" } as never)).toBe(true);
  });
});

describe("image generation plan gate (Pro/Agency only, owner decision 2026-08-17)", () => {
  // The gate must hold even while AI_METERING_ENFORCED is off — it is the only
  // thing standing between a free-preview account and the most expensive AI
  // call in the product. Overrides keep these tests off the DB.
  const gated: PlanId[] = ["freePreview", "starter", "growth"];
  const allowed: PlanId[] = ["pro", "agency"];

  it("refuses every plan below Pro with the upgrade message", async () => {
    for (const plan of gated) {
      await expect(
        assertImageGenerationAllowed({ userId: "u1", planOverride: plan, isOwnerOverride: false }),
      ).rejects.toBeInstanceOf(ImageGenerationGateError);
    }
  });

  it("allows Pro and Agency", async () => {
    for (const plan of allowed) {
      await expect(
        assertImageGenerationAllowed({ userId: "u1", planOverride: plan, isOwnerOverride: false }),
      ).resolves.toBeUndefined();
    }
  });

  it("keeps the owner bypass, even on the free preview", async () => {
    await expect(
      assertImageGenerationAllowed({
        userId: "u1",
        planOverride: "freePreview",
        isOwnerOverride: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps the metered quota consistent with the boolean flag on every plan", () => {
    for (const plan of gated) {
      expect(PLAN_LIMITS[plan].imageGenerationEnabled, plan).toBe(false);
      expect(PLAN_LIMITS[plan].monthlyImageGenerations, plan).toBe(0);
    }
    for (const plan of allowed) {
      expect(PLAN_LIMITS[plan].imageGenerationEnabled, plan).toBe(true);
      expect(PLAN_LIMITS[plan].monthlyImageGenerations, plan).toBeGreaterThan(0);
    }
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
