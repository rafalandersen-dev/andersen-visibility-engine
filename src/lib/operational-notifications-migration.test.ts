import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000031",
  other = "00000000-0000-4000-8000-000000000032";
const event = {
  key: "stable-event",
  kind: "approval_due",
  projectId: "p",
  targetId: "a",
  title: "Article",
  dueAt: "2026-09-07T12:00:00Z",
  detail: { timeZone: "Europe/Stockholm" },
};
const migration = readFileSync(
  "supabase/migrations/20260907150000_operational_notifications.sql",
  "utf8",
);
const scan = async (
  events: unknown[] = [event],
  rev = 1,
  time = "2026-09-01T10:00:00Z",
  who = user,
) =>
  (
    await db.query<{ ok: boolean }>(
      "SELECT public.sync_operational_notifications($1,$2,$3,$4::jsonb) AS ok",
      [who, rev, time, JSON.stringify(events)],
    )
  ).rows[0].ok;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,PRIMARY KEY(user_id,collection,entity_id));CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint);GRANT USAGE ON SCHEMA auth TO authenticated;",
  );
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [user, other]);
  await db.query(
    "INSERT INTO public.workspace_entities VALUES ($1,'projects','p'),($2,'projects','p')",
    [user, other],
  );
  await db.exec(migration);
  await db.exec(
    readFileSync("supabase/migrations/20260907200000_scheduler_recovery_notifications.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260907234500_generation_capacity_notifications.sql",
      "utf8",
    ),
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; TRUNCATE public.operational_notifications,public.operational_notification_scans,public.operational_notification_scan_attempts,public.workspace_meta;",
  );
  await db.query("INSERT INTO public.workspace_meta VALUES ($1,1),($2,1)", [user, other]);
});
afterAll(async () => {
  await db?.close();
});
describe("durable notification inbox", () => {
  it.each(["generation_capacity_low", "generation_capacity_unavailable"])(
    "deduplicates and resolves %s incidents",
    async (kind) => {
      const capacity = { ...event, kind, targetId: "p", dueAt: null };
      await scan([capacity]);
      await scan([capacity], 1, "2026-09-01T11:00:00Z");
      expect(
        (await db.query("SELECT kind,active FROM public.operational_notifications")).rows,
      ).toEqual([{ kind, active: true }]);
      await scan([], 1, "2026-09-01T12:00:00Z");
      expect((await db.query("SELECT active FROM public.operational_notifications")).rows).toEqual([
        { active: false },
      ]);
    },
  );
  it("persists and deduplicates recovery incidents, resolving them after completion", async () => {
    const recovery = { ...event, kind: "scheduler_recovery", targetId: "p" };
    expect(await scan([recovery])).toBe(true);
    await scan([recovery], 1, "2026-09-01T11:00:00Z");
    expect(
      (await db.query("SELECT kind,active FROM public.operational_notifications")).rows,
    ).toEqual([{ kind: "scheduler_recovery", active: true }]);
    await scan([], 1, "2026-09-01T12:00:00Z");
    expect((await db.query("SELECT active FROM public.operational_notifications")).rows).toEqual([
      { active: false },
    ]);
  });
  it("removes project alerts when their source project is deleted", async () => {
    await scan();
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect(
      (await db.query("SELECT count(*)::int AS n FROM public.operational_notifications")).rows,
    ).toEqual([{ n: 0 }]);
    await db.query("INSERT INTO public.workspace_entities VALUES ($1,'projects','p')", [user]);
  });
  it("marks only the current recipient's notification as read", async () => {
    await scan();
    const id = (await db.query<{ id: string }>("SELECT id FROM public.operational_notifications"))
      .rows[0].id;
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec("SET ROLE authenticated");
    expect(
      (await db.query("SELECT public.mark_operational_notification_read($1) AS ok", [id])).rows,
    ).toEqual([{ ok: true }]);
    expect(
      (
        await db.query(
          "SELECT read_at IS NOT NULL AS was_read FROM public.operational_notifications",
        )
      ).rows,
    ).toEqual([{ was_read: true }]);
  });

  it("moves past a failed attempt instead of starving the remaining accounts", async () => {
    const first = await db.query("SELECT * FROM public.operational_notification_scan_targets(1)");
    const next = await db.query("SELECT * FROM public.operational_notification_scan_targets(1)");
    expect(first.rows).not.toEqual(next.rows);
    expect(
      (await db.query("SELECT count(*)::int AS n FROM public.operational_notification_scans")).rows,
    ).toEqual([{ n: 0 }]);
  });
  it("deduplicates a repeated event and preserves its read status", async () => {
    await scan();
    await db.exec("UPDATE public.operational_notifications SET read_at=now()");
    await scan([event], 1, "2026-09-01T11:00:00Z");
    const rows = (
      await db.query(
        "SELECT active,read_at IS NOT NULL AS was_read FROM public.operational_notifications",
      )
    ).rows;
    expect(rows).toEqual([{ active: true, was_read: true }]);
  });
  it("resolves obsolete alerts and reopens returning alerts without duplicates", async () => {
    await scan();
    await scan([], 1, "2026-09-01T11:00:00Z");
    expect((await db.query("SELECT active FROM public.operational_notifications")).rows[0]).toEqual(
      { active: false },
    );
    await scan([event], 1, "2026-09-01T12:00:00Z");
    expect(
      (await db.query("SELECT active,read_at FROM public.operational_notifications")).rows,
    ).toEqual([{ active: true, read_at: null }]);
  });
  it("rejects a stale workspace revision and an older scan instead of clearing current alerts", async () => {
    await scan();
    expect(await scan([], 0, "2026-09-01T12:00:00Z")).toBe(false);
    expect(await scan([], 1, "2026-08-31T12:00:00Z")).toBe(false);
    expect((await db.query("SELECT active FROM public.operational_notifications")).rows[0]).toEqual(
      { active: true },
    );
  });
  it("keeps accounts separate during reconciliation", async () => {
    await scan();
    await scan([event], 1, "2026-09-01T10:00:00Z", other);
    await scan([], 1, "2026-09-01T11:00:00Z");
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM public.operational_notifications WHERE active AND user_id=$1",
          [other],
        )
      ).rows[0],
    ).toEqual({ count: 1 });
  });
  it("does not partially apply a malformed scan", async () => {
    await scan();
    await expect(
      scan(
        [
          { ...event, key: "new" },
          { ...event, kind: "invalid" },
        ],
        1,
        "2026-09-01T11:00:00Z",
      ),
    ).rejects.toThrow("invalid_notification_event");
    expect(
      (await db.query("SELECT event_key,active FROM public.operational_notifications")).rows,
    ).toEqual([{ event_key: "stable-event", active: true }]);
  });
  it("only exposes a recipient's own events and denies marking somebody else's event", async () => {
    await scan();
    await scan([event], 1, "2026-09-01T10:00:00Z", other);
    const foreignId = (
      await db.query<{ id: string }>(
        "SELECT id FROM public.operational_notifications WHERE user_id=$1",
        [other],
      )
    ).rows[0].id;
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec("SET ROLE authenticated;");
    expect((await db.query("SELECT user_id FROM public.operational_notifications")).rows).toEqual([
      { user_id: user },
    ]);
    expect(
      (await db.query("SELECT public.mark_operational_notification_read($1) AS ok", [foreignId]))
        .rows[0],
    ).toEqual({ ok: false });
    await expect(
      db.exec("UPDATE public.operational_notifications SET active=false"),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies direct scan calls to ordinary sessions", async () => {
    const r = await db.query(
      "SELECT has_function_privilege('authenticated','public.sync_operational_notifications(uuid,bigint,timestamptz,jsonb)','EXECUTE') AS authenticated,has_function_privilege('anon','public.operational_notification_scan_targets(integer)','EXECUTE') AS anon",
    );
    expect(r.rows[0]).toEqual({ authenticated: false, anon: false });
  });
  it("prioritizes unscanned workspaces and remains bounded", async () => {
    await scan();
    const r = await db.query("SELECT * FROM public.operational_notification_scan_targets(1)");
    expect(r.rows).toEqual([{ user_id: other }]);
  });
});
