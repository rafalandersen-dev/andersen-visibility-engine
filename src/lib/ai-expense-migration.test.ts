import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20260907140000_ai_expense_reservations.sql", "utf8");
const permitsSql = readFileSync(
  "supabase/migrations/20260908210000_restricted_ai_expense_permits.sql",
  "utf8",
);
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000011";
const other = "00000000-0000-4000-8000-000000000012";
const job = "00000000-0000-4000-8000-000000000013";
async function reserve(id = randomUUID(), ceiling = 100, who = user) {
  return (
    await db.query(
      "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'test','synthetic','test',$4)",
      [id, who, job, ceiling],
    )
  ).rows[0] as { allowed: boolean; reason: string; period: string };
}
async function reconcile(
  id: string,
  actual: number | null,
  outcome = "succeeded",
  source: string | null = "test-rate-v1",
  who = user,
) {
  return (
    await db.query("SELECT * FROM public.reconcile_ai_expense($1,$2,$3,$4,$5)", [
      id,
      who,
      actual,
      outcome,
      source,
    ])
  ).rows[0];
}
async function balances() {
  return (
    await db.query(
      "SELECT scope,reserved_microusd::integer AS held,spent_microusd::integer AS spent,paused FROM public.ai_expense_budgets ORDER BY scope",
    )
  ).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await db.exec(sql);
  await db.exec(permitsSql);
}, 30000);
beforeEach(async () => {
  await db.exec("TRUNCATE public.ai_expense_requests,public.ai_expense_budgets;");
  await db.query(
    "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd) SELECT scope,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),cap FROM (VALUES ('global',500),($1,300),($2,400)) v(scope,cap)",
    [`user:${user}`, `user:${other}`],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("atomic internal expense ledger", () => {
  it("requires configured global and account budgets", async () => {
    await db.exec("DELETE FROM public.ai_expense_budgets WHERE scope='global'");
    expect(await reserve()).toMatchObject({ allowed: false, reason: "budget_unconfigured" });
  });
  it("enforces the first account claim and the shared global cap", async () => {
    expect(await reserve(randomUUID(), 301)).toMatchObject({ allowed: false });
    expect(await reserve(randomUUID(), 300)).toMatchObject({ allowed: true });
    expect(await reserve(randomUUID(), 201, other)).toMatchObject({ allowed: false });
    expect(await reserve(randomUUID(), 200, other)).toMatchObject({ allowed: true });
    expect(await reserve(randomUUID(), 1, other)).toMatchObject({ allowed: false });
  });
  it("does not authorize duplicate execution before or after settlement", async () => {
    const id = randomUUID();
    expect((await reserve(id)).allowed).toBe(true);
    expect(await reserve(id)).toMatchObject({ allowed: false, reason: "duplicate_request" });
    await reconcile(id, 30);
    expect(await reserve(id)).toMatchObject({ allowed: false, reason: "duplicate_request" });
  });
  it("moves only measured cost to spent and releases unused reservation once", async () => {
    const id = randomUUID();
    await reserve(id, 100);
    await reserve(randomUUID(), 100);
    expect(await reconcile(id, 30)).toEqual({ state: "settled", overrun: false });
    await reconcile(id, 30);
    expect((await balances())[0]).toMatchObject({ held: 100, spent: 30, paused: false });
    await expect(reconcile(id, 0)).rejects.toThrow("expense_reconciliation_conflict");
  });
  it("retains unknown expenses until evidenced reconciliation, including failures", async () => {
    const id = randomUUID();
    await reserve(id, 300);
    expect(await reconcile(id, null, "uncertain", null)).toEqual({
      state: "unknown",
      overrun: false,
    });
    expect(await reserve()).toMatchObject({ allowed: false });
    expect((await balances())[0]).toMatchObject({ held: 300, spent: 0 });
    await reconcile(id, 80, "failed");
    expect((await balances())[0]).toMatchObject({ held: 0, spent: 80 });
  });
  it("records an overrun honestly and pauses global and account budgets", async () => {
    const id = randomUUID();
    await reserve(id, 100);
    expect(await reconcile(id, 150)).toEqual({ state: "settled", overrun: true });
    expect((await balances())[0]).toMatchObject({ held: 0, spent: 150, paused: true });
    expect(await reserve(randomUUID(), 1, other)).toMatchObject({
      allowed: false,
      reason: "budget_paused",
    });
  });
  it("does not settle another account's request", async () => {
    const id = randomUUID();
    await reserve(id);
    await expect(reconcile(id, 0, "failed", "test-rate-v1", other)).rejects.toThrow(
      "expense_request_missing",
    );
    expect((await balances())[0]).toMatchObject({ held: 100, spent: 0 });
  });
  it("requires explicit cost provenance even for zero cost", async () => {
    const id = randomUUID();
    await reserve(id);
    await expect(reconcile(id, 0, "failed", null)).rejects.toThrow(
      "invalid_expense_reconciliation",
    );
    expect((await balances())[0]).toMatchObject({ held: 100, spent: 0 });
  });
  it.each([0, -1, 1000000000001])("refuses invalid reservation %s", async (cost) => {
    await expect(reserve(randomUUID(), cost)).rejects.toThrow("invalid_expense_reservation");
    expect((await balances())[0]).toMatchObject({ held: 0, spent: 0 });
  });
  it("preserves ledger and budgets when the migration is reapplied", async () => {
    const id = randomUUID();
    await reserve(id);
    await db.exec(sql);
    await db.exec(permitsSql);
    expect(await reserve(id)).toMatchObject({ allowed: false });
    expect((await balances())[0]).toMatchObject({ held: 100 });
  });
  it("denies anonymous and signed-in direct access, including the privileged functions", async () => {
    const result = await db.query(
      "SELECT has_function_privilege('anon','public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint)','EXECUTE') AS anon, has_function_privilege('authenticated','public.reconcile_ai_expense(uuid,uuid,bigint,text,text,text,bigint,bigint)','EXECUTE') AS signed_in, has_table_privilege('authenticated','public.ai_expense_requests','SELECT') AS reads, has_table_privilege('authenticated','public.ai_expense_budgets','UPDATE') AS writes",
    );
    expect(result.rows[0]).toEqual({ anon: false, signed_in: false, reads: false, writes: false });
  });
});
