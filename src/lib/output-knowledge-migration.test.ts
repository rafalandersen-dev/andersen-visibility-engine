import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  sid = "00000000-0000-4000-8000-000000000003",
  token = "00000000-0000-4000-8000-000000000004";
const source = {
  ownerId: user,
  projectId: "p",
  id: sid,
  revision: 1,
  kind: "website",
  label: "Website",
  fingerprint: "a".repeat(64),
  observedAt: "2026-09-10T08:00:00Z",
  status: "active",
  url: "https://example.com",
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${user}'),('${other}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb);
    INSERT INTO public.workspace_meta VALUES('${user}'),('${other}');
    INSERT INTO public.workspace_entities(user_id,collection,entity_id) VALUES('${user}','projects','p'),('${other}','projects','p');`);
  await db.exec(readFileSync("supabase/migrations/20260909200000_project_knowledge.sql", "utf8"));
  await db.exec(
    "CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb)",
  );
  await db.exec(readFileSync("supabase/migrations/20260910100000_source_refresh.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/20260911000000_output_knowledge_integrity.sql", "utf8"),
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; DELETE FROM public.workspace_entities WHERE collection='content'; TRUNCATE public.ai_generation_results,public.project_output_source_dependencies,public.project_source_refresh,public.project_knowledge_documents,public.project_knowledge_records,public.project_knowledge_sources,public.project_knowledge_history,public.project_knowledge_tombstones;",
  );
  await db.query("SELECT public.save_project_knowledge($1,'p','source',$2,0,$3)", [
    user,
    sid,
    JSON.stringify(source),
  ]);
});
afterAll(async () => {
  await db?.close();
});

const ref = {
  recordId: token,
  recordRevision: 1,
  sourceId: sid,
  sourceRevision: 1,
  sourceFingerprint: "a".repeat(64),
};
const retain = (kind = "content", refs = [ref], id = token) =>
  db.query(
    "INSERT INTO public.ai_generation_results(receipt_id,user_id,payload) VALUES($1,$2,$3)",
    [
      id,
      user,
      JSON.stringify({
        kind,
        projectId: "p",
        assetId: "a",
        imageId: "im",
        output: { knowledgeReferences: refs },
      }),
    ],
  );
const registry = async (owner = user) =>
  (
    await db.query<{ result: { references: unknown[]; forgotten: boolean; outputId: string }[] }>(
      "SELECT public.read_output_knowledge_dependencies($1,'p',ARRAY['a','b']) result",
      [owner],
    )
  ).rows[0].result;
describe("durable output knowledge", () => {
  it("retains immutable refs for saved output after archive discard and scopes reads", async () => {
    await retain();
    await db.query("INSERT INTO public.workspace_entities VALUES($1,'content','a',$2)", [
      user,
      JSON.stringify({ projectId: "p" }),
    ]);
    await db.query("UPDATE public.ai_generation_results SET payload=NULL WHERE receipt_id=$1", [
      token,
    ]);
    expect((await registry())[0].references).toEqual([ref]);
    expect(await registry(other)).toEqual([]);
  });
  it("retains website and knowledge dependencies in the same row", async () => {
    await db.query(
      "INSERT INTO public.ai_generation_results(receipt_id,user_id,payload) VALUES($1,$2,$3)",
      [
        token,
        user,
        JSON.stringify({
          kind: "content",
          projectId: "p",
          assetId: "a",
          output: {
            knowledgeReferences: [ref],
            sourceDependencies: [
              {
                ownerId: user,
                projectId: "p",
                sourceId: sid,
                key: "price",
                fingerprint: "a".repeat(64),
                critical: true,
              },
            ],
          },
        }),
      ],
    );
    const rows = (
      await db.query<{ n: number }>(
        "SELECT jsonb_array_length(dependencies) n FROM public.project_output_source_dependencies",
      )
    ).rows;
    expect(rows).toEqual([{ n: 1 }]);
    expect((await registry())[0].references).toEqual([ref]);
  });
  it("source forgetting strips identifiers but preserves the hold", async () => {
    await retain();
    await db.query("SELECT public.forget_project_knowledge($1,'p','source',$2,1)", [user, sid]);
    expect((await registry())[0]).toMatchObject({ references: [], forgotten: true });
  });
  it("late generation after forgetting remains held", async () => {
    await db.query("SELECT public.forget_project_knowledge($1,'p','source',$2,1)", [user, sid]);
    await retain();
    expect((await registry())[0]).toMatchObject({ references: [], forgotten: true });
  });
  it("copies saved approved image evidence on reuse even when browser omits it", async () => {
    await retain("image");
    await db.query("INSERT INTO public.workspace_entities VALUES($1,'content','a',$2)", [
      user,
      JSON.stringify({
        projectId: "p",
        images: [{ id: "im", url: "https://example.com/image.webp", status: "accepted" }],
      }),
    ]);
    await db.query("INSERT INTO public.workspace_entities VALUES($1,'content','b',$2)", [
      user,
      JSON.stringify({
        projectId: "p",
        images: [{ id: "copy", url: "https://example.com/image.webp", status: "accepted" }],
      }),
    ]);
    expect((await registry()).find((r) => r.outputId === "copy")?.references).toEqual([ref]);
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='content' AND entity_id='a'",
      [user],
    );
    expect((await registry()).find((r) => r.outputId === "copy")?.references).toEqual([ref]);
  });
  it("record forgetting removes reference identifiers and keeps a hold", async () => {
    const record = {
      ownerId: user,
      projectId: "p",
      id: token,
      revision: 1,
      sourceId: sid,
      sourceRevision: 1,
      key: "visual",
      category: "visualStyle",
      appliesTo: "both",
      value: "Blue",
      locator: "Page 1",
      status: "accepted",
      updatedAt: "2026-09-10T08:00:00Z",
      reviewedAt: "2026-09-10T08:00:00Z",
    };
    await db.query("SELECT public.save_project_knowledge($1,'p','record',$2,0,$3)", [
      user,
      token,
      JSON.stringify(record),
    ]);
    await retain();
    await db.query("SELECT public.forget_project_knowledge($1,'p','record',$2,1)", [user, token]);
    expect((await registry())[0]).toMatchObject({ references: [], forgotten: true });
  });
  it("moves an image within one edit without losing forgotten holds", async () => {
    await retain("image");
    await db.query("INSERT INTO public.workspace_entities VALUES($1,'content','a',$2)", [
      user,
      JSON.stringify({
        projectId: "p",
        images: [{ id: "im", url: "https://example.com/image.webp", status: "accepted" }],
      }),
    ]);
    await db.query("SELECT public.forget_project_knowledge($1,'p','source',$2,1)", [user, sid]);
    await db.query(
      "UPDATE public.workspace_entities SET data=$2 WHERE user_id=$1 AND entity_id='a' AND collection='content'",
      [
        user,
        JSON.stringify({
          projectId: "p",
          images: [{ id: "moved", url: "https://example.com/image.webp", status: "accepted" }],
        }),
      ],
    );
    expect(await registry()).toMatchObject([
      { outputId: "moved", references: [], forgotten: true },
    ]);
  });
  it("releases discarded orphan rows and refuses a late content save", async () => {
    await retain();
    await db.query("UPDATE public.ai_generation_results SET payload=NULL WHERE receipt_id=$1", [
      token,
    ]);
    expect(await registry()).toEqual([]);
    await expect(
      db.query("INSERT INTO public.workspace_entities VALUES($1,'content','a',$2)", [
        user,
        JSON.stringify({ projectId: "p" }),
      ]),
    ).rejects.toThrow("discarded_output_cannot_be_attached");
  });
  it("refuses a late discarded image attachment but preserves unrelated owner edits", async () => {
    await retain("image");
    await db.query("INSERT INTO public.workspace_entities VALUES($1,'content','a',$2)", [
      user,
      JSON.stringify({ projectId: "p", images: [] }),
    ]);
    await db.query("UPDATE public.ai_generation_results SET payload=NULL WHERE receipt_id=$1", [
      token,
    ]);
    expect(await registry()).toEqual([]);
    await expect(
      db.query(
        "UPDATE public.workspace_entities SET data=$2 WHERE user_id=$1 AND collection='content' AND entity_id='a'",
        [user, JSON.stringify({ projectId: "p", images: [{ id: "im" }] })],
      ),
    ).rejects.toThrow("discarded_output_cannot_be_attached");
    await db.query(
      "UPDATE public.workspace_entities SET data=$2 WHERE user_id=$1 AND collection='content' AND entity_id='a'",
      [user, JSON.stringify({ projectId: "p", markdown: "Owner edit", images: [] })],
    );
  });
  it("blocks renamed discarded image reuse by path while keeping an existing copy editable", async () => {
    const path = `${user}/p/a/file.webp`;
    await db.query(
      "INSERT INTO public.ai_generation_results(receipt_id,user_id,payload) VALUES($1,$2,$3)",
      [
        token,
        user,
        JSON.stringify({
          kind: "image",
          projectId: "p",
          assetId: "a",
          imageId: "im",
          output: { path, knowledgeReferences: [ref] },
        }),
      ],
    );
    const copy = {
      projectId: "p",
      images: [
        {
          id: "copy",
          url: `https://example.com/storage/v1/object/public/article-assets-public/${path}`,
          status: "accepted",
        },
      ],
    };
    await db.query("INSERT INTO public.workspace_entities VALUES($1,'content','b',$2)", [
      user,
      JSON.stringify(copy),
    ]);
    await db.query("UPDATE public.ai_generation_results SET payload=NULL WHERE receipt_id=$1", [
      token,
    ]);
    await expect(
      db.query("INSERT INTO public.workspace_entities VALUES($1,'content','c',$2)", [
        user,
        JSON.stringify({ projectId: "p", images: [{ id: "renamed", storagePath: path }] }),
      ]),
    ).rejects.toThrow("discarded_output_cannot_be_attached");
    await db.query(
      "UPDATE public.workspace_entities SET data=$2 WHERE user_id=$1 AND entity_id='b' AND collection='content'",
      [user, JSON.stringify({ ...copy, markdown: "Owner edit" })],
    );
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM public.ai_generation_results WHERE discarded_output_identity IS NOT NULL",
        )
      ).rows[0].n,
    ).toBe(0);
    await db.query(
      "INSERT INTO public.workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p')",
      [user],
    );
  });
  it("denies direct writes and non-service reads", async () => {
    await db.exec("SET ROLE authenticated");
    await expect(registry()).rejects.toThrow();
    await db.exec("RESET ROLE; SET ROLE service_role");
    await expect(
      db.exec("UPDATE public.project_output_source_dependencies SET knowledge_references='[]'"),
    ).rejects.toThrow();
  });
});
