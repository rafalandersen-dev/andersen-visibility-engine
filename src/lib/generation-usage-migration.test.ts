import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const claim = (id: string = randomUUID(), overrides: Record<string, unknown> = {}) => {
  const args = {
    id,
    user,
    period: "2026-09",
    bucket: "contentGeneration",
    cap: 3,
    operation: "generateContentCore",
    native: null,
    ...overrides,
  };
  return db
    .query<{
      used: number;
      cap: number;
      allowed: boolean;
      receipt_id: string;
      claim_status: string;
    }>("SELECT * FROM public.claim_generation_usage($1,$2,$3,$4,$5,$6,$7)", [
      args.id,
      args.user,
      args.period,
      args.bucket,
      args.cap,
      args.operation,
      args.native,
    ])
    .then((r) => r.rows[0]);
};
const settle = (id: string, outcome = "released", userId = user) =>
  db
    .query("SELECT * FROM public.settle_generation_usage($1,$2,$3)", [id, userId, outcome])
    .then((r) => r.rows[0]);
const counts = () =>
  db
    .query<{ user_id: string; period: string; bucket: string; used: number }>(
      "SELECT user_id, period, bucket, used FROM public.ai_usage ORDER BY user_id, period, bucket",
    )
    .then((r) => r.rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  for (const file of [
    "20260719160000_ai_usage.sql",
    "20260907110000_ai_usage_fail_closed.sql",
    "20260909150000_generation_usage_receipts.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("TRUNCATE public.ai_generation_usage_receipts, public.ai_usage;");
});
afterAll(async () => {
  await db?.close();
});

describe("generation quota receipts in PostgreSQL", () => {
  it("shares the existing atomic cap without resetting legacy usage", async () => {
    await db.query("SELECT * FROM public.claim_ai_usage($1,'2026-09','contentGeneration',3,2)", [
      user,
    ]);
    const row = await claim();
    expect(row).toMatchObject({ allowed: true, used: 3, claim_status: "reserved" });
    const denied = await claim();
    expect(denied).toMatchObject({ allowed: false, used: 3, claim_status: "denied" });
    await expect(settle(denied.receipt_id)).rejects.toThrow("already_settled");
    await settle(row.receipt_id);
    expect((await counts())[0].used).toBe(2);
  });
  it("returns a reservation once and refuses completed/released state reversal", async () => {
    const a = await claim();
    const b = await claim();
    expect(await settle(a.receipt_id)).toMatchObject({ state: "released" });
    expect(await settle(a.receipt_id)).toMatchObject({ state: "released" });
    await expect(settle(a.receipt_id, "completed")).rejects.toThrow("already_settled");
    expect(await settle(b.receipt_id, "completed")).toMatchObject({ state: "completed" });
    expect(await settle(b.receipt_id, "completed")).toMatchObject({ state: "completed" });
    await expect(settle(b.receipt_id)).rejects.toThrow("already_settled");
    expect((await counts())[0].used).toBe(1);
  });
  it.each(["reserved", "released", "completed", "denied"])(
    "a %s receipt cannot authorize another provider call",
    async (state) => {
      const cap = state === "denied" ? 0 : 3;
      const row = await claim(undefined, { cap });
      if (state === "released" || state === "completed") await settle(row.receipt_id, state);
      const before = await counts();
      expect(await claim(row.receipt_id, { cap })).toMatchObject({
        allowed: false,
        claim_status: "replayed",
      });
      expect(await counts()).toEqual(before);
    },
  );
  it.each([
    { user: other },
    { period: "2026-10" },
    { cap: 4 },
    { operation: "generateContentAssetFn" },
    { bucket: "imageGeneration", operation: "generateArticleImageCore" },
    { native: randomUUID() },
  ])("rejects identity drift %#", async (overrides) => {
    const row = await claim();
    await expect(claim(row.receipt_id, overrides)).rejects.toThrow("identity_conflict");
    expect((await counts())[0].used).toBe(1);
  });
  it("keeps owner, month and bucket boundaries when releasing across a month change", async () => {
    const old = await claim();
    await claim(undefined, { period: "2026-10" });
    await claim(undefined, { user: other });
    await claim(undefined, { bucket: "imageGeneration", operation: "generateArticleImageCore" });
    await expect(settle(old.receipt_id, "released", other)).rejects.toThrow("not_found");
    await settle(old.receipt_id);
    expect(await counts()).toEqual([
      { user_id: user, period: "2026-09", bucket: "contentGeneration", used: 0 },
      { user_id: user, period: "2026-09", bucket: "imageGeneration", used: 1 },
      { user_id: user, period: "2026-10", bucket: "contentGeneration", used: 1 },
      { user_id: other, period: "2026-09", bucket: "contentGeneration", used: 1 },
    ]);
  });
  it("does not invent a refund for an unknown receipt or corrupt counter", async () => {
    await expect(settle(randomUUID())).rejects.toThrow("not_found");
    const row = await claim();
    await db.exec("UPDATE public.ai_usage SET used = 0");
    await expect(settle(row.receipt_id)).rejects.toThrow("counter_unavailable");
    expect((await db.query("SELECT state FROM public.ai_generation_usage_receipts")).rows).toEqual([
      { state: "reserved" },
    ]);
  });
  it("serializes same-identity bursts and preserves capacity with old and new claims", async () => {
    // PGlite uses one connection; real multi-session contention remains acceptance work.
    const id = randomUUID();
    const replayed = await Promise.all(Array.from({ length: 5 }, () => claim(id)));
    expect(replayed.filter((r) => r.allowed)).toHaveLength(1);
    const more = await Promise.all(Array.from({ length: 5 }, () => claim()));
    expect(more.filter((r) => r.allowed)).toHaveLength(2);
    await Promise.all(Array.from({ length: 5 }, () => settle(id)));
    expect((await counts())[0].used).toBe(2);
  });
  it("records unlimited beta use and handles integer overflow without a stranded new receipt", async () => {
    const row = await claim(undefined, { cap: -1 });
    await settle(row.receipt_id);
    await db.exec("UPDATE public.ai_usage SET used = 2147483647");
    await expect(claim(undefined, { cap: -1 })).rejects.toThrow("counter_unavailable");
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::integer AS n FROM public.ai_generation_usage_receipts",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it.each([
    { id: null },
    { user: null },
    { cap: -2 },
    { period: "2026-13" },
    { operation: "client_supplied" },
    { bucket: "audit" },
    { operation: "generateArticleImageCore" },
  ])("rejects invalid admission %# before creating a receipt", async (overrides) => {
    await expect(claim(undefined, overrides)).rejects.toThrow("invalid_generation_usage_claim");
    expect(await counts()).toEqual([]);
  });
  it.each(["anon", "authenticated"])(
    "denies %s claims, refunds and receipt reads",
    async (role) => {
      const row = await claim();
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(claim()).rejects.toThrow("permission denied");
        await expect(settle(row.receipt_id)).rejects.toThrow("permission denied");
        await expect(db.query("SELECT * FROM public.ai_generation_usage_receipts")).rejects.toThrow(
          "permission denied",
        );
      } finally {
        await db.exec("RESET ROLE");
      }
    },
  );
  it("allows service RPCs but rejects direct receipt mutation", async () => {
    await db.exec("SET ROLE service_role");
    try {
      const row = await claim();
      await settle(row.receipt_id);
      expect(
        (await db.query("SELECT state FROM public.ai_generation_usage_receipts")).rows,
      ).toEqual([{ state: "released" }]);
      await expect(
        db.exec("UPDATE public.ai_generation_usage_receipts SET state = 'reserved'"),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
