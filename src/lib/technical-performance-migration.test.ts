import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { requestTechnicalPerformance } from "./technical-performance.server";
import { normalizeCrux, normalizeLighthouse } from "./technical-performance";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  id = "00000000-0000-4000-8000-000000000003",
  second = "00000000-0000-4000-8000-000000000004";
const url = "https://example.test/page?q=1";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz); INSERT INTO auth.users(id) VALUES('${owner}'),('${other}'); CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint); INSERT INTO workspace_meta VALUES('${owner}',1),('${other}',1); CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb,ord integer DEFAULT 0,PRIMARY KEY(user_id,collection,entity_id)); INSERT INTO workspace_entities VALUES('${owner}','projects','p','{"websiteUrl":"https://example.test"}',0),('${owner}','projects','q','{"websiteUrl":"https://example.test"}',0),('${other}','projects','p','{"websiteUrl":"https://other.test"}',0);`,
  );
  for (const file of [
    "20260909200000_project_knowledge.sql",
    "20260911110000_technical_crawls.sql",
    "20260911140000_technical_performance_requests.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    `RESET ROLE; TRUNCATE technical_performance_requests,technical_performance_provider_limits,technical_performance_account_limits; UPDATE auth.users SET deleted_at=NULL,banned_until=NULL; UPDATE workspace_entities SET data='{"websiteUrl":"https://example.test"}' WHERE user_id='${owner}';`,
  );
});
afterAll(async () => {
  await db?.close();
});
async function reserve(
  request = id,
  project = "p",
  user = owner,
  source = "crux",
  device = "PHONE",
) {
  return (
    await db.query<{
      result: { claimed: boolean; record: { lease_token: string; status: string } };
    }>(
      "SELECT reserve_technical_performance_request($1,$2,$3,'https://example.test','https://example.test',$4,$5,'url',$6) result",
      [user, project, request, url, source, device],
    )
  ).rows[0].result;
}
async function authorize(lease: string, request = id) {
  return (
    await db.query<{ result: boolean }>(
      "SELECT authorize_technical_performance_dispatch($1,'p',$2,$3) result",
      [owner, request, lease],
    )
  ).rows[0].result;
}
const observation = () =>
  normalizeCrux({}, { url, scope: "url", device: "PHONE", observedAt: new Date().toISOString() });
async function finish(lease: string, value: unknown = observation(), error: string | null = null) {
  return (
    await db.query<{ result: boolean }>(
      "SELECT finish_technical_performance_request($1,'p',$2,$3,$4,$5) result",
      [owner, id, lease, value, error],
    )
  ).rows[0].result;
}
it("admits each request once, refuses altered replays, and allows one active request across the owner's projects", async () => {
  expect((await reserve()).claimed).toBe(true);
  const retry = await reserve();
  expect(retry.claimed).toBe(false);
  expect(retry.record).not.toHaveProperty("lease_token");
  await expect(reserve(id, "p", owner, "pagespeed", "mobile")).rejects.toThrow(
    "performance_replay",
  );
  await expect(reserve(second, "q")).rejects.toThrow("performance_active");
});
it("requires dispatch and exact evidence source, URL, scope and device before durable success", async () => {
  const r = await reserve();
  await expect(finish(r.record.lease_token)).rejects.toThrow("performance_result_invalid");
  expect(await authorize(r.record.lease_token)).toBe(true);
  expect(await authorize(r.record.lease_token)).toBe(false);
  for (const patch of [
    { source: "pagespeed_lighthouse" },
    { requestedUrl: "https://example.test/other" },
    { requestedScope: "origin" },
    { device: "DESKTOP" },
    { evidenceKind: "lab" },
  ])
    await expect(finish(r.record.lease_token, { ...observation(), ...patch })).rejects.toThrow(
      "performance_result_invalid",
    );
  expect(await finish(r.record.lease_token)).toBe(true);
  expect(await finish(r.record.lease_token)).toBe(false);
});
it("holds changes to the canonical website before dispatch and after the provider returns", async () => {
  const r = await reserve();
  await db.exec(
    `UPDATE workspace_entities SET data='{"websiteUrl":"https://changed.test"}' WHERE user_id='${owner}' AND entity_id='p'`,
  );
  expect(await authorize(r.record.lease_token)).toBe(false);
  expect(
    (await db.query<{ status: string }>("SELECT status FROM technical_performance_requests"))
      .rows[0].status,
  ).toBe("held");
});
it("never reclaims an expired/unknown request or dispatches with insufficient lease time", async () => {
  const r = await reserve();
  await db.exec(
    "UPDATE technical_performance_requests SET lease_until=clock_timestamp()+interval '70 seconds'",
  );
  expect(await authorize(r.record.lease_token)).toBe(false);
  const retry = await reserve();
  expect(retry.claimed).toBe(false);
  expect(retry.record.status).toBe("unknown");
  expect(await finish(r.record.lease_token)).toBe(false);
});
it("rejects foreign project scope and suspended owners and denies direct table access", async () => {
  await expect(reserve(id, "p", other)).rejects.toThrow("performance_scope");
  await db.exec(
    `UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id='${owner}'`,
  );
  await expect(reserve()).rejects.toThrow("technical_crawl_unavailable");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT * FROM technical_performance_requests")).rejects.toThrow(
      "permission denied",
    );
    if (role !== "service_role")
      await expect(
        db.query("SELECT list_technical_performance_requests($1,'p')", [owner]),
      ).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  }
});
it("bounds new requests per owner across projects while preserving exact retries and history", async () => {
  const r = await reserve();
  await authorize(r.record.lease_token);
  await finish(r.record.lease_token);
  await db.exec(
    `INSERT INTO technical_performance_requests SELECT user_id,project_id,gen_random_uuid(),project_collection,website_value,origin,source,scope,device,url,status,lease_token,lease_until,dispatched_at,observation,error_code,created_at,updated_at FROM technical_performance_requests CROSS JOIN generate_series(1,19)`,
  );
  await expect(reserve(second, "q")).rejects.toThrow("performance_quota");
  expect((await reserve()).claimed).toBe(false);
  await db.exec(
    "UPDATE technical_performance_requests SET created_at=clock_timestamp()-interval '2 hours'",
  );
  expect((await reserve(second, "q")).claimed).toBe(true);
  expect(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int count FROM technical_performance_requests",
      )
    ).rows[0].count,
  ).toBe(21);
});
async function rpc(name: string, args: Record<string, unknown>) {
  const values = Object.values(args),
    placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  return {
    data: (
      await db.query<{ result: unknown }>(`SELECT public.${name}(${placeholders}) result`, values)
    ).rows[0].result,
    error: null,
  };
}
it("integrates the controller with real reservation/dispatch/finish SQL without duplicate provider calls", async () => {
  const fetch = vi.fn().mockResolvedValue(observation()),
    key = vi.fn().mockReturnValue("fixture-only");
  const target = {
    projectId: "p",
    requestId: id,
    query: { source: "crux", url, scope: "url", device: "PHONE" },
  };
  expect(await requestTechnicalPerformance(owner, target, { rpc, key, fetch })).toMatchObject({
    status: "succeeded",
  });
  expect(await requestTechnicalPerformance(owner, target, { rpc, key, fetch })).toMatchObject({
    status: "succeeded",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(key).toHaveBeenCalledTimes(1);
});
it("records missing configuration without any dispatch and keeps ambiguous failures unknown", async () => {
  const fetch = vi.fn();
  const target = {
    projectId: "p",
    requestId: id,
    query: { source: "crux", url, scope: "url", device: "PHONE" },
  };
  expect(
    await requestTechnicalPerformance(owner, target, { rpc, key: () => "", fetch }),
  ).toMatchObject({ status: "failed", error: "configuration" });
  expect(fetch).not.toHaveBeenCalled();
  expect(
    (
      await db.query<{ dispatched_at: unknown }>(
        "SELECT dispatched_at FROM technical_performance_requests",
      )
    ).rows[0].dispatched_at,
  ).toBeNull();
  fetch.mockRejectedValue(new Error("private-provider-detail"));
  const result = await requestTechnicalPerformance(
    owner,
    { ...target, requestId: second },
    { rpc, key: () => "fixture", fetch },
  );
  expect(result).toMatchObject({ status: "unknown", error: "unavailable" });
  expect(JSON.stringify(result)).not.toContain("private-provider-detail");
});

it("holds a result if the project website changes while the provider is running", async () => {
  const r = await reserve();
  expect(await authorize(r.record.lease_token)).toBe(true);
  await db.exec(
    `UPDATE workspace_entities SET data='{"websiteUrl":"https://changed.test"}' WHERE user_id='${owner}' AND entity_id='p'`,
  );
  expect(await finish(r.record.lease_token)).toBe(false);
  expect(
    (
      await db.query<{ status: string; observation: unknown }>(
        "SELECT status,observation FROM technical_performance_requests",
      )
    ).rows[0],
  ).toEqual({ status: "held", observation: null });
});
it("stores lab evidence under its own identity without accepting a field observation", async () => {
  const r = await reserve(id, "p", owner, "pagespeed", "mobile");
  expect(await authorize(r.record.lease_token)).toBe(true);
  await expect(finish(r.record.lease_token, observation())).rejects.toThrow(
    "performance_result_invalid",
  );
  const lab = normalizeLighthouse(
    {
      lighthouseResult: {
        requestedUrl: url,
        finalUrl: url,
        configSettings: { formFactor: "mobile" },
      },
    },
    { url, device: "mobile", observedAt: new Date().toISOString() },
  );
  expect(await finish(r.record.lease_token, lab)).toBe(true);
});

it("enforces one active owner request across projects at storage level", async () => {
  await reserve();
  await expect(
    db.query(
      "INSERT INTO technical_performance_requests SELECT user_id,'q',$1,project_collection,website_value,origin,source,scope,device,url,status,lease_token,lease_until,dispatched_at,observation,error_code,created_at,updated_at FROM technical_performance_requests",
      [second],
    ),
  ).rejects.toThrow("technical_performance_one_active_owner");
  expect((await reserve()).claimed).toBe(false);
});
it("requires a common workspace row before admitting a performance request", async () => {
  await db.query("DELETE FROM workspace_meta WHERE user_id=$1", [owner]);
  try {
    await expect(reserve()).rejects.toThrow("technical_crawl_unavailable");
  } finally {
    await db.query("INSERT INTO workspace_meta(user_id,rev) VALUES($1,1)", [owner]);
  }
});

it("shares provider dispatch quota across accounts while isolating providers", async () => {
  const first = await reserve();
  expect(await authorize(first.record.lease_token)).toBe(true);
  await db.exec("UPDATE technical_performance_provider_limits SET hour_count=100");
  await db.query(
    'UPDATE workspace_entities SET data=\'{"websiteUrl":"https://example.test"}\' WHERE user_id=$1',
    [other],
  );
  const secondRequest = await reserve(second, "p", other);
  const dispatch = async (request: string, token: string) =>
    (
      await db.query<{ result: boolean }>(
        "SELECT authorize_technical_performance_dispatch($1,'p',$2,$3) result",
        [other, request, token],
      )
    ).rows[0].result;
  expect(await dispatch(second, secondRequest.record.lease_token)).toBe(false);
  expect(
    (
      await db.query(
        "SELECT status,error_code,dispatched_at FROM technical_performance_requests WHERE user_id=$1",
        [other],
      )
    ).rows,
  ).toEqual([{ status: "held", error_code: "quota", dispatched_at: null }]);
  const lab = await reserve(id, "p", other, "pagespeed", "mobile");
  expect(await dispatch(id, lab.record.lease_token)).toBe(true);
  expect(
    (
      await db.query(
        "SELECT source,hour_count FROM technical_performance_provider_limits ORDER BY source",
      )
    ).rows,
  ).toEqual([
    { source: "crux", hour_count: 100 },
    { source: "pagespeed", hour_count: 1 },
  ]);
});
it("retains provider capacity through project deletion and denies direct writes", async () => {
  const first = await reserve();
  await authorize(first.record.lease_token);
  await db.query("DELETE FROM workspace_entities WHERE user_id=$1 AND entity_id='p'", [owner]);
  expect(
    (await db.query("SELECT hour_count FROM technical_performance_provider_limits")).rows,
  ).toEqual([{ hour_count: 1 }]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT * FROM technical_performance_provider_limits")).rejects.toThrow(
      "permission denied",
    );
    await db.exec("RESET ROLE");
  }
  await db.query(
    "INSERT INTO workspace_entities VALUES($1,'projects','p','{\"websiteUrl\":\"https://example.test\"}',0)",
    [owner],
  );
});

it.each(["minute", "hour", "active"])(
  "bounds deployment %s admission and recovers expired windows",
  async (limit) => {
    const first = await reserve();
    await db.query(
      "INSERT INTO technical_performance_provider_limits VALUES('crux',now(),$1,now(),$2,$3)",
      [
        limit === "minute" ? 10 : 0,
        limit === "hour" ? 100 : 0,
        limit === "active"
          ? Object.fromEntries(
              [1, 2, 3, 4].map((n) => [String(n), new Date(Date.now() + 90000).toISOString()]),
            )
          : {},
      ],
    );
    expect(await authorize(first.record.lease_token)).toBe(false);
    await db.exec(
      "UPDATE technical_performance_provider_limits SET minute_start=now()-interval '2 minutes',hour_start=now()-interval '2 hours',leases=jsonb_build_object('expired',now()-interval '1 second')",
    );
    const next = await reserve(second);
    expect(await authorize(next.record.lease_token, second)).toBe(true);
    expect(
      (
        await db.query(
          "SELECT minute_count,hour_count,(SELECT count(*) FROM jsonb_object_keys(leases)) AS active FROM technical_performance_provider_limits",
        )
      ).rows,
    ).toHaveLength(1);
  },
);

it.each(["hour", "minute", "active"])(
  "preserves independent account capacity after one account exhausts its provider share: %s",
  async (limit) => {
    const first = await reserve();
    const leases =
      limit === "active"
        ? JSON.stringify({ fixture: new Date(Date.now() + 60000).toISOString() })
        : "{}";
    await db.query(
      "INSERT INTO technical_performance_account_limits VALUES($1,'crux',now(),$2,now(),$3,$4)",
      [owner, limit === "minute" ? 2 : 0, limit === "hour" ? 10 : 0, leases],
    );
    // Five exhausted ten-request shares leave half the deployment's hourly pool available.
    await db.query(
      "INSERT INTO technical_performance_provider_limits VALUES('crux',now(),0,now(),50,'{}')",
    );
    expect(await authorize(first.record.lease_token)).toBe(false);
    await db.query("UPDATE workspace_entities SET data=$1 WHERE user_id=$2", [
      { websiteUrl: "https://example.test" },
      other,
    ]);
    const next = await reserve(second, "p", other);
    const admitted = (
      await db.query<{ result: boolean }>(
        "SELECT authorize_technical_performance_dispatch($1,'p',$2,$3) result",
        [other, second, next.record.lease_token],
      )
    ).rows[0].result;
    expect(admitted).toBe(true);
    expect(
      (await db.query("SELECT hour_count FROM technical_performance_provider_limits")).rows,
    ).toEqual([{ hour_count: 51 }]);
  },
);
it("retains account provider shares after project deletion and rejects direct role access", async () => {
  const first = await reserve();
  expect(await authorize(first.record.lease_token)).toBe(true);
  await db.query("DELETE FROM workspace_entities WHERE user_id=$1 AND entity_id='p'", [owner]);
  expect(
    (await db.query("SELECT hour_count FROM technical_performance_account_limits")).rows,
  ).toEqual([{ hour_count: 1 }]);
  await db.query("INSERT INTO workspace_entities VALUES($1,'projects','p',$2,0)", [
    owner,
    { websiteUrl: "https://example.test" },
  ]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query("SELECT * FROM technical_performance_account_limits")).rejects.toThrow();
    await db.exec("RESET ROLE");
  }
});
