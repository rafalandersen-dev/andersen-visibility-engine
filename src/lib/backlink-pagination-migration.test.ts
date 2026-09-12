import { runBacklinkDetails } from "./backlink-details-lifecycle.server";
import { readBacklinkDetailsHistory } from "./backlink-details-history.server";
import { fetchBacklinkPage } from "./backlink-details-transport.server";
import type { TeamReadRpc } from "./project-team-read.server";
import { vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  root = "00000000-0000-4000-8000-000000000003",
  child = "00000000-0000-4000-8000-000000000004",
  third = "00000000-0000-4000-8000-000000000005";
const scope = {
  target: "example.com",
  dateFrom: "2026-09-01",
  dateTo: "2026-09-01",
  includeSubdomains: false,
  selection: "first_seen" as const,
  limit: 100,
  offset: 20000,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);INSERT INTO auth.users(id) VALUES('${owner}'),('${other}');CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint);INSERT INTO workspace_meta VALUES('${owner}',1),('${other}',1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb,PRIMARY KEY(user_id,collection,entity_id));INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"websiteUrl":"https://example.com"}'),('${other}','projects','p','{"websiteUrl":"https://example.com"}');`,
  );
  for (const file of [
    "20260907140000_ai_expense_reservations.sql",
    "20260908210000_restricted_ai_expense_permits.sql",
    "20260911170000_backlink_monitoring_requests.sql",
    "20260911180000_backlink_detail_requests.sql",
    "20260912000000_backlink_detail_pages.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE;TRUNCATE backlink_detail_pages,backlink_details_requests,backlink_monitoring_limits,ai_expense_requests,ai_expense_budgets,ai_expense_permits;UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;UPDATE workspace_entities SET data='{"websiteUrl":"https://example.com"}';`,
  );
});
afterAll(async () => await db?.close());
async function reserve(
  id = root,
  parent: string | null = null,
  who = owner,
  next: unknown = parent ? null : scope,
) {
  return (
    await db.query<{
      result: {
        claimed: boolean;
        record: { lease_token?: string; scope: unknown };
        page?: { requestCursor: string | null; pageNumber: number; priorReturnedCount: number };
      };
    }>("SELECT reserve_backlink_page($1,'p',$2,'https://example.com',$3,$4) result", [
      who,
      id,
      next,
      parent,
    ])
  ).rows[0].result;
}
const fund = () =>
  db.query(
    "INSERT INTO ai_expense_budgets(scope,period,cap_microusd) VALUES('global',to_char(now(),'YYYY-MM'),1000000),($1,to_char(now(),'YYYY-MM'),1000000)",
    ["user:" + owner],
  );
const dispatch = (id: string, lease: string) =>
  db.query<{ ok: boolean }>("SELECT authorize_backlink_page_dispatch($1,'p',$2,$3) ok", [
    owner,
    id,
    lease,
  ]);
const observation = () => ({
  source: "dataforseo_index",
  scope,
  observedAt: new Date().toISOString(),
  providerTaskId: "fixture",
  providerReportedCostUsd: 0.024036,
  providerReturnedCount: 1,
  links: [],
});
const finish = (
  id: string,
  lease: string,
  next: string | null = "private-next",
  value: unknown = observation(),
) =>
  db.query<{ ok: boolean }>("SELECT finish_backlink_page($1,'p',$2,$3,$4,$5) ok", [
    owner,
    id,
    lease,
    value,
    next,
  ]);
const history = async () =>
  (
    await db.query<{
      result: Array<{
        request_id: string;
        pageInfo: {
          parentRequestId: string | null;
          pageNumber: number;
          priorReturnedCount: number;
          childRequestId: string | null;
          canContinue: boolean;
        } | null;
      }>;
    }>("SELECT list_backlink_pages($1,'p') result", [owner])
  ).rows[0].result;
async function completeRoot() {
  await fund();
  const r = await reserve();
  await dispatch(root, r.record.lease_token!);
  await finish(root, r.record.lease_token!);
  return r;
}

it("binds the next page to an immutable settled parent and reuses the existing expense admission", async () => {
  await completeRoot();
  expect((await history())[0].pageInfo?.canContinue).toBe(true);
  const r = await reserve(child, root);
  expect(r.record.scope).toEqual(scope);
  expect(r.page).toMatchObject({
    requestCursor: "private-next",
    pageNumber: 2,
    priorReturnedCount: 1,
  });
  expect((await dispatch(child, r.record.lease_token!)).rows[0].ok).toBe(true);
  expect(
    (
      await db.query(
        "SELECT reserved_microusd,operation FROM ai_expense_requests ORDER BY request_id",
      )
    ).rows,
  ).toEqual([
    { reserved_microusd: 27600, operation: "backlink_details" },
    { reserved_microusd: 27600, operation: "backlink_details" },
  ]);
  expect((await finish(child, r.record.lease_token!, "private-third")).rows[0].ok).toBe(true);
  const rows = await history();
  expect(rows.find((v) => v.request_id === child)?.pageInfo).toMatchObject({
    parentRequestId: root,
    pageNumber: 2,
    priorReturnedCount: 1,
    canContinue: true,
  });
  expect(rows.find((v) => v.request_id === root)?.pageInfo).toMatchObject({
    childRequestId: child,
    canContinue: false,
  });
  expect(JSON.stringify(rows)).not.toContain("private-next");
  expect(JSON.stringify(rows)).not.toContain("private-third");
});
it("permits only one child and makes exact replay free of new quota or cursor exposure", async () => {
  await completeRoot();
  await reserve(child, root);
  const before = (await db.query("SELECT requests FROM backlink_monitoring_limits ORDER BY scope"))
    .rows;
  const replay = await reserve(child, root);
  expect(replay.claimed).toBe(false);
  expect(replay.record).not.toHaveProperty("lease_token");
  expect(replay).not.toHaveProperty("page");
  await expect(reserve(third, root)).rejects.toThrow("backlink_page_already_requested");
  expect(
    (await db.query("SELECT requests FROM backlink_monitoring_limits ORDER BY scope")).rows,
  ).toEqual(before);
  await expect(reserve(child, null)).rejects.toThrow("backlink_page_replay");
});
it("rejects client scope substitution and foreign parents before admission", async () => {
  await completeRoot();
  const before = (await db.query("SELECT requests FROM backlink_monitoring_limits ORDER BY scope"))
    .rows;
  await expect(reserve(child, root, owner, { ...scope, offset: 0 })).rejects.toThrow(
    "backlink_page_scope",
  );
  await expect(reserve(child, root, other)).rejects.toThrow("backlink_page_unavailable");
  expect(
    (await db.query("SELECT requests FROM backlink_monitoring_limits ORDER BY scope")).rows,
  ).toEqual(before);
});
it.each(["website", "accounting", "unknown"])(
  "holds a continuation after parent %s changes",
  async (kind) => {
    await completeRoot();
    if (kind === "website")
      await db.exec(`UPDATE workspace_entities SET data='{"websiteUrl":"https://changed.test"}'`);
    if (kind === "accounting")
      await db.exec("UPDATE backlink_details_requests SET accounting_state='pending'");
    if (kind === "unknown") await db.exec("UPDATE backlink_details_requests SET status='unknown'");
    await expect(reserve(child, root)).rejects.toThrow();
    expect((await db.query("SELECT count(*)::int n FROM backlink_details_requests")).rows).toEqual([
      { n: 1 },
    ]);
  },
);
it("cannot dispatch a continuation without the existing money reservation gate", async () => {
  const r = await reserve();
  await expect(dispatch(root, r.record.lease_token!)).rejects.toThrow("backlink_details_expense");
  expect((await db.query("SELECT * FROM ai_expense_requests")).rows).toEqual([]);
  await fund();
  await db.exec("UPDATE ai_expense_budgets SET requires_permit=true");
  await expect(dispatch(root, r.record.lease_token!)).rejects.toThrow("backlink_details_expense");
});
it("rejects repeated/empty-progress cursors and cannot rewrite a completed cursor", async () => {
  await completeRoot();
  const r = await reserve(child, root);
  await dispatch(child, r.record.lease_token!);
  await expect(finish(child, r.record.lease_token!, "private-next")).rejects.toThrow(
    "backlink_page_result",
  );
  await expect(
    finish(child, r.record.lease_token!, "new", { ...observation(), providerReturnedCount: 0 }),
  ).rejects.toThrow("backlink_page_result");
  await finish(child, r.record.lease_token!, "private-third");
  expect((await finish(child, r.record.lease_token!, "overwrite")).rows[0].ok).toBe(false);
  expect(
    (await db.query("SELECT next_cursor FROM backlink_detail_pages WHERE request_id=$1", [child]))
      .rows,
  ).toEqual([{ next_cursor: "private-third" }]);
});
it("preserves old history without inventing continuation metadata", async () => {
  await db.query("SELECT reserve_backlink_details($1,'p',$2,'https://example.com',$3)", [
    owner,
    root,
    scope,
  ]);
  expect((await history())[0].pageInfo).toBeNull();
  await expect(reserve()).rejects.toThrow("backlink_page_replay");
});
it("does not expose private cursors through any direct client role", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT * FROM backlink_detail_pages")).rejects.toThrow(
      "permission denied",
    );
    if (role !== "service_role") await expect(history()).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  }
});

it("runs two authenticated pages through SQL admission, bounded transport and private history", async () => {
  await fund();
  const rpc: TeamReadRpc = async (name, args) => {
    try {
      const entries = Object.entries(args);
      const result = await db.query<{ value: unknown }>(
        `SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) value`,
        entries.map(([, value]) => value),
      );
      return { data: result.rows[0].value, error: null };
    } catch (error) {
      return { data: null, error: { message: String(error) } };
    }
  };
  const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const data = JSON.parse(String(init?.body))[0];
    const next = !data.search_after_token;
    return new Response(
      JSON.stringify({
        status_code: 20000,
        tasks_count: 1,
        tasks_error: 0,
        tasks: [
          {
            id: next ? "fixture-root" : "fixture-child",
            status_code: 20000,
            cost: 0.024036,
            result_count: 1,
            data,
            result: [
              {
                target: scope.target,
                mode: "as_is",
                total_count: 20002,
                items_count: 1,
                search_after_token: next ? "private-integration-cursor" : null,
                items: [
                  {
                    type: "backlink",
                    url_from: `https://source.test/${next ? "a" : "b"}`,
                    domain_from: "source.test",
                    url_to: "https://example.com/page",
                    domain_to: "example.com",
                    first_seen: "2026-09-01 12:00:00 +00:00",
                  },
                ],
              },
            ],
          },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  const deps = {
    rpc,
    credentials: () => ({ login: "fixture", password: "fixture-secret" }),
    fetch: (
      s: Parameters<typeof fetchBacklinkPage>[0],
      c: Parameters<typeof fetchBacklinkPage>[1],
      signal: AbortSignal,
      continuation: Parameters<typeof fetchBacklinkPage>[3],
    ) => fetchBacklinkPage(s, c, signal, continuation, request),
  };
  const { target: _target, ...filters } = scope;
  const first = {
    ...filters,
    projectId: "p",
    requestId: root,
    expectedWebsite: "https://example.com",
  };
  expect((await runBacklinkDetails(owner, first, deps)).state).toBe("stored");
  let saved = await readBacklinkDetailsHistory(owner, { projectId: "p" }, rpc);
  expect(saved[0].pageInfo?.canContinue).toBe(true);
  const second = {
    projectId: "p",
    requestId: child,
    parentRequestId: root,
    expectedWebsite: "https://example.com",
  };
  const result = await runBacklinkDetails(owner, second, deps);
  expect(result.state).toBe("stored");
  expect((await runBacklinkDetails(owner, second, deps)).state).toBe("existing");
  saved = await readBacklinkDetailsHistory(owner, { projectId: "p" }, rpc);
  const page = saved.find((r) => r.requestId === child)!;
  expect(page.observation?.moreProviderResults).toBe(false);
  expect(page.pageInfo).toEqual({
    parentRequestId: root,
    pageNumber: 2,
    priorReturnedCount: 1,
    childRequestId: null,
    canContinue: false,
  });
  expect(saved.find((r) => r.requestId === root)?.pageInfo?.childRequestId).toBe(child);
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))[0]).toMatchObject({
    offset: 20000,
    search_after_token: "private-integration-cursor",
  });
  expect(JSON.stringify({ saved, result })).not.toMatch(
    /private-integration-cursor|fixture-secret|lease_token/,
  );
  const expenses = (
    await db.query<{ count: number }>("SELECT count(*)::int count FROM ai_expense_requests")
  ).rows[0].count;
  expect(expenses).toBe(2);
});
