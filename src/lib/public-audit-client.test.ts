import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicAuditUnavailableError, runPublicAudit } from "./public-audit-client";

afterEach(() => vi.unstubAllEnvs());

describe("public audit HTTP client", () => {
  it("calls the dedicated endpoint without credentials", async () => {
    const audit = {
      id: "audit_1",
      normalizedUrl: "https://example.com",
      auditedAt: "2026-07-28T00:00:00.000Z",
      overall: 50,
      categories: {},
    };
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(audit), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      runPublicAudit({ url: "example.com", language: "English", botProof: "proof" }, fetchImpl),
    ).resolves.toEqual(audit);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/public-audit",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
      }),
    );
  });

  it("surfaces only the public Worker error", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "rate_limited", message: "Try again later." } }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl),
    ).rejects.toThrow("Try again later.");
  });

  it("does not allow build configuration to turn the audit into a cross-origin request", async () => {
    vi.stubEnv("VITE_PUBLIC_AUDIT_API_URL", "https://evil.test/collect");
    const audit = {
      id: "audit_1",
      normalizedUrl: "https://example.com",
      auditedAt: "2026-07-28T00:00:00.000Z",
      overall: 50,
      categories: {},
    };
    const fetchImpl = vi.fn(async () => Response.json(audit));
    await runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/public-audit",
      expect.objectContaining({ credentials: "omit" }),
    );
  });
});

describe("endpoint not wired up", () => {
  it("flags a bare 404 as permanently unavailable, not a retryable error", async () => {
    const fetchImpl = vi.fn(async () => new Response("<!doctype html>", { status: 404 }));
    await expect(
      runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl),
    ).rejects.toBeInstanceOf(PublicAuditUnavailableError);
  });

  it("keeps a real worker error retryable even on a 503", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "upstream", message: "Provider down." } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl),
    ).rejects.not.toBeInstanceOf(PublicAuditUnavailableError);
  });
});
