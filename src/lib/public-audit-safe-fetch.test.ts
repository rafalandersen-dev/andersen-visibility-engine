import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "./safe-fetch";

const originalMode = process.env.MILO_OUTBOUND_FETCH_MODE;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalMode === undefined) delete process.env.MILO_OUTBOUND_FETCH_MODE;
  else process.env.MILO_OUTBOUND_FETCH_MODE = originalMode;
});

describe("public audit safe-fetch adversarial cases", () => {
  it("rejects non-default ports before opening a connection", async () => {
    process.env.MILO_OUTBOUND_FETCH_MODE = "workers";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(safeFetch("https://example.com:22", { maxBytes: 100 })).resolves.toEqual({
      ok: false,
      reason: "blocked",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates a redirect target and never connects to metadata", async () => {
    process.env.MILO_OUTBOUND_FETCH_MODE = "workers";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
      );

    await expect(safeFetch("https://example.com", { maxBytes: 100 })).resolves.toEqual({
      ok: false,
      reason: "blocked",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops at the redirect-count boundary", async () => {
    process.env.MILO_OUTBOUND_FETCH_MODE = "workers";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const n = Number(url.searchParams.get("n") ?? "0");
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/?n=${n + 1}` },
      });
    });

    await expect(
      safeFetch("https://example.com/?n=0", { maxRedirects: 2, maxBytes: 100 }),
    ).resolves.toEqual({ ok: false, reason: "too_many_redirects" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("caps an oversized response body", async () => {
    process.env.MILO_OUTBOUND_FETCH_MODE = "workers";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("abcdefghijklmnopqrstuvwxyz", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await safeFetch("https://example.com", { maxBytes: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toBe("abcdefghij");
  });

  it("aborts a slow response", async () => {
    process.env.MILO_OUTBOUND_FETCH_MODE = "workers";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    await expect(
      safeFetch("https://example.com", { timeoutMs: 5, maxBytes: 100 }),
    ).resolves.toEqual({ ok: false, reason: "timeout" });
  });
});
