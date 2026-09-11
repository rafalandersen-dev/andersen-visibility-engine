import { expect, it } from "vitest";
import {
  backlinkDetailPayload,
  detailScope,
  normalizeBacklinkDetails,
  type BacklinkDetailScope,
} from "./backlink-details";
const observed = "2026-09-11T12:00:00Z";
const scope: BacklinkDetailScope = {
  target: "www.example.test",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-10",
  includeSubdomains: false,
  selection: "first_seen",
  limit: 100,
  offset: 0,
};
const link = () => ({
  type: "backlink",
  url_from: "https://source.test/page",
  domain_from: "source.test",
  url_to: "https://www.example.test/article",
  domain_to: "www.example.test",
  first_seen: "2026-09-01 10:00:00 +00:00",
  prev_seen: "2026-09-02 10:00:00 +00:00",
  last_seen: "2026-09-03 10:00:00 +00:00",
  is_new: false,
  is_lost: true,
  dofollow: true,
  anchor: null,
  rank: 0,
  backlink_spam_score: null,
  links_count: 2,
});
function fixture(next = scope) {
  return {
    status_code: 20000,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: "fixture",
        status_code: 20000,
        cost: 0.024,
        result_count: 1,
        data: backlinkDetailPayload(next, new Date(observed)),
        result: [
          {
            target: "example.test",
            mode: "as_is",
            total_count: 10,
            items_count: 1,
            items: [link()],
          },
        ],
      },
    ],
  };
}
it("retains exact www destination while using documented provider target syntax", () => {
  const p = backlinkDetailPayload(scope, new Date(observed));
  expect(p.target).toBe("example.test");
  expect(p.include_subdomains).toBe(true);
  expect(p.filters[0]).toEqual(["domain_to", "=", "www.example.test"]);
  const r = normalizeBacklinkDetails(fixture(), scope, observed);
  expect(r.moreProviderResults).toBe(true);
  expect(r.links[0]).toMatchObject({
    targetUrl: "https://www.example.test/article",
    providerLost: true,
    actualRemovedAt: null,
    actualPlacedAt: null,
    rank: 0,
    spamScore: null,
  });
});
it("labels lost selection by last-seen evidence without inventing a removal timestamp", () => {
  const next = { ...scope, selection: "lost_last_seen" as const };
  const r = normalizeBacklinkDetails(fixture(next), next, observed);
  expect(r.links[0].lastSeenAt).toBe("2026-09-03T10:00:00Z");
  expect(r.links[0].actualRemovedAt).toBeNull();
  expect(backlinkDetailPayload(next, new Date(observed)).backlinks_status_type).toBe("lost");
});
it.each(["include_subdomains", "target", "filters", "limit", "mode", "backlinks_status_type"])(
  "rejects mismatched request echo %s",
  (key) => {
    const f = fixture();
    (f.tasks[0].data as Record<string, unknown>)[key] = "changed";
    expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow("scope_mismatch");
  },
);
it.each([
  "example.test",
  "evilwww.example.test",
  "www.example.test.evil.test",
  "sub.www.example.test",
])("rejects an out-of-scope destination %s", (host) => {
  const f = fixture();
  f.tasks[0].result[0].items[0].url_to = `https://${host}/`;
  f.tasks[0].result[0].items[0].domain_to = host;
  expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow("destination_mismatch");
});
it("includes genuine subdomains only when requested", () => {
  const next = { ...scope, includeSubdomains: true };
  const f = fixture(next);
  f.tasks[0].result[0].items[0].url_to = "https://sub.www.example.test/";
  f.tasks[0].result[0].items[0].domain_to = "sub.www.example.test";
  expect(normalizeBacklinkDetails(f, next, observed).links).toHaveLength(1);
});
it.each(["2026-02-30 10:00:00 +00:00", "2026-08-31 10:00:00 +00:00", "2026-09-12 10:00:00 +00:00"])(
  "rejects impossible or out-of-range selected dates %s",
  (date) => {
    const f = fixture();
    f.tasks[0].result[0].items[0].first_seen = date;
    expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow();
  },
);
it("rejects a live row in a lost selection", () => {
  const next = { ...scope, selection: "lost_last_seen" as const };
  const f = fixture(next);
  f.tasks[0].result[0].items[0].is_lost = false;
  expect(() => normalizeBacklinkDetails(f, next, observed)).toThrow("date_mismatch");
});
it("rejects duplicate evidence and inconsistent counts", () => {
  const f = fixture();
  f.tasks[0].result[0].items.push(link());
  expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow("result_mismatch");
  f.tasks[0].result[0].items_count = 2;
  expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow("duplicate");
});
it("bounds retained URL evidence and explicitly reports omissions", () => {
  const f = fixture();
  const row = f.tasks[0].result[0];
  row.items = Array.from({ length: 100 }, (_, i) => ({
    ...link(),
    url_from: `https://source.test/${i}/` + "a".repeat(4000),
  }));
  row.total_count = 100;
  row.items_count = 100;
  const r = normalizeBacklinkDetails(f, scope, observed);
  expect(r.retainedTruncated).toBe(true);
  expect(r.retainedCount).toBeLessThan(100);
  expect(r.providerReturnedCount).toBe(100);
  expect(new TextEncoder().encode(JSON.stringify(r)).length).toBeLessThan(270000);
});
it.each([0, 101])("refuses unsupported detail limits %s", (limit) => {
  expect(() => detailScope({ ...scope, limit }, new Date(observed))).toThrow();
});
it("rejects credentials and non-http link URLs", () => {
  const f = fixture();
  f.tasks[0].result[0].items[0].url_from = "https://name:password@source.test/";
  expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow();
});

it("binds a later page and computes remaining results after its offset", () => {
  const next = { ...scope, offset: 9 };
  const f = fixture(next);
  expect(backlinkDetailPayload(next, new Date(observed)).offset).toBe(9);
  expect(normalizeBacklinkDetails(f, next, observed).moreProviderResults).toBe(false);
  f.tasks[0].data.offset = 0;
  expect(() => normalizeBacklinkDetails(f, next, observed)).toThrow("scope_mismatch");
});
it.each([-1, 20001, 1.5])("refuses unsupported page offset %s", (offset) =>
  expect(() => backlinkDetailPayload({ ...scope, offset }, new Date(observed))).toThrow(),
);
it("rejects a later-page count inconsistent with total matching results", () => {
  const next = { ...scope, offset: 10 };
  expect(() => normalizeBacklinkDetails(fixture(next), next, observed)).toThrow("result_mismatch");
});

it.each(["first_seen", "lost_last_seen"] as const)(
  "uses deterministic URL tie-breakers for %s pagination",
  (selection) => {
    const first = backlinkDetailPayload({ ...scope, selection, offset: 0 }, new Date(observed));
    const next = backlinkDetailPayload({ ...scope, selection, offset: 100 }, new Date(observed));
    expect(first.order_by).toEqual([
      selection === "first_seen" ? "first_seen,desc" : "last_seen,desc",
      "url_from,asc",
      "url_to,asc",
    ]);
    expect(next.order_by).toEqual(first.order_by);
  },
);
it("rejects provider echo that omits deterministic pagination tie-breakers", () => {
  const f = fixture();
  f.tasks[0].data.order_by = ["first_seen,desc"];
  expect(() => normalizeBacklinkDetails(f, scope, observed)).toThrow("scope_mismatch");
});
