import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** The GA4 test-rollout candidate on top of the released google_connections definition. */
let db: PGlite;
const sql = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");
const CANDIDATE = "20261122152000_ga4_connections.sql";
const U = "00000000-0000-4000-8000-000000000001";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
  );
  await db.exec(sql("20260630120000_google_connections.sql"));
  await db.exec(sql(CANDIDATE));
  await db.exec(sql(CANDIDATE)); // idempotent re-apply
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe("GA4 rollout migration", () => {
  it.each(["ga4_project_properties", "ga4_oauth_attempts"])(
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
});
