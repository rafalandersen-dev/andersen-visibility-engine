import { describe, expect, it } from "vitest";

import { CONTENT_SECURITY_POLICY, withSecurityHeaders } from "./security-headers";

const html = (headers: Record<string, string> = {}) =>
  new Response("<html></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

describe("withSecurityHeaders", () => {
  it("sets the full baseline on HTML documents", () => {
    const res = withSecurityHeaders(html());
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
  });

  it("keeps CSP off non-HTML responses but still applies the rest", () => {
    const res = withSecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("never overrides a header a route already set", () => {
    const res = withSecurityHeaders(
      html({ "content-security-policy": "default-src 'none'", "x-frame-options": "SAMEORIGIN" }),
    );
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("preserves status, existing headers and body", async () => {
    const res = withSecurityHeaders(
      new Response("nope", {
        status: 404,
        headers: { "content-type": "text/html", "x-custom": "kept" },
      }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("x-custom")).toBe("kept");
    expect(await res.text()).toBe("nope");
  });

  it("policy allows the origins the app actually uses", () => {
    // Inventory 2026-08-19: Google Fonts CSS+files, Supabase (https+wss),
    // Paddle checkout surfaces, hydration inline scripts, user-site images.
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("https://fonts.googleapis.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://fonts.gstatic.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://*.supabase.co");
    expect(CONTENT_SECURITY_POLICY).toContain("wss://*.supabase.co");
    expect(CONTENT_SECURITY_POLICY).toContain("https://cdn.paddle.com");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: blob: https:");
  });
});
