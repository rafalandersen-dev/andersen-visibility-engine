import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { teamRoster, myProjectTeams, teamComments } from "./project-team";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const invite = "00000000-0000-4000-8000-000000000004";
const second = "00000000-0000-4000-8000-000000000005";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.identities(user_id uuid,identity_data jsonb); CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','owner@example.test',now()),('${actor}','member@example.test',now()),('${other}','other@example.test',now());
    INSERT INTO auth.identities VALUES('${actor}','{"email":"member@example.test","email_verified":true}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');
    INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{"name":"Assigned"}'),('${other}','projects','p','{"name":"Other"}');`);
  for (const file of [
    "20260909200000_project_knowledge.sql",
    "20260911020000_project_team_reads.sql",
    "20260911030000_project_team_membership.sql",
    "20260911040000_project_team_comments.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.project_team_comments,public.project_team_members,public.project_team_invitations,public.project_team_audit;
    UPDATE public.workspace_meta SET rev=1;
    INSERT INTO public.workspace_entities VALUES('${owner}','content','a','{"projectId":"p","title":"Draft","status":"Draft","updatedAt":"now","markdown":"Saved draft"}') ON CONFLICT DO NOTHING;
    UPDATE auth.identities SET identity_data='{"email":"member@example.test","email_verified":true}';
    UPDATE auth.users SET email_confirmed_at=now(),deleted_at=NULL,banned_until=NULL;
    UPDATE auth.users SET email='member@example.test' WHERE id='${actor}';`);
});
afterAll(async () => {
  await db?.close();
});
const create = (id = invite, who = owner, email = "Member@example.test", role = "editor") =>
  db.query("SELECT public.create_project_team_invitation($1,$2,'p',$3,$4,$5)", [
    who,
    owner,
    id,
    email,
    role,
  ]);
const accept = (id = invite, who = actor) =>
  db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3) revision", [who, owner, id]);
const change = (expected = 1, remove = false, who = owner) =>
  db.query("SELECT public.change_project_team_member($1,$2,'p',$3,$4,'reviewer',$5) revision", [
    who,
    owner,
    actor,
    expected,
    remove,
  ]);
const revoke = (id = invite, who = owner) =>
  db.query("SELECT public.revoke_project_team_invitation($1,$2,'p',$3)", [who, owner, id]);
describe("durable project invitation and membership lifecycle", () => {
  it("accepts a verified intended recipient, records actor audit and grants scoped reads", async () => {
    await create();
    expect((await accept()).rows[0]).toEqual({ revision: 1 });
    const member = (await db.query("SELECT role,active,revision FROM public.project_team_members"))
      .rows[0];
    expect(member).toEqual({ role: "editor", active: true, revision: 1 });
    expect(
      (await db.query("SELECT public.read_project_team_snapshot($1,$2,'p')", [actor, owner])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT actor_id,action FROM public.project_team_audit ORDER BY event_id"))
        .rows,
    ).toEqual([
      { actor_id: owner, action: "invited" },
      { actor_id: actor, action: "accepted" },
    ]);
  });
  it("makes creation retries idempotent without changing the recipient or role", async () => {
    await create();
    await create();
    expect((await db.query("SELECT * FROM public.project_team_audit")).rows).toHaveLength(1);
    await expect(create(invite, owner, "other@example.test")).rejects.toThrow(
      "team_invitation_replay",
    );
    await expect(create(invite, owner, "Member@example.test", "reviewer")).rejects.toThrow(
      "team_invitation_replay",
    );
    await expect(create(second)).rejects.toThrow("team_invitation_exists");
  });
  it("rejects wrong recipient, unverified, deleted, banned and changed-email accounts", async () => {
    await create();
    await expect(accept(invite, other)).rejects.toThrow("team_invitation_unavailable");
    for (const field of [
      "email_confirmed_at=NULL",
      "deleted_at=now()",
      "banned_until=now()+interval '1 hour'",
      "email='changed@example.test'",
    ]) {
      await db.exec(
        `UPDATE auth.users SET email_confirmed_at=now(),deleted_at=NULL,banned_until=NULL,email='member@example.test' WHERE id='${actor}'; UPDATE auth.users SET ${field} WHERE id='${actor}'`,
      );
      await expect(accept()).rejects.toThrow("team_invitation_unavailable");
    }
    expect((await db.query("SELECT * FROM public.project_team_members")).rows).toHaveLength(0);
  });
  it("requires a verified identity for the current email even if an old confirmation timestamp remains", async () => {
    await create();
    await db.exec(
      `UPDATE auth.identities SET identity_data='{"email":"member@example.test","email_verified":false}'`,
    );
    await expect(accept()).rejects.toThrow("team_invitation_unavailable");
    await db.exec(
      `UPDATE auth.identities SET identity_data='{"email":"old@example.test","email_verified":true}'`,
    );
    await expect(accept()).rejects.toThrow("team_invitation_unavailable");
  });
  it("rejects expiry, permits a fresh invite and keeps the old one terminal", async () => {
    await create();
    await db.exec(
      "UPDATE public.project_team_invitations SET expires_at=now()-interval '1 second'",
    );
    await expect(accept()).rejects.toThrow("team_invitation_unavailable");
    await create(second);
    await accept(second);
    await expect(accept()).rejects.toThrow("team_invitation_unavailable");
  });
  it("supports idempotent revocation and prevents accepting or recreating a revoked ID", async () => {
    await create();
    await revoke();
    await revoke();
    await expect(accept()).rejects.toThrow("team_invitation_unavailable");
    await expect(create()).rejects.toThrow("team_invitation_replay");
  });
  it("requires owner authority and current revision for changes", async () => {
    await expect(create(invite, actor)).rejects.toThrow();
    await create();
    await expect(revoke(invite, actor)).rejects.toThrow();
    await accept();
    await expect(change(1, false, actor)).rejects.toThrow();
    expect((await change()).rows[0]).toEqual({ revision: 2 });
    await expect(change(1, true)).rejects.toThrow("team_membership_changed");
    expect((await change(2, true)).rows[0]).toEqual({ revision: 3 });
    await expect(
      db.query("SELECT public.read_project_team_snapshot($1,$2,'p')", [actor, owner]),
    ).rejects.toThrow("team_project_unavailable");
  });
  it("never restores access through accepted or pending old invitations after removal", async () => {
    await create();
    await accept();
    await create(second);
    await change(1, true);
    await expect(accept()).rejects.toThrow("team_invitation_unavailable");
    await expect(accept(second)).rejects.toThrow("team_invitation_unavailable");
    expect((await db.query("SELECT active FROM public.project_team_members")).rows[0]).toEqual({
      active: false,
    });
  });
  it("does not let a new pending invitation overwrite active membership", async () => {
    await create();
    await accept();
    await create(second, owner, "member@example.test", "reviewer");
    await expect(accept(second)).rejects.toThrow("team_membership_exists");
    expect((await db.query("SELECT role FROM public.project_team_members")).rows[0]).toEqual({
      role: "editor",
    });
  });
  it("provides owner-only roster and actor-only discovery with valid response contracts", async () => {
    await create();
    const discover = async (who = actor) =>
      myProjectTeams.parse(
        (
          await db.query<{ result: unknown }>("SELECT public.list_my_project_teams($1) result", [
            who,
          ])
        ).rows[0].result,
      );
    expect((await discover()).invitations).toHaveLength(1);
    expect((await discover(other)).invitations).toHaveLength(0);
    await accept();
    expect((await discover()).projects).toHaveLength(1);
    const roster = teamRoster.parse(
      (
        await db.query<{ result: unknown }>(
          "SELECT public.read_project_team_roster($1,$1,'p') result",
          [owner],
        )
      ).rows[0].result,
    );
    expect(roster.members[0]).toMatchObject({ actorId: actor, role: "editor" });
    await expect(
      db.query("SELECT public.read_project_team_roster($1,$2,'p')", [actor, owner]),
    ).rejects.toThrow("team_project_unavailable");
    await change(1, true);
    expect((await discover()).projects).toHaveLength(0);
  });
  it("binds comments to the saved revision, rejects replays and removes access immediately", async () => {
    await create();
    await accept();
    const add = (body = "Review this fact", expected = 1, id = second) =>
      db.query("SELECT public.add_project_team_comment($1,$2,'p','a',$3,$4,$5)", [
        actor,
        owner,
        id,
        expected,
        body,
      ]);
    await add();
    await add();
    expect((await db.query("SELECT * FROM public.project_team_comments")).rows).toHaveLength(1);
    await expect(add("Different")).rejects.toThrow("team_comment_replay");
    await db.exec("UPDATE public.workspace_meta SET rev=2");
    await expect(add("New comment", 1, invite)).rejects.toThrow("team_comment_draft_changed");
    const result = (
      await db.query<{ result: unknown }>(
        "SELECT public.read_project_team_comments($1,$2,'p','a') result",
        [owner, owner],
      )
    ).rows[0].result;
    teamComments.parse(result);
    expect(result).toMatchObject({
      comments: [{ body: "Review this fact", mine: false, workspaceRevision: 1 }],
    });
    await change(1, true);
    await expect(add()).rejects.toThrow("team_project_unavailable");
    await expect(
      db.query("SELECT public.read_project_team_comments($1,$2,'p','a')", [actor, owner]),
    ).rejects.toThrow("team_project_unavailable");
  });
  it("restricts all lifecycle functions and private tables to service-mediated calls", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of [
        "project_team_invitations",
        "project_team_audit",
        "project_team_members",
        "project_team_comments",
      ])
        await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      if (role !== "service_role") {
        await expect(create()).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.add_project_team_comment($1,$2,'p','a',$3,1,'Comment')", [
            actor,
            owner,
            invite,
          ]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.read_project_team_comments($1,$2,'p','a')", [actor, owner]),
        ).rejects.toThrow(/permission denied/);
        await expect(accept()).rejects.toThrow(/permission denied/);
        await expect(revoke()).rejects.toThrow(/permission denied/);
        await expect(change()).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.read_project_team_roster($1,$1,'p')", [owner]),
        ).rejects.toThrow(/permission denied/);
        await expect(db.query("SELECT public.list_my_project_teams($1)", [actor])).rejects.toThrow(
          /permission denied/,
        );
      } else {
        await create();
        await accept();
        await change();
      }
      await db.exec("RESET ROLE");
    }
  });
});
