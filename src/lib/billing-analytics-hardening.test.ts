/**
 * P1-10 + P1-11 hardening pins.
 *
 * The billing page must not call a provider portal with client-supplied ids,
 * and the public analytics endpoint must rate-limit and refuse to insert rows
 * for project ids that do not exist.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RATE_BUCKETS } from "./oauth.server";

describe("billing page holds no Paddle code (P1-10)", () => {
  it("neither calls a Paddle server function nor sends provider ids up", () => {
    const page = readFileSync("src/routes/_authenticated/app.billing.tsx", "utf-8");
    expect(page).not.toMatch(/billing\.functions|PaddlePortal|PaddleCheckout/);
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
