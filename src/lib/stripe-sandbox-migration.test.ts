import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await db.exec(
    readFileSync("supabase/migrations/20260907210000_stripe_sandbox_receipts.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
const record = (id: string, created = 10, fingerprint = "a".repeat(64)) =>
  db.query(
    "SELECT public.record_stripe_sandbox_event($1,'customer.subscription.updated',$2,'sub_fixture',$3) AS result",
    [id, created, fingerprint],
  );
describe("separate Stripe sandbox journal", () => {
  it("deduplicates identical delivery and rejects changed event identity", async () => {
    expect((await record("evt_1")).rows).toEqual([{ result: "recorded" }]);
    expect((await record("evt_1")).rows).toEqual([{ result: "duplicate" }]);
    await expect(record("evt_1", 11)).rejects.toThrow("stripe_sandbox_event_conflict");
    await expect(record("evt_1", 10, "b".repeat(64))).rejects.toThrow(
      "stripe_sandbox_event_conflict",
    );
  });
  it("retains out-of-order receipt metadata without changing subscription state", async () => {
    await record("evt_new", 100);
    await record("evt_old", 50);
    expect(
      (
        await db.query(
          "SELECT event_created::int FROM public.stripe_sandbox_events WHERE event_id IN ('evt_new','evt_old') ORDER BY event_created",
        )
      ).rows,
    ).toEqual([{ event_created: 50 }, { event_created: 100 }]);
    expect(
      (await db.query("SELECT to_regclass('public.entitlements') IS NULL AS untouched")).rows,
    ).toEqual([{ untouched: true }]);
  });
  it("denies ordinary users the receipt table and write function", async () => {
    expect(
      (
        await db.query(
          "SELECT has_table_privilege('anon','public.stripe_sandbox_events','SELECT') AS anon, has_table_privilege('authenticated','public.stripe_sandbox_events','INSERT') AS signed_in, has_function_privilege('authenticated','public.record_stripe_sandbox_event(text,text,bigint,text,text)','EXECUTE') AS execute",
        )
      ).rows,
    ).toEqual([{ anon: false, signed_in: false, execute: false }]);
  });
  it("caps new diagnostic events while preserving duplicate acceptance", async () => {
    await db.exec(
      "INSERT INTO public.stripe_sandbox_events(event_id,event_type,event_created,object_id,fingerprint) SELECT 'evt_bulk_'||n,'test',1,'obj_test',repeat('a',64) FROM generate_series(1,1997) n",
    );
    await expect(record("evt_overflow")).rejects.toThrow("stripe_sandbox_journal_full");
    expect((await record("evt_1")).rows).toEqual([{ result: "duplicate" }]);
  });
});
