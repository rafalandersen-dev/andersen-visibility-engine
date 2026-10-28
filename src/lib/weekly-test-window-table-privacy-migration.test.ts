import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Executes the ACTUAL prerequisite migrations, the ACTUAL bounded weekly
 * observation migration and the ACTUAL table-privacy follow-up, in deploy
 * order, against two fixtures: one WITHOUT the optional `sandbox_exec`
 * environment role, and one WITH it plus a local `ALTER DEFAULT PRIVILEGES`
 * grant that reproduces the environment default which made the strict
 * production installation guard roll 20261028170000 back before commit.
 *
 * The role and the default grant below are a LOCAL TEST FIXTURE ONLY. Neither
 * the repository nor the follow-up migration creates a role or changes any
 * default privilege; the fixture exists so the follow-up can be proved against
 * the real inherited grant instead of an assumed one.
 *
 * Scope note: PGlite runs one in-process superuser connection, so `SET ROLE`
 * here proves the ACL decision of the server for that role, not a separate
 * authenticated login. A real host PostgreSQL 17 ACL/`SET ROLE` probe is owned
 * by the external fixture and is listed as an open item in the evidence record.
 * The bootstrap and migration-chain pattern mirrors
 * `weekly-test-window-migration.test.ts`; that module is neither imported nor
 * modified.
 */
const PREREQUISITES = [
  "20260907140000_ai_expense_reservations.sql",
  "20260908210000_restricted_ai_expense_permits.sql",
  "20260907190000_auto_scheduler_leases.sql",
  "20260909200000_project_knowledge.sql",
  "20260910150000_weekly_preparation.sql",
  "20260910170000_publication_approval.sql",
  "20260910180000_weekly_executor.sql",
  "20260919120000_ai_expense_default_budgets.sql",
  "20260919130000_manual_free_ai_budgets.sql",
];
const BOUNDED = "20261028170000_bounded_weekly_test_windows.sql";
/** Immutable identity of the reviewed bounded migration. The follow-up is
 * additive, so the original file must stay byte-for-byte as reviewed. */
const BOUNDED_SHA256 = "25019b0874493109258de5c8380cfb32bb12d4853e324bd2d8077bb067503263";
const FOLLOWUP = "20261028211000_bounded_window_table_privacy.sql";
const SANDBOX = "sandbox_exec";
/** The exact four tables the follow-up is allowed to touch. */
const BOUNDED_TABLES = [
  "weekly_test_windows",
  "weekly_test_window_slots",
  "weekly_test_window_contracts",
  "weekly_test_window_allowances",
];
const TABLE_RIGHTS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const CLOSED_ROLES = ["public", "anon", "authenticated", "service_role"];
/** Created BEFORE the follow-up with the default grant in force, so it must
 * keep the inherited SELECT/INSERT afterwards. */
const SENTINEL = "sandbox_unrelated_sentinel";
/** Created AFTER the follow-up, to prove the default privileges themselves
 * were not altered. */
const FUTURE = "sandbox_future_sentinel";
const owner = "00000000-0000-4000-8000-000000000001";

const BOOTSTRAP =
  "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;" +
  "CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);" +
  "CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint NOT NULL DEFAULT 0);" +
  "CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb NOT NULL DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));" +
  "CREATE TABLE scheduled_publishes(id uuid DEFAULT gen_random_uuid(),user_id uuid,project_id text,asset_id text,publish_at timestamptz,status text,attempts integer DEFAULT 0,last_error text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());" +
  "CREATE TABLE ai_generation_usage_receipts(id uuid PRIMARY KEY,user_id uuid,native_attempt_id uuid);" +
  "CREATE TABLE ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb,discarded_at timestamptz);" +
  "CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);" +
  "CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE id bigint; BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(p_name,p_schedule,p_command) RETURNING jobid INTO id; RETURN id; END; $$;" +
  "CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1; $$;" +
  "INSERT INTO cron.job(jobname,schedule,command) VALUES('monthly-auto-scheduler','0 6 25 * *','existing-monthly-command');";

const migration = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");

/** A fresh database with the real released prerequisite chain applied. */
async function prepared() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  for (const file of PREREQUISITES) await db.exec(migration(file));
  return db;
}

type Snapshot = {
  tableAcls: unknown[];
  functions: unknown[];
  defaultAcls: unknown[];
  data: unknown;
  roles: unknown[];
};
type Probe = { ok: boolean; code: string | null; message: string };

/** RLS, policy count and the raw ACL of each bounded table. */
const tableAcls = async (db: PGlite) =>
  (
    await db.query(
      `SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity forced,
              (SELECT count(*)::integer FROM pg_policy WHERE polrelid=c.oid) policies,
              coalesce(c.relacl::text,'') acl,
              coalesce((SELECT string_agg(a.attacl::text,'|' ORDER BY a.attnum) FROM pg_attribute a
                WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL),'') column_acl
         FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
        WHERE s.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname`,
      [BOUNDED_TABLES],
    )
  ).rows;

/** Every function in `public`: identity, full definition and raw ACL. Proves
 * the follow-up adds no function and changes no EXECUTE grant, including for
 * the optional role (which appears in `proacl` when present). */
const functions = async (db: PGlite) =>
  (
    await db.query(
      `SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
              coalesce(p.proacl::text,'') acl
         FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
        WHERE s.nspname='public' ORDER BY 1`,
    )
  ).rows;

const defaultAcls = async (db: PGlite) =>
  (
    await db.query(
      `SELECT d.defaclrole::regrole::text grantor,d.defaclnamespace::regnamespace::text schema,
              d.defaclobjtype objtype,d.defaclacl::text acl
         FROM pg_default_acl d ORDER BY 1,2,3,4`,
    )
  ).rows;

/** Exact contents of the four bounded tables, plus the money ledgers that must
 * stay empty (nothing is funded, granted or activated by either migration). */
const data = async (db: PGlite) =>
  (
    await db.query<{ d: unknown }>(
      `SELECT jsonb_build_object(
          'windows',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.window_id) FROM public.weekly_test_windows t),
          'slots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.publish_at) FROM public.weekly_test_window_slots s),
          'contracts',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.stage) FROM public.weekly_test_window_contracts c),
          'allowances',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.stage) FROM public.weekly_test_window_allowances a),
          'permits',(SELECT count(*) FROM public.ai_expense_permits),
          'requests',(SELECT count(*) FROM public.ai_expense_requests),
          'budgets',(SELECT count(*) FROM public.ai_expense_budgets)) d`,
    )
  ).rows[0].d;

const roles = async (db: PGlite) =>
  (
    await db.query(
      `SELECT rolname,rolcanlogin,rolbypassrls,rolsuper,rolcreaterole
         FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY rolname`,
    )
  ).rows;

async function snapshot(db: PGlite): Promise<Snapshot> {
  return {
    tableAcls: await tableAcls(db),
    functions: await functions(db),
    defaultAcls: await defaultAcls(db),
    data: await data(db),
    roles: await roles(db),
  };
}

/** `has_table_privilege` for every direct table right, per bounded table. */
const rights = async (db: PGlite, role: string) =>
  (
    await db.query<{ name: string; privilege: string; allowed: boolean }>(
      `SELECT t.name,p.privilege,has_table_privilege($1,'public.'||t.name,p.privilege) allowed
         FROM unnest($2::text[]) t(name),unnest($3::text[]) p(privilege)
        ORDER BY t.name,p.privilege`,
      [role, BOUNDED_TABLES, TABLE_RIGHTS],
    )
  ).rows;

/** Run one statement with the session role actually switched. */
async function asRole(db: PGlite, role: string, statement: string): Promise<Probe> {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query(statement);
    return { ok: true, code: null, message: "" };
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return {
      ok: false,
      code: failure.code ?? null,
      message: failure.message ?? String(error),
    };
  } finally {
    await db.exec("RESET ROLE");
  }
}

/** Real reads of the four bounded tables as the sandbox role. */
async function readsAsSandbox(db: PGlite) {
  const out: Record<string, Probe & { rows?: number }> = {};
  for (const table of BOUNDED_TABLES) {
    await db.exec(`SET ROLE ${SANDBOX}`);
    try {
      const { rows } = await db.query<{ n: number }>(
        `SELECT count(*)::integer n FROM public.${table}`,
      );
      out[table] = { ok: true, code: null, message: "", rows: rows[0].n };
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      out[table] = { ok: false, code: failure.code ?? null, message: failure.message ?? "" };
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  return out;
}

describe("original bounded migration is untouched", () => {
  it("still has the reviewed SHA256 identity", () => {
    expect(
      createHash("sha256")
        .update(readFileSync(`supabase/migrations/${BOUNDED}`))
        .digest("hex"),
    ).toBe(BOUNDED_SHA256);
  });
  it("names no sandbox role anywhere (the grant it misses is an inherited default)", () => {
    expect(migration(BOUNDED)).not.toContain(SANDBOX);
  });
});

describe("missing prerequisite tables", () => {
  it("refuses to install and names every absent bounded table", async () => {
    const db = new PGlite();
    try {
      await expect(db.exec(migration(FOLLOWUP))).rejects.toThrow(
        /bounded_window_tables_absent: weekly_test_window_allowances,weekly_test_window_contracts,weekly_test_window_slots,weekly_test_windows/,
      );
    } finally {
      await db.close();
    }
  }, 30000);
});

describe("environment role present (local default-grant fixture)", () => {
  let db: PGlite;
  let before: Snapshot;
  let after: Snapshot;
  let reapplied: Snapshot;
  let readsBefore: Awaited<ReturnType<typeof readsAsSandbox>>;
  let rightsBefore: Awaited<ReturnType<typeof rights>>;
  let rightsAfter: Awaited<ReturnType<typeof rights>>;
  let closedBefore: Record<string, Awaited<ReturnType<typeof rights>>>;
  let closedAfter: Record<string, Awaited<ReturnType<typeof rights>>>;
  let denials: Record<string, { select: Probe; insert: Probe }>;
  let denialsAfterReapply: Record<string, { select: Probe }>;
  let sentinelAfter: { select: Probe; insert: Probe; privileges: unknown };
  let futurePrivileges: unknown;

  beforeAll(async () => {
    db = await prepared();
    // LOCAL FIXTURE ONLY — reproduces the environment this migration is written
    // for: an optional LOGIN, BYPASSRLS, non-superuser role plus a default
    // grant that applies to tables created AFTERWARDS by this same creator.
    await db.exec(`CREATE ROLE ${SANDBOX} LOGIN BYPASSRLS`);
    await db.exec(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO ${SANDBOX}`,
    );
    // Unrelated table created while the default grant is in force.
    await db.exec(
      `CREATE TABLE public.${SENTINEL}(id integer PRIMARY KEY);INSERT INTO public.${SENTINEL}(id) VALUES(1);`,
    );

    // The real bounded migration, which creates the four tables under that default.
    await db.exec(migration(BOUNDED));
    // Fixture rows (inserted directly by the owning superuser, NOT by the
    // register RPC) so a sandbox read returns actual data rather than an empty
    // relation, and so "data unchanged" is a real comparison.
    const { rows } = await db.query<{ window_id: string; publish_at: string }>(
      `WITH w AS (
         INSERT INTO public.weekly_test_windows(user_id,project_id,starts_at,ends_at,
             expected_revision,expected_configuration,lifetime_ceiling_microusd)
           VALUES($1,'privacy-fixture',now(),now()+interval '168 hours',1,
             '{"mode":"approve_first"}'::jsonb,2200000)
           RETURNING window_id,ends_at
       ), s AS (
         INSERT INTO public.weekly_test_window_slots(window_id,publish_at)
           SELECT w.window_id,now()+interval '24 hours' FROM w RETURNING window_id,publish_at
       ), c AS (
         INSERT INTO public.weekly_test_window_contracts(window_id,stage,provider,model,operation,ceiling_microusd)
           SELECT w.window_id,'research','openai','gpt-5.6-terra','generateOpportunitiesCore',500000 FROM w
           RETURNING window_id
       ), a AS (
         INSERT INTO public.weekly_test_window_allowances(window_id,publish_at,stage,user_id,project_id,
             request_id,job_id,provider,model,operation,ceiling_microusd,period,expires_at)
           SELECT s.window_id,s.publish_at,'research',$1,'privacy-fixture',gen_random_uuid(),
             gen_random_uuid(),'openai','gpt-5.6-terra','generateOpportunitiesCore',500000,'2026-10',
             (SELECT ends_at FROM w) FROM s RETURNING window_id
       ) SELECT s.window_id,s.publish_at::text publish_at FROM s`,
      [owner],
    );
    expect(rows).toHaveLength(1);

    // State the original migration leaves behind, BEFORE the follow-up.
    before = await snapshot(db);
    rightsBefore = await rights(db, SANDBOX);
    closedBefore = {};
    for (const role of CLOSED_ROLES) closedBefore[role] = await rights(db, role);
    readsBefore = await readsAsSandbox(db);

    // The exact new migration.
    await db.exec(migration(FOLLOWUP));
    after = await snapshot(db);
    rightsAfter = await rights(db, SANDBOX);
    closedAfter = {};
    for (const role of CLOSED_ROLES) closedAfter[role] = await rights(db, role);
    denials = {};
    for (const table of BOUNDED_TABLES)
      denials[table] = {
        select: await asRole(db, SANDBOX, `SELECT * FROM public.${table}`),
        // Permission is checked before any constraint, so a bare DEFAULT row
        // never reaches the table; a wrongly surviving grant would surface as a
        // NOT NULL/foreign-key error instead of 42501 and still fail below.
        insert: await asRole(db, SANDBOX, `INSERT INTO public.${table} VALUES(DEFAULT)`),
      };
    sentinelAfter = {
      select: await asRole(db, SANDBOX, `SELECT * FROM public.${SENTINEL}`),
      insert: await asRole(db, SANDBOX, `INSERT INTO public.${SENTINEL}(id) VALUES(2)`),
      privileges: (
        await db.query(
          `SELECT has_table_privilege($1,$2,'SELECT') "select",has_table_privilege($1,$2,'INSERT') "insert"`,
          [SANDBOX, `public.${SENTINEL}`],
        )
      ).rows[0],
    };

    // Re-applying the follow-up must be a no-op, not an error.
    await db.exec(migration(FOLLOWUP));
    reapplied = await snapshot(db);
    denialsAfterReapply = {};
    for (const table of BOUNDED_TABLES)
      denialsAfterReapply[table] = {
        select: await asRole(db, SANDBOX, `SELECT * FROM public.${table}`),
      };

    // A future unrelated table must still inherit the untouched defaults.
    await db.exec(`CREATE TABLE public.${FUTURE}(id integer PRIMARY KEY)`);
    futurePrivileges = (
      await db.query(
        `SELECT has_table_privilege($1,$2,'SELECT') "select",has_table_privilege($1,$2,'INSERT') "insert"`,
        [SANDBOX, `public.${FUTURE}`],
      )
    ).rows[0];
  }, 120000);

  afterAll(async () => {
    await db?.close();
  });

  describe("the defect the follow-up exists for", () => {
    it("the role is a real reader: LOGIN, BYPASSRLS and not superuser", async () => {
      expect(
        (
          await db.query(
            `SELECT rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname=$1`,
            [SANDBOX],
          )
        ).rows,
      ).toEqual([{ rolcanlogin: true, rolbypassrls: true, rolsuper: false }]);
    });
    it("the original migration leaves SELECT and INSERT on all four tables", () => {
      for (const row of rightsBefore)
        expect(row.allowed, `${row.name} ${row.privilege}`).toBe(
          row.privilege === "SELECT" || row.privilege === "INSERT",
        );
    });
    it("the role can actually read the fixture rows despite RLS being enabled", () => {
      for (const table of BOUNDED_TABLES) {
        expect(readsBefore[table].ok, table).toBe(true);
        expect(readsBefore[table].rows, table).toBe(1);
      }
      for (const row of before.tableAcls as Array<{ name: string; rls: boolean }>)
        expect(row.rls, row.name).toBe(true);
    });
  });

  describe("after the follow-up", () => {
    it("denies direct SELECT on all four bounded tables with SQLSTATE 42501", () => {
      for (const table of BOUNDED_TABLES) {
        expect(denials[table].select.ok, table).toBe(false);
        expect(denials[table].select.code, `${table}: ${denials[table].select.message}`).toBe(
          "42501",
        );
        expect(denials[table].select.message).toMatch(/permission denied/);
      }
    });
    it("denies direct INSERT on all four bounded tables with SQLSTATE 42501", () => {
      for (const table of BOUNDED_TABLES) {
        expect(denials[table].insert.ok, table).toBe(false);
        expect(denials[table].insert.code, `${table}: ${denials[table].insert.message}`).toBe(
          "42501",
        );
      }
    });
    it("reports false for every direct table right of the sandbox role", () => {
      for (const row of rightsAfter)
        expect(row.allowed, `${row.name} ${row.privilege}`).toBe(false);
    });
    it("leaves no sandbox entry in the table or column ACLs", () => {
      for (const row of after.tableAcls as Array<{
        name: string;
        acl: string;
        column_acl: string;
      }>) {
        expect(row.acl, row.name).not.toContain(SANDBOX);
        expect(row.column_acl, row.name).toBe("");
      }
    });
    it("keeps PUBLIC, anon, authenticated and service_role closed exactly as before", () => {
      for (const role of CLOSED_ROLES) {
        for (const row of closedBefore[role])
          expect(row.allowed, `before ${role} ${row.name} ${row.privilege}`).toBe(false);
        expect(closedAfter[role], role).toEqual(closedBefore[role]);
      }
    });
    it("leaves RLS, forced RLS and the zero policies of each table intact", () => {
      const strip = (rows: unknown[]) =>
        (rows as Array<Record<string, unknown>>).map(({ name, rls, forced, policies }) => ({
          name,
          rls,
          forced,
          policies,
        }));
      expect(strip(after.tableAcls)).toEqual(strip(before.tableAcls));
      for (const row of strip(after.tableAcls)) {
        expect(row.rls, String(row.name)).toBe(true);
        expect(row.policies, String(row.name)).toBe(0);
      }
    });
    it("changes no function definition and no EXECUTE grant in public", () => {
      expect(after.functions).toEqual(before.functions);
    });
    it("keeps the four operator RPCs executable by service_role only", async () => {
      const { rows } = await db.query(
        `SELECT p.proname name,has_function_privilege('service_role',p.oid,'EXECUTE') service,
                has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
                has_function_privilege($1,p.oid,'EXECUTE') sandbox
           FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
          WHERE s.nspname='public' AND p.proname LIKE '%weekly_test_window%' ORDER BY p.proname`,
        [SANDBOX],
      );
      expect(rows).toEqual([
        {
          name: "assert_weekly_test_window_dispatch",
          service: true,
          authenticated: false,
          sandbox: false,
        },
        { name: "read_weekly_test_window", service: true, authenticated: false, sandbox: false },
        {
          name: "register_weekly_test_window",
          service: true,
          authenticated: false,
          sandbox: false,
        },
        { name: "revoke_weekly_test_window", service: true, authenticated: false, sandbox: false },
        { name: "weekly_test_window_admits", service: false, authenticated: false, sandbox: false },
        { name: "weekly_test_window_fresh", service: false, authenticated: false, sandbox: false },
        { name: "weekly_test_window_state", service: false, authenticated: false, sandbox: false },
      ]);
    });
    it("changes no row of the four tables and funds nothing", () => {
      expect(after.data).toEqual(before.data);
      expect(after.data).toMatchObject({ permits: 0, requests: 0, budgets: 0 });
    });
    it("creates, alters or drops no role", () => {
      expect(after.roles).toEqual(before.roles);
    });
    it("leaves the default privilege snapshot byte-identical", () => {
      expect(after.defaultAcls).toEqual(before.defaultAcls);
      expect(JSON.stringify(after.defaultAcls)).toContain(SANDBOX);
    });
    it("leaves the unrelated sentinel table's inherited SELECT and INSERT working", () => {
      expect(sentinelAfter.privileges).toEqual({ select: true, insert: true });
      expect(sentinelAfter.select.ok, sentinelAfter.select.message).toBe(true);
      expect(sentinelAfter.insert.ok, sentinelAfter.insert.message).toBe(true);
    });
    it("still gives a future unrelated table the same inherited defaults", () => {
      expect(futurePrivileges).toEqual({ select: true, insert: true });
    });
  });

  describe("re-applying the follow-up", () => {
    it("is a no-op: same ACLs, functions, defaults, roles and data", () => {
      expect(reapplied).toEqual(after);
    });
    it("keeps every bounded table denied", () => {
      for (const table of BOUNDED_TABLES) {
        expect(denialsAfterReapply[table].select.ok, table).toBe(false);
        expect(denialsAfterReapply[table].select.code, table).toBe("42501");
      }
    });
  });
});

describe("environment role absent", () => {
  let db: PGlite;
  let before: Snapshot;
  let after: Snapshot;

  beforeAll(async () => {
    db = await prepared();
    await db.exec(migration(BOUNDED));
    before = await snapshot(db);
    // Must apply cleanly with no optional role anywhere.
    await db.exec(migration(FOLLOWUP));
    after = await snapshot(db);
  }, 120000);

  afterAll(async () => {
    await db?.close();
  });

  it("applies without creating or changing any role", async () => {
    expect(after.roles).toEqual(before.roles);
    expect((await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1`, [SANDBOX])).rows).toEqual([]);
  });
  it("changes no table ACL, RLS setting, policy or function", () => {
    expect(after.tableAcls).toEqual(before.tableAcls);
    expect(after.functions).toEqual(before.functions);
  });
  it("adds no default privilege entry", () => {
    expect(before.defaultAcls).toEqual([]);
    expect(after.defaultAcls).toEqual([]);
  });
  it("leaves the four tables closed to every client role and empty", async () => {
    for (const role of CLOSED_ROLES)
      for (const row of await rights(db, role))
        expect(row.allowed, `${role} ${row.name} ${row.privilege}`).toBe(false);
    expect(after.data).toEqual(before.data);
    expect(after.data).toMatchObject({
      windows: null,
      slots: null,
      contracts: null,
      allowances: null,
      permits: 0,
      requests: 0,
      budgets: 0,
    });
  });
});
