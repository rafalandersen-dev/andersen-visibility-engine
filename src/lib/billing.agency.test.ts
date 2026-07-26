/**
 * Agency plan (owner decisions 2026-07-26/27) — pricing-ladder and gate
 * invariants. Agency must sit ABOVE Pro in EVERY market (the repricing was
 * specifically to avoid cannibalizing Pro), and the white-label/cap gates
 * must reject self-declared agency subscriptions that are not actively paid.
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_IDS,
  PLAN_LIMITS,
  PLAN_META,
  PLAN_PRICING,
  isAgencyPlan,
  type SubscriptionPlan,
} from "./billing";

describe("Agency plan", () => {
  it("is a real top tier: priced above Pro in every market", () => {
    for (const [market, prices] of Object.entries(PLAN_PRICING)) {
      expect(prices.agency, market).toBeGreaterThan(prices.pro);
    }
  });

  it("limits strictly dominate Pro (no downgrade surprise for upgraders)", () => {
    const pro = PLAN_LIMITS.pro;
    const agency = PLAN_LIMITS.agency;
    for (const key of Object.keys(pro) as (keyof typeof pro)[]) {
      const p = pro[key];
      const a = agency[key];
      if (typeof p === "number" && typeof a === "number") {
        expect(a, key).toBeGreaterThanOrEqual(p);
      } else {
        expect(a, key).toBe(true); // every Pro boolean feature stays on
      }
    }
    expect(agency.maxProjects).toBe(15);
  });

  it("is registered everywhere a PlanId is enumerated", () => {
    expect(PLAN_IDS).toContain("agency");
    expect(PLAN_META.agency.name).toBe("Agency");
    expect(PLAN_META.agency.features.join(" ")).toMatch(/white-label/i);
  });

  it("isAgencyPlan gates on ACTIVE status — a self-declared planId is not enough", () => {
    const active = { planId: "agency", status: "active" } as SubscriptionPlan;
    const declared = { planId: "agency", status: "freePreview" } as SubscriptionPlan;
    const pro = { planId: "pro", status: "active" } as SubscriptionPlan;
    expect(isAgencyPlan(active)).toBe(true);
    expect(isAgencyPlan({ planId: "agency", status: "manualBeta" } as SubscriptionPlan)).toBe(true);
    expect(isAgencyPlan(declared)).toBe(false);
    expect(isAgencyPlan(pro)).toBe(false);
    expect(isAgencyPlan(undefined)).toBe(false);
  });
});
