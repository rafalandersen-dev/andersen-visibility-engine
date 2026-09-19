import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Exercises the ACTUAL migrations, layered in deploy order, so the shared
// free-account circuit breaker is validated against the real reserve/reconcile
// money gate — including the final ten-argument reserve and unchanged
// eight-argument reconcile signatures.
const files = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
  "20260919120000_ai_expense_default_budgets.sql",
  "20260919130000_ai_expense_free_pool.sql",
];
const owner = "00000000-0000-4000-8000-000000000011";
const paid = "00000000-0000-4000-8000-000000000012";
const job = "00000000-0000-4000-8000-000000000013";
const GLOBAL = 50_000_000; // USD50 platform cap
const FREE_ACCOUNT = 32_000_000; // freePreview plan-derived account cap
const PAID_ACCOUNT = 2_317_000_000; // pro plan-derived account cap
const POOL = 5_000_000; // min(USD5, global cap)
let db: PGlite;

type Row = { allowed: boolean; reason: string; period: string };

/** The final ten-argument reserve. `useFreePool` is the server-derived
 * classification; a KNOWN paid/owner attempt passes false to bypass the pool. */
async function reserve(
  who: string,
  ceiling: number,
  useFreePool: boolean,
  caps: [number, number] = [FREE_ACCOUNT, GLOBAL],
  id = randomUUID(),
) {
  const { rows } = await db.query<Row>(
    "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6,$7)",
    [id, who, job, ceiling, caps[0], caps[1], useFreePool],
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

describe("shared free-account expense pool", () => {
  it("migrates an existing reservation without charging it to the new pool", async () => {
    const historical = new PGlite();
    try {
      await historical.exec(
        "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
      );
      for (const file of files.slice(0, -1))
        await historical.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
      const id = randomUUID();
      await historical.query(
        "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',500000,50000000,50000000)",
        [id, owner, job],
      );
      const before = await historical.query(
        "SELECT scope,cap_microusd,reserved_microusd,spent_microusd FROM public.ai_expense_budgets ORDER BY scope",
      );
      await historical.exec(readFileSync(`supabase/migrations/${files.at(-1)}`, "utf8"));
      expect(
        (
          await historical.query(
            "SELECT scope,cap_microusd,reserved_microusd,spent_microusd FROM public.ai_expense_budgets ORDER BY scope",
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (
          await historical.query(
            "SELECT uses_free_pool FROM public.ai_expense_requests WHERE request_id=$1",
            [id],
          )
        ).rows,
      ).toEqual([{ uses_free_pool: false }]);
      expect(
        (
          await historical.query(
            "SELECT * FROM public.reconcile_ai_expense($1,$2,100000,'succeeded','test-rate-v1')",
            [id, owner],
          )
        ).rows,
      ).toEqual([{ state: "settled", overrun: false }]);
      expect(
        (
          await historical.query(
            "SELECT count(*)::integer AS n FROM public.ai_expense_budgets WHERE scope='global:free'",
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    } finally {
      await historical.close();
    }
  });

  it("caps ALL free accounts at USD5 total, then a verified paid account still uses the rest of the global cap", async () => {
    // Ten 0.50 reservations spread across DISTINCT free accounts fill the shared
    // pool exactly. A per-account cap alone would let each Sybil keep going.
    for (let i = 0; i < 10; i++) {
      expect((await reserve(randomUUID(), 500_000, true)).reason).toBe("reserved");
    }
    expect(await scope("global:free")).toMatchObject({
      cap: POOL,
      held: POOL,
      provenance: "auto",
    });
    // The eleventh free reservation — a fresh account — is refused by the pool.
    expect((await reserve(randomUUID(), 500_000, true)).reason).toBe("budget_exhausted");

    // The global cap is untouched at USD50 and still has USD45 available: a
    // verified paid account (bypassing the pool) can reserve the remainder.
    expect(await scope("global")).toMatchObject({ cap: GLOBAL, held: POOL });
    expect((await reserve(paid, 45_000_000, false, [PAID_ACCOUNT, GLOBAL])).reason).toBe(
      "reserved",
    );
    expect(await scope("global")).toMatchObject({ cap: GLOBAL, held: GLOBAL });
    // The paid attempt never touched the shared pool.
    expect(await scope("global:free")).toMatchObject({ held: POOL, spent: 0 });
    expect(await scope(`user:${paid}`)).toMatchObject({ held: 45_000_000, provenance: "auto" });
  });

  it("a verified owner bypasses an exhausted pool", async () => {
    for (let i = 0; i < 10; i++) await reserve(randomUUID(), 500_000, true);
    expect((await reserve(randomUUID(), 500_000, true)).reason).toBe("budget_exhausted");
    // The owner is classified non-free upstream and reserves against global only.
    expect((await reserve(owner, 500_000, false, [PAID_ACCOUNT, GLOBAL])).reason).toBe("reserved");
  });

  it("gates concurrent free reservations at the shared cap without overshoot", async () => {
    // Fifteen simultaneous 0.50 free reservations across distinct accounts: the
    // PGlite serializes queries on one connection; this verifies aggregate admission,
    // while the production SQL uses row locks for concurrent database sessions.
    const results = await Promise.all(
      Array.from({ length: 15 }, () => reserve(randomUUID(), 500_000, true)),
    );
    expect(results.filter((r) => r.reason === "reserved")).toHaveLength(10);
    expect(results.filter((r) => r.reason === "budget_exhausted")).toHaveLength(5);
    expect(await scope("global:free")).toMatchObject({ held: POOL });
    expect(await scope("global")).toMatchObject({ held: POOL, cap: GLOBAL });
  });

  it("retains an unknown free expense in the pool, then settles all three scopes", async () => {
    const id = randomUUID();
    const who = randomUUID();
    expect((await reserve(who, 500_000, true, [FREE_ACCOUNT, GLOBAL], id)).reason).toBe("reserved");
    // A crash/timeout reconciliation keeps the reservation held in every scope.
    expect(await reconcile(id, who, null, "uncertain", null)).toEqual({
      state: "unknown",
      overrun: false,
    });
    for (const s of ["global", "global:free", `user:${who}`])
      expect(await scope(s)).toMatchObject({ held: 500_000, spent: 0 });
    // A later measured settlement releases the reserve and charges actual in the
    // pool as well as the global and account rows.
    expect(await reconcile(id, who, 300_000, "failed")).toEqual({
      state: "settled",
      overrun: false,
    });
    for (const s of ["global", "global:free", `user:${who}`])
      expect(await scope(s)).toMatchObject({ held: 0, spent: 300_000, paused: false });
  });

  it("charges a measured free settlement to all three scopes and is idempotent", async () => {
    const id = randomUUID();
    const who = randomUUID();
    await reserve(who, 500_000, true, [FREE_ACCOUNT, GLOBAL], id);
    expect(await reconcile(id, who, 200_000)).toEqual({ state: "settled", overrun: false });
    // Replaying the identical settlement is a no-op; a different one conflicts.
    expect(await reconcile(id, who, 200_000)).toEqual({ state: "settled", overrun: false });
    await expect(reconcile(id, who, 0)).rejects.toThrow("expense_reconciliation_conflict");
    for (const s of ["global", "global:free", `user:${who}`])
      expect(await scope(s)).toMatchObject({ held: 0, spent: 200_000 });
  });

  it("pauses the pool, global and account on a free overrun", async () => {
    const id = randomUUID();
    const who = randomUUID();
    await reserve(who, 100_000, true, [FREE_ACCOUNT, GLOBAL], id);
    expect(await reconcile(id, who, 150_000)).toEqual({ state: "settled", overrun: true });
    for (const s of ["global", "global:free", `user:${who}`])
      expect(await scope(s)).toMatchObject({ spent: 150_000, held: 0, paused: true });
    // A paused pool then refuses another free account entirely.
    expect((await reserve(randomUUID(), 1, true)).reason).toBe("budget_paused");
  });

  it("does not mutate the pool for a standard (non-free) request, even when a pool exists", async () => {
    // A free reservation creates the pool, then a paid reservation + settlement
    // must leave the pool balances entirely unchanged.
    await reserve(randomUUID(), 500_000, true);
    const id = randomUUID();
    expect((await reserve(paid, 400_000, false, [PAID_ACCOUNT, GLOBAL], id)).reason).toBe(
      "reserved",
    );
    expect(await scope("global:free")).toMatchObject({ held: 500_000, spent: 0 });
    expect(await reconcile(id, paid, 250_000)).toEqual({ state: "settled", overrun: false });
    // The pool is unchanged; only the global and paid account moved.
    expect(await scope("global:free")).toMatchObject({ held: 500_000, spent: 0 });
    expect(await scope(`user:${paid}`)).toMatchObject({ held: 0, spent: 250_000 });
  });

  it("records the immutable pool classification on each request row", async () => {
    const freeId = randomUUID();
    const paidId = randomUUID();
    await reserve(randomUUID(), 500_000, true, [FREE_ACCOUNT, GLOBAL], freeId);
    await reserve(paid, 400_000, false, [PAID_ACCOUNT, GLOBAL], paidId);
    const rows = (
      await db.query<{ request_id: string; uses_free_pool: boolean }>(
        "SELECT request_id, uses_free_pool FROM public.ai_expense_requests ORDER BY uses_free_pool",
      )
    ).rows;
    expect(rows).toEqual([
      { request_id: paidId, uses_free_pool: false },
      { request_id: freeId, uses_free_pool: true },
    ]);
  });

  it("respects manual pool, global and account rows (cap, pause, permit)", async () => {
    const p = await period();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES('global',$1,150,'manual'),('global:free',$1,120,'manual'),($2,$1,140,'manual')",
      [p, `user:${paid}`],
    );
    // A far larger supplied pool/global/account cap must not raise a manual cap.
    expect((await reserve(paid, 100, true, [9_999_999, 9_999_999])).reason).toBe("reserved");
    expect((await budgets()).map((b) => [b.scope, b.cap, b.provenance])).toEqual([
      ["global", 150, "manual"],
      ["global:free", 120, "manual"],
      [`user:${paid}`, 140, "manual"],
    ]);
    // A paused manual pool blocks a free attempt; a permit-gated pool requires one.
    await db.query("UPDATE public.ai_expense_budgets SET paused=true WHERE scope='global:free'");
    expect((await reserve(paid, 1, true, [9_999_999, 9_999_999])).reason).toBe("budget_paused");
    await db.query(
      "UPDATE public.ai_expense_budgets SET paused=false, requires_permit=true WHERE scope='global:free'",
    );
    expect((await reserve(paid, 1, true, [9_999_999, 9_999_999])).reason).toBe("permit_required");
  });

  it("preserves the manual global/owner USD50 rows and never charges them to the pool", async () => {
    const p = await period();
    await db.query(
      "INSERT INTO public.ai_expense_budgets(scope,period,cap_microusd,provenance) VALUES('global',$1,50000000,'manual'),($2,$1,50000000,'manual')",
      [p, `user:${owner}`],
    );
    // The owner is verified non-free upstream, so this reserves global+account.
    expect((await reserve(owner, 500_000, false)).reason).toBe("reserved");
    expect(await scope("global")).toMatchObject({
      cap: GLOBAL,
      held: 500_000,
      provenance: "manual",
    });
    // No auto pool row is created by a non-free attempt.
    expect(await scope("global:free")).toBeUndefined();
  });

  it("keeps legacy nine-argument callers on the conservative free pool", async () => {
    // A nine-argument call binds to p_use_free_pool DEFAULT true, so it cannot
    // bypass the shared cap: it provisions and charges the pool.
    const id = randomUUID();
    const { rows } = await db.query<Row>(
      "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6)",
      [id, randomUUID(), job, 500_000, FREE_ACCOUNT, GLOBAL],
    );
    expect(rows[0].reason).toBe("reserved");
    expect(await scope("global:free")).toMatchObject({ held: 500_000 });
    expect(
      (
        await db.query<{ uses_free_pool: boolean }>(
          "SELECT uses_free_pool FROM public.ai_expense_requests WHERE request_id=$1",
          [id],
        )
      ).rows[0].uses_free_pool,
    ).toBe(true);
  });

  it("keeps legacy seven-argument callers fail-closed (no caps to provision)", async () => {
    const { rows } = await db.query<Row>(
      "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4)",
      [randomUUID(), randomUUID(), job, 500_000],
    );
    expect(rows[0].reason).toBe("budget_unconfigured");
    expect(await budgets()).toEqual([]);
  });

  it("rejects an explicit NULL free-pool flag rather than silently bypassing", async () => {
    await expect(
      db.query(
        "SELECT * FROM public.reserve_ai_expense($1,$2,$3,'openai','synthetic','score',$4,$5,$6,$7)",
        [randomUUID(), randomUUID(), job, 500_000, FREE_ACCOUNT, GLOBAL, null],
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
  });

  it("preserves rows, balances and the pool when every migration is reapplied", async () => {
    const id = randomUUID();
    const who = randomUUID();
    await reserve(who, 500_000, true, [FREE_ACCOUNT, GLOBAL], id);
    for (const file of files) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    expect(await scope("global:free")).toMatchObject({ held: 500_000, provenance: "auto" });
    expect((await reserve(who, 500_000, true, [FREE_ACCOUNT, GLOBAL], id)).reason).toBe(
      "duplicate_request",
    );
  });
});
