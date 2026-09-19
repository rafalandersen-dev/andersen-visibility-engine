import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Exercises the ACTUAL migrations, layered in deploy order, so default
// provisioning is validated against the real reserve/reconcile money gate and
// both the old (seven-argument) and new (nine-argument) reserve signatures.
const files = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
  "20260919120000_ai_expense_default_budgets.sql",
];
const user = "00000000-0000-4000-8000-000000000011";
const other = "00000000-0000-4000-8000-000000000012";
const job = "00000000-0000-4000-8000-000000000013";
const account = `user:${user}`;
let db: PGlite;

type Row = { allowed: boolean; reason: string; period: string };

/** `caps=null` calls the legacy seven-argument form (which now binds to the
 * nine-argument overload's NULL defaults); otherwise the explicit caps form. */
async function reserve(
  ceiling = 100,
  caps: [number | null, number | null] | null = [300_000_000, 500_000_000],
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
async function reconcile(
  id: string,
  actual: number | null,
  outcome = "succeeded",
  source = "test-rate-v1",
) {
  return (
    await db.query("SELECT * FROM public.reconcile_ai_expense($1,$2,$3,$4,$5)", [
      id,
      user,
      actual,
      outcome,
      source,
    ])
  ).rows[0];
}
async function period() {
  return (
    (await db.query("SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM') AS p")).rows[0] as {
      p: string;
    }
  ).p;
}
async function budgets() {
  return (
    await db.query<{
      scope: string;
      cap: number;
      held: number;
      spent: number;
      paused: boolean;
      permit: boolean;
      provenance: string;
    }>(
      "SELECT scope,cap_microusd::integer AS cap,reserved_microusd::integer AS held,spent_microusd::integer AS spent,paused,requires_permit AS permit,provenance FROM public.ai_expense_budgets ORDER BY scope",
    )
  ).rows;
}
async function accountRow() {
  return (await budgets()).find((b) => b.scope === account);
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
  it("creates missing global and account rows for the month, marked auto", async () => {
    expect(await reserve()).toMatchObject({
      allowed: true,
      reason: "reserved",
      period: await period(),
    });
    expect(await budgets()).toEqual([
      {
        scope: "global",
        cap: 500_000_000,
        held: 100,
        spent: 0,
        paused: false,
        permit: false,
        provenance: "auto",
      },
      {
        scope: account,
        cap: 300_000_000,
        held: 100,
        spent: 0,
        paused: false,
        permit: false,
        provenance: "auto",
      },
    ]);
    // A second account gets its own auto row under the shared global row.
    expect((await reserve(100, [200_000_000, 500_000_000], other)).reason).toBe("reserved");
    expect(await budgets()).toHaveLength(3);
  });

  it("keeps the fail-closed behaviour for legacy/NULL-cap callers", async () => {
    expect(await reserve(100, null)).toMatchObject({
      allowed: false,
      reason: "budget_unconfigured",
    });
    expect(await budgets()).toEqual([]);
    expect(await reserve(100, [null, null])).toMatchObject({ reason: "budget_unconfigured" });
    expect(await reserve(100, [300_000_000, null])).toMatchObject({
      reason: "budget_unconfigured",
    });
    // Once the global row exists, an account with no account cap still can't provision.
    await reserve(100, [300_000_000, 500_000_000]);
    expect(await reserve(100, [null, 500_000_000], other)).toMatchObject({
      reason: "budget_unconfigured",
    });
    expect(await budgets()).toHaveLength(2);
  });

  it("lets an AUTO account cap FOLLOW a plan upgrade and downgrade within the month", async () => {
    expect((await reserve(100, [5_000_000, 500_000_000])).reason).toBe("reserved");
    expect((await accountRow())?.cap).toBe(5_000_000);

    // Upgrade: a later reservation carries a higher plan cap; the auto cap follows.
    expect((await reserve(100, [30_000_000, 500_000_000])).reason).toBe("reserved");
    expect((await accountRow())?.cap).toBe(30_000_000);

    // Downgrade: the auto cap drops to a still-sufficient ceiling; it follows the
    // plan. Only the cap moves — spent stays 0 and existing reservations remain.
    expect((await reserve(100, [20_000_000, 500_000_000])).reason).toBe("reserved");
    expect(await accountRow()).toMatchObject({ cap: 20_000_000, spent: 0 });
  });

  it("follows a downgrade below committed spend without freeing the reservation", async () => {
    expect((await reserve(200, [5_000_000, 500_000_000])).reason).toBe("reserved"); // held 200
    // Next call carries a downgraded cap below what is already reserved.
    expect(await reserve(1, [100, 500_000_000])).toMatchObject({ reason: "budget_exhausted" });
    expect(await accountRow()).toMatchObject({ cap: 100, held: 200 });
  });

  it("NEVER creates, changes, pauses or restricts a MANUAL row", async () => {
    const p = await period();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,paused,provenance) VALUES('global',$1,150,false,'manual'),($2,$1,120,false,'manual')",
      [p, account],
    );
    // A far larger supplied cap must not raise a manual cap.
    expect((await reserve(100, [9999, 9999])).reason).toBe("reserved");
    expect((await budgets()).map((b) => [b.cap, b.provenance])).toEqual([
      [150, "manual"],
      [120, "manual"],
    ]);
    await db.query("UPDATE public.ai_expense_budgets SET paused=true WHERE scope='global'");
    expect((await reserve(1, [9999, 9999])).reason).toBe("budget_paused");
    await db.query(
      "UPDATE public.ai_expense_budgets SET paused=false, requires_permit=true WHERE scope='global'",
    );
    expect((await reserve(1, [9999, 9999])).reason).toBe("permit_required");
  });

  it("is a no-op when the supplied cap already matches an auto row", async () => {
    await reserve(100, [5_000_000, 500_000_000]);
    await reserve(100, [5_000_000, 500_000_000]);
    expect(await accountRow()).toMatchObject({ cap: 5_000_000, held: 200, provenance: "auto" });
  });

  it("enforces created caps, duplicates and the shared global cap", async () => {
    expect((await reserve(200, [300, 500])).reason).toBe("reserved");
    expect((await reserve(200, [300, 500])).reason).toBe("budget_exhausted");
    const id = randomUUID();
    expect((await reserve(50, [300, 500], user, id)).reason).toBe("reserved");
    expect((await reserve(50, [300, 500], user, id)).reason).toBe("duplicate_request");
    // Global cap binds across accounts: 250 held globally, a second account is refused.
    expect((await reserve(300, [1000, 500], other)).reason).toBe("budget_exhausted");
  });

  it.each([
    ["zero account cap", [0, 500]],
    ["zero global cap", [300, 0]],
    ["negative account cap", [-1, 500]],
  ] as Array<[string, [number, number]]>)(
    "rejects invalid caps before touching a row: %s",
    async (_l, caps) => {
      await expect(reserve(100, caps)).rejects.toThrow(/invalid_expense_reservation/);
      expect(await budgets()).toEqual([]);
    },
  );

  it("still reconciles a settled reservation (unchanged reconcile signature)", async () => {
    const id = randomUUID();
    expect((await reserve(100, [5_000_000, 500_000_000], user, id)).reason).toBe("reserved");
    expect(await reconcile(id, 30)).toEqual({ state: "settled", overrun: false });
    expect(await accountRow()).toMatchObject({ held: 0, spent: 30 });
  });

  it("keeps exactly one reserve overload, service-role only", async () => {
    const count = (
      await db.query<{ n: string }>(
        "SELECT count(*)::text n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname='reserve_ai_expense'",
      )
    ).rows[0].n;
    expect(count).toBe("1");
    const sig = "public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint)";
    const priv = (
      await db.query<{ anon: boolean; signed_in: boolean; service: boolean }>(
        `SELECT has_function_privilege('anon','${sig}','EXECUTE') AS anon, has_function_privilege('authenticated','${sig}','EXECUTE') AS signed_in, has_function_privilege('service_role','${sig}','EXECUTE') AS service`,
      )
    ).rows[0];
    expect(priv).toEqual({ anon: false, signed_in: false, service: true });
  });

  it("preserves rows, balances and provenance when every migration is reapplied", async () => {
    const id = randomUUID();
    await reserve(100, [5_000_000, 500_000_000], user, id);
    for (const file of files) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    expect(await accountRow()).toMatchObject({ cap: 5_000_000, held: 100, provenance: "auto" });
    expect(await reserve(100, [5_000_000, 500_000_000], user, id)).toMatchObject({
      reason: "duplicate_request",
    });
  });
});
