/**
 * BU (29 September 2026) — production-shaped website knowledge intake through the REAL path:
 * captureProjectWebsiteKnowledge → real fetchSiteContext extraction (only the pinned socket layer is replaced by
 * a page body) → real writeProjectKnowledgePair → the APPLIED SQL pair function in PGlite. The page body is a
 * production-shaped SSR homepage (title, Polish text, script tags carrying dehydrated router state with NUL
 * characters, inline style) or, when MILO_BU_HOMEPAGE_HTML names a local file, the actual public homepage saved
 * for the local reproduction. Page input is untrusted data; nothing here follows instructions from it.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ html: "", calls: [] as string[], rpc: [] as string[] }));
vi.mock("./homepage-fetch.server", () => ({
  fetchHomepageHtml: async (url: string) => {
    h.calls.push(url);
    return h.html;
  },
}));
let db: PGlite;
const rpcNames: Record<string, string[]> = {
  read_project_knowledge: ["p_user", "p_project"],
  save_project_knowledge_pair: [
    "p_user",
    "p_project",
    "p_source",
    "p_record",
    "p_source_expected",
    "p_record_expected",
  ],
};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpc.push(name);
      const order = rpcNames[name];
      if (!order) return { data: null, error: { code: "unknown_rpc" } };
      const params = order.map((k) =>
        args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k],
      );
      try {
        const r = await db.query<{ result: unknown }>(
          `SELECT public.${name}(${order.map((_, i) => `$${i + 1}`).join(",")}) result`,
          params,
        );
        return { data: r.rows[0].result, error: null };
      } catch (e) {
        // Fixed class only; no SQL text or bodies are surfaced.
        return { data: null, error: { code: String((e as Error).message).split(":")[0] } };
      }
    },
  },
}));
import { captureProjectWebsiteKnowledge } from "./project-knowledge-website.server";
import { KnowledgeUnavailableError } from "./project-knowledge.server";
const user = "00000000-0000-4000-8000-000000000001";
const scope = { ownerId: user, projectId: "owifrp3e" };
const polish =
  "Strony gotowe pod SEO i AI dla polskich firm usługowych. Projektujemy szybkie, dostępne strony, które " +
  "odpowiadają na pytania klientów, są czytelne dla wyszukiwarek i asystentów AI oraz prowadzą do zapytań. ";
/** Production-shaped SSR shell: dehydrated router state with NUL characters inside a script, styles, nav, body. */
const SHAPED_HTML = `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><title>Strony gotowe pod SEO i AI dla polskich firm usługowych - Andersen Innovations</title>
<meta name="description" content="Szybkie strony dla firm usługowych."><style>.a{color:red}</style></head><body>
<a href="#main">Przejdź do treści</a><nav><a href="/uslugi">Usługi</a><a href="/cennik">Cennik</a><a href="/o-nas">O nas</a></nav>
<main id="main">${polish.repeat(12)}</main>
<script>$R=[];$R[0]={matches:[{i:"__root__\u0000",u:1790641399435,s:"success",ssr:!0}]}</script>
<script type="module" src="/assets/index-abc.js"></script></body></html>`;
const fixturePath = process.env.MILO_BU_HOMEPAGE_HTML;
const html = fixturePath ? readFileSync(fixturePath, "utf8") : SHAPED_HTML;
const count = async (table: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${user}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb);
    INSERT INTO public.workspace_meta VALUES('${user}');
    INSERT INTO public.workspace_entities(user_id,collection,entity_id) VALUES('${user}','projects','owifrp3e');`);
  await db.exec(readFileSync("supabase/migrations/20260909200000_project_knowledge.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  h.html = html;
  h.calls = [];
  h.rpc = [];
  await db.exec(
    "TRUNCATE public.project_knowledge_documents,public.project_knowledge_records,public.project_knowledge_sources,public.project_knowledge_history,public.project_knowledge_tombstones",
  );
});
afterAll(async () => {
  await db.close();
});
describe("production-shaped homepage capture through the real pair path", () => {
  it(`writes one website source and one proposed excerpt via the applied SQL (${fixturePath ? "actual saved homepage" : "shaped fixture"})`, async () => {
    const result = await captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl");
    expect(h.calls).toEqual(["https://anderseninnovations.pl/"]);
    expect(result.changed).toBe(true);
    expect(result.source).toMatchObject({ kind: "website", revision: 1, status: "active" });
    expect(await count("project_knowledge_sources")).toBe(1);
    expect(await count("project_knowledge_records")).toBe(1);
    const stored = (
      await db.query<{ result: { sources: unknown[]; records: Array<Record<string, unknown>> } }>(
        "SELECT public.read_project_knowledge($1,$2) result",
        [user, scope.projectId],
      )
    ).rows[0].result;
    expect(stored.sources).toHaveLength(1);
    expect(stored.records).toHaveLength(1);
    const record = stored.records[0];
    expect(record).toMatchObject({ key: "fact.website-excerpt", status: "proposed", revision: 1 });
    expect(String(record.value)).toHaveLength(2000);
    // No C0 control character (including the NUL carried by the page's script state) reaches the stored value.
    expect(
      Array.from(String(record.value)).some((c) => {
        const code = c.codePointAt(0)!;
        return code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
      }),
    ).toBe(false);
    // A repeated capture of the unchanged page is idempotent through the same real path.
    expect((await captureProjectWebsiteKnowledge(scope, "anderseninnovations.pl")).changed).toBe(
      false,
    );
    expect(await count("project_knowledge_records")).toBe(1);
  });
  it("a page without readable text is a KNOWN fetch rejection: nothing is written and the reason is distinguishable from an unconfirmed save", async () => {
    h.html = `<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>`;
    const failure = await captureProjectWebsiteKnowledge(
      scope,
      "https://anderseninnovations.pl",
    ).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(KnowledgeUnavailableError);
    expect((failure as Error).message).toBe("website_source_unreadable");
    expect(await count("project_knowledge_sources")).toBe(0);
    expect(await count("project_knowledge_records")).toBe(0);
  });
  it("an unreachable page (empty body) is the same known rejection", async () => {
    h.html = "";
    await expect(
      captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl"),
    ).rejects.toThrow("website_source_unreadable");
    expect(await count("project_knowledge_sources")).toBe(0);
  });
  it("BV: a record insert refused INSIDE the real pair transaction rolls back the already-inserted source (pair RPC reached, no partial rows or history)", async () => {
    // Isolated local trigger: the source insert of save_project_knowledge_pair succeeds (rollback-proof
    // sequence probe records it), then the record insert is refused, so the whole RPC statement rolls back.
    await db.exec(`CREATE SEQUENCE public.bv_source_probe;
      CREATE FUNCTION public.bv_probe_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('public.bv_source_probe'); RETURN NEW; END $$;
      CREATE TRIGGER bv_probe_source BEFORE INSERT ON public.project_knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.bv_probe_source();
      CREATE FUNCTION public.bv_refuse_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'bv_record_refused' USING ERRCODE='22023'; END $$;
      CREATE TRIGGER bv_refuse_record BEFORE INSERT ON public.project_knowledge_records FOR EACH ROW EXECUTE FUNCTION public.bv_refuse_record();`);
    try {
      const failure = await captureProjectWebsiteKnowledge(
        scope,
        "https://anderseninnovations.pl",
      ).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(KnowledgeUnavailableError);
      expect(h.calls).toEqual(["https://anderseninnovations.pl/"]);
      expect(h.rpc).toEqual(["read_project_knowledge", "save_project_knowledge_pair"]);
      const probe = (
        await db.query<{ n: string }>(
          "SELECT CASE WHEN is_called THEN last_value ELSE 0 END n FROM public.bv_source_probe",
        )
      ).rows[0].n;
      expect(Number(probe)).toBe(1);
    } finally {
      await db.exec(`DROP TRIGGER bv_refuse_record ON public.project_knowledge_records; DROP FUNCTION public.bv_refuse_record();
        DROP TRIGGER bv_probe_source ON public.project_knowledge_sources; DROP FUNCTION public.bv_probe_source(); DROP SEQUENCE public.bv_source_probe;`);
    }
    expect(await count("project_knowledge_sources")).toBe(0);
    expect(await count("project_knowledge_records")).toBe(0);
    expect(await count("project_knowledge_history")).toBe(0);
    // The same capture succeeds once the refusal is gone (nothing stale was left behind).
    expect(
      (await captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl")).changed,
    ).toBe(true);
    expect(await count("project_knowledge_sources")).toBe(1);
  });
  it("a refused INITIAL read is an unconfirmed save before any fetch or pair write", async () => {
    await db.exec(
      "ALTER TABLE public.project_knowledge_records RENAME TO project_knowledge_records_off",
    );
    try {
      await expect(
        captureProjectWebsiteKnowledge(scope, "https://anderseninnovations.pl"),
      ).rejects.toBeInstanceOf(KnowledgeUnavailableError);
    } finally {
      await db.exec(
        "ALTER TABLE public.project_knowledge_records_off RENAME TO project_knowledge_records",
      );
    }
    expect(h.rpc).toEqual(["read_project_knowledge"]);
    expect(h.calls).toEqual([]);
    expect(await count("project_knowledge_sources")).toBe(0);
  });
});
