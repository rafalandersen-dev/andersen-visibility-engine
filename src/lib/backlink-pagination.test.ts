import { expect, it } from "vitest";
import { backlinkDetailPayload } from "./backlink-details";
import {
  backlinkPagePayload,
  normalizeBacklinkPage,
  type BacklinkContinuation,
} from "./backlink-pagination";
const observed = "2026-09-12T00:00:00Z";
const scope = {
  target: "example.test",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-10",
  includeSubdomains: false,
  selection: "first_seen" as const,
  limit: 100,
  offset: 20000,
};
function fixture(
  continuation: BacklinkContinuation | null = null,
  nextToken: string | null = "opaque/first+=",
) {
  return {
    status_code: 20000,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: "fixture",
        status_code: 20000,
        cost: 0.024036,
        result_count: 1,
        data: backlinkPagePayload(scope, continuation, new Date(observed)),
        result: [
          {
            target: scope.target,
            mode: "as_is",
            total_count: 50000,
            items_count: 1,
            search_after_token: nextToken,
            items: [
              {
                type: "backlink",
                url_from: "https://source.test/page",
                domain_from: "source.test",
                url_to: "https://example.test/target",
                domain_to: "example.test",
                first_seen: "2026-09-01 10:00:00 +00:00",
              },
            ],
          },
        ],
      },
    ],
  };
}
const previous = () => normalizeBacklinkPage(fixture(), scope, observed).continuation!;
it("continues beyond the original offset while retaining every other payload parameter", () => {
  const cursor = previous();
  expect(cursor).toMatchObject({ priorReturnedCount: 1, pageNumber: 2 });
  const payload = backlinkPagePayload(scope, cursor, new Date(observed));
  expect(payload).toEqual({
    ...backlinkDetailPayload(scope, new Date(observed)),
    search_after_token: "opaque/first+=",
  });
  const next = normalizeBacklinkPage(fixture(cursor, "opaque/second+="), scope, observed, cursor);
  expect(next.page).toEqual({
    pageNumber: 2,
    returnedInChain: 2,
    initialOffset: 20000,
    pageLimitReached: false,
  });
  expect(next.continuation).toMatchObject({
    pageNumber: 3,
    priorReturnedCount: 2,
    token: "opaque/second+=",
  });
  expect(next.observation.providerReportedCostUsd).toBe(0.024036);
});
it.each(["target", "dateFrom", "dateTo", "includeSubdomains", "selection", "limit", "offset"])(
  "refuses a changed continuation scope %s",
  (key) => {
    const cursor = previous();
    const altered = {
      ...scope,
      [key]:
        key === "includeSubdomains"
          ? true
          : key === "limit"
            ? 99
            : key === "offset"
              ? 0
              : key === "selection"
                ? "lost_last_seen"
                : key === "target"
                  ? "other.test"
                  : "2026-09-02",
    };
    expect(() =>
      backlinkPagePayload(altered as typeof scope, cursor, new Date(observed)),
    ).toThrow();
  },
);
it("rejects a missing or mismatched echoed continuation token", () => {
  const cursor = previous();
  const raw = fixture(cursor, "next");
  Object.assign(raw.tasks[0].data, { search_after_token: "wrong" });
  expect(() => normalizeBacklinkPage(raw, scope, observed, cursor)).toThrow("echo_mismatch");
  expect(() => normalizeBacklinkPage(fixture(cursor, "next"), scope, observed)).toThrow(
    "echo_mismatch",
  );
});
it("rejects repeated cursors and empty pages that claim progress", () => {
  const cursor = previous();
  expect(() =>
    normalizeBacklinkPage(fixture(cursor, cursor.token), scope, observed, cursor),
  ).toThrow("did_not_advance");
  const raw = fixture(cursor, "next");
  raw.tasks[0].result[0].items = [];
  raw.tasks[0].result[0].items_count = 0;
  expect(() => normalizeBacklinkPage(raw, scope, observed, cursor)).toThrow("did_not_advance");
});
it("keeps missing continuation distinct from a complete web inventory", () => {
  const next = normalizeBacklinkPage(fixture(null, null), scope, observed);
  expect(next.continuation).toBeNull();
  expect(next.observation.moreProviderResults).toBe(true);
  expect(next.observation.coverage).toBe("representative_links_from_referring_pages");
});
it("bounds token bytes and chain length explicitly", () => {
  expect(() => normalizeBacklinkPage(fixture(null, "é".repeat(5000)), scope, observed)).toThrow();
  const cursor = { ...previous(), pageNumber: 10000 };
  const next = normalizeBacklinkPage(fixture(cursor, "next"), scope, observed, cursor);
  expect(next.page.pageLimitReached).toBe(true);
  expect(next.continuation).toBeNull();
  expect(next.observation.moreProviderResults).toBe(true);
});
it("never turns cumulative row counts into a unique backlink count", () => {
  const cursor = previous();
  const next = normalizeBacklinkPage(fixture(cursor, "next"), scope, observed, cursor);
  expect(next.page.returnedInChain).toBe(2);
  expect(next.observation.retainedCount).toBe(1);
  expect(next.observation.links[0].actualPlacedAt).toBeNull();
});
