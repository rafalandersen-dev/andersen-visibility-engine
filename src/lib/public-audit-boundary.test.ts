import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public audit architecture boundary", () => {
  it("does not expose the old TanStack paid-audit server function", () => {
    const aiFunctions = readFileSync("src/lib/ai.functions.ts", "utf-8");
    const route = readFileSync("src/routes/free-ai-visibility-audit.tsx", "utf-8");
    expect(aiFunctions).not.toContain("runPublicAiVisibilityAuditFn");
    expect(route).not.toContain("ai.functions");
    expect(route).toContain("runPublicAudit");
  });

  it("keeps production Worker development and preview URLs disabled", () => {
    const config = readFileSync("workers/public-audit/wrangler.jsonc", "utf-8");
    expect(config).toContain('"workers_dev": false');
    expect(config).toContain('"preview_urls": false');
    expect(config).not.toMatch(/"services"|"hyperdrive"|"tcp_sockets"|"vpc"/);
  });

  it("keeps the staging harness separately named and disabled by default", () => {
    const config = readFileSync("workers/public-audit/wrangler.jsonc", "utf-8");
    expect(config).toContain('"name": "milo-public-audit-staging"');
    expect(config).toContain('"PUBLIC_AUDIT_STAGING_HARNESS_HOST": ""');
    expect(config).toContain('"PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY": ""');
  });

  it("routes production traffic ONLY to the dedicated audit path on our own zone", () => {
    // Owner-approved deploy (Aug 2026): the Worker serves exactly
    // milogrowth.com/api/public-audit. A broader pattern would put the Worker
    // in front of pages it was never hardened for; a foreign zone would be a
    // misdeploy. The staging env must stay route-less.
    const config = readFileSync("workers/public-audit/wrangler.jsonc", "utf-8");
    const routePatterns = [...config.matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(routePatterns).toEqual(["milogrowth.com/api/public-audit"]);
    const zones = [...config.matchAll(/"zone_name":\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(zones).toEqual(["milogrowth.com"]);
    expect(config).not.toContain('"custom_domains"');
    // No routes inside the staging env block (it must never shadow production).
    const stagingBlock = config.slice(config.indexOf('"staging"'));
    expect(stagingBlock).not.toContain('"routes"');
  });

  it("keeps the public audit independent from Lovable-managed AI credentials", () => {
    const worker = readFileSync("workers/public-audit/src/index.ts", "utf-8");
    expect(worker).toContain("GEMINI_API_KEY");
    expect(worker).toContain("generativelanguage.googleapis.com");
    expect(worker).not.toContain("LOVABLE_API_KEY");
    expect(worker).not.toContain("ai.gateway.lovable.dev");
  });
});
