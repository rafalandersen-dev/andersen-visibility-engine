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
    expect(config).not.toMatch(/"routes"|"custom_domains"/);
  });

  it("keeps the public audit independent from Lovable-managed AI credentials", () => {
    const worker = readFileSync("workers/public-audit/src/index.ts", "utf-8");
    expect(worker).toContain("GEMINI_API_KEY");
    expect(worker).toContain("generativelanguage.googleapis.com");
    expect(worker).not.toContain("LOVABLE_API_KEY");
    expect(worker).not.toContain("ai.gateway.lovable.dev");
  });
});
