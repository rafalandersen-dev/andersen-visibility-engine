import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const original = readFileSync("supabase/migrations/20260719160000_ai_usage.sql", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260907110000_ai_usage_fail_closed.sql",
  "utf8",
);
const user = "00000000-0000-4000-8000-000000000001";
const otherUser = "00000000-0000-4000-8000-000000000002";
type Claim = { used: number; cap: number; allowed: boolean };
let db: PGlite;

async function claim(
  cap: number,
  units = 1,
  bucket = "contentGeneration",
  period = "2026-09",
  userId = user,
) {
  const result = await db.query<Claim>("SELECT * FROM public.claim_ai_usage($1,$2,$3,$4,$5)", [
    userId,
    period,
    bucket,
    cap,
    units,
  ]);
  return result.rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await db.exec(original);
  // Confirm the actual original defect before exercising its replacement.
  expect(await claim(0)).toEqual({ used: 1, cap: 0, allowed: true });
  await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await db.exec("TRUNCATE public.ai_usage;");
});
afterAll(async () => {
  await db?.close();
});

describe("claim_ai_usage SQL in PostgreSQL (PGlite)", () => {
  it("blocks the first claim at zero and an oversized first multi-unit claim", async () => {
    expect(await claim(0)).toEqual({ used: 0, cap: 0, allowed: false });
    expect(await claim(2, 3, "audit")).toEqual({ used: 0, cap: 2, allowed: false });
    expect(await claim(2, 2, "audit")).toEqual({ used: 2, cap: 2, allowed: true });
    expect(await claim(2, 1, "audit")).toEqual({ used: 2, cap: 2, allowed: false });
  });

  it("records unlimited usage and denies a lowered cap without erasing existing use", async () => {
    expect(await claim(-1, 5)).toEqual({ used: 5, cap: -1, allowed: true });
    expect(await claim(2)).toEqual({ used: 5, cap: 2, allowed: false });
    expect(await claim(-1, 2)).toEqual({ used: 7, cap: -1, allowed: true });
  });

  it("keeps user, month and bucket counters separate", async () => {
    await claim(1);
    expect((await claim(1)).allowed).toBe(false);
    expect((await claim(1, 1, "audit")).allowed).toBe(true);
    expect((await claim(1, 1, "contentGeneration", "2026-10")).allowed).toBe(true);
    expect((await claim(1, 1, "contentGeneration", "2026-09", otherUser)).allowed).toBe(true);
  });

  it("admits only the available units across a burst of requests", async () => {
    // PGlite serializes requests on one connection. This is an execution
    // regression, not evidence of multi-session PostgreSQL lock contention.
    const results = await Promise.all(Array.from({ length: 10 }, () => claim(3)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(await claim(3)).toEqual({ used: 3, cap: 3, allowed: false });
  });

  it.each([
    [user, "2026-09", "audit", 10, 0],
    [user, "2026-09", "audit", 10, -1],
    [user, "2026-09", "audit", 10, null],
    [user, "2026-09", "audit", null, 1],
    [user, "2026-09", "audit", -2, 1],
    [user, "2026-13", "audit", 10, 1],
    [user, null, "audit", 10, 1],
    [user, "2026-09", "", 10, 1],
    [user, "2026-09", null, 10, 1],
    [null, "2026-09", "audit", 10, 1],
  ])("rejects invalid claim arguments %# without changing counters", async (...args) => {
    await expect(
      db.query("SELECT * FROM public.claim_ai_usage($1,$2,$3,$4,$5)", args),
    ).rejects.toThrow("invalid_ai_usage_claim");
    const result = await db.query("SELECT * FROM public.ai_usage");
    expect(result.rows).toHaveLength(0);
  });

  it("refuses a corrupted negative counter or integer overflow instead of authorizing spend", async () => {
    await claim(-1, 2147483647);
    await expect(claim(-1)).rejects.toThrow("ai_usage_counter_unavailable");
    await db.exec("UPDATE public.ai_usage SET used = -1;");
    await expect(claim(10)).rejects.toThrow("ai_usage_counter_unavailable");
  });

  it("reapplying the additive migration preserves usage", async () => {
    await claim(2);
    await db.exec(migration);
    expect(await claim(2)).toEqual({ used: 2, cap: 2, allowed: true });
    expect((await claim(2)).allowed).toBe(false);
  });

  it.each(["anon", "authenticated"])("denies %s direct claims and counter access", async (role) => {
    await db.exec(`SET ROLE ${role};`);
    try {
      await expect(claim(100)).rejects.toThrow("permission denied");
      await expect(db.query("SELECT * FROM public.ai_usage")).rejects.toThrow("permission denied");
    } finally {
      await db.exec("RESET ROLE;");
    }
  });

  it("allows the server role to call the function", async () => {
    await db.exec("SET ROLE service_role;");
    try {
      expect(await claim(1)).toEqual({ used: 1, cap: 1, allowed: true });
    } finally {
      await db.exec("RESET ROLE;");
    }
  });
});
