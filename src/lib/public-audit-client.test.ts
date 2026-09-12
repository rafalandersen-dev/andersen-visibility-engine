import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicAuditUnavailableError, runPublicAudit } from "./public-audit-client";

afterEach(() => vi.unstubAllEnvs());

function validAudit() {
  return {
    id: "audit_1",
    url: "example.com",
    normalizedUrl: "https://example.com/",
    auditedAt: "2026-07-28T00:00:00.000Z",
    overall: 50,
    status: "needsWork",
    categories: Object.fromEntries(
      [
        "entityClarity",
        "serviceClarity",
        "localRelevance",
        "answerReadiness",
        "trustSignals",
        "searchStructure",
        "contentDepth",
        "technicalBasics",
      ].map((key) => [
        key,
        {
          score: 50,
          status: "needsWork",
          explanation: "Limited evidence.",
          suggestions: ["Add detail."],
        },
      ]),
    ),
    topIssues: ["Missing service details."],
    quickWins: [],
    recommendedActions: ["Describe services."],
    summary: "Readiness needs work.",
    disclaimer: "Readiness signals only.",
    extractedSignals: { title: "Example", detectedServices: ["Design"], hasFaqSignals: false },
  };
}

describe("public audit HTTP client", () => {
  it("calls the dedicated endpoint without credentials", async () => {
    const audit = validAudit();
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
    const audit = validAudit();
    const fetchImpl = vi.fn(async () => Response.json(audit));
    await runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/public-audit",
      expect.objectContaining({ credentials: "omit" }),
    );
  });
});

describe("endpoint without a usable error response", () => {
  it("flags a bare 404 as unavailable without an immediate retry", async () => {
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

describe("malformed error envelopes", () => {
  it.each(["proxy failure", 42, true, null, { error: "broken" }, { error: { message: 42 } }])(
    "handles malformed JSON %j without exposing a runtime error",
    async (payload) => {
      const fetchImpl = vi.fn(async () => Response.json(payload, { status: 500 }));
      await expect(
        runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl),
      ).rejects.toThrow("The audit is temporarily unavailable. Please try again later.");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it("does not infer setup state or promise a future audit from an unavailable response", async () => {
    const fetchImpl = vi.fn(async () => Response.json("proxy failure", { status: 503 }));
    await expect(
      runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl),
    ).rejects.toThrow(
      "The free audit service is currently unavailable. You can return later or continue to project setup.",
    );
  });
});

describe("success response contract", () => {
  it.each([
    ["categories", {}],
    ["categories.entityClarity", null],
    ["categories.entityClarity.score", "50"],
    ["categories.entityClarity.score", 101],
    ["categories.entityClarity.status", "excellent"],
    ["categories.entityClarity.explanation", {}],
    ["categories.entityClarity.suggestions", "Add detail"],
    ["categories.entityClarity.suggestions", [{}]],
    ["overall", -1],
    ["status", "excellent"],
    ["topIssues", null],
    ["quickWins", [42]],
    ["recommendedActions", {}],
    ["summary", {}],
    ["disclaimer", null],
    ["url", undefined],
    ["extractedSignals", []],
    ["extractedSignals.title", {}],
    ["extractedSignals.detectedServices", "Design"],
    ["extractedSignals.detectedLocations", [{}]],
    ["extractedSignals.headings", [42]],
    ["extractedSignals.hasFaqSignals", "false"],
  ])("rejects malformed %s instead of exposing it to the results page", async (path, value) => {
    const payload = validAudit();
    const parts = (path as string).split(".");
    let target = payload as Record<string, unknown>;
    for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
    target[parts.at(-1)!] = value;
    const fetchImpl = vi.fn(async () => Response.json(payload));
    await expect(
      runPublicAudit({ url: "example.com", botProof: "proof" }, fetchImpl),
    ).rejects.toThrow("The audit returned an invalid response. Please try again later.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "accepts a serialized worker-normalized audit (signals present: %s)",
    async (includeSignals) => {
      const { normalizePublicAudit } = await import("./public-audit");
      const payload = normalizePublicAudit(validAudit(), {
        id: "audit_2",
        url: "example.com",
        normalizedUrl: "https://example.com/",
        auditedAt: "2026-09-12T00:00:00.000Z",
      });
      if (!includeSignals) delete payload.extractedSignals;
      await expect(
        runPublicAudit(
          { url: "example.com", botProof: "proof" },
          vi.fn(async () => Response.json(payload)),
        ),
      ).resolves.toEqual(JSON.parse(JSON.stringify(payload)));
    },
  );
});
