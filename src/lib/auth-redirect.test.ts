/**
 * PR150 finding 4111227860: Google/Apple sign-in must return the assigned reviewer to the scoped review link,
 * exactly like password sign-in, without opening a redirect to anything but an internal /app path.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APP_PATH,
  hasScopedRedirect,
  oauthRedirectUri,
  redirectFromAuthUrl,
  safeRedirect,
  startOAuthSignIn,
} from "./auth-redirect";
import { absoluteReviewerLink, reviewerLinkContext } from "./citation-review-ui";

const owner = "00000000-0000-4000-8000-000000000001";
const finding = "00000000-0000-4000-8000-0000000000f0";
const ctx = { ownerId: owner, projectId: "synergy_2026", findingRowId: finding };
// What the authenticated layout puts into /auth?redirect= for a logged-out reviewer: `${pathname}${searchStr}`.
const scopedPath = `/app/citation-review?owner=${owner}&project=synergy_2026&finding=${finding}`;
const origin = "https://milogrowth.com";

describe("safeRedirect — only internal /app targets survive", () => {
  it("keeps the scoped review path with owner/project/finding intact", () => {
    expect(safeRedirect(scopedPath)).toBe(scopedPath);
    expect(safeRedirect("/app")).toBe("/app");
    expect(safeRedirect("/app/connect?req=abc")).toBe("/app/connect?req=abc");
    expect(safeRedirect("/app?tab=1")).toBe("/app?tab=1");
  });
  it("falls back to /app for protocol-relative, backslash, absolute, encoded and malformed input", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "//evil.example/app",
      "/\\evil.example",
      "/app\\@evil.example",
      "\\/evil.example",
      "https://evil.example/app",
      "http://milogrowth.com/app",
      "javascript:alert(1)",
      "/application",
      "/apps",
      "app/citation-review",
      "/app/%2f%2fevil.example",
      "/app/%5Cevil.example",
      "/app/\n//evil.example",
      "/app/ x",
      "/app/\u0000",
      "/app/" + "a".repeat(3000),
    ])
      expect(safeRedirect(bad), String(bad)).toBe(DEFAULT_APP_PATH);
  });
  it("reports whether a specific target was kept", () => {
    expect(hasScopedRedirect(scopedPath)).toBe(true);
    expect(hasScopedRedirect("/app")).toBe(false);
    expect(hasScopedRedirect("//evil.example")).toBe(false);
  });
});

describe("oauthRedirectUri — the callback carries the validated target on the current origin", () => {
  it("returns /auth?redirect=<scoped path> and round-trips back to the same reviewer context", () => {
    const uri = oauthRedirectUri(origin, scopedPath);
    expect(uri).toBe(`${origin}/auth?redirect=${encodeURIComponent(scopedPath)}`);
    const url = new URL(uri!);
    expect(url.origin).toBe(origin);
    expect(redirectFromAuthUrl(uri!)).toBe(scopedPath);
    const back = new URL(redirectFromAuthUrl(uri!), origin);
    expect(reviewerLinkContext(Object.fromEntries(back.searchParams))).toEqual({
      mode: "reviewer",
      context: ctx,
    });
  });
  it("keeps the historical origin + /app callback when there is no specific target or it is unsafe", () => {
    expect(oauthRedirectUri(origin, undefined)).toBe(`${origin}/app`);
    expect(oauthRedirectUri(origin, "/app")).toBe(`${origin}/app`);
    expect(oauthRedirectUri(origin, "//evil.example/app")).toBe(`${origin}/app`);
    expect(oauthRedirectUri(origin, "https://evil.example/app")).toBe(`${origin}/app`);
  });
  it("refuses a non-origin base (never a fabricated or foreign callback)", () => {
    for (const bad of [
      "",
      "milogrowth.com",
      "https://milogrowth.com/base",
      "https://a:b@x.io",
      "javascript://x",
    ])
      expect(oauthRedirectUri(bad, scopedPath)).toBeNull();
    expect(
      oauthRedirectUri("http://localhost:3000", scopedPath)!.startsWith(
        "http://localhost:3000/auth?",
      ),
    ).toBe(true);
  });
  it("redirectFromAuthUrl re-validates and ignores non-/auth callbacks", () => {
    expect(
      redirectFromAuthUrl(`${origin}/auth?redirect=${encodeURIComponent("//evil.example")}`),
    ).toBe("/app");
    expect(redirectFromAuthUrl(`${origin}/app/citation-review?owner=x`)).toBe("/app");
    expect(redirectFromAuthUrl("not a url")).toBe("/app");
  });
});

describe("startOAuthSignIn — the production handler contract for BOTH providers", () => {
  it.each(["google", "apple"] as const)(
    "%s derives the scoped callback from the validated redirect",
    async (provider) => {
      const signIn = vi.fn(async () => ({ error: null, redirected: true }));
      const result = await startOAuthSignIn(provider, { origin, redirect: scopedPath }, signIn);
      expect(result).toEqual({ error: null, redirected: true });
      expect(signIn).toHaveBeenCalledTimes(1);
      const [calledProvider, opts] = signIn.mock.calls[0] as unknown as [
        string,
        { redirect_uri: string },
      ];
      expect(calledProvider).toBe(provider);
      expect(opts.redirect_uri).toBe(`${origin}/auth?redirect=${encodeURIComponent(scopedPath)}`);
      // The callback URL resolves back to the exact scoped destination the reviewer opened.
      expect(redirectFromAuthUrl(opts.redirect_uri)).toBe(scopedPath);
    },
  );
  it.each(["google", "apple"] as const)(
    "%s with malicious or absent redirect falls back to origin + /app",
    async (provider) => {
      for (const redirect of [
        undefined,
        "//evil.example/app",
        "https://evil.example",
        "/app\\evil",
      ]) {
        const signIn = vi.fn(async () => ({ error: null, redirected: true }));
        await startOAuthSignIn(provider, { origin, redirect }, signIn);
        expect(
          (signIn.mock.calls[0] as unknown as [string, { redirect_uri: string }])[1].redirect_uri,
        ).toBe(`${origin}/app`);
      }
    },
  );
  it("does not start the provider flow from a malformed origin and surfaces the adapter error unchanged", async () => {
    const signIn = vi.fn(async () => ({ error: null, redirected: true }));
    const refused = await startOAuthSignIn(
      "google",
      { origin: "not-an-origin", redirect: scopedPath },
      signIn,
    );
    expect(signIn).not.toHaveBeenCalled();
    expect(refused.error?.message).toBe("auth_origin_invalid");
    const failing = vi.fn(async () => ({ error: new Error("provider_down") }));
    expect(
      (await startOAuthSignIn("apple", { origin, redirect: scopedPath }, failing)).error?.message,
    ).toBe("provider_down");
  });
  it("the owner-shared absolute link and the layout's /auth redirect agree on the same scoped path", () => {
    const shared = new URL(absoluteReviewerLink(ctx, origin).href);
    const layoutRedirect = `${shared.pathname}${shared.search}`;
    expect(safeRedirect(layoutRedirect)).toBe(layoutRedirect);
    expect(redirectFromAuthUrl(oauthRedirectUri(origin, layoutRedirect)!)).toBe(layoutRedirect);
  });
});
