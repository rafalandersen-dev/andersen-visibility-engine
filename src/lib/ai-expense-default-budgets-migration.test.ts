import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
/** Default budgets (owner instruction 2026-09-17): a missing monthly row is created from
 * the server-supplied caps; nothing existing is changed, and legacy callers without caps
 * keep the fail-closed behaviour. Money is never funded by a default. */
const files = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
  "20260917100000_ai_expense_default_budgets.sql",
];
const user = "00000000-0000-4000-8000-000000000011";
const other = "00000000-0000-4000-8000-000000000012";
const job = "00000000-0000-4000-8000-000000000013";
let db: PGlite;
const period = () => new Date().toISOString().slice(0, 7);
type Row = { allowed: boolean; reason: string; period: string };
async function reserve(
  ceiling = 100,
  caps: [number | null, number | null] | null = [300, 500],
  who = user,
  id = randomUUID(),
) {
  const { rows } = caps
    ? await db.query<Row>(
        "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6)",
        [id, who, job, ceiling, caps[0], caps[1]],
      )
    : await db.query<Row>(
        "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4)",
        [id, who, job, ceiling],
      );
  return rows[0];
}
async function budgets() {
  return (
    await db.query<{ scope: string; cap: number; held: number; paused: boolean; permit: boolean }>(
      "SELECT scope,cap_microusd::integer AS cap,reserved_microusd::integer AS held,paused,requires_permit AS permit FROM public.ai_expense_budgets ORDER BY scope",
    )
  ).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const file of files) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    "TRUNCATE public.ai_expense_requests,public.ai_expense_budgets,public.ai_expense_permits;",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("default AI expense budgets", () => {
  it("creates the missing global and account rows for the month from the supplied caps", async () => {
    expect(await reserve()).toMatchObject({ allowed: true, reason: "reserved", period: period() });
    expect(await budgets()).toEqual([
      { scope: "global", cap: 500, held: 100, paused: false, permit: false },
      { scope: `user:${user}`, cap: 300, held: 100, paused: false, permit: false },
    ]);
    // A second account gets its own row under the same global row.
    expect((await reserve(100, [200, 500], other)).reason).toBe("reserved");
    expect(await budgets()).toHaveLength(3);
    expect((await budgets())[0].held).toBe(200);
  });
  it("keeps the previous fail-closed behaviour for callers that supply no caps", async () => {
    expect(await reserve(100, null)).toMatchObject({
      allowed: false,
      reason: "budget_unconfigured",
    });
    expect(await budgets()).toEqual([]);
    expect(await reserve(100, [null, null])).toMatchObject({ reason: "budget_unconfigured" });
    expect(await reserve(100, [300, null])).toMatchObject({ reason: "budget_unconfigured" });
    // The global row exists once created, but the account still needs its own cap.
    await reserve(100, [300, 500]);
    expect(await reserve(100, [null, 500], other)).toMatchObject({ reason: "budget_unconfigured" });
    expect(await budgets()).toHaveLength(2);
  });
  it("never changes an existing cap, pause or restriction", async () => {
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,paused) VALUES('global',$1,150,false),($2,$1,120,false)",
      [period(), `user:${user}`],
    );
    expect((await reserve(100, [9999, 9999])).reason).toBe("reserved");
    expect((await budgets()).map((b) => b.cap)).toEqual([150, 120]);
    await db.query("UPDATE public.ai_expense_budgets SET paused=true WHERE scope='global'");
    expect((await reserve(1, [9999, 9999])).reason).toBe("budget_paused");
    await db.query(
      "UPDATE public.ai_expense_budgets SET paused=false, requires_permit=true WHERE scope='global'",
    );
    expect((await reserve(1, [9999, 9999])).reason).toBe("permit_required");
  });
  it("enforces the created caps and duplicate identities exactly like provisioned rows", async () => {
    expect((await reserve(200, [300, 500])).reason).toBe("reserved");
    expect((await reserve(200, [300, 500])).reason).toBe("budget_exhausted");
    const id = randomUUID();
    expect((await reserve(50, [300, 500], user, id)).reason).toBe("reserved");
    expect((await reserve(50, [300, 500], user, id)).reason).toBe("duplicate_request");
    // Global cap binds across accounts: 250 held, another account asks for 300 with a large account cap.
    expect((await reserve(300, [1000, 500], other)).reason).toBe("budget_exhausted");
  });
  it("rejects invalid caps before touching any row", async () => {
    for (const caps of [
      [0, 500],
      [300, 0],
      [-1, 500],
    ] as Array<[number, number]>)
      await expect(reserve(100, caps)).rejects.toThrow(/invalid_expense_reservation/);
    expect(await budgets()).toEqual([]);
  });
  it("keeps one service-only overload of the reservation function", async () => {
    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*)::text n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname='reserve_ai_expense'",
    );
    expect(rows[0].n).toBe("1");
    for (const role of ["anon", "authenticated"])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "SELECT has_function_privilege($1,'public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(false);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege('service_role','public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
  });
});
