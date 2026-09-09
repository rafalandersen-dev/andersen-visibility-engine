import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20260909120000_owner_ai_benchmark_runs.sql", "utf8");
const user = "00000000-0000-4000-8000-000000000011";
const other = "00000000-0000-4000-8000-000000000012";
const run = "00000000-0000-4000-8000-000000000013";
const attempts = [
  "00000000-0000-4000-8000-000000000021",
  "00000000-0000-4000-8000-000000000022",
  "00000000-0000-4000-8000-000000000023",
];
let db: PGlite;
async function claim(stage = "scan", token = randomUUID(), owner = user) {
  const result = await db.query<{ value: boolean }>(
    "SELECT public.claim_owner_benchmark_stage($1,$2,$3,$4,'text','image',500000,100000) AS value",
    [run, owner, stage, token],
  );
  return result.rows[0].value;
}
async function record(stage: string, token: string, result: unknown = { saved: true }) {
  return (
    await db.query<{ value: boolean }>(
      "SELECT public.record_owner_benchmark_result($1,$2,$3,$4,$5) AS value",
      [run, user, stage, token, JSON.stringify(result)],
    )
  ).rows[0].value;
}
async function finish(stage: string, token: string, success = true) {
  return (
    await db.query<{ value: boolean }>(
      "SELECT public.finish_owner_benchmark_stage($1,$2,$3,$4,$5) AS value",
      [run, user, stage, token, success],
    )
  ).rows[0].value;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const file of [
    "20260907140000_ai_expense_reservations.sql",
    "20260908210000_restricted_ai_expense_permits.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(sql);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "TRUNCATE public.owner_ai_benchmark_runs, public.ai_expense_permits, public.ai_expense_requests, public.ai_expense_budgets;",
  );
  await db.query(
    "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,requires_permit) SELECT scope,to_char(now(),'YYYY-MM'),5000000,true FROM (VALUES ('global'),($1)) v(scope)",
    [`user:${user}`],
  );
  for (let i = 0; i < 3; i++)
    await db.query(
      "INSERT INTO public.ai_expense_permits(request_id,user_id,job_id,period,provider,model,operation,ceiling_microusd,expires_at) VALUES($1,$2,$3,to_char(now(),'YYYY-MM'),'openai',$4,$5,$6,now()+interval '2 hours')",
      [
        attempts[i],
        user,
        run,
        i === 2 ? "image" : "text",
        ["scanWebsiteCore", "generateContentCore", "generateArticleImageCore"][i],
        i === 2 ? 100000 : 500000,
      ],
    );
  await db.query(
    "INSERT INTO public.owner_ai_benchmark_runs(id,user_id,project_id,opportunity_id,asset_id,image_id,snapshot,scan_request,article_request,image_request,expires_at) VALUES($1,$2,'project','topic',$3,$4,'{}',$5,$6,$7,now()+interval '1 hour')",
    [run, user, randomUUID(), randomUUID(), ...attempts],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("durable three-stage owner benchmark", () => {
  it("does not install any executable plan or fund a test", async () => {
    await db.exec(
      "TRUNCATE public.owner_ai_benchmark_runs,public.ai_expense_permits,public.ai_expense_budgets;",
    );
    await db.exec(sql);
    expect(await claim()).toBe(false);
    expect((await db.query("SELECT * FROM public.owner_ai_benchmark_runs")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM public.ai_expense_budgets")).rows).toEqual([]);
  });
  it("claims each expected stage once and never advances on a replayed earlier request", async () => {
    for (const stage of ["scan", "article", "image"]) {
      const token = randomUUID();
      expect(await claim(stage, token)).toBe(true);
      expect(await claim(stage)).toBe(false);
      expect(await record(stage, token)).toBe(true);
      expect(await finish(stage, token)).toBe(true);
      expect(await claim(stage)).toBe(false);
      expect(await finish(stage, token)).toBe(false);
    }
    expect((await db.query("SELECT state FROM public.owner_ai_benchmark_runs")).rows).toEqual([
      { state: "completed" },
    ]);
  });
  it("requires the correct owner, stage and claim token", async () => {
    expect(await claim("scan", randomUUID(), other)).toBe(false);
    expect(await claim("article")).toBe(false);
    const token = randomUUID();
    await claim("scan", token);
    expect(await record("scan", randomUUID())).toBe(false);
    expect(await finish("article", token)).toBe(false);
    expect(await finish("scan", token)).toBe(false);
  });
  it("gives only one claim to simultaneous requests", async () => {
    expect((await Promise.all([claim(), claim(), claim()])).filter(Boolean)).toHaveLength(1);
  });
  it("preserves output once and refuses conflicting replacement", async () => {
    const token = randomUUID();
    await claim("scan", token);
    expect(await record("scan", token)).toBe(true);
    expect(await record("scan", token)).toBe(true);
    expect(await record("scan", token, { changed: true })).toBe(false);
    expect(await finish("scan", token, false)).toBe(true);
    expect(await claim()).toBe(false);
    expect((await db.query("SELECT results FROM public.owner_ai_benchmark_runs")).rows).toEqual([
      { results: { scan: { saved: true } } },
    ]);
  });
  it("never reclaims an abandoned or uncertain running stage", async () => {
    await claim();
    await db.exec("UPDATE public.owner_ai_benchmark_runs SET claimed_at=now()-interval '1 day';");
    expect(await claim()).toBe(false);
  });
  it.each(["requires_permit=false", "paused=true", "cap_microusd=0"])(
    "refuses unusable or unrestricted budgets: %s",
    async (assignment) => {
      await db.exec(`UPDATE public.ai_expense_budgets SET ${assignment} WHERE scope='global';`);
      expect(await claim()).toBe(false);
    },
  );
  it.each([
    "model='wrong'",
    "job_id='00000000-0000-4000-8000-000000000099'",
    "revoked=true",
    "ceiling_microusd=1",
  ])("requires all three permits to match: %s", async (assignment) => {
    await db.query(`UPDATE public.ai_expense_permits SET ${assignment} WHERE request_id=$1`, [
      attempts[2],
    ]);
    expect(await claim()).toBe(false);
  });
  it("refuses a consumed current attempt even if its run has not started", async () => {
    await db.query(
      "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','text','scanWebsiteCore',500000)",
      [attempts[0], user, run],
    );
    expect(await claim()).toBe(false);
  });
  it("keeps the plan immutable and browser roles unable to read, provision or execute it", async () => {
    await expect(
      db.exec("UPDATE public.owner_ai_benchmark_runs SET snapshot='{\"changed\":true}';"),
    ).rejects.toThrow("benchmark_plan_immutable");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.exec("SELECT * FROM public.owner_ai_benchmark_runs")).rejects.toThrow();
      await expect(claim()).rejects.toThrow();
      await db.exec("RESET ROLE");
    }
    const privileges = await db.query(
      "SELECT has_table_privilege('service_role','public.owner_ai_benchmark_runs','UPDATE') AS may_reset",
    );
    expect(privileges.rows).toEqual([{ may_reset: false }]);
  });
});
