import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
function originalFunction(path: string, name: string, delimiter: string) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
  if (start < 0) throw new Error("Missing original trigger definition");
  const bodyStart = source.indexOf(`AS ${delimiter}`, start);
  const end = source.indexOf(`${delimiter};`, bodyStart + delimiter.length + 3);
  return source.slice(start, end + delimiter.length + 1);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.workspace_entities(user_id uuid, collection text, entity_id text);
    CREATE TABLE public.workspace_meta(id text PRIMARY KEY, updated_at timestamptz);
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.active_plan_id(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'freePreview'::text $$;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON public.workspace_entities,public.workspace_meta TO authenticated;
  `);
  await db.exec(
    originalFunction(
      "supabase/migrations/20260730205423_d6fe67e4-58c0-4848-86bd-649615604d1c.sql",
      "workspace_entities_project_cap",
      "$function$",
    ),
  );
  await db.exec(
    originalFunction(
      "supabase/migrations/20260726120000_workspace_entities.sql",
      "tg_workspace_meta_updated_at",
      "$$",
    ),
  );
  await db.exec(`
    CREATE TRIGGER cap BEFORE INSERT ON public.workspace_entities FOR EACH ROW EXECUTE FUNCTION public.workspace_entities_project_cap();
    CREATE TRIGGER updated BEFORE UPDATE ON public.workspace_meta FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_meta_updated_at();
  `);
  await db.exec(
    readFileSync("supabase/migrations/20260907233000_workspace_trigger_privileges.sql", "utf8"),
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; RESET search_path; TRUNCATE public.workspace_entities,public.workspace_meta;",
  );
});
afterAll(async () => {
  await db?.close();
});

describe("workspace trigger privilege hygiene", () => {
  it("removes ordinary execute access while preserving service maintenance access", async () => {
    const result = await db.query<{
      anon: boolean;
      authenticated: boolean;
      service: boolean;
      settings: string[];
    }>(`
      SELECT has_function_privilege('anon',oid,'EXECUTE') anon,
        has_function_privilege('authenticated',oid,'EXECUTE') authenticated,
        has_function_privilege('service_role',oid,'EXECUTE') service, proconfig settings
      FROM pg_proc WHERE proname IN ('workspace_entities_project_cap','tg_workspace_meta_updated_at')
    `);
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows)
      expect(row).toEqual({
        anon: false,
        authenticated: false,
        service: true,
        settings: ['search_path=""'],
      });
  });
  it("still enforces the project cap through an authenticated insert", async () => {
    await db.exec("SET ROLE authenticated; SET search_path='pg_catalog';");
    await db.exec(
      "INSERT INTO public.workspace_entities SELECT '11111111-1111-4111-8111-111111111111','projects',n::text FROM generate_series(1,5) n;",
    );
    await expect(
      db.exec(
        "INSERT INTO public.workspace_entities VALUES ('11111111-1111-4111-8111-111111111111','projects','six');",
      ),
    ).rejects.toThrow("Project limit reached (5)");
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int count FROM public.workspace_entities",
        )
      ).rows[0].count,
    ).toBe(5);
  });
  it("keeps non-project writes working after execute revocation", async () => {
    await db.exec(
      "SET ROLE authenticated; INSERT INTO public.workspace_entities VALUES ('11111111-1111-4111-8111-111111111111','content','draft');",
    );
    expect((await db.query("SELECT entity_id FROM public.workspace_entities")).rows).toEqual([
      { entity_id: "draft" },
    ]);
  });
  it("still updates metadata timestamps under an unrelated caller search path", async () => {
    await db.exec(
      "INSERT INTO public.workspace_meta VALUES ('meta','2000-01-01'); SET ROLE authenticated; SET search_path='pg_catalog'; UPDATE public.workspace_meta SET id='meta';",
    );
    expect(
      (
        await db.query<{ fresh: boolean }>(
          "SELECT updated_at > '2020-01-01'::timestamptz fresh FROM public.workspace_meta",
        )
      ).rows[0].fresh,
    ).toBe(true);
  });
});
