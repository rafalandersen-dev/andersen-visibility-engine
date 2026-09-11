import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  const prior = readFileSync("supabase/migrations/20260719120000_scheduled_publishes.sql", "utf8");
  await db.exec(prior.slice(prior.indexOf("CREATE TABLE IF NOT EXISTS"), prior.indexOf("-- 3.")));
  await db.exec(
    readFileSync("supabase/migrations/20260911105000_scheduled_publish_fairness.sql", "utf8"),
  );
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE; TRUNCATE scheduled_publishes");
});
afterAll(async () => {
  await db?.close();
});
async function seed(user = owner, count = 20, age = 60) {
  await db.query(
    "INSERT INTO scheduled_publishes(user_id,project_id,asset_id,publish_at) SELECT $1::uuid,'p',($1::uuid)::text||'/'||i,now()-make_interval(mins=>$3) FROM generate_series(1,$2::int) i",
    [user, count, age],
  );
}
const claim = (batch = 20) =>
  db.query<{ id: string; user_id: string; attempts: number }>(
    "SELECT * FROM claim_scheduled_publishes($1,3)",
    [batch],
  );
it("gives later accounts capacity despite an earlier owner backlog", async () => {
  await seed();
  await seed(other, 3, 10);
  const rows = (await claim()).rows;
  expect(rows.filter((r) => r.user_id === owner)).toHaveLength(2);
  expect(rows.filter((r) => r.user_id === other)).toHaveLength(2);
  expect(rows.every((r) => r.attempts === 1)).toBe(true);
  expect((await claim()).rows).toHaveLength(0);
});
it("excludes future retries and preserves the originally requested publication time", async () => {
  await seed(owner, 2);
  await seed(other, 2);
  const before = (await db.query("SELECT id,publish_at FROM scheduled_publishes ORDER BY id")).rows;
  await db.query(
    "UPDATE scheduled_publishes SET retry_after=now()+interval '30 minutes' WHERE user_id=$1",
    [owner],
  );
  expect((await claim()).rows.map((r) => r.user_id)).toEqual([other, other]);
  expect(
    (await db.query("SELECT id,publish_at FROM scheduled_publishes ORDER BY id")).rows,
  ).toEqual(before);
  await db.query(
    "UPDATE scheduled_publishes SET retry_after=now()-interval '1 second' WHERE user_id=$1",
    [owner],
  );
  expect((await claim()).rows.map((r) => r.user_id)).toEqual([owner, owner]);
});
it("caps oversized batches and shares the first round among owners", async () => {
  for (let i = 10; i < 35; i++)
    await seed(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, 2);
  const rows = (await claim(1000)).rows;
  expect(rows).toHaveLength(20);
  expect(new Set(rows.map((r) => r.user_id)).size).toBe(20);
});
it("counts existing publishing rows and never reclaims them or exhausted connector attempts", async () => {
  await seed(owner, 5);
  await db.exec(
    "UPDATE scheduled_publishes SET status='publishing' WHERE asset_id LIKE '%/1'; UPDATE scheduled_publishes SET attempts=3 WHERE asset_id LIKE '%/2'",
  );
  expect((await claim()).rows).toHaveLength(1);
  expect((await claim()).rows).toHaveLength(0);
  expect(
    (await db.query("SELECT status FROM scheduled_publishes WHERE asset_id LIKE '%/2'")).rows,
  ).toEqual([{ status: "pending" }]);
});
it("denies untrusted queue claiming and enforces the durable preflight count bound", async () => {
  await seed(owner, 1);
  await expect(db.exec("UPDATE scheduled_publishes SET preflight_attempts=13")).rejects.toThrow(
    /check constraint/,
  );
  await db.exec("SET ROLE authenticated");
  await expect(claim()).rejects.toThrow(/permission denied/);
});
