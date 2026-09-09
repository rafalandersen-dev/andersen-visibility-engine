import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const payload = {
  version: 1,
  kind: "content",
  projectId: "p",
  title: "Retained draft",
  output: { markdown: "Actual generated content" },
};
async function claim(bucket = "contentGeneration", userId = user) {
  const id = randomUUID();
  await db.query("SELECT * FROM public.claim_generation_usage($1,$2,'2026-09',$3,100,$4,NULL)", [
    id,
    userId,
    bucket,
    bucket === "contentGeneration" ? "generateContentCore" : "generateArticleImageCore",
  ]);
  return id;
}
const record = (id: string, data: unknown = payload, userId = user) =>
  db.query("SELECT * FROM public.record_generation_result($1,$2,$3)", [
    id,
    userId,
    JSON.stringify(data),
  ]);
const discard = (id: string, userId = user) =>
  db.query("SELECT * FROM public.discard_generation_result($1,$2)", [id, userId]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE TABLE public.workspace_meta (user_id uuid PRIMARY KEY, rev bigint DEFAULT 0,
      active_project_id text, billing_profile jsonb, extras jsonb, subscription jsonb);
    CREATE TABLE public.workspace_entities (user_id uuid, collection text, entity_id text,
      ord int, data jsonb, updated_at timestamptz,
      PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO auth.users VALUES ('${user}'),('${other}');`);
  for (const name of [
    "20260719160000_ai_usage.sql",
    "20260907110000_ai_usage_fail_closed.sql",
    "20260909150000_generation_usage_receipts.sql",
    "20260909160000_generation_result_recovery.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    "TRUNCATE public.workspace_meta,public.workspace_entities,public.ai_generation_results,public.ai_generation_usage_receipts,public.ai_usage;",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("durable private generation results", () => {
  it("records output and completes quota in one transaction, then refuses release", async () => {
    const id = await claim();
    await record(id);
    expect((await db.query("SELECT state FROM public.ai_generation_usage_receipts")).rows).toEqual([
      { state: "completed" },
    ]);
    expect((await db.query("SELECT payload FROM public.ai_generation_results")).rows).toEqual([
      { payload },
    ]);
    await expect(
      db.query("SELECT * FROM public.settle_generation_usage($1,$2,'released')", [id, user]),
    ).rejects.toThrow("already_settled");
    expect((await db.query("SELECT used FROM public.ai_usage")).rows).toEqual([{ used: 1 }]);
  });
  it("allows an identical record replay and refuses overwriting paid output", async () => {
    const id = await claim();
    await record(id);
    await record(id);
    await expect(record(id, { ...payload, title: "Changed" })).rejects.toThrow("conflict");
    expect(
      (await db.query("SELECT count(*)::integer AS n FROM public.ai_generation_results")).rows,
    ).toEqual([{ n: 1 }]);
  });
  it("discard removes private payload and cannot be reversed by a late save", async () => {
    const id = await claim();
    await record(id);
    await discard(id);
    await discard(id);
    expect(
      (
        await db.query(
          "SELECT payload,discarded_at IS NOT NULL AS discarded FROM public.ai_generation_results",
        )
      ).rows,
    ).toEqual([{ payload: null, discarded: true }]);
    await expect(record(id)).rejects.toThrow("conflict");
    expect((await db.query("SELECT state FROM public.ai_generation_usage_receipts")).rows).toEqual([
      { state: "completed" },
    ]);
  });
  it("cannot record or discard another account's output", async () => {
    const id = await claim();
    await expect(record(id, payload, other)).rejects.toThrow("not_found");
    await record(id);
    await expect(discard(id, other)).rejects.toThrow("not_found");
  });
  it.each(["released", "completed"])(
    "does not manufacture an output for a previously %s receipt",
    async (state) => {
      const id = await claim();
      await db.query("SELECT * FROM public.settle_generation_usage($1,$2,$3)", [id, user, state]);
      await expect(record(id)).rejects.toThrow("receipt_settled");
    },
  );
  it("binds content/image kind to the charged bucket", async () => {
    const id = await claim("imageGeneration");
    await expect(record(id)).rejects.toThrow("kind_mismatch");
    await record(id, { ...payload, kind: "image" });
  });
  it.each([
    null,
    [],
    { ...payload, version: 2 },
    { ...payload, projectId: "../other" },
    { ...payload, title: "" },
    { ...payload, output: null },
    { ...payload, output: { markdown: "ą".repeat(130000) } },
  ])("rejects invalid/bloated stored output %#", async (data) => {
    const id = await claim();
    await expect(record(id, data)).rejects.toThrow("invalid_generation_result");
    expect((await db.query("SELECT state FROM public.ai_generation_usage_receipts")).rows).toEqual([
      { state: "reserved" },
    ]);
  });
  it.each(["anon", "authenticated"])("denies %s reads and mutations", async (role) => {
    const id = await claim();
    await record(id);
    await db.exec(`SET ROLE ${role}`);
    try {
      await expect(record(id)).rejects.toThrow("permission denied");
      await expect(discard(id)).rejects.toThrow("permission denied");
      await expect(db.query("SELECT * FROM public.ai_generation_results")).rejects.toThrow(
        "permission denied",
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("the service can use RPCs but cannot change retained output directly", async () => {
    const id = await claim();
    await db.exec("SET ROLE service_role");
    try {
      await record(id);
      await expect(
        db.exec("UPDATE public.ai_generation_results SET payload = '{}'::jsonb"),
      ).rejects.toThrow("permission denied");
      await discard(id);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("account deletion also removes retained output", async () => {
    const id = await claim();
    await record(id);
    await db.query("DELETE FROM auth.users WHERE id=$1", [user]);
    expect((await db.query("SELECT * FROM public.ai_generation_results")).rows).toEqual([]);
    await db.query("INSERT INTO auth.users(id) VALUES($1)", [user]);
  });
  it("pages through tied timestamps without missing rows and scopes every list/read", async () => {
    const ids: string[] = [];
    for (let n = 0; n < 25; n++) {
      const id = await claim();
      ids.push(id);
      await record(id);
    }
    const otherId = await claim("contentGeneration", other);
    await record(otherId, payload, other);
    const hidden = await claim();
    await record(hidden, { ...payload, projectId: "another" });
    await db.exec(
      "UPDATE public.ai_generation_results SET created_at = '2026-09-09T12:00:00.123456Z'",
    );
    const first = await db.query<{ receipt_id: string; at: string }>(
      "SELECT receipt_id,created_at::text AS at FROM public.list_generation_results($1,'p')",
      [user],
    );
    expect(first.rows).toHaveLength(20);
    const last = first.rows.at(-1)!;
    expect(last.at).toContain("123456");
    const second = await db.query<{ receipt_id: string }>(
      "SELECT * FROM public.list_generation_results($1,'p',$2,$3)",
      [user, last.at, last.receipt_id],
    );
    expect(second.rows).toHaveLength(5);
    expect([...first.rows, ...second.rows].map((r) => r.receipt_id).sort()).toEqual(ids.sort());
    expect(
      (await db.query("SELECT * FROM public.read_generation_result($1,$2)", [otherId, user])).rows,
    ).toEqual([]);
    await discard(ids[0]);
    expect(
      (await db.query("SELECT * FROM public.read_generation_result($1,$2)", [ids[0], user])).rows,
    ).toEqual([]);
    await expect(
      db.query("SELECT * FROM public.list_generation_results($1,'p',now(),NULL)", [user]),
    ).rejects.toThrow("invalid_generation_result_cursor");
    await expect(
      db.query("SELECT * FROM public.list_generation_results($1,'../other')", [user]),
    ).rejects.toThrow("invalid_generation_result_cursor");
  });
});

describe("late browser save versus recovered owner edits", () => {
  const ownerDraft = {
    id: "a",
    markdown: "Recovered and corrected",
    updatedAt: "2026-09-09T10:00:00Z",
  };
  const staleDraft = { id: "a", markdown: "Delayed original", updatedAt: "2026-09-09T12:00:00Z" };
  async function savedDraft() {
    await db.query(
      'INSERT INTO public.workspace_meta(user_id,rev,extras,subscription) VALUES ($1,7,\'{"keep":true}\', \'{"planId":"freePreview"}\')',
      [user],
    );
    await db.query(
      "INSERT INTO public.workspace_entities(user_id,collection,entity_id,ord,data) VALUES ($1,'content','a',0,$2)",
      [user, JSON.stringify(ownerDraft)],
    );
  }
  const batch = (upserts: unknown[], meta = {}, rev: number | null = null) =>
    db.query("SELECT public.apply_workspace_entity_batch($1,$2,'[]',$3,$4)", [
      user,
      JSON.stringify(upserts),
      JSON.stringify(meta),
      rev,
    ]);
  it.each([null, { id: "a", markdown: "Before recovery" }])(
    "rejects stale creation/update despite its newer timestamp %#",
    async (expected) => {
      await savedDraft();
      await expect(
        batch(
          [
            {
              collection: "opportunities",
              entity_id: "o",
              data: { id: "o", currentContentAssetId: "wrong" },
            },
            { collection: "content", entity_id: "a", data: staleDraft, expected_data: expected },
          ],
          { extras: { bad: true } },
        ),
      ).rejects.toThrow("workspace_content_changed");
      expect((await db.query("SELECT data FROM public.workspace_entities")).rows).toEqual([
        { data: ownerDraft },
      ]);
      expect((await db.query("SELECT rev,extras FROM public.workspace_meta")).rows).toEqual([
        { rev: 7, extras: { keep: true } },
      ]);
    },
  );
  it("accepts a current edit and its identical late replay; preserves entitlements and extras", async () => {
    await savedDraft();
    const upserts = [
      { collection: "content", entity_id: "a", data: staleDraft, expected_data: ownerDraft },
    ];
    await batch(upserts, { subscription: { planId: "agency" }, extras: { new: true } });
    await batch(upserts);
    expect((await db.query("SELECT data FROM public.workspace_entities")).rows).toEqual([
      { data: staleDraft },
    ]);
    expect((await db.query("SELECT subscription,extras FROM public.workspace_meta")).rows).toEqual([
      { subscription: { planId: "freePreview" }, extras: { keep: true, new: true } },
    ]);
  });
  it("preserves existing server revision checks", async () => {
    await savedDraft();
    await expect(batch([], {}, 6)).rejects.toThrow("workspace_conflict");
    await batch([], {}, 7);
  });
  it("does not resurrect a deleted draft through a stale update", async () => {
    await savedDraft();
    await db.exec("DELETE FROM public.workspace_entities");
    await expect(
      batch([
        { collection: "content", entity_id: "a", data: staleDraft, expected_data: ownerDraft },
      ]),
    ).rejects.toThrow("workspace_content_changed");
  });
});
