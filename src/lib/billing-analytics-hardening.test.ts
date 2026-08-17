/**
 * P1-10 + P1-11 hardening pins.
 *
 * The Paddle portal session must never take customer/subscription ids from
 * the request body, and the public analytics endpoint must rate-limit and
 * refuse to insert rows for project ids that do not exist.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RATE_BUCKETS } from "./oauth.server";

describe("Paddle portal session is entitlement-scoped (P1-10)", () => {
  const source = readFileSync("src/lib/billing.functions.ts", "utf-8");

  it("accepts no ids from the client", () => {
    expect(source).not.toMatch(/customerId:\s*z\.string/);
    expect(source).not.toMatch(/subscriptionId:\s*z\.string/);
  });

  it("resolves the caller's own ids from the entitlements row", () => {
    expect(source).toContain("readEntitlement(context.userId as string)");
    expect(source).toContain("entitlement.providerCustomerId");
  });

  it("the billing page no longer sends ids up", () => {
    const page = readFileSync("src/routes/_authenticated/app.billing.tsx", "utf-8");
    expect(page).toContain("createPaddlePortalSessionFn()");
    expect(page).not.toMatch(/customerId:\s*subscription/);
  });
});

describe("analytics ingestion is bounded (P1-11)", () => {
  const source = readFileSync("src/routes/api.analytics.track.ts", "utf-8");

  it("has a per-IP rate bucket with a real wall", () => {
    expect(RATE_BUCKETS.analyticsIp.bucket).toBe("analytics_ip");
    expect(RATE_BUCKETS.analyticsIp.limit).toBeGreaterThan(0);
    expect(RATE_BUCKETS.analyticsIp.windowSec).toBeGreaterThan(0);
    expect(source).toContain("RATE_BUCKETS.analyticsIp");
    expect(source).toContain("429");
  });

  it("verifies the project exists before inserting, without an existence oracle", () => {
    const check = source.indexOf('from("workspace_entities")');
    const insert = source.indexOf('from("analytics_events")');
    expect(check).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(check).toBeLessThan(insert);
    // Unknown ids must not be distinguishable from accepted ones.
    expect(source).toContain("if (!projectRow) return json({ ok: true })");
  });
});
