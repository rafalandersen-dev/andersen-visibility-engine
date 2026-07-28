import { describe, expect, it } from "vitest";
import { stagingHarnessResponse, type StagingHarnessEnv } from "./staging-harness";

const env: StagingHarnessEnv = {
  PUBLIC_AUDIT_ALLOWED_HOSTS: "staging.milogrowth.com",
  PUBLIC_AUDIT_ALLOWED_ORIGINS: "https://staging.milogrowth.com",
  PUBLIC_AUDIT_STAGING_HARNESS_HOST: "staging.milogrowth.com",
  PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

function request(url = "https://staging.milogrowth.com/"): Request {
  return new Request(url);
}

describe("staging harness boundary", () => {
  it.each([
    ["no staging hostname", { ...env, PUBLIC_AUDIT_STAGING_HARNESS_HOST: "" }],
    ["no site key", { ...env, PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY: "" }],
    ["invalid site key", { ...env, PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY: `x"</script>` }],
    ["host missing from API allowlist", { ...env, PUBLIC_AUDIT_ALLOWED_HOSTS: "other.test" }],
    [
      "origin missing from API allowlist",
      { ...env, PUBLIC_AUDIT_ALLOWED_ORIGINS: "https://other.test" },
    ],
  ])("stays disabled with %s", (_label, candidate) => {
    expect(stagingHarnessResponse(request(), candidate)).toBeUndefined();
  });

  it("refuses the configured page on another hostname, path or method", () => {
    expect(stagingHarnessResponse(request("https://other.test/"), env)).toBeUndefined();
    expect(
      stagingHarnessResponse(request("https://staging.milogrowth.com/other"), env),
    ).toBeUndefined();
    expect(
      stagingHarnessResponse(
        new Request("https://staging.milogrowth.com/", { method: "POST" }),
        env,
      ),
    ).toBeUndefined();
  });

  it("cannot be enabled on the production hostname by configuration alone", () => {
    const productionEnv: StagingHarnessEnv = {
      ...env,
      PUBLIC_AUDIT_ALLOWED_HOSTS: "milogrowth.com",
      PUBLIC_AUDIT_ALLOWED_ORIGINS: "https://milogrowth.com",
      PUBLIC_AUDIT_STAGING_HARNESS_HOST: "milogrowth.com",
    };
    expect(
      stagingHarnessResponse(request("https://milogrowth.com/"), productionEnv),
    ).toBeUndefined();
  });

  it("serves a noindex same-origin harness with a nonce-bound CSP", async () => {
    const response = stagingHarnessResponse(request(), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("x-robots-tag")).toContain("noindex");
    expect(response?.headers.get("x-frame-options")).toBe("DENY");
    expect(response?.headers.get("referrer-policy")).toBe("no-referrer");

    const body = await response?.text();
    const nonce = body?.match(/<style nonce="([a-f0-9]+)">/)?.[1];
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(response?.headers.get("content-security-policy")).toContain(`'nonce-${nonce}'`);
    expect(body).toContain(env.PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY);
    expect(body).toContain('action: "public_audit"');
    expect(body).toContain('fetch("/api/public-audit"');
    expect(body).toContain('credentials: "same-origin"');
    expect(body).toContain("output.textContent = JSON.stringify(payload, null, 2)");
    expect(body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(body).not.toContain("GEMINI_API_KEY");
    expect(body).not.toContain("TURNSTILE_SECRET_KEY");
  });
});
