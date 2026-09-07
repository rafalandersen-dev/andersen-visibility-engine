import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000031",
  other = "00000000-0000-4000-8000-000000000032";
const event = {
  key: "event-one",
  kind: "approval_due",
  projectId: "p",
  targetId: "a",
  title: "Article",
  detail: { timeZone: "UTC" },
};
async function sync(events: unknown[] = [event], who = user) {
  await db.query("SELECT sync_operational_notifications($1,1,clock_timestamp(),$2::jsonb)", [
    who,
    JSON.stringify(events),
  ]);
}
async function enable(who = user) {
  await db.query(
    "INSERT INTO operational_email_preferences(user_id,enabled,locale) VALUES($1,true,'pl')",
    [who],
  );
}
async function queue(who = user) {
  return (
    await db.query<{ id: string | null }>("SELECT queue_operational_email_digest($1) AS id", [who])
  ).rows[0].id;
}
async function claim() {
  return (
    await db.query<{ id: string; user_id: string; lease_token: string }>(
      "SELECT * FROM claim_operational_email_digest()",
    )
  ).rows[0];
}
async function begin(c: Awaited<ReturnType<typeof claim>>) {
  return (
    await db.query<{ body: unknown }>("SELECT begin_operational_email_delivery($1,$2) AS body", [
      c.id,
      c.lease_token,
    ])
  ).rows[0].body;
}
async function finish(c: Awaited<ReturnType<typeof claim>>, outcome: string) {
  return (
    await db.query<{ ok: boolean }>("SELECT finish_operational_email_delivery($1,$2,$3) AS ok", [
      c.id,
      c.lease_token,
      outcome,
    ])
  ).rows[0].ok;
}
async function state() {
  return (
    await db.query<{ status: string; attempts: number }>(
      "SELECT status,attempts FROM operational_email_outbox ORDER BY created_at",
    )
  ).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,PRIMARY KEY(user_id,collection,entity_id));CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint);",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_entities VALUES($1,'projects','p'),($2,'projects','p')", [
    user,
    other,
  ]);
  for (const file of [
    "20260907150000_operational_notifications.sql",
    "20260907170000_operational_email_outbox.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; TRUNCATE operational_email_preferences,operational_email_items,operational_email_outbox,operational_notifications,operational_notification_scans,workspace_meta CASCADE;",
  );
  await db.query("INSERT INTO workspace_meta VALUES($1,1),($2,1)", [user, other]);
});
afterAll(async () => {
  await db?.close();
});
describe("operational email outbox", () => {
  it("defaults off and requires a fresh matching server scan", async () => {
    await sync();
    expect(await queue()).toBeNull();
    await enable();
    await db.exec("UPDATE workspace_meta SET rev=2");
    expect(await queue()).toBeNull();
    await db.exec(
      "UPDATE workspace_meta SET rev=1;UPDATE operational_notification_scans SET scanned_at=now()-interval '10 minutes'",
    );
    expect(await queue()).toBeNull();
  });
  it("aggregates incidents and deduplicates repeated scans and cron", async () => {
    await enable();
    await sync([event, { ...event, key: "event-two", targetId: "b" }]);
    expect(await queue()).toBeTruthy();
    expect(await queue()).toBeNull();
    const c = await claim();
    expect(await claim()).toBeUndefined();
    expect(await begin(c)).toMatchObject({
      locale: "pl",
      items: expect.arrayContaining([
        expect.objectContaining({ targetId: "a" }),
        expect.objectContaining({ targetId: "b" }),
      ]),
    });
    expect(await finish(c, "accepted")).toBe(true);
    expect(await finish(c, "accepted")).toBe(true);
    await db.exec("UPDATE operational_email_outbox SET created_at=now()-interval '2 hours'");
    await sync();
    expect(await queue()).toBeNull();
  });
  it("cancels resolved incidents immediately before transport", async () => {
    await enable();
    await sync();
    await queue();
    const c = await claim();
    await sync([]);
    expect(await begin(c)).toBeNull();
    expect((await state())[0].status).toBe("cancelled");
  });
  it("removes read incidents from the digest and keeps remaining current items", async () => {
    await enable();
    await sync([event, { ...event, key: "event-two", targetId: "b" }]);
    await queue();
    const c = await claim();
    await db.exec("UPDATE operational_notifications SET read_at=now() WHERE target_id='a'");
    expect(await begin(c)).toMatchObject({ items: [{ targetId: "b" }] });
  });
  it("rejects a source edited after preparation scan", async () => {
    await enable();
    await sync();
    await queue();
    const c = await claim();
    await db.exec("UPDATE workspace_meta SET rev=2");
    await expect(begin(c)).rejects.toThrow("notification_source_stale");
    expect((await state())[0].status).toBe("leased");
  });
  it("only retries failures before transport with a finite backoff budget", async () => {
    await enable();
    await sync();
    await queue();
    for (let i = 0; i < 3; i++) {
      const c = await claim();
      expect(await finish(c, "preflight_unavailable")).toBe(true);
      expect(await claim()).toBeUndefined();
      await db.exec("UPDATE operational_email_outbox SET available_at=now()-interval '1 minute'");
    }
    expect(await state()).toEqual([{ status: "failed", attempts: 3 }]);
    expect(await claim()).toBeUndefined();
  });
  it("never retries ambiguous transport even after lease expiration", async () => {
    await enable();
    await sync();
    await queue();
    const c = await claim();
    await begin(c);
    await db.exec("UPDATE operational_email_outbox SET lease_until=now()-interval '1 minute'");
    expect(await claim()).toBeUndefined();
    expect((await state())[0].status).toBe("unknown");
    expect(await finish(c, "accepted")).toBe(false);
  });
  it("reclaims pre-transport leases while excluding old lease tokens", async () => {
    await enable();
    await sync();
    await queue();
    const old = await claim();
    await db.exec("UPDATE operational_email_outbox SET lease_until=now()-interval '1 minute'");
    const next = await claim();
    expect(next.lease_token).not.toBe(old.lease_token);
    expect(await begin(old)).toBeNull();
    expect(await finish(old, "preflight_unavailable")).toBe(false);
    expect(await begin(next)).toBeTruthy();
  });
  it("retires expired leases at the attempt limit instead of stranding them", async () => {
    await enable();
    await sync();
    await queue();
    await claim();
    await db.exec(
      "UPDATE operational_email_outbox SET attempts=3,lease_until=now()-interval '1 minute'",
    );
    expect(await claim()).toBeUndefined();
    expect((await state())[0].status).toBe("failed");
  });
  it("changes only the signed-in preference and cancels its pending digest on opt-out", async () => {
    await enable();
    await enable(other);
    await sync();
    await sync([event], other);
    await queue();
    await queue(other);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec("SET ROLE authenticated");
    await db.query("SELECT set_operational_email_preference(false,'sv')");
    expect(
      (await db.query("SELECT user_id,enabled,locale FROM operational_email_preferences")).rows,
    ).toEqual([{ user_id: user, enabled: false, locale: "sv" }]);
    expect((await db.query("SELECT status FROM operational_email_outbox")).rows).toEqual([
      { status: "cancelled" },
    ]);
    await expect(db.exec("UPDATE operational_email_preferences SET enabled=true")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.exec("SELECT claim_operational_email_digest()")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE");
    expect(
      (await db.query("SELECT status FROM operational_email_outbox WHERE user_id=$1", [other]))
        .rows,
    ).toEqual([{ status: "pending" }]);
  });
  it("keeps anonymous callers out and validates preference arguments", async () => {
    await db.exec("SET ROLE anon");
    await expect(db.exec("SELECT set_operational_email_preference(true,'pl')")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    await expect(db.exec("SELECT set_operational_email_preference(true,'xx')")).rejects.toThrow(
      "invalid_email_preference",
    );
  });
  it("caps a digest at fifty incidents and enforces the one-hour spacing", async () => {
    await enable();
    await sync(
      Array.from({ length: 51 }, (_, i) => ({ ...event, key: `event-${i}`, targetId: `a-${i}` })),
    );
    await queue();
    const c = await claim();
    expect(((await begin(c)) as { items: unknown[] }).items).toHaveLength(50);
    await finish(c, "accepted");
    expect(await queue()).toBeNull();
    await db.exec("UPDATE operational_email_outbox SET created_at=now()-interval '2 hours'");
    expect(await queue()).toBeTruthy();
  });
});
