import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directProviderFetch, ProviderRedirectError } from "./provider-fetch.server";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

// A Location a hijacked/misconfigured provider might use, plus a synthetic
// secret in the redirect body — neither must ever be followed or surfaced.
const EVIL_LOCATION = "https://evil.example/steal";
const BODY_SECRET = "sk-proj-REDIRECT-BODY-SECRET-DO-NOT-LEAK";

/** Minimal Response-shaped object with a spyable body.cancel(), so we can
 * assert body cleanup without depending on stream-cancel propagation. */
function fakeResponse(init: {
  status: number;
  type?: string;
  redirected?: boolean;
  body?: { cancel: ReturnType<typeof vi.fn> } | null;
}) {
  return {
    status: init.status,
    type: init.type ?? "default",
    redirected: init.redirected ?? false,
    headers: new Headers({ location: EVIL_LOCATION }),
    body: init.body === undefined ? { cancel: vi.fn().mockResolvedValue(undefined) } : init.body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.fetch.mockReset();
});

describe("directProviderFetch — redirect refusal", () => {
  it.each([301, 302, 303, 307, 308])(
    "refuses a %s redirect without following Location and cancels the body",
    async (status) => {
      const body = { cancel: vi.fn().mockResolvedValue(undefined) };
      mocks.fetch.mockResolvedValue(fakeResponse({ status, body }));

      await expect(directProviderFetch("https://api.openai.com/v1/x")).rejects.toBeInstanceOf(
        ProviderRedirectError,
      );
      // Exactly one request — Location is never fetched.
      expect(mocks.fetch).toHaveBeenCalledOnce();
      expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/x");
      // The refused response body is released.
      expect(body.cancel).toHaveBeenCalledOnce();
    },
  );

  it("refuses an opaqueredirect response (defensive across runtimes)", async () => {
    const body = { cancel: vi.fn().mockResolvedValue(undefined) };
    mocks.fetch.mockResolvedValue(fakeResponse({ status: 0, type: "opaqueredirect", body }));
    await expect(directProviderFetch("https://api.openai.com/v1/x")).rejects.toBeInstanceOf(
      ProviderRedirectError,
    );
    expect(body.cancel).toHaveBeenCalledOnce();
  });

  it("refuses a response flagged redirected even at a 2xx status", async () => {
    mocks.fetch.mockResolvedValue(fakeResponse({ status: 200, redirected: true }));
    await expect(directProviderFetch("https://api.openai.com/v1/x")).rejects.toBeInstanceOf(
      ProviderRedirectError,
    );
  });

  it("tolerates a redirect response with no body", async () => {
    mocks.fetch.mockResolvedValue(fakeResponse({ status: 307, body: null }));
    await expect(directProviderFetch("https://api.openai.com/v1/x")).rejects.toBeInstanceOf(
      ProviderRedirectError,
    );
  });

  it("never forwards the credential to the redirect target and leaks nothing", async () => {
    mocks.fetch.mockResolvedValue(fakeResponse({ status: 302 }));
    let thrown: unknown;
    try {
      await directProviderFetch("https://api.openai.com/v1/x", {
        headers: { authorization: `Bearer ${BODY_SECRET}` },
      });
    } catch (e) {
      thrown = e;
    }
    // One request only — no second, credentialed request to Location.
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/x");
    // The error exposes neither the Location nor any credential/body content.
    const text = `${(thrown as Error).name}: ${(thrown as Error).message}`;
    expect(text).not.toContain(EVIL_LOCATION);
    expect(text).not.toContain(BODY_SECRET);
  });
});

describe("directProviderFetch — policy and pass-through", () => {
  it("forces redirect:'manual' and a caller cannot override the policy", async () => {
    mocks.fetch.mockResolvedValue(fakeResponse({ status: 200 }));
    await directProviderFetch("https://api.openai.com/v1/x", {
      redirect: "follow",
      method: "POST",
    });
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ redirect: "manual", method: "POST" });
  });

  it("passes a non-redirect response straight through without cancelling its body", async () => {
    const body = { cancel: vi.fn().mockResolvedValue(undefined) };
    const ok = fakeResponse({ status: 200, body });
    mocks.fetch.mockResolvedValue(ok);
    const result = await directProviderFetch("https://api.openai.com/v1/x");
    expect(result).toBe(ok);
    expect(body.cancel).not.toHaveBeenCalled();
  });

  it("preserves caller init (headers, body, signal) except the redirect policy", async () => {
    mocks.fetch.mockResolvedValue(fakeResponse({ status: 200 }));
    const signal = new AbortController().signal;
    await directProviderFetch("https://api.openai.com/v1/x", {
      method: "POST",
      headers: { authorization: "Bearer synthetic" },
      body: "{}",
      signal,
    });
    const init = mocks.fetch.mock.calls[0][1] as RequestInit;
    expect(init).toMatchObject({ method: "POST", body: "{}", redirect: "manual" });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer synthetic");
    expect(init.signal).toBe(signal);
  });
});
