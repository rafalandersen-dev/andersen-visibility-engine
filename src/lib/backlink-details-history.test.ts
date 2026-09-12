import { expect, it } from "vitest";
import { savedBacklinkDetails, projectBacklinkDetailsHistory } from "./backlink-details-history";
const user = "00000000-0000-4000-8000-000000000001";
const fixture = () => ({
  source: "dataforseo_index",
  scope: {
    target: "example.test",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-10",
    includeSubdomains: false,
    selection: "first_seen",
    limit: 100,
    offset: 0,
  },
  observedAt: "2026-09-11T00:00:00Z",
  providerTaskId: "fixture",
  providerReportedCostUsd: 0.024,
  providerTotalCount: 1,
  providerReturnedCount: 1,
  retainedCount: 1,
  retainedTruncated: false,
  moreProviderResults: false,
  coverage: "representative_links_from_referring_pages",
  links: [
    {
      sourceUrl: "https://source.test/",
      targetUrl: "https://example.test/a",
      firstSeenAt: "2026-09-01T00:00:00Z",
      previousSeenAt: null,
      lastSeenAt: "2026-09-02T00:00:00Z",
      providerNew: null,
      providerLost: false,
      actualPlacedAt: null,
      actualRemovedAt: null,
      dofollow: null,
      anchor: null,
      anchorTruncated: false,
      rank: 0,
      spamScore: null,
      linksOnReferringPage: 1,
    },
  ],
});
const row = () => ({
  user_id: user,
  project_id: "p",
  request_id: user,
  scope: fixture().scope,
  status: "succeeded",
  accounting_state: "pending",
  created_at: "2026-09-11T00:00:00Z",
  observation: fixture(),
  lease_token: "private",
  lease_until: "private",
});
it("preserves zero/null and strips operational secrets from project history", () => {
  const value = projectBacklinkDetailsHistory([row()], user, "p")[0];
  expect(value.observation?.links[0]).toMatchObject({
    rank: 0,
    spamScore: null,
    actualPlacedAt: null,
  });
  expect(JSON.stringify(value)).not.toContain("private");
});
it.each(["scope", "owner", "project", "status"])("refuses mismatched history %s", (kind) => {
  const r = row();
  if (kind === "scope") r.scope = { ...r.scope, includeSubdomains: true };
  if (kind === "owner") r.user_id = "00000000-0000-4000-8000-000000000002";
  if (kind === "project") r.project_id = "other";
  if (kind === "status") r.status = "unknown";
  expect(() => projectBacklinkDetailsHistory([r], user, "p")).toThrow();
});
it.each([
  "host",
  "credentials",
  "scheme",
  "future",
  "chronology",
  "selection",
  "count",
  "truncation",
  "inventedDate",
  "duplicate",
  "anchor",
])("refuses corrupted stored evidence: %s", (kind) => {
  const f = fixture();
  if (kind === "host") f.links[0].targetUrl = "https://example.test.evil.test/";
  if (kind === "credentials") f.links[0].sourceUrl = "https://secret@source.test/";
  if (kind === "scheme") f.links[0].sourceUrl = "javascript:alert(1)";
  if (kind === "future") f.links[0].lastSeenAt = "2026-09-12T00:00:00Z";
  if (kind === "chronology") f.links[0].lastSeenAt = "2026-08-01T00:00:00Z";
  if (kind === "selection") f.scope.selection = "lost_last_seen";
  if (kind === "count") f.retainedCount = 0;
  if (kind === "truncation") f.retainedTruncated = true;
  if (kind === "inventedDate")
    Object.assign(f.links[0], { actualRemovedAt: "2026-09-02T00:00:00Z" });
  if (kind === "duplicate") {
    f.links.push({ ...f.links[0] });
    f.retainedCount = 2;
    f.providerReturnedCount = 2;
    f.providerTotalCount = 2;
  }
  if (kind === "anchor") f.links[0].anchorTruncated = true;
  expect(() => savedBacklinkDetails(f)).toThrow();
});
it("accepts explicitly incomplete retained results without claiming complete coverage", () => {
  const f = fixture();
  f.providerReturnedCount = 2;
  f.providerTotalCount = 4;
  f.retainedTruncated = true;
  f.moreProviderResults = true;
  expect(savedBacklinkDetails(f).retainedCount).toBe(1);
});
it("rejects more than twenty history records", () =>
  expect(() =>
    projectBacklinkDetailsHistory(Array.from({ length: 21 }, row), user, "p"),
  ).toThrow());

const pageInfo = () => ({
  parentRequestId: null as string | null,
  pageNumber: 1,
  priorReturnedCount: 0,
  childRequestId: null as string | null,
  canContinue: false,
});
it("reads legacy rows without continuation metadata", () => {
  expect(projectBacklinkDetailsHistory([row()], user, "p")[0].pageInfo).toBeNull();
});
it("accepts the last continuation page using cumulative observed rows", () => {
  const r = {
    ...row(),
    accounting_state: "settled",
    pageInfo: {
      ...pageInfo(),
      parentRequestId: "00000000-0000-4000-8000-000000000002",
      pageNumber: 2,
      priorReturnedCount: 100,
    },
  };
  r.observation.providerTotalCount = 101;
  expect(projectBacklinkDetailsHistory([r], user, "p")[0].observation?.moreProviderResults).toBe(
    false,
  );
  expect(() => savedBacklinkDetails(r.observation)).toThrow();
});
it.each([
  "rootCount",
  "rootNumber",
  "childCount",
  "selfParent",
  "selfChild",
  "unsettled",
  "alreadyRequested",
  "pageLimit",
  "zeroRows",
  "missingMore",
  "cursor",
])("rejects inconsistent page history: %s", (kind) => {
  const r = { ...row(), accounting_state: "settled", pageInfo: pageInfo() };
  if (kind === "rootCount") r.pageInfo.priorReturnedCount = 1;
  if (kind === "rootNumber") r.pageInfo.pageNumber = 2;
  if (kind === "childCount") {
    r.pageInfo.parentRequestId = "00000000-0000-4000-8000-000000000002";
    r.pageInfo.pageNumber = 2;
  }
  if (kind === "selfParent") r.pageInfo.parentRequestId = user;
  if (kind === "selfChild") r.pageInfo.childRequestId = user;
  if (["unsettled", "alreadyRequested", "pageLimit", "zeroRows", "missingMore"].includes(kind)) {
    r.pageInfo.canContinue = true;
    r.observation.moreProviderResults = true;
  }
  if (kind === "unsettled") r.accounting_state = "pending";
  if (kind === "alreadyRequested")
    r.pageInfo.childRequestId = "00000000-0000-4000-8000-000000000002";
  if (kind === "pageLimit") {
    r.pageInfo.pageNumber = 10000;
    r.pageInfo.parentRequestId = "00000000-0000-4000-8000-000000000002";
    r.pageInfo.priorReturnedCount = 10000;
  }
  if (kind === "zeroRows") {
    r.observation.providerReturnedCount = 0;
    r.observation.retainedCount = 0;
    r.observation.links = [];
  }
  if (kind === "missingMore") r.observation.moreProviderResults = false;
  if (kind === "cursor") Object.assign(r.pageInfo, { requestCursor: "private" });
  expect(() => projectBacklinkDetailsHistory([r], user, "p")).toThrow();
});
