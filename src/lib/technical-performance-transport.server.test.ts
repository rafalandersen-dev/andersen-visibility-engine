import { describe, expect, it, vi } from "vitest";
import {
  fetchTechnicalPerformance,
  type PerformanceQuery,
} from "./technical-performance-transport.server";
const url = "https://example.com/article?edition=2";
const query: PerformanceQuery = { source: "crux", url, scope: "url", device: "PHONE" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const crux = { record: { key: { url, formFactor: "PHONE" }, metrics: {} } };
describe("bounded performance provider transport", () => {
  it("sends an exact page/device lookup to the fixed CrUX endpoint without fallback", async () => {
    const request = vi.fn().mockResolvedValue(json(crux));
    const observation = await fetchTechnicalPerformance(query, "fixture-key", request);
    const [endpoint, init] = request.mock.calls[0];
    expect(new URL(endpoint).origin).toBe("https://chromeuxreport.googleapis.com");
    expect(new URL(endpoint).pathname).toBe("/v1/records:queryRecord");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init.body)).toEqual({
      url,
      formFactor: "PHONE",
      metrics: ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"],
    });
    expect(observation).toMatchObject({
      evidenceKind: "field",
      identityMatches: true,
      availability: "partial",
    });
    expect(JSON.stringify(observation)).not.toContain("fixture-key");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("requests origin and all-device aggregation only when explicitly selected", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(json({ record: { key: { origin: "https://example.com" }, metrics: {} } }));
    const result = await fetchTechnicalPerformance(
      { ...query, scope: "origin", device: "ALL" },
      "fixture",
      request,
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      origin: "https://example.com",
    });
    expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty("formFactor");
    expect(result).toMatchObject({ requestedScope: "origin", identityMatches: true });
  });
  it("requests a separate PageSpeed lab run and never calls the customer's URL", async () => {
    const request = vi.fn().mockResolvedValue(
      json({
        lighthouseResult: {
          requestedUrl: url,
          finalUrl: url,
          configSettings: { formFactor: "mobile" },
          audits: {},
        },
      }),
    );
    const result = await fetchTechnicalPerformance(
      { source: "pagespeed", url, device: "mobile" },
      "fixture",
      request,
    );
    const endpoint = new URL(request.mock.calls[0][0]);
    expect(endpoint.origin).toBe("https://www.googleapis.com");
    expect(endpoint.pathname).toBe("/pagespeedonline/v5/runPagespeed");
    expect(endpoint.searchParams.get("url")).toBe(url);
    expect(endpoint.searchParams.get("strategy")).toBe("mobile");
    expect(endpoint.searchParams.get("category")).toBe("performance");
    expect(request.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(result).toMatchObject({ evidenceKind: "lab", performanceScore: null });
  });
  it("records verified missing CrUX data without retrying or converting it to zero", async () => {
    const request = vi.fn().mockResolvedValue(json({ error: { status: "NOT_FOUND" } }, 404));
    const result = await fetchTechnicalPerformance(query, "fixture", request);
    expect(result).toMatchObject({
      availability: "unavailable",
      assessment: "unknown",
      metrics: { lcp: { p75: null } },
    });
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(json({ error: { status: "OTHER" } }, 404));
    await expect(fetchTechnicalPerformance(query, "fixture", request)).rejects.toThrow(
      "performance_unavailable",
    );
  });
  it.each([
    [401, "access"],
    [403, "access"],
    [429, "quota"],
    [500, "unavailable"],
    [302, "unavailable"],
  ])("sanitizes HTTP %s without a retry", async (status, suffix) => {
    const request = vi
      .fn()
      .mockResolvedValue(json({ private: "provider-private-detail" }, Number(status)));
    await expect(fetchTechnicalPerformance(query, "fixture-key", request)).rejects.toThrow(
      `performance_${suffix}`,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds declared and streamed bytes and refuses non-JSON or invalid envelopes", async () => {
    for (const response of [
      new Response("{}", {
        headers: { "content-type": "application/json", "content-length": "4194305" },
      }),
      new Response("x".repeat(4194305), { headers: { "content-type": "application/json" } }),
      new Response("{}", { headers: { "content-type": "text/html" } }),
      json({}),
      json([]),
      json({ record: [] }),
    ]) {
      await expect(
        fetchTechnicalPerformance(query, "fixture", vi.fn().mockResolvedValue(response)),
      ).rejects.toThrow("performance_unavailable");
    }
  });
  it("terminates a stalled body even if the transport ignores its abort signal", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const request = vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-type": "application/json" },
        }),
      );
      const work = fetchTechnicalPerformance(query, "fixture", request);
      const assertion = expect(work).rejects.toThrow("performance_unavailable");
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
      expect(cancel).toHaveBeenCalled();
      expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("refuses invalid targets and missing configuration before dispatch", async () => {
    const request = vi.fn();
    await expect(
      fetchTechnicalPerformance(
        { ...query, url: "https://user:pass@example.com" },
        "fixture",
        request,
      ),
    ).rejects.toThrow("performance_scope");
    await expect(fetchTechnicalPerformance(query, "", request)).rejects.toThrow(
      "performance_configuration",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
