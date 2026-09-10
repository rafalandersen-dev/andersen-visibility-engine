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
const fact = {
  key: "price",
  field: "price",
  value: "120",
  locator: "Offer",
  fingerprint: "a".repeat(64),
};
const begin = (owner = user, expected = 1) =>
  db.query<{ result: { acquired: boolean; revision: number } }>(
    "SELECT public.begin_project_source_refresh($1,'p',$2,$3,$4) result",
    [owner, sid, expected, token],
  );
const finish = (snapshot: unknown, leaseToken = token) =>
  db.query("SELECT public.finish_project_source_refresh($1,'p',$2,$3,$4) result", [
    user,
    sid,
    leaseToken,
    snapshot === null ? null : JSON.stringify(snapshot),
  ]);
const read = async () =>
  (
    await db.query<{
      result: {
        snapshot: unknown;
        history: { revision: number }[];
        reviewHistory: { accepted: boolean; revision: number }[];
        accepted: Record<string, string>;
        status: string;
        revision: number;
      }[];
    }>("SELECT public.read_project_source_refresh($1,'p') result", [user])
  ).rows[0].result;
const review = (accept = true, rev = 1, fingerprint = fact.fingerprint, previous = !accept) =>
  db.query("SELECT public.review_project_source_fact($1,'p',$2,$3,'price',$4,$5,$6)", [
    user,
    sid,
    rev,
    fingerprint,
    accept,
    previous,
  ]);
const snapshot = async (revision = 1, facts = [fact]) => ({
  ownerId: user,
  projectId: "p",
  sourceId: sid,
  revision,
  coverage: "public-page",
  observedAt: (await db.query<{ now: string }>("SELECT clock_timestamp()::text now")).rows[0].now,
  facts,
});
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
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; TRUNCATE public.ai_generation_results,public.project_output_source_dependencies,public.project_source_refresh,public.project_knowledge_documents,public.project_knowledge_records,public.project_knowledge_sources,public.project_knowledge_history,public.project_knowledge_tombstones;",
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
describe("scoped source refresh storage", () => {
  it("rejects stale competing decisions on the same fact", async () => {
    await begin();
    await finish(await snapshot());
    await review();
    await expect(review(false, 1, fact.fingerprint, false)).rejects.toThrow(
      "source_refresh_changed",
    );
    expect((await read())[0].accepted).toEqual({ price: fact.fingerprint });
    await review(false);
    expect((await read())[0].reviewHistory.map((r) => r.accepted)).toEqual([false, true]);
    expect((await read())[0].accepted).toEqual({});
  });

  it("source replacement clears old evidence and approvals before a new capture", async () => {
    await begin();
    await finish(await snapshot());
    await review();
    await db.query("SELECT public.save_project_knowledge($1,'p','source',$2,1,$3)", [
      user,
      sid,
      JSON.stringify({ ...source, revision: 2, fingerprint: "b".repeat(64) }),
    ]);
    expect(await read()).toEqual([]);
    expect((await begin(user, 2)).rows[0].result.acquired).toBe(true);
    expect((await read())[0]).toMatchObject({ snapshot: null, accepted: {}, status: "running" });
    await finish(await snapshot(2));
    expect((await read())[0].accepted).toEqual({});
  });
  it("rejects foreign snapshot scope and timestamps outside the lease attempt", async () => {
    await begin();
    await expect(finish({ ...(await snapshot()), ownerId: other })).rejects.toThrow(
      "invalid_source_snapshot",
    );
    await expect(
      finish({ ...(await snapshot()), observedAt: "2000-01-01T00:00:00Z" }),
    ).rejects.toThrow("invalid_source_snapshot");
    await expect(
      finish({ ...(await snapshot()), observedAt: "2100-01-01T00:00:00Z" }),
    ).rejects.toThrow("invalid_source_snapshot");
    expect((await read())[0].snapshot).toBeNull();
  });
  it("leases once, enforces cooldown and persists a bounded snapshot", async () => {
    expect((await begin()).rows[0].result.acquired).toBe(true);
    expect((await begin()).rows[0].result.acquired).toBe(false);
    await finish(await snapshot());
    expect((await read())[0]).toMatchObject({ revision: 1, status: "ok", accepted: {} });
    expect((await begin()).rows[0].result.acquired).toBe(false);
  });
  it("does not replace the winning source lease with a competing request token", async () => {
    await begin();
    const competing = await db.query<{ result: { acquired: boolean } }>(
      "SELECT begin_project_source_refresh($1,'p',$2,1,$3) result",
      [user, sid, other],
    );
    expect(competing.rows[0].result.acquired).toBe(false);
    await expect(
      db.query("SELECT finish_project_source_refresh($1,'p',$2,$3,NULL)", [user, sid, other]),
    ).rejects.toThrow("source_refresh_changed");
    await finish(await snapshot());
    expect((await read())[0].status).toBe("ok");
  });
  it("keeps last successful evidence when a later fetch fails", async () => {
    await begin();
    const first = await snapshot();
    await finish(first);
    await review();
    await db.exec(
      "UPDATE public.project_source_refresh SET last_attempt=clock_timestamp()-interval '11 minutes'",
    );
    await begin();
    await finish(null);
    expect((await read())[0]).toMatchObject({
      revision: 1,
      status: "unknown",
      snapshot: first,
      accepted: { price: fact.fingerprint },
    });
  });
  it("preserves unchanged acceptance and removes approval of changed facts", async () => {
    await begin();
    await finish(await snapshot());
    await review();
    await db.exec(
      "UPDATE public.project_source_refresh SET last_attempt=clock_timestamp()-interval '11 minutes'",
    );
    await begin();
    await finish(await snapshot(2));
    expect((await read())[0].accepted).toEqual({ price: fact.fingerprint });
    await db.exec(
      "UPDATE public.project_source_refresh SET last_attempt=clock_timestamp()-interval '11 minutes'",
    );
    await begin();
    await finish(await snapshot(3, [{ ...fact, value: "125", fingerprint: "b".repeat(64) }]));
    expect((await read())[0].accepted).toEqual({});
    await expect(review(true, 2)).rejects.toThrow("source_refresh_changed");
  });
  it("rejects wrong owners, leases, revisions and duplicate fact identities", async () => {
    await expect(begin(other)).rejects.toThrow();
    await begin();
    await expect(finish(await snapshot(), other)).rejects.toThrow("source_refresh_changed");
    await expect(finish(await snapshot(2))).rejects.toThrow("invalid_source_snapshot");
    await expect(finish(await snapshot(1, [fact, fact]))).rejects.toThrow(
      "invalid_source_snapshot",
    );
    expect((await read())[0].snapshot).toBeNull();
  });
  it("rejects delayed completion after lease expiry and reports it as unknown", async () => {
    await begin();
    await db.exec(
      "UPDATE public.project_source_refresh SET lease_until=clock_timestamp()-interval '1 second'",
    );
    await expect(finish(await snapshot())).rejects.toThrow("source_refresh_changed");
    expect((await read())[0].status).toBe("unknown");
  });
  it("revocation blocks reads/late writes and forget cascades observations", async () => {
    await begin();
    await finish(await snapshot());
    await db.query("SELECT public.save_project_knowledge($1,'p','source',$2,1,$3)", [
      user,
      sid,
      JSON.stringify({ ...source, revision: 2, status: "revoked" }),
    ]);
    expect(await read()).toEqual([]);
    await expect(finish(await snapshot(2))).rejects.toThrow();
    await db.query("SELECT public.forget_project_knowledge($1,'p','source',$2,2)", [user, sid]);
    expect((await db.query("SELECT * FROM public.project_source_refresh")).rows).toEqual([]);
  });
  it("retains only five preceding snapshots and preserves history during outage", async () => {
    for (let revision = 1; revision <= 8; revision++) {
      await db.exec(
        "UPDATE public.project_source_refresh SET last_attempt=clock_timestamp()-interval '11 minutes'",
      );
      await begin();
      await finish(await snapshot(revision));
    }
    expect((await read())[0].history.map((s) => s.revision)).toEqual([7, 6, 5, 4, 3]);
    await db.exec(
      "UPDATE public.project_source_refresh SET last_attempt=clock_timestamp()-interval '11 minutes'",
    );
    await begin();
    await finish(null);
    expect((await read())[0].history.map((s) => s.revision)).toEqual([7, 6, 5, 4, 3]);
  });
  it("persists bounded diagnostics and rejects usable conflicting facts", async () => {
    await begin();
    const key = "a".repeat(64);
    await expect(
      finish({ ...(await snapshot(1, [{ ...fact, key }])), conflicts: [key] }),
    ).rejects.toThrow("invalid_source_snapshot");
    await expect(
      finish({ ...(await snapshot()), warnings: ["arbitrary page instruction"] }),
    ).rejects.toThrow("invalid_source_snapshot");
    await finish({ ...(await snapshot()), warnings: ["unresolved_price"], conflicts: [key] });
    expect((await read())[0].snapshot).toMatchObject({
      warnings: ["unresolved_price"],
      conflicts: [key],
    });
  });
  it("atomically retains generated dependencies across archive discard and rejects foreign ownership", async () => {
    const dependency = {
      ownerId: user,
      projectId: "p",
      sourceId: sid,
      key: "price",
      fingerprint: fact.fingerprint,
      critical: true,
    };
    const payload = {
      kind: "content",
      projectId: "p",
      assetId: "asset",
      output: { sourceDependencies: [dependency] },
    };
    await db.query("INSERT INTO public.ai_generation_results VALUES($1,$2,$3)", [
      token,
      user,
      JSON.stringify(payload),
    ]);
    await db.exec("UPDATE public.ai_generation_results SET payload=NULL");
    const retained = await db.query<{ result: unknown[] }>(
      "SELECT public.read_output_source_dependencies($1,'p','asset') result",
      [user],
    );
    expect(retained.rows[0].result).toEqual([
      {
        assetId: "asset",
        outputId: "asset",
        kind: "content",
        dependencies: [dependency],
        sourceForgotten: false,
      },
    ]);
    const filtered = await db.query<{ result: unknown[] }>(
      "SELECT public.read_output_source_dependencies($1,'p',NULL,ARRAY['other']) result",
      [user],
    );
    expect(filtered.rows[0].result).toEqual([]);
    const selected = await db.query<{ result: unknown[] }>(
      "SELECT public.read_output_source_dependencies($1,'p',NULL,ARRAY['asset']) result",
      [user],
    );
    expect(selected.rows[0].result).toEqual(retained.rows[0].result);
    await expect(
      db.query("INSERT INTO public.ai_generation_results VALUES($1,$2,$3)", [
        other,
        user,
        JSON.stringify({
          ...payload,
          output: { sourceDependencies: [{ ...dependency, ownerId: other }] },
        }),
      ]),
    ).rejects.toThrow("invalid_output_source_dependencies");
    expect((await db.query("SELECT * FROM public.ai_generation_results")).rows).toHaveLength(1);
    await db.query(
      "INSERT INTO public.workspace_entities(user_id,collection,entity_id) VALUES($1,'content','asset')",
      [user],
    );
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='content' AND entity_id='asset'",
      [user],
    );
    expect(
      (await db.query("SELECT * FROM public.project_output_source_dependencies")).rows,
    ).toEqual([]);
  });
  it("forgets source identities while retaining only an output-level publication hold", async () => {
    const dependency = {
      ownerId: user,
      projectId: "p",
      sourceId: sid,
      key: "private-key",
      productId: "private-product",
      fingerprint: fact.fingerprint,
      critical: true,
    };
    await db.query("INSERT INTO public.ai_generation_results VALUES($1,$2,$3)", [
      token,
      user,
      JSON.stringify({
        kind: "content",
        projectId: "p",
        assetId: "asset",
        output: { sourceDependencies: [dependency] },
      }),
    ]);
    await db.query("SELECT forget_project_knowledge($1,'p','source',$2,1)", [user, sid]);
    const retained = await db.query<{ result: unknown[] }>(
      "SELECT read_output_source_dependencies($1,'p','asset') result",
      [user],
    );
    expect(retained.rows[0].result).toEqual([
      {
        assetId: "asset",
        outputId: "asset",
        kind: "content",
        dependencies: [],
        sourceForgotten: true,
      },
    ]);
    const serialized = JSON.stringify(retained.rows[0].result);
    for (const privateValue of [sid, dependency.key, dependency.productId, dependency.fingerprint])
      expect(serialized).not.toContain(privateValue);
    expect(await read()).toEqual([]);
    await db.query("INSERT INTO public.ai_generation_results VALUES($1,$2,$3)", [
      other,
      user,
      JSON.stringify({
        kind: "content",
        projectId: "p",
        assetId: "late",
        output: { sourceDependencies: [dependency] },
      }),
    ]);
    const late = await db.query<{ result: unknown[] }>(
      "SELECT read_output_source_dependencies($1,'p','late') result",
      [user],
    );
    expect(late.rows[0].result).toEqual([
      {
        assetId: "late",
        outputId: "late",
        kind: "content",
        dependencies: [],
        sourceForgotten: true,
      },
    ]);
  });
  it("does not consume source registry capacity for empty dependencies even at capacity", async () => {
    await db.query("INSERT INTO public.ai_generation_results VALUES($1,$2,$3)", [
      token,
      user,
      JSON.stringify({
        kind: "content",
        projectId: "p",
        assetId: "empty",
        output: { sourceDependencies: [] },
      }),
    ]);
    expect(
      (await db.query("SELECT * FROM public.project_output_source_dependencies")).rows,
    ).toHaveLength(0);
    await db.query(
      "INSERT INTO public.project_output_source_dependencies(user_id,project_id,asset_id,output_id,kind,dependencies) SELECT $1,'p','asset-'||n,'asset-'||n,'content','[]'::jsonb FROM generate_series(1,1000) n",
      [user],
    );
    await db.query("INSERT INTO public.ai_generation_results VALUES($1,$2,$3)", [
      other,
      user,
      JSON.stringify({
        kind: "image",
        projectId: "p",
        assetId: "empty",
        imageId: "empty-image",
        output: { sourceDependencies: [] },
      }),
    ]);
    expect(
      (await db.query("SELECT * FROM public.project_output_source_dependencies")).rows,
    ).toHaveLength(1000);
    expect((await db.query("SELECT * FROM public.ai_generation_results")).rows).toHaveLength(2);
  });
  it("denies browser roles and direct service table access", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(read()).rejects.toThrow("permission denied");
      await expect(begin()).rejects.toThrow("permission denied");
      await expect(db.query("SELECT * FROM public.project_source_refresh")).rejects.toThrow(
        "permission denied",
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    await expect(db.query("SELECT * FROM public.project_source_refresh")).rejects.toThrow(
      "permission denied",
    );
    expect((await begin()).rows[0].result.acquired).toBe(true);
  });
});
