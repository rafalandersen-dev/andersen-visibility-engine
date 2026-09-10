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
  await db.exec(readFileSync("supabase/migrations/20260910100000_source_refresh.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; TRUNCATE public.project_source_refresh,public.project_knowledge_documents,public.project_knowledge_records,public.project_knowledge_sources,public.project_knowledge_history,public.project_knowledge_tombstones;",
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
    await db.exec(
      "UPDATE public.project_source_refresh SET last_attempt=clock_timestamp()-interval '11 minutes'",
    );
    await begin(user, 2);
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
