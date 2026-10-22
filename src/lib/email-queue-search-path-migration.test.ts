/**
 * 20261021120000_email_queue_search_path.sql against REAL pgmq 1.5.1 SQL (the
 * live version, vendored) in PGlite. "drift" reproduces the live state before
 * the migration: the original wrappers with proconfig NULL.
 *
 * PGlite adapter limits: there is no pgmq extension object, so the schema is
 * created explicitly. The two extension-bookkeeping helpers that create_non_
 * partitioned consults before ALTER EXTENSION ... ADD TABLE are renamed to
 * *_real and wrapped: each real body still runs with the inherited search_path
 * and its result is recorded; the wrappers then return what the live extension
 * would (_extension_exists -> true, _belongs_to_pgmq -> true, skipping the
 * extension-only ALTER). Everything else (send, read, delete, create,
 * format_table_name, ...) is unmodified pgmq. Live behaviour on
 * the real extension is covered by the rollback-only smoke in
 * .coordination/email-ck-live-smoke-rollback.sql.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(`supabase/migrations/${name}`, "utf8");
const infra = migration("20260628221427_email_infra.sql");
const wrappers = infra.slice(
  infra.indexOf("CREATE OR REPLACE FUNCTION public.enqueue_email"),
  infra.indexOf("-- Suppressed emails table"),
);
const FUNCS = [
  "enqueue_email(text, jsonb)",
  "read_email_batch(text, integer, integer)",
  "delete_email(text, bigint)",
  "move_to_dlq(text, text, bigint, jsonb)",
];

async function boot(state: "drift" | "pinned") {
  const db = new PGlite();
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA pgmq;",
  );
  await db.exec(readFileSync("src/lib/__fixtures__/pgmq/pgmq-v1.5.1.sql", "utf8"));
  await db.exec(`CREATE TABLE public.harness_bookkeeping(check_name text, arg text, real_result boolean);
    GRANT INSERT ON public.harness_bookkeeping TO PUBLIC;
    ALTER FUNCTION pgmq._extension_exists(text) RENAME TO _extension_exists_real;
    CREATE FUNCTION pgmq._extension_exists(extension_name text) RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO public.harness_bookkeeping
        VALUES ('extension_exists', extension_name, pgmq._extension_exists_real(extension_name));
      RETURN true;
    END $$;
    ALTER FUNCTION pgmq._belongs_to_pgmq(text) RENAME TO _belongs_to_pgmq_real;
    CREATE FUNCTION pgmq._belongs_to_pgmq(table_name text) RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO public.harness_bookkeeping
        VALUES ('belongs_to_pgmq', table_name, pgmq._belongs_to_pgmq_real(table_name));
      RETURN true;
    END $$;`);
  await db.exec(wrappers);
  await db.exec(migration("20260628223554_b78e49c2-3682-4641-90ff-67dd092a7f20.sql"));
  for (const f of FUNCS) await db.exec(`ALTER FUNCTION public.${f} RESET search_path`);
  if (state === "pinned") await db.exec(migration("20261021120000_email_queue_search_path.sql"));
  // A caller-controlled schema shadowing a pg_catalog function used by pgmq.
  await db.exec(`CREATE SCHEMA evil;
    CREATE FUNCTION evil.clock_timestamp() RETURNS timestamptz LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'shadowed clock_timestamp ran'; END $$;
    GRANT USAGE ON SCHEMA evil TO service_role;
    GRANT EXECUTE ON FUNCTION evil.clock_timestamp() TO service_role;
    GRANT TEMPORARY ON DATABASE postgres TO service_role;`);
  return db;
}
const asRole = (db: PGlite, role: string, searchPath = "public") =>
  db.exec(`RESET ROLE; SET ROLE ${role}; SET search_path = ${searchPath}`);
const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
// Temp relations named like the catalogs pgmq's bookkeeping reads unqualified,
// claiming every table belongs to an extension named pgmq.
const shadowCatalogs = `
  CREATE TEMP TABLE pg_extension AS SELECT 4242::oid AS oid, 'pgmq'::name AS extname;
  CREATE TEMP TABLE pg_class AS SELECT 7777::oid AS oid, 'q_shadowed'::name AS relname;
  CREATE TEMP TABLE pg_depend AS SELECT 4242::oid AS refobjid, 7777::oid AS objid;`;
const bookkeeping = async (db: PGlite) => {
  await db.exec("RESET ROLE");
  return (
    await db.query<{ check_name: string; arg: string; real_result: boolean }>(
      `SELECT check_name, arg, real_result FROM public.harness_bookkeeping
        WHERE arg IN ('pgmq', 'q_shadowed') ORDER BY check_name`,
    )
  ).rows;
};

describe("live drift state (proconfig NULL) is exploitable", () => {
  it("a caller schema ahead of pg_catalog runs inside the wrappers", async () => {
    const db = await boot("drift");
    await asRole(db, "service_role", "evil, pg_catalog");
    await expect(
      db.query("SELECT public.enqueue_email('auth_emails', '{\"a\":1}'::jsonb)"),
    ).rejects.toThrow("shadowed clock_timestamp ran");
    await db.close();
  }, 30000);

  it("session temp tables shadow the catalogs pgmq's real bookkeeping reads", async () => {
    const db = await boot("drift");
    await asRole(db, "service_role");
    await db.exec(shadowCatalogs);
    await db.query("SELECT public.enqueue_email('shadowed', '{}'::jsonb)");
    // The real helpers read the temp tables: PGlite has no pgmq extension and the
    // new queue table is not registered, yet both report true.
    expect(await bookkeeping(db)).toEqual([
      { check_name: "belongs_to_pgmq", arg: "q_shadowed", real_result: true },
      { check_name: "extension_exists", arg: "pgmq", real_result: true },
    ]);
    await db.close();
  }, 30000);
});

describe("after the migration (search_path = pg_catalog, pg_temp)", () => {
  it("changes only proconfig: bodies, signatures, owner and SECURITY DEFINER are unchanged", async () => {
    const [drift, pinned] = await Promise.all([boot("drift"), boot("pinned")]);
    const meta = (db: PGlite) =>
      db.query<{
        sig: string;
        config: string[] | null;
        secdef: boolean;
        src: string;
        owner: string;
      }>(
        `SELECT p.oid::regprocedure::text AS sig, p.proconfig AS config, p.prosecdef AS secdef,
                p.prosrc AS src, pg_get_userbyid(p.proowner) AS owner
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
            AND p.proname IN ('enqueue_email','read_email_batch','delete_email','move_to_dlq')
          ORDER BY 1`,
      );
    const before = (await meta(drift)).rows;
    const after = (await meta(pinned)).rows;
    expect(before.map((r) => r.config)).toEqual([null, null, null, null]);
    expect(after.map((r) => r.config)).toEqual(Array(4).fill(["search_path=pg_catalog, pg_temp"]));
    const rest = (rows: typeof after) =>
      rows.map(({ sig, secdef, src, owner }) => ({ sig, secdef, src, owner }));
    expect(rest(after)).toEqual(rest(before));
    expect(after.every((r) => r.secdef)).toBe(true);
    await Promise.all([drift.close(), pinned.close()]);
  }, 30000);

  it("keeps execution service_role-only (no PUBLIC, anon or authenticated)", async () => {
    const db = await boot("pinned");
    for (const f of FUNCS) {
      const privs = await one<{ anon: boolean; auth: boolean; svc: boolean; acl: string }>(
        db,
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
                has_function_privilege('service_role', $1, 'EXECUTE') AS svc,
                (SELECT proacl::text FROM pg_proc WHERE oid = $1::regprocedure) AS acl`,
        [`public.${f}`],
      );
      expect(privs).toMatchObject({ anon: false, auth: false, svc: true });
      expect(privs.acl).not.toMatch(/(^|[{,])=X/); // no PUBLIC grant
    }
    await asRole(db, "anon");
    await expect(
      db.query("SELECT public.enqueue_email('auth_emails','{}'::jsonb)"),
    ).rejects.toThrow(/permission denied/);
    await db.close();
  }, 30000);

  it("the caller's pg_catalog function shadow no longer runs", async () => {
    const db = await boot("pinned");
    await asRole(db, "service_role", "evil, pg_catalog");
    await expect(
      db.query("SELECT public.enqueue_email('auth_emails', '{\"a\":1}'::jsonb)"),
    ).resolves.toBeDefined();
    await db.close();
  }, 30000);

  it("temp tables no longer shadow the catalogs pgmq's bookkeeping reads", async () => {
    const db = await boot("pinned");
    await asRole(db, "service_role");
    await db.exec(shadowCatalogs);
    await db.query("SELECT public.enqueue_email('shadowed', '{}'::jsonb)");
    // The real catalogs are read: no pgmq extension object exists in PGlite and the
    // queue table belongs to none, so both real helpers report false.
    expect(await bookkeeping(db)).toEqual([
      { check_name: "belongs_to_pgmq", arg: "q_shadowed", real_result: false },
      { check_name: "extension_exists", arg: "pgmq", real_result: false },
    ]);
    await db.close();
  }, 30000);

  it("temp relations cannot redirect queue data (pgmq data paths are schema-qualified)", async () => {
    const db = await boot("pinned");
    await db.exec("SELECT pgmq.create('auth_emails')");
    await asRole(db, "service_role");
    await db.exec(
      "CREATE TEMP TABLE q_auth_emails(msg_id bigint, read_ct int, enqueued_at timestamptz, vt timestamptz, message jsonb); CREATE TEMP TABLE meta(queue_name text)",
    );
    await db.query("SELECT public.enqueue_email('auth_emails', '{\"real\":true}'::jsonb)");
    expect((await db.query("SELECT * FROM pg_temp.q_auth_emails")).rows).toEqual([]);
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT message FROM pgmq.q_auth_emails")).rows).toEqual([
      { message: { real: true } },
    ]);
    await db.close();
  }, 30000);

  it.each(["''", "public", "evil, pg_catalog"])(
    "all four semantics are preserved with caller search_path %s",
    async (callerPath) => {
      const db = await boot("pinned");
      await db.exec("SELECT pgmq.create('auth_emails')");
      await asRole(db, "service_role", callerPath);
      const { id } = await one<{ id: number }>(
        db,
        "SELECT public.enqueue_email('auth_emails', '{\"to\":\"x\"}'::jsonb) AS id",
      );
      expect(
        (await db.query("SELECT * FROM public.read_email_batch('auth_emails', 10, 30)")).rows,
      ).toEqual([{ msg_id: id, read_ct: 1, message: { to: "x" } }]);
      // The visibility timeout hides a message that was just read.
      expect(
        (await db.query("SELECT * FROM public.read_email_batch('auth_emails', 10, 30)")).rows,
      ).toEqual([]);
      expect(
        (
          await one<{ ok: boolean }>(
            db,
            "SELECT public.delete_email('auth_emails', $1::bigint) AS ok",
            [id],
          )
        ).ok,
      ).toBe(true);
      // Missing queues: enqueue and read create them; delete reports false.
      expect(
        (
          await one<{ id: number }>(
            db,
            "SELECT public.enqueue_email('new_queue', '{}'::jsonb) AS id",
          )
        ).id,
      ).toBe(1);
      expect(
        (await db.query("SELECT * FROM public.read_email_batch('fresh_queue', 5, 30)")).rows,
      ).toEqual([]);
      expect(
        (await one<{ ok: boolean }>(db, "SELECT public.delete_email('nope_queue', 1) AS ok")).ok,
      ).toBe(false);
      // DLQ: moves an existing message (creating the DLQ) and still records the
      // payload when the source queue does not exist.
      const { id: m } = await one<{ id: number }>(
        db,
        "SELECT public.enqueue_email('auth_emails', '{\"n\":2}'::jsonb) AS id",
      );
      await db.query(
        "SELECT public.move_to_dlq('auth_emails', 'auth_emails_dlq', $1::bigint, '{\"n\":2}'::jsonb)",
        [m],
      );
      expect(
        (
          await one<{ id: number }>(
            db,
            "SELECT public.move_to_dlq('ghost_queue', 'ghost_queue_dlq', 7, '{\"g\":1}'::jsonb) AS id",
          )
        ).id,
      ).toBe(1);
      await db.exec("RESET ROLE");
      expect((await db.query("SELECT message FROM pgmq.q_auth_emails_dlq")).rows).toEqual([
        { message: { n: 2 } },
      ]);
      expect(
        (await db.query("SELECT 1 FROM pgmq.q_auth_emails WHERE msg_id = $1", [m])).rows,
      ).toEqual([]);
      expect((await db.query("SELECT message FROM pgmq.q_ghost_queue_dlq")).rows).toEqual([
        { message: { g: 1 } },
      ]);
      await db.close();
    },
    30000,
  );
});
