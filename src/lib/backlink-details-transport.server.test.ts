import { it, expect, vi } from "vitest";
import { fetchBacklinkDetails } from "./backlink-details-transport.server";
import { backlinkDetailPayload } from "./backlink-details";
const scope = {
  target: "example.com",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-01",
  includeSubdomains: false,
  selection: "first_seen" as const,
  limit: 100,
  offset: 0,
};
const credentials = { login: "fixture-login", password: "fixture-secret" };
const fixture = () => ({
  status_code: 20000,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [
    {
      id: "fixture-task",
      status_code: 20000,
      cost: 0.024,
      result_count: 1,
      data: backlinkDetailPayload(scope),
      result: [
        {
          target: scope.target,
          mode: "as_is",
          total_count: 0,
          items_count: 0,
          items: [],
        },
      ],
    },
  ],
});
it("sends one exact detail scope to the fixed endpoint and preserves supplier cost", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(fixture()), { headers: { "content-type": "application/json" } }),
    );
  const result = await fetchBacklinkDetails(
    scope,
    credentials,
    new AbortController().signal,
    request,
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    "https://api.dataforseo.com/v3/backlinks/backlinks/live",
    expect.objectContaining({
      method: "POST",
      redirect: "error",
      body: JSON.stringify([backlinkDetailPayload(scope)]),
    }),
  );
  expect(result.providerReportedCostUsd).toBe(0.024);
  expect(result.links).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("fixture-secret");
});
it.each([401, 403, 429, 500])(
  "does not retry or expose provider bodies on HTTP %i",
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("fixture-secret", { status }));
    await expect(
      fetchBacklinkDetails(scope, credentials, new AbortController().signal, request),
    ).rejects.toThrow("backlink_details_unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it("refuses invalid scope and prior cancellation before dispatch", async () => {
  const request = vi.fn<typeof fetch>();
  await expect(
    fetchBacklinkDetails(
      { ...scope, dateFrom: "2020-01-01" },
      credentials,
      new AbortController().signal,
      request,
    ),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetchBacklinkDetails(scope, credentials, controller.signal, request),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it.each(["oversize", "chunks", "utf8", "type", "scope"])(
  "refuses unusable evidence: %s",
  async (kind) => {
    let response: Response;
    if (kind === "chunks") {
      let chunks = 0;
      response = new Response(
        new ReadableStream({
          pull(c) {
            if (++chunks <= 4097) c.enqueue(new Uint8Array());
            else c.close();
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    } else {
      const raw = fixture();
      if (kind === "scope") raw.tasks[0].data.target = "other.test";
      response = new Response(
        kind === "oversize"
          ? "x".repeat(1048577)
          : kind === "utf8"
            ? new Uint8Array([255])
            : JSON.stringify(raw),
        { headers: { "content-type": kind === "type" ? "text/html" : "application/json" } },
      );
    }
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      fetchBacklinkDetails(scope, credentials, new AbortController().signal, request),
    ).rejects.toThrow("backlink_details_unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it("cancels a stalled response body and withholds a late result", async () => {
  const cancel = vi.fn();
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    }),
  );
  const controller = new AbortController();
  const pending = fetchBacklinkDetails(scope, credentials, controller.signal, request);
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toThrow("backlink_details_unavailable");
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("rejects blank credentials before any transport", async () => {
  const request = vi.fn<typeof fetch>();
  await expect(
    fetchBacklinkDetails(
      scope,
      { login: " ", password: "fixture" },
      new AbortController().signal,
      request,
    ),
  ).rejects.toThrow("backlink_details_unconfigured");
  expect(request).not.toHaveBeenCalled();
});
