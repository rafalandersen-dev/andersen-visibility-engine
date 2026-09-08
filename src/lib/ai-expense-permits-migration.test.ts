import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const baseSql = readFileSync(
  "supabase/migrations/20260907140000_ai_expense_reservations.sql",
  "utf8",
);
const sql = readFileSync(
  "supabase/migrations/20260908210000_restricted_ai_expense_permits.sql",
  "utf8",
);
const user = "00000000-0000-4000-8000-000000000011";
const other = "00000000-0000-4000-8000-000000000012";
const job = "00000000-0000-4000-8000-000000000013";
let db: PGlite;
const template = {
  user,
  job,
  provider: "openai",
  model: "synthetic",
  operation: "benchmark_scan",
  ceiling: 100,
};
async function reserve(id = randomUUID(), changes: Partial<typeof template> = {}) {
  const r = { ...template, ...changes };
  return (
    await db.query("SELECT * FROM public.reserve_ai_expense($1,$2,$3,$4,$5,$6,$7)", [
      id,
      r.user,
      r.job,
      r.provider,
      r.model,
      r.operation,
      r.ceiling,
    ])
  ).rows[0] as { allowed: boolean; reason: string };
}
async function permit(id = randomUUID(), changes: Partial<typeof template> = {}) {
  const r = { ...template, ...changes };
  await db.query(
    `INSERT INTO public.ai_expense_permits
       (request_id,user_id,job_id,period,provider,model,operation,ceiling_microusd,expires_at)
     VALUES ($1,$2,$3,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),$4,$5,$6,$7,now()+interval '1 hour')`,
    [id, r.user, r.job, r.provider, r.model, r.operation, r.ceiling],
  );
  return id;
}
async function ledgerCount() {
  return (
    await db.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM public.ai_expense_requests",
    )
  ).rows[0].count;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await db.exec(baseSql);
  await db.exec(sql);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "TRUNCATE public.ai_expense_requests,public.ai_expense_budgets,public.ai_expense_permits;",
  );
  await db.query(
    `INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,requires_permit)
     SELECT scope,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),500,true
     FROM (VALUES ('global'),($1),($2)) v(scope)`,
    [`user:${user}`, `user:${other}`],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("isolated one-attempt monetary permits", () => {
  it("does not fund budgets or mint authorization during installation", async () => {
    await db.exec("TRUNCATE public.ai_expense_budgets;");
    await db.exec(sql);
    expect((await reserve()).reason).toBe("budget_unconfigured");
    expect((await db.query("SELECT * FROM public.ai_expense_permits")).rows).toEqual([]);
  });

  it.each(["global", `user:${user}`])(
    "requires a permit when only %s is restricted",
    async (scope) => {
      await db.query("UPDATE public.ai_expense_budgets SET requires_permit=(scope=$1)", [scope]);
      expect(await reserve()).toMatchObject({ allowed: false, reason: "permit_required" });
      expect(await ledgerCount()).toBe(0);
    },
  );

  it("allows the three approved operations once while denying every background attempt", async () => {
    for (const operation of ["benchmark_scan", "benchmark_article", "benchmark_image"]) {
      const id = await permit(randomUUID(), { operation });
      expect(await reserve()).toMatchObject({ allowed: false, reason: "permit_required" });
      expect((await reserve(id, { operation })).allowed).toBe(true);
      expect((await reserve(id, { operation })).reason).toBe("duplicate_request");
    }
    expect(await ledgerCount()).toBe(3);
    const balances = (
      await db.query(
        "SELECT reserved_microusd::integer AS held FROM public.ai_expense_budgets WHERE scope='global'",
      )
    ).rows;
    expect(balances).toEqual([{ held: 300 }]);
  });

  it.each([
    { user: other },
    { job: "00000000-0000-4000-8000-000000000014" },
    { provider: "another-provider" },
    { model: "another-model" },
    { operation: "scheduler" },
    { ceiling: 99 },
    { ceiling: 101 },
  ])("rejects a permit used outside its exact approved request: %j", async (changes) => {
    const id = await permit();
    expect(await reserve(id, changes)).toMatchObject({ allowed: false, reason: "permit_invalid" });
    expect(await ledgerCount()).toBe(0);
    expect((await reserve(id)).allowed).toBe(true);
  });

  it.each([
    "revoked=true",
    "created_at=now()-interval '2 hours', expires_at=now()-interval '1 hour'",
    "period='2000-01'",
  ])("rejects inactive grants (%s)", async (assignment) => {
    const id = await permit();
    await db.query(`UPDATE public.ai_expense_permits SET ${assignment} WHERE request_id=$1`, [id]);
    expect((await reserve(id)).reason).toBe("permit_invalid");
    expect(await ledgerCount()).toBe(0);
  });

  it("still enforces money and pause controls without consuming an inadmissible permit", async () => {
    const id = await permit();
    await db.exec("UPDATE public.ai_expense_budgets SET cap_microusd=99;");
    expect((await reserve(id)).reason).toBe("budget_exhausted");
    await db.exec("UPDATE public.ai_expense_budgets SET cap_microusd=500,paused=true;");
    expect((await reserve(id)).reason).toBe("budget_paused");
    expect(await ledgerCount()).toBe(0);
    await db.exec("UPDATE public.ai_expense_budgets SET paused=false;");
    expect((await reserve(id)).allowed).toBe(true);
  });

  it.each([null, 0, 30])(
    "never reauthorizes a consumed permit after reconciliation at %s",
    async (actual) => {
      const id = await permit();
      await reserve(id);
      await db.query(
        "SELECT * FROM public.reconcile_ai_expense($1,$2,$3,'uncertain','synthetic-evidence')",
        [id, user, actual],
      );
      expect((await reserve(id)).reason).toBe("duplicate_request");
      await db.exec(sql);
      expect((await reserve(id)).reason).toBe("duplicate_request");
    },
  );

  it("preserves existing unrestricted behavior and still rejects a mismatched known permit", async () => {
    await db.exec("UPDATE public.ai_expense_budgets SET requires_permit=false;");
    expect((await reserve()).allowed).toBe(true);
    const id = await permit();
    expect((await reserve(id, { model: "wrong" })).reason).toBe("permit_invalid");
  });

  it("preserves previously reserved expense through the upgrade", async () => {
    // The old function cannot see permits. Upgrade must retain its ledger.
    await db.exec(baseSql);
    const id = randomUUID();
    await reserve(id);
    await db.exec(sql);
    expect((await reserve(id)).reason).toBe("duplicate_request");
    expect(await ledgerCount()).toBe(1);
  });

  it("does not expose permit minting, reading or admission to browser accounts", async () => {
    for (const role of ["anon", "authenticated"]) {
      const result = await db.query(
        `SELECT has_table_privilege($1,'public.ai_expense_permits','SELECT') AS reads,
          has_table_privilege($1,'public.ai_expense_permits','INSERT') AS mints,
          has_table_privilege($1,'public.ai_expense_permits','UPDATE') AS edits,
          has_function_privilege($1,'public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint)','EXECUTE') AS admits`,
        [role],
      );
      expect(result.rows[0]).toEqual({ reads: false, mints: false, edits: false, admits: false });
    }
  });
});
