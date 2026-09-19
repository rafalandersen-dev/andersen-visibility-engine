import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Exercises the ACTUAL migrations, layered in deploy order, so the manual-budget
// requirement is validated against the real reserve/reconcile money gate —
// including the final ten-argument reserve (p_require_manual_budget) and the
// UNCHANGED eight-argument reconcile signature (no pool scope, no pool cost, no
// request classification column). Owner decision 2026-09-19: a free/uncertain
// account gets native AI only after an operator manually grants a budget row.
const files = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
  "20260919120000_ai_expense_default_budgets.sql",
  "20260919130000_manual_free_ai_budgets.sql",
];
const owner = "00000000-0000-4000-8000-000000000011";
const granted = "00000000-0000-4000-8000-000000000012"; // a manually-budgeted account
const job = "00000000-0000-4000-8000-000000000013";
const GLOBAL = 50_000_000; // USD50 platform cap
const PAID_ACCOUNT = 2_317_000_000; // pro plan-derived account cap
let db: PGlite;

type Row = { allowed: boolean; reason: string; period: string };

/** The final ten-argument reserve. `requireManual` is the server-derived
 * classification; a verified owner / KNOWN paid plan passes false, every free or
 * uncertain account passes true. A restricted free account sends NO account cap. */
async function reserve(
  who: string,
  ceiling: number,
  requireManual: boolean,
  caps: [number | null, number | null] = [null, GLOBAL],
  id = randomUUID(),
) {
  const { rows } = await db.query<Row>(
    "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6,$7)",
    [id, who, job, ceiling, caps[0], caps[1], requireManual],
  );
  return rows[0];
}
async function reconcile(
  id: string,
  who: string,
  actual: number | null,
  outcome = "succeeded",
  source: string | null = "test-rate-v1",
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
      "SELECT scope,cap_microusd::float8 AS cap,reserved_microusd::integer AS held,spent_microusd::integer AS spent,paused,requires_permit AS permit,provenance FROM public.ai_expense_budgets ORDER BY scope",
    )
  ).rows;
}
async function scope(name: string) {
  return (await budgets()).find((b) => b.scope === name);
}
async function requestCount() {
  return (
    await db.query<{ n: number }>("SELECT count(*)::integer AS n FROM public.ai_expense_requests")
  ).rows[0].n;
}
/** Seed the owner-approved manual platform row (production reality: USD50). */
async function seedManualGlobal(cap = GLOBAL) {
  await db.query(
    "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES('global',$1,$2,'manual')",
    [await period(), cap],
  );
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

describe("manual-budget requirement for free/uncertain accounts", () => {
  it("denies many distinct free accounts, creating NO account row, request or held cost", async () => {
    await seedManualGlobal();
    for (let i = 0; i < 12; i++) {
      expect((await reserve(randomUUID(), 500_000, true)).reason).toBe("manual_budget_required");
    }
    // A free attempt that even supplies an account cap is still refused BEFORE
    // any row is created: the guard runs before auto provisioning.
    expect((await reserve(randomUUID(), 500_000, true, [32_000_000, GLOBAL])).reason).toBe(
      "manual_budget_required",
    );
    // Only the untouched manual global row exists; no user rows, no attempts.
    expect(await budgets()).toEqual([
      {
        scope: "global",
        cap: GLOBAL,
        held: 0,
        spent: 0,
        paused: false,
        permit: false,
        provenance: "manual",
      },
    ]);
    expect(await requestCount()).toBe(0);
  });

  it("admits ONLY the account an operator manually budgeted", async () => {
    await seedManualGlobal();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES($1,$2,1000000,'manual')",
      [`user:${granted}`, await period()],
    );
    // The granted account is admitted against its manual row; a far larger
    // supplied cap must NOT raise the manual cap.
    expect((await reserve(granted, 500_000, true, [9_999_999_999, GLOBAL])).reason).toBe(
      "reserved",
    );
    expect(await scope(`user:${granted}`)).toMatchObject({
      cap: 1_000_000,
      held: 500_000,
      provenance: "manual",
    });
    // Any other free account is still refused and gains no row.
    expect((await reserve(randomUUID(), 500_000, true)).reason).toBe("manual_budget_required");
    expect((await budgets()).map((b) => b.scope)).toEqual(["global", `user:${granted}`]);
  });

  it("respects a manual account row's pause and permit gates", async () => {
    await seedManualGlobal();
    const p = await period();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES($1,$2,1000000,'manual')",
      [`user:${granted}`, p],
    );
    await db.query("UPDATE public.ai_expense_budgets SET paused=true WHERE scope=$1", [
      `user:${granted}`,
    ]);
    expect((await reserve(granted, 1, true, [9_999_999, GLOBAL])).reason).toBe("budget_paused");
    await db.query(
      "UPDATE public.ai_expense_budgets SET paused=false, requires_permit=true WHERE scope=$1",
      [`user:${granted}`],
    );
    expect((await reserve(granted, 1, true, [9_999_999, GLOBAL])).reason).toBe("permit_required");
  });

  it("denies an existing AUTO account row without altering it (a downgraded account cannot bypass)", async () => {
    await seedManualGlobal();
    const p = await period();
    // An account left over as 'auto' from a paid month, now downgraded to free.
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,reserved_microusd,provenance) VALUES($1,$2,32000000,700000,'auto')",
      [`user:${granted}`, p],
    );
    expect((await reserve(granted, 500_000, true, [null, GLOBAL])).reason).toBe(
      "manual_budget_required",
    );
    // The auto row is untouched: no cap change, no new hold, no request row.
    expect(await scope(`user:${granted}`)).toMatchObject({
      cap: 32_000_000,
      held: 700_000,
      provenance: "auto",
    });
    expect(await requestCount()).toBe(0);
  });

  it("auto-provisions a KNOWN paid/owner account with the requirement waived", async () => {
    await seedManualGlobal();
    // requireManual=false (verified owner or KNOWN paid): the account row is
    // created 'auto' and its cap follows the supplied plan cap, as before.
    expect((await reserve(owner, 500_000, false, [PAID_ACCOUNT, GLOBAL])).reason).toBe("reserved");
    expect(await scope(`user:${owner}`)).toMatchObject({
      cap: PAID_ACCOUNT,
      held: 500_000,
      provenance: "auto",
    });
  });

  it("still stops a requirement-waived owner at an exhausted global cap", async () => {
    await seedManualGlobal(500_000);
    expect((await reserve(owner, 500_000, false, [PAID_ACCOUNT, GLOBAL])).reason).toBe("reserved");
    // The global manual cap is full; even a waived owner cannot exceed it.
    expect((await reserve(owner, 1, false, [PAID_ACCOUNT, GLOBAL])).reason).toBe(
      "budget_exhausted",
    );
  });

  it("preserves manual global/account rows, balances and reconciliation (unchanged reconcile)", async () => {
    const p = await period();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES('global',$1,50000000,'manual'),($2,$1,50000000,'manual')",
      [p, `user:${owner}`],
    );
    const id = randomUUID();
    expect((await reserve(owner, 500_000, true, [9_999_999, GLOBAL], id)).reason).toBe("reserved");
    // A crash/timeout keeps the reservation held; a later settlement releases it.
    expect(await reconcile(id, owner, null, "uncertain", null)).toEqual({
      state: "unknown",
      overrun: false,
    });
    for (const s of ["global", `user:${owner}`])
      expect(await scope(s)).toMatchObject({ held: 500_000, spent: 0, provenance: "manual" });
    expect(await reconcile(id, owner, 300_000, "succeeded")).toEqual({
      state: "settled",
      overrun: false,
    });
    for (const s of ["global", `user:${owner}`])
      expect(await scope(s)).toMatchObject({ held: 0, spent: 300_000, provenance: "manual" });
    // Idempotent replay is a no-op; a different settlement conflicts.
    expect(await reconcile(id, owner, 300_000, "succeeded")).toEqual({
      state: "settled",
      overrun: false,
    });
    await expect(reconcile(id, owner, 1, "succeeded")).rejects.toThrow(
      "expense_reconciliation_conflict",
    );
    // A duplicate reserve never runs the provider again.
    expect((await reserve(owner, 500_000, true, [9_999_999, GLOBAL], id)).reason).toBe(
      "duplicate_request",
    );
  });

  it("keeps legacy nine-argument callers on the conservative manual requirement", async () => {
    await seedManualGlobal();
    // Nine arguments bind p_require_manual_budget DEFAULT true, so an unclassified
    // caller cannot bypass the requirement even with an account cap supplied.
    const { rows } = await db.query<Row>(
      "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6)",
      [randomUUID(), randomUUID(), job, 500_000, 32_000_000, GLOBAL],
    );
    expect(rows[0].reason).toBe("manual_budget_required");
    expect(await requestCount()).toBe(0);
  });

  it("keeps legacy seven-argument callers fail-closed (conservative, no bypass)", async () => {
    await seedManualGlobal();
    const { rows } = await db.query<Row>(
      "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4)",
      [randomUUID(), randomUUID(), job, 500_000],
    );
    expect(rows[0].reason).toBe("manual_budget_required");
    expect(await requestCount()).toBe(0);
  });

  it("rejects an explicit NULL manual-budget flag rather than silently bypassing", async () => {
    await expect(
      db.query(
        "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6,$7)",
        [randomUUID(), randomUUID(), job, 500_000, null, GLOBAL, null],
      ),
    ).rejects.toThrow(/invalid_expense_reservation/);
    expect(await budgets()).toEqual([]);
  });

  it("keeps exactly one reserve overload, and grants only the service role", async () => {
    const count = (
      await db.query<{ n: string }>(
        "SELECT count(*)::text n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname='reserve_ai_expense'",
      )
    ).rows[0].n;
    expect(count).toBe("1");
    const reserveSig =
      "public.reserve_ai_expense(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean)";
    const reconcileSig =
      "public.reconcile_ai_expense(uuid,uuid,bigint,text,text,text,bigint,bigint)";
    const priv = (
      await db.query<{
        r_anon: boolean;
        r_auth: boolean;
        r_svc: boolean;
        c_anon: boolean;
        c_auth: boolean;
        c_svc: boolean;
      }>(
        `SELECT has_function_privilege('anon','${reserveSig}','EXECUTE') AS r_anon,
                has_function_privilege('authenticated','${reserveSig}','EXECUTE') AS r_auth,
                has_function_privilege('service_role','${reserveSig}','EXECUTE') AS r_svc,
                has_function_privilege('anon','${reconcileSig}','EXECUTE') AS c_anon,
                has_function_privilege('authenticated','${reconcileSig}','EXECUTE') AS c_auth,
                has_function_privilege('service_role','${reconcileSig}','EXECUTE') AS c_svc`,
      )
    ).rows[0];
    expect(priv).toEqual({
      r_anon: false,
      r_auth: false,
      r_svc: true,
      c_anon: false,
      c_auth: false,
      c_svc: true,
    });
    // No pool scope and no request classification column were ever introduced.
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_expense_requests' AND column_name='uses_free_pool'",
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("preserves rows, balances and provenance when every migration is reapplied", async () => {
    await seedManualGlobal();
    const p = await period();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES($1,$2,1000000,'manual')",
      [`user:${granted}`, p],
    );
    const id = randomUUID();
    await reserve(granted, 500_000, true, [9_999_999, GLOBAL], id);
    for (const file of files) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    expect(await scope(`user:${granted}`)).toMatchObject({
      cap: 1_000_000,
      held: 500_000,
      provenance: "manual",
    });
    expect((await reserve(granted, 500_000, true, [9_999_999, GLOBAL], id)).reason).toBe(
      "duplicate_request",
    );
  });
});
