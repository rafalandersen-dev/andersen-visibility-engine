import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { readTeamProject } from "./project-team-read.server";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users(id) VALUES('${owner}'),('${actor}'),('${other}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');`);
  await db.exec(readFileSync("supabase/migrations/20260911020000_project_team_reads.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; UPDATE auth.users SET deleted_at=NULL,banned_until=NULL; TRUNCATE public.project_team_members, public.workspace_entities;
    INSERT INTO public.workspace_entities VALUES
    ('${owner}','projects','p','{"name":"Assigned","publishSecret":"fixture-only-private"}'),
    ('${owner}','projects','q','{"name":"Unassigned"}'),
    ('${other}','projects','p','{"name":"Other owner"}'),
    ('${owner}','content','a','{"projectId":"p","title":"Allowed","status":"Draft","updatedAt":"now","markdown":"Content","images":[{"id":"im","alt":"Product","url":"fixture-private-path"}]}'),
    ('${owner}','content','b','{"projectId":"q","title":"Private"}'),
    ('${other}','content','a','{"projectId":"p","title":"Other owner content"}');
    INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${actor}','viewer');`);
});
afterAll(async () => {
  await db?.close();
});
async function read(
  who = actor,
  account = owner,
  project = "p",
  asset: string | null = null,
  offset = 0,
) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.read_project_team_snapshot($1,$2,$3,$4,$5) result",
      [who, account, project, asset, offset],
    )
  ).rows[0].result;
}
describe("project membership scoped database reads", () => {
  it("returns only assigned project fields and projects the actual SQL response through the server", async () => {
    const result = await read(actor, owner, "p", "a");
    expect(JSON.stringify(result)).not.toContain("fixture");
    expect(JSON.stringify(result)).not.toContain("Other owner");
    expect(result.drafts).toEqual([
      { id: "a", projectId: "p", title: "Allowed", status: "Draft", updatedAt: "now" },
    ]);
    const projected = await readTeamProject(
      actor,
      { ownerId: owner, projectId: "p", assetId: "a" },
      async () => ({ data: result, error: null }),
    );
    expect(projected.draft?.images).toEqual([{ id: "im", alt: "Product" }]);
  });
  it("rejects forged owner and unassigned project/draft even with colliding IDs", async () => {
    await expect(read(actor, other)).rejects.toThrow("team_project_unavailable");
    await expect(read(actor, owner, "q")).rejects.toThrow("team_project_unavailable");
    await expect(read(actor, owner, "p", "b")).rejects.toThrow("team_project_unavailable");
    await expect(read(other, owner)).rejects.toThrow("team_project_unavailable");
  });
  it.each(["banned_until=now()+interval '1 hour'", "deleted_at=now()"])(
    "rejects current account restrictions despite active membership: %s",
    async (restriction) => {
      await read();
      await db.exec(`UPDATE auth.users SET ${restriction} WHERE id='${actor}'`);
      await expect(read()).rejects.toThrow("team_project_unavailable");
      await expect(read(actor, owner, "p", "a")).rejects.toThrow("team_project_unavailable");
    },
  );
  it.each(["banned_until=now()+interval '1 hour'", "deleted_at=now()"])(
    "blocks existing collaborators when their owner is suspended: %s",
    async (restriction) => {
      await read(actor, owner, "p", "a");
      await db.exec(`UPDATE auth.users SET ${restriction} WHERE id='${owner}'`);
      await expect(read(actor, owner, "p", "a")).rejects.toThrow("team_project_unavailable");
    },
  );
  it("allows access after a temporary ban expires", async () => {
    await db.exec(
      `UPDATE auth.users SET banned_until=now()-interval '1 second' WHERE id='${actor}'`,
    );
    expect((await read()).actorId).toBe(actor);
  });
  it("rechecks membership after removal and expiry", async () => {
    await read();
    await db.exec("UPDATE public.project_team_members SET active=false,revision=2");
    await expect(read()).rejects.toThrow("team_project_unavailable");
    await db.exec(
      "UPDATE public.project_team_members SET active=true,expires_at=clock_timestamp()-interval '1 second'",
    );
    await expect(read()).rejects.toThrow("team_project_unavailable");
  });
  it("returns the latest membership revision and permits the actual owner", async () => {
    await db.exec("UPDATE public.project_team_members SET revision=3,role='reviewer'");
    expect((await read()).membershipRevision).toBe(3);
    expect((await read(owner)).actorId).toBe(owner);
  });
  it("restricts direct tables and actor-asserting RPC to the trusted service", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM public.project_team_members")).rejects.toThrow(
        /permission denied/,
      );
      if (role !== "service_role") await expect(read()).rejects.toThrow(/permission denied/);
      else expect((await read()).actorId).toBe(actor);
      await db.exec("RESET ROLE");
    }
  });
  it("rejects invalid pagination and disappears with the owning project", async () => {
    await expect(read(actor, owner, "p", null, -1)).rejects.toThrow();
    await expect(read(actor, owner, "p", "a", 1)).rejects.toThrow();
    await db.query(
      "DELETE FROM public.workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [owner],
    );
    expect((await db.query("SELECT * FROM public.project_team_members")).rows).toHaveLength(0);
    await expect(read()).rejects.toThrow("team_project_unavailable");
  });
});

it("authorizes before nonwaiting shared read admission and retains explicit exclusive mutation admission", async () => {
  const definition = (
    await db.query<{ definition: string }>(
      "SELECT pg_get_functiondef('public.read_project_team_snapshot(uuid,uuid,text,text,integer,boolean)'::regprocedure) definition",
    )
  ).rows[0].definition;
  expect(definition.indexOf("OR (p_actor<>p_owner AND NOT EXISTS")).toBeLessThan(
    definition.indexOf("FOR UPDATE NOWAIT"),
  );
  expect(definition).toContain("FOR SHARE NOWAIT");
  expect(definition).toContain("IF p_write THEN");
  await expect(
    db.query("SELECT public.read_project_team_snapshot($1,$2,'q',NULL,0,true)", [actor, owner]),
  ).rejects.toThrow("team_project_unavailable");
  const result = await db.query<{ snapshot: { workspaceRevision: number } }>(
    "SELECT public.read_project_team_snapshot($1,$2,'p',NULL,0,true) snapshot",
    [actor, owner],
  );
  expect(result.rows[0].snapshot.workspaceRevision).toBe(1);
});
