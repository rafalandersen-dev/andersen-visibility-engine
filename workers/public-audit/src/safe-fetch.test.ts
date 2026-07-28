import { describe, expect, it, vi } from "vitest";
import { isSafePublicUrl, safeFetch } from "./safe-fetch";

describe("Worker outbound fetch", () => {
  it.each([
    "http://127.0.0.1",
    "http://2130706433",
    "http://0177.0.0.1",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.0.1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[fe80::1]",
    "http://[fc00::1]",
    "https://example.com:444",
    "https://user:password@example.com",
    "file:///etc/passwd",
  ])("blocks %s", (url) => {
    expect(isSafePublicUrl(url)).toBe(false);
  });

  it("revalidates every redirect and never connects to metadata", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        }),
    ) as typeof fetch;
    await expect(safeFetch("https://example.com", fetchImpl)).resolves.toEqual({
      ok: false,
      reason: "blocked",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-HTML and oversized bodies", async () => {
    const nonHtml = vi.fn(async () => Response.json({ okay: true })) as typeof fetch;
    await expect(safeFetch("https://example.com", nonHtml)).resolves.toEqual({
      ok: false,
      reason: "blocked",
    });

    const oversized = vi.fn(
      async () =>
        new Response("x", {
          headers: {
            "content-type": "text/html",
            "content-length": "300001",
          },
        }),
    ) as typeof fetch;
    await expect(safeFetch("https://example.com", oversized)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("does not forward user cookies, authorization or platform secrets", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has("cookie")).toBe(false);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("apikey")).toBe(false);
      return new Response("<h1>Safe</h1>", {
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;
    await expect(safeFetch("https://example.com", fetchImpl)).resolves.toEqual({
      ok: true,
      contentType: "text/html",
      body: "<h1>Safe</h1>",
    });
  });
});
