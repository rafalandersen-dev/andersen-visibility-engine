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
});
