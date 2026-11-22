import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** The GA4 test-rollout candidate on top of the released google_connections definition. */
let db: PGlite;
const sql = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");
const CANDIDATE = "20261122152000_ga4_connections.sql";
const DAILY = "20261122180000_ga4_synergy_daily_sync.sql";
const U = "00000000-0000-4000-8000-000000000001";

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
  );
  // Minimal Supabase Vault and pg_cron stand-ins.
  await db.exec(`
    CREATE SCHEMA vault; CREATE TABLE vault.secrets(name text PRIMARY KEY, secret text);
    CREATE VIEW vault.decrypted_secrets AS SELECT name, secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(s text, n text, d text) RETURNS uuid LANGUAGE sql AS $$
      INSERT INTO vault.secrets VALUES (n, s); SELECT gen_random_uuid() $$;
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY, jobname text, schedule text, command text);
    CREATE FUNCTION cron.schedule(n text, e text, c text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname, schedule, command) VALUES (n, e, c) RETURNING jobid $$;
    CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$
      DELETE FROM cron.job WHERE jobname = n RETURNING true $$;
  `);
  await db.exec(sql("20260630120000_google_connections.sql"));
  await db.exec(sql(CANDIDATE));
  await db.exec(sql(CANDIDATE)); // idempotent re-apply
  await db.exec(sql(DAILY));
  await db.exec(sql(DAILY));
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe("GA4 rollout migration", () => {
  it.each(["ga4_project_properties", "ga4_oauth_attempts", "ga4_daily_reports"])(
    "%s has RLS, no policies and service-role-only privileges",
    async (table) => {
      const rls = await db.query<{ relrowsecurity: boolean }>(
        "SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass",
        [`public.${table}`],
      );
      expect(rls.rows[0].relrowsecurity).toBe(true);
      const policies = await db.query("SELECT 1 FROM pg_policies WHERE tablename = $1", [table]);
      expect(policies.rows).toHaveLength(0);
      for (const role of ["anon", "authenticated"])
        for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
          expect(
            (
              await db.query<{ ok: boolean }>("SELECT has_table_privilege($1,$2,$3) ok", [
                role,
                `public.${table}`,
                p,
              ])
            ).rows[0].ok,
            `${role} ${p}`,
          ).toBe(false);
      expect(
        (
          await db.query<{ ok: boolean }>(
            "SELECT has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') ok",
            [`public.${table}`],
          )
        ).rows[0].ok,
      ).toBe(true);
    },
  );

  it("keeps the GA4 token row beside Search Console under the existing unique (user_id, provider)", async () => {
    const insert = (provider: string) =>
      db.query(
        "INSERT INTO public.google_connections(workspace_id,user_id,provider) VALUES($1,$2,$3)",
        [U, U, provider],
      );
    await insert("google_search_console");
    await insert("google_analytics");
    await expect(insert("google_analytics")).rejects.toThrow();
  });

  it("rejects malformed property ids, nonce hashes and project ids", async () => {
    await expect(
      db.query(
        "INSERT INTO public.ga4_project_properties(user_id,project_id,property_id) VALUES($1,'p','12a')",
        [U],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "INSERT INTO public.ga4_oauth_attempts(nonce_hash,user_id,project_id,expires_at) VALUES('abc',$1,'p',now())",
        [U],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "INSERT INTO public.ga4_oauth_attempts(nonce_hash,user_id,project_id,expires_at) VALUES($2,$1,'',now())",
        [U, "a".repeat(64)],
      ),
    ).rejects.toThrow();
  });

  it("consumes an attempt exactly once", async () => {
    const hash = "b".repeat(64);
    await db.query(
      "INSERT INTO public.ga4_oauth_attempts(nonce_hash,user_id,project_id,expires_at) VALUES($1,$2,'p',now() + interval '10 minutes')",
      [hash, U],
    );
    const consume = () =>
      db.query(
        "DELETE FROM public.ga4_oauth_attempts WHERE nonce_hash=$1 AND user_id=$2 AND project_id='p' AND expires_at > now() RETURNING nonce_hash",
        [hash, U],
      );
    expect((await consume()).rows).toHaveLength(1);
    expect((await consume()).rows).toHaveLength(0);
  });

  describe("Synergy daily sync", () => {
    const P = "528831108";
    const select = async () =>
      (await db.query("SELECT 1 FROM public.ga4_daily_reports WHERE user_id = $1", [U])).rows;
    const snapshotRow = (end: string, start: string) =>
      db.query(
        `INSERT INTO public.ga4_daily_reports(user_id,project_id,property_id,period_start,period_end,snapshot,last_attempt_at,last_success_at)
         VALUES($1,'syn',$2,$3,$4,'{"source":"ga4_api"}',now(),now())
         ON CONFLICT (user_id,project_id) DO UPDATE SET period_start = EXCLUDED.period_start`,
        [U, P, start, end],
      );

    it("schedules one named job at 05:40 UTC with the vault Bearer, generated in-database", async () => {
      const jobs = await db.query<{ schedule: string; command: string }>(
        "SELECT schedule, command FROM cron.job WHERE jobname = 'ga4-synergy-daily-sync'",
      );
      expect(jobs.rows).toHaveLength(1);
      expect(jobs.rows[0].schedule).toBe("40 5 * * *");
      expect(jobs.rows[0].command).toContain(
        "https://milogrowth.com/api/google/analytics/daily-sync",
      );
      expect(jobs.rows[0].command).toContain("name = 'ga4_daily_cron_secret'");
      const secrets = await db.query<{ n: number; len: number }>(
        "SELECT count(*)::int n, max(length(secret)) len FROM vault.secrets WHERE name = 'ga4_daily_cron_secret'",
      );
      expect(secrets.rows[0]).toEqual({ n: 1, len: 64 });
    });

    it("exposes the secret accessor to the service role only", async () => {
      for (const [role, ok] of [
        ["anon", false],
        ["authenticated", false],
        ["service_role", true],
      ] as const)
        expect(
          (
            await db.query<{ ok: boolean }>(
              "SELECT has_function_privilege($1, 'public.ga4_daily_cron_secret()', 'EXECUTE') ok",
              [role],
            )
          ).rows[0].ok,
          role,
        ).toBe(ok);
    });

    it("requires a property selection, a 28-day period with a snapshot and a known error code", async () => {
      await expect(snapshotRow("2026-11-21", "2026-10-25")).rejects.toThrow(); // no selection yet
      await db.query(
        "INSERT INTO public.ga4_project_properties(user_id,project_id,property_id) VALUES($1,'syn',$2)",
        [U, P],
      );
      await snapshotRow("2026-11-21", "2026-10-25");
      await expect(snapshotRow("2026-11-21", "2026-10-01")).rejects.toThrow();
      await expect(
        db.query(
          "UPDATE public.ga4_daily_reports SET last_error = 'Google said: quota' WHERE user_id = $1",
          [U],
        ),
      ).rejects.toThrow();
      await expect(
        db.query("UPDATE public.ga4_daily_reports SET snapshot = NULL WHERE user_id = $1", [U]),
      ).rejects.toThrow();
      await db.query(
        "UPDATE public.ga4_daily_reports SET last_error = 'expired' WHERE user_id = $1",
        [U],
      );
      expect(await select()).toHaveLength(1);
    });

    it("disappears with the property selection (disconnect)", async () => {
      await db.query("DELETE FROM public.ga4_project_properties WHERE user_id = $1", [U]);
      expect(await select()).toHaveLength(0);
    });
  });
});
