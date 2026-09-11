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
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$; CREATE TABLE auth.identities(user_id uuid,identity_data jsonb); CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','owner@example.test',now()),('${actor}','member@example.test',now()),('${other}','other@example.test',now());
    INSERT INTO auth.identities VALUES('${actor}','{"email":"member@example.test","email_verified":true}');
    CREATE TABLE public.scheduled_publishes(user_id uuid,project_id text,asset_id text,status text,updated_at timestamptz);
    CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb);
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,collection,entity_id));
    ALTER TABLE public.workspace_entities ADD COLUMN updated_at timestamptz DEFAULT now();
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');
    INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{"name":"Assigned"}'),('${other}','projects','p','{"name":"Other"}');`);
  for (const file of [
    "20260907150000_operational_notifications.sql",
    "20260907170000_operational_email_outbox.sql",
    "20260909200000_project_knowledge.sql",
    "20260910100000_source_refresh.sql",
    "20260911000000_output_knowledge_integrity.sql",
    "20260911010000_output_knowledge_reviews.sql",
    "20260911020000_project_team_reads.sql",
    "20260911030000_project_team_membership.sql",
    "20260911040000_project_team_comments.sql",
    "20260910170000_publication_approval.sql",
    "20260911050000_project_team_edits.sql",
    "20260911060000_project_team_approval_policy.sql",
    "20260911070000_project_team_review_context.sql",
    "20260911080000_project_team_notification_recipients.sql",
    "20260911090000_project_team_notification_outbox.sql",
    "20260911100000_project_team_invitation_delivery.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.project_team_media_limits,public.project_team_invitation_deliveries,public.project_team_notification_items,public.project_team_notification_outbox,public.operational_email_items,public.operational_email_outbox,public.operational_notifications,public.operational_notification_scans,public.operational_email_preferences,public.project_team_notification_recipient_audit,public.project_team_notification_recipients,public.project_team_approval_history,public.project_team_approval_policy,public.output_knowledge_reviews,public.project_team_edits,public.scheduled_publishes,public.publication_approvals,public.project_team_comments,public.project_team_members,public.project_team_invitations,public.project_team_audit;
    UPDATE public.workspace_meta SET rev=1;
    INSERT INTO public.workspace_entities VALUES('${owner}','content','a','{"projectId":"p","title":"Draft","status":"Draft","updatedAt":"now","markdown":"Saved draft"}') ON CONFLICT(user_id,collection,entity_id) DO UPDATE SET data=EXCLUDED.data;
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
  it("enforces actor-wide media concurrency, release ownership and lease recovery", async () => {
    const acquire = async (who = actor) =>
      (await db.query<{ lease: string }>("SELECT acquire_project_team_media($1) lease", [who]))
        .rows[0].lease;
    const leases = [];
    for (let i = 0; i < 4; i++) leases.push(await acquire());
    await expect(acquire()).rejects.toThrow("team_media_capacity");
    await acquire(owner);
    await db.query("SELECT release_project_team_media($1,$2)", [owner, leases[0]]);
    await expect(acquire()).rejects.toThrow("team_media_capacity");
    await db.query("SELECT release_project_team_media($1,$2)", [actor, leases[0]]);
    await acquire();
    await db.query(
      "UPDATE project_team_media_limits SET leases=jsonb_build_object($2::text,now()-interval '1 second') WHERE actor_id=$1",
      [actor, leases[1]],
    );
    await acquire();
    expect((await db.query("SELECT count(*)::int n FROM project_team_media_limits")).rows).toEqual([
      { n: 2 },
    ]);
  });
  it("enforces minute/hour media limits, restores expired windows and rejects banned actors", async () => {
    await db.query("SELECT acquire_project_team_media($1)", [actor]);
    await db.query(
      "UPDATE project_team_media_limits SET leases='{}',minute_count=120 WHERE actor_id=$1",
      [actor],
    );
    await expect(db.query("SELECT acquire_project_team_media($1)", [actor])).rejects.toThrow(
      "team_media_capacity",
    );
    await db.query(
      "UPDATE project_team_media_limits SET minute_start=now()-interval '2 minutes',hour_count=600 WHERE actor_id=$1",
      [actor],
    );
    await expect(db.query("SELECT acquire_project_team_media($1)", [actor])).rejects.toThrow(
      "team_media_capacity",
    );
    await db.query(
      "UPDATE project_team_media_limits SET hour_start=now()-interval '2 hours' WHERE actor_id=$1",
      [actor],
    );
    await db.query("SELECT acquire_project_team_media($1)", [actor]);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1", [
      actor,
    ]);
    await expect(db.query("SELECT acquire_project_team_media($1)", [actor])).rejects.toThrow(
      "team_project_unavailable",
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM project_team_media_limits")).rejects.toThrow(
        "permission denied",
      );
      if (role !== "service_role")
        await expect(db.query("SELECT acquire_project_team_media($1)", [owner])).rejects.toThrow(
          "permission denied",
        );
      await db.exec("RESET ROLE");
    }
  });

  it.each(["banned_until=now()+interval '1 hour'", "deleted_at=now()"])(
    "blocks direct review, comment and edit calls for restricted accounts: %s",
    async (restriction) => {
      await create();
      await accept();
      const hash = (
        await db.query<{ hash: string }>(
          "SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') hash FROM workspace_entities WHERE user_id=$1 AND collection='content' AND entity_id='a'",
          [owner],
        )
      ).rows[0].hash;
      await db.exec(`UPDATE auth.users SET ${restriction} WHERE id='${actor}'`);
      await expect(
        db.query("SELECT read_project_team_review_context($1,$2,'p','a')", [actor, owner]),
      ).rejects.toThrow("team_project_unavailable");
      await expect(
        db.query("SELECT add_project_team_comment($1,$2,'p','a',$3,1,'Comment')", [
          actor,
          owner,
          second,
        ]),
      ).rejects.toThrow("team_project_unavailable");
      await expect(
        db.query("SELECT save_project_team_draft($1,$2,'p','a',$3,$4,1,$5)", [
          actor,
          owner,
          second,
          hash,
          JSON.stringify({ title: "Changed" }),
        ]),
      ).rejects.toThrow("team_project_unavailable");
      expect(
        (
          await db.query(
            "SELECT data->>'title' title FROM workspace_entities WHERE user_id=$1 AND collection='content' AND entity_id='a'",
            [owner],
          )
        ).rows[0],
      ).toEqual({ title: "Draft" });
    },
  );
  it.each(["banned_until=now()+interval '1 hour'", "deleted_at=now()"])(
    "rejects suspended owner lifecycle and hides discovery: %s",
    async (restriction) => {
      await create();
      await db.exec(`UPDATE auth.users SET ${restriction} WHERE id='${owner}'`);
      await expect(create(second, owner, "new@example.test")).rejects.toThrow(
        "team_project_unavailable",
      );
      await expect(revoke()).rejects.toThrow("team_project_unavailable");
      await expect(accept()).rejects.toThrow("team_project_unavailable");
      await expect(change()).rejects.toThrow("team_project_unavailable");
      await expect(db.query("SELECT read_project_team_roster($1,$1,'p')", [owner])).rejects.toThrow(
        "team_project_unavailable",
      );
      const result = (
        await db.query<{ result: { invitations: unknown[] } }>(
          "SELECT list_my_project_teams($1) result",
          [actor],
        )
      ).rows[0].result;
      expect(result.invitations).toEqual([]);
    },
  );
  it("retains terminal invitations without exhausting pending capacity or roster limits", async () => {
    await db.query(
      "INSERT INTO project_team_invitations(owner_id,project_id,invite_id,recipient_email,role,state,expires_at,created_at) SELECT $1,'p',gen_random_uuid(),'old-'||i||'@example.test','viewer',(ARRAY['accepted','revoked','pending'])[1+i%3],now()-interval '1 day',now()-interval '2 days' FROM generate_series(1,1000) i",
      [owner],
    );
    await create();
    const roster = teamRoster.parse(
      (
        await db.query<{ result: unknown }>("SELECT read_project_team_roster($1,$1,'p') result", [
          owner,
        ])
      ).rows[0].result,
    );
    expect(roster.invitations).toHaveLength(1000);
    expect(roster.invitations.some((i) => i.inviteId === invite)).toBe(true);
    expect(
      (await db.query("SELECT count(*)::int n FROM project_team_invitations")).rows[0],
    ).toEqual({ n: 1001 });
  });
  it("retains the cap on unexpired pending invitations", async () => {
    await db.query(
      "INSERT INTO project_team_invitations(owner_id,project_id,invite_id,recipient_email,role,expires_at) SELECT $1,'p',gen_random_uuid(),'pending-'||i||'@example.test','viewer',now()+interval '1 day' FROM generate_series(1,1000) i",
      [owner],
    );
    await expect(create()).rejects.toThrow("team_invitation_capacity");
  });
  it.each([false, true])(
    "counts current memberships instead of former identities: active=%s",
    async (active) => {
      await db.query(
        "WITH accounts AS (INSERT INTO auth.users(id) SELECT gen_random_uuid() FROM generate_series(1,1000) RETURNING id) INSERT INTO project_team_members(owner_id,project_id,actor_id,role,active) SELECT $1,'p',id,'viewer',$2 FROM accounts",
        [owner, active],
      );
      await create();
      if (active) await expect(accept()).rejects.toThrow("team_membership_capacity");
      else {
        await accept();
        const roster = teamRoster.parse(
          (
            await db.query<{ result: unknown }>(
              "SELECT read_project_team_roster($1,$1,'p') result",
              [owner],
            )
          ).rows[0].result,
        );
        expect(roster.members).toHaveLength(1000);
        expect(roster.members.some((m) => m.actorId === actor && m.active)).toBe(true);
      }
    },
  );
  it("isolates a collaborator comment quota, permits exact retries and recovers after one hour", async () => {
    await create();
    await accept();
    const add = (who = actor, id = second) =>
      db.query("SELECT add_project_team_comment($1,$2,'p','a',$3,1,'New comment')", [
        who,
        owner,
        id,
      ]);
    await add();
    await db.query(
      "INSERT INTO project_team_comments(owner_id,project_id,asset_id,comment_id,actor_id,author_name,body,workspace_revision) SELECT $1,'p','a',gen_random_uuid(),$2,'Member','Recent',1 FROM generate_series(1,99)",
      [owner, actor],
    );
    await add(); // An exact retry does not consume another slot.
    await expect(add(actor, invite)).rejects.toThrow("team_comment_capacity");
    await add(owner, invite); // A teammate's quota remains available.
    expect((await db.query("SELECT * FROM project_team_comments")).rows).toHaveLength(101);
    await db.exec("UPDATE project_team_comments SET created_at=now()-interval '2 hours'");
    await add(actor, other);
    expect((await db.query("SELECT * FROM project_team_comments")).rows).toHaveLength(102);
  });
  it.each([false, true])(
    "preserves comment history with a recent activity limit: recent=%s",
    async (recent) => {
      await create();
      await accept();
      await db.query(
        "INSERT INTO project_team_comments(owner_id,project_id,asset_id,comment_id,actor_id,author_name,body,workspace_revision,created_at) SELECT $1,'p','a',gen_random_uuid(),$2,'Member','Historical',1,now()-CASE WHEN $3 THEN interval '1 minute' ELSE interval '2 hours' END FROM generate_series(1,5101)",
        [owner, actor, recent],
      );
      const add = () =>
        db.query("SELECT add_project_team_comment($1,$2,'p','a',$3,1,'New comment')", [
          actor,
          owner,
          second,
        ]);
      if (recent) await expect(add()).rejects.toThrow("team_comment_capacity");
      else {
        await add();
        const result = teamComments.parse(
          (
            await db.query<{ result: unknown }>(
              "SELECT read_project_team_comments($1,$2,'p','a',0) result",
              [actor, owner],
            )
          ).rows[0].result,
        );
        expect(result.remaining).toBe(5002);
        expect(
          (
            await db.query<{ result: unknown }>(
              "SELECT read_project_team_comments($1,$2,'p','a',5100) result",
              [actor, owner],
            )
          ).rows,
        ).toHaveLength(1);
      }
    },
  );
  it("permits editing and reviewing after retained history exceeds the former limits", async () => {
    await create();
    await accept();
    await db.query(
      "INSERT INTO project_team_edits(owner_id,project_id,asset_id,edit_id,actor_id,before_hash,after_hash,patch_hash,membership_revision,created_at) SELECT $1,'p','a',gen_random_uuid(),$2,repeat('a',64),repeat('b',64),repeat('c',64),1,now()-interval '2 hours' FROM generate_series(1,10000)",
      [owner, actor],
    );
    const snapshot = async () =>
      (
        await db.query<{ result: { draftHash: string; workspaceRevision: number } }>(
          "SELECT read_project_team_snapshot($1,$1,'p','a') result",
          [owner],
        )
      ).rows[0].result;
    await db.query("SELECT save_project_team_draft($1,$2,'p','a',$3,$4,1,$5)", [
      actor,
      owner,
      second,
      (await snapshot()).draftHash,
      { title: "New title" },
    ]);
    await db.query(
      "INSERT INTO project_team_approval_history(owner_id,project_id,asset_id,review_id,actor_id,membership_revision,policy_revision,version_hash,approved,created_at) SELECT $1,'p','a',gen_random_uuid(),$1,1,0,repeat('a',64),true,now()-interval '2 hours' FROM generate_series(1,10000)",
      [owner],
    );
    const current = await snapshot();
    await db.query("SELECT save_project_team_approval($1,$1,'p','a',$2,$3,$4,$5,1,0,true)", [
      owner,
      second,
      current.workspaceRevision,
      current.draftHash,
      "a".repeat(64),
    ]);
    expect(
      (await db.query("SELECT count(*)::int n FROM project_team_approval_history")).rows[0],
    ).toEqual({ n: 10001 });
  });
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
    // Model a pre-existing pending invitation, bypassing current creation guards.
    await db.query(
      "INSERT INTO public.project_team_invitations(owner_id,project_id,invite_id,recipient_email,role,expires_at) VALUES($1,'p',$2,'member@example.test','editor',now()+interval '1 day')",
      [owner, second],
    );
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
    await expect(create(second, owner, "MEMBER@example.test", "reviewer")).rejects.toThrow(
      "team_membership_exists",
    );
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM public.project_team_invitations WHERE state='pending'",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    expect((await db.query("SELECT role FROM public.project_team_members")).rows[0]).toEqual({
      role: "editor",
    });
  });
  it.each(["active=false", "expires_at=now()-interval '1 second'"])(
    "allows a fresh invitation after membership ends: %s",
    async (update) => {
      await create();
      await accept();
      await db.exec(`UPDATE public.project_team_members SET ${update}`);
      await create(second);
      expect((await accept(second)).rows[0]).toEqual({ revision: 2 });
    },
  );
  it("matches the member's current address when preventing duplicate invitations", async () => {
    await create();
    await accept();
    await db.query("UPDATE auth.users SET email='changed@example.test' WHERE id=$1", [actor]);
    await expect(create(second, owner, "changed@example.test")).rejects.toThrow(
      "team_membership_exists",
    );
    await create(second, owner, "member@example.test");
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
  it("saves an exact editor patch, preserves private evidence and withdraws approval while holding the queue", async () => {
    await create();
    await accept();
    await db.exec(`UPDATE public.workspace_entities SET data=data || '{"status":"Approved","sourceDependencies":[{"sourceId":"retained"}],"publishExternalId":"existing"}' WHERE collection='content';
      INSERT INTO public.scheduled_publishes VALUES('${owner}','p','a','pending',now());`);
    await db.query("SELECT public.set_publication_approval($1,'p','a',1,$2,true)", [
      owner,
      "a".repeat(64),
    ]);
    await db.query(
      "INSERT INTO public.output_knowledge_reviews(user_id,project_id,asset_id,review_id,version_hash,context_hash) VALUES($1,'p','a',$2,$3,$3)",
      [owner, invite, "a".repeat(64)],
    );
    const snapshot = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    const save = () =>
      db.query<{ hash: string }>(
        "SELECT public.save_project_team_draft($1,$2,'p','a',$3,$4,1,$5) hash",
        [actor, owner, second, snapshot.draftHash, { markdown: "Edited draft" }],
      );
    const result = await save();
    await save();
    expect(result.rows[0].hash).not.toBe(snapshot.draftHash);
    const saved = (
      await db.query<{ data: unknown }>(
        "SELECT data FROM public.workspace_entities WHERE collection='content'",
      )
    ).rows[0].data;
    expect(saved).toMatchObject({
      markdown: "Edited draft",
      status: "In Review",
      sourceDependencies: [{ sourceId: "retained" }],
      publishExternalId: "existing",
    });
    expect((await db.query("SELECT approved FROM public.publication_approvals")).rows[0]).toEqual({
      approved: false,
    });
    expect((await db.query("SELECT status FROM public.scheduled_publishes")).rows[0]).toEqual({
      status: "review_required",
    });
    expect(
      (await db.query("SELECT rev FROM public.workspace_meta WHERE user_id=$1", [owner])).rows[0],
    ).toEqual({ rev: 2 });
    expect((await db.query("SELECT * FROM public.project_team_edits")).rows).toHaveLength(1);
    expect((await db.query("SELECT active FROM public.output_knowledge_reviews")).rows[0]).toEqual({
      active: false,
    });
  });
  it("preserves approved content, scores, reviews and schedules for an unchanged populated form", async () => {
    await create();
    await accept();
    await db.exec(`UPDATE public.workspace_entities SET data=data || '{"status":"Approved","qualityScore":{"total":80},"qualityScoreStale":false}' WHERE collection='content';
      INSERT INTO public.scheduled_publishes VALUES('${owner}','p','a','pending',now());`);
    await db.query("SELECT public.set_publication_approval($1,'p','a',1,$2,true)", [
      owner,
      "a".repeat(64),
    ]);
    await db.query(
      "INSERT INTO public.output_knowledge_reviews(user_id,project_id,asset_id,review_id,version_hash,context_hash) VALUES($1,'p','a',$2,$3,$3)",
      [owner, invite, "a".repeat(64)],
    );
    const before = (
      await db.query(
        "SELECT data,updated_at FROM public.workspace_entities WHERE user_id=$1 AND collection='content'",
        [owner],
      )
    ).rows;
    const hash = (
      await db.query<{ hash: string }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a')->>'draftHash' hash",
        [actor, owner],
      )
    ).rows[0].hash;
    const patch = {
      title: "Draft",
      markdown: "Saved draft",
      h1: "",
      metaTitle: "",
      metaDescription: "",
      cta: "",
      outline: [],
      faq: [],
    };
    const save = () =>
      db.query<{ hash: string }>(
        "SELECT public.save_project_team_draft($1,$2,'p','a',$3,$4,1,$5) hash",
        [actor, owner, second, hash, patch],
      );
    expect((await save()).rows[0].hash).toBe(hash);
    expect((await save()).rows[0].hash).toBe(hash);
    expect(
      (
        await db.query(
          "SELECT data,updated_at FROM public.workspace_entities WHERE user_id=$1 AND collection='content'",
          [owner],
        )
      ).rows,
    ).toEqual(before);
    expect((await db.query("SELECT approved FROM public.publication_approvals")).rows).toEqual([
      { approved: true },
    ]);
    expect((await db.query("SELECT active FROM public.output_knowledge_reviews")).rows).toEqual([
      { active: true },
    ]);
    expect((await db.query("SELECT status FROM public.scheduled_publishes")).rows).toEqual([
      { status: "pending" },
    ]);
    expect(
      (await db.query("SELECT rev FROM public.workspace_meta WHERE user_id=$1", [owner])).rows,
    ).toEqual([{ rev: 1 }]);
    expect((await db.query("SELECT * FROM public.project_team_edits")).rows).toHaveLength(1);
  });
  it.each([
    { title: "New title" },
    { markdown: "New body" },
    { h1: "New heading" },
    { metaTitle: "New meta title" },
    { metaDescription: "New description" },
    { cta: "New CTA" },
    { outline: ["New section"] },
    { faq: [{ q: "Question", a: "Answer" }] },
  ])("marks the existing quality score stale after content changes: %j", async (patch) => {
    await create();
    await accept();
    await db.exec(
      `UPDATE public.workspace_entities SET data=data || '{"qualityScore":{"total":80},"qualityScoreStale":false}' WHERE collection='content'`,
    );
    const hash = (
      await db.query<{ hash: string }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a')->>'draftHash' hash",
        [actor, owner],
      )
    ).rows[0].hash;
    await db.query("SELECT public.save_project_team_draft($1,$2,'p','a',$3,$4,1,$5)", [
      actor,
      owner,
      second,
      hash,
      patch,
    ]);
    const saved = (
      await db.query<{ data: unknown }>(
        "SELECT data FROM public.workspace_entities WHERE user_id=$1 AND collection='content'",
        [owner],
      )
    ).rows[0].data;
    expect(saved).toMatchObject({
      ...patch,
      qualityScore: { total: 80 },
      qualityScoreStale: true,
      status: "In Review",
    });
  });
  it("rejects changed draft, changed membership, viewers, private-field patches and in-flight publication", async () => {
    await create();
    await accept();
    const snapshot = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    const save = (patch: unknown = { markdown: "Edit" }, hash = snapshot.draftHash, revision = 1) =>
      db.query("SELECT public.save_project_team_draft($1,$2,'p','a',$3,$4,$5,$6)", [
        actor,
        owner,
        second,
        hash,
        revision,
        patch,
      ]);
    await expect(save({ status: "Approved" })).rejects.toThrow("team_edit_invalid");
    await expect(save({ sourceDependencies: [] })).rejects.toThrow("team_edit_invalid");
    await expect(save({ markdown: "Edit" }, "b".repeat(64))).rejects.toThrow("team_draft_changed");
    await db.exec(
      `INSERT INTO public.scheduled_publishes VALUES('${owner}','p','a','publishing',now())`,
    );
    await expect(save()).rejects.toThrow("team_publication_in_flight");
    await db.exec(
      "TRUNCATE public.scheduled_publishes;UPDATE public.project_team_members SET revision=2",
    );
    await expect(save()).rejects.toThrow("team_edit_permission_changed");
    await db.exec("UPDATE public.project_team_members SET role='viewer'");
    await expect(save({ markdown: "Edit" }, snapshot.draftHash, 2)).rejects.toThrow(
      "team_edit_permission_changed",
    );
    expect((await db.query("SELECT * FROM public.project_team_edits")).rows).toHaveLength(0);
  });

  it("records an owner review without delegation and exposes only scoped decision history", async () => {
    await create();
    await accept();
    const authority = async (who: string) =>
      (
        await db.query<{ result: { canReview: boolean; policyRevision: number } }>(
          "SELECT public.read_project_team_review_authority($1,$2,'p','a') result",
          [who, owner],
        )
      ).rows[0].result;
    expect(await authority(owner)).toMatchObject({ canReview: true, policyRevision: 0 });
    expect(await authority(actor)).toMatchObject({ canReview: false, policyRevision: 0 });
    const snap = (
      await db.query<{ result: { draftHash: string; membershipRevision: number } }>(
        "SELECT public.read_project_team_snapshot($1,$1,'p','a') result",
        [owner],
      )
    ).rows[0].result;
    await db.query("SELECT public.save_project_team_approval($1,$1,'p','a',$2,1,$3,$4,$5,0,true)", [
      owner,
      second,
      snap.draftHash,
      "a".repeat(64),
      snap.membershipRevision,
    ]);
    expect(
      (
        await db.query(
          "SELECT approved,delegate_actor_id,delegate_policy_revision FROM public.publication_approvals",
        )
      ).rows[0],
    ).toEqual({ approved: true, delegate_actor_id: null, delegate_policy_revision: null });
    const history = (
      await db.query<{ result: { reviews: unknown[] } }>(
        "SELECT public.read_project_team_review_history($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    expect(history.reviews).toHaveLength(1);
    expect(history.reviews[0]).toEqual({
      reviewId: second,
      mine: false,
      owner: true,
      approved: true,
      versionHash: "a".repeat(64),
      createdAt: expect.any(String),
    });
    await expect(
      db.query("SELECT public.read_project_team_review_history($1,$2,'p','a')", [other, owner]),
    ).rejects.toThrow();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
      [owner],
    );
    expect(await authority(actor)).toMatchObject({ canReview: true, policyRevision: 1 });
  });
  it("denies direct browser-role calls to review authority and history", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const fn of ["read_project_team_review_authority", "read_project_team_review_history"]) {
        await expect(
          db.query(`SELECT public.${fn}($1,$2,'p','a')`, [actor, owner]),
        ).rejects.toThrow("permission denied");
      }
      await db.exec("RESET ROLE");
    }
  });

  it("keeps delegation off by default and only permits the owner to select a current policy", async () => {
    await create();
    await accept();
    const snap = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    await expect(
      db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,1,1,true)", [
        actor,
        owner,
        second,
        snap.draftHash,
        "a".repeat(64),
      ]),
    ).rejects.toThrow("team_approval_policy_changed");
    await expect(
      db.query(
        "SELECT public.set_project_team_approval_policy($1,$2,'p',0,'editors_can_approve')",
        [actor, owner],
      ),
    ).rejects.toThrow();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'separate_reviewers')",
      [owner],
    );
    await expect(
      db.query(
        "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
        [owner],
      ),
    ).rejects.toThrow("team_policy_changed");
    await expect(
      db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,1,1,true)", [
        actor,
        owner,
        second,
        snap.draftHash,
        "a".repeat(64),
      ]),
    ).rejects.toThrow("team_approval_policy_changed");
  });
  it("supports editor approval only under the selected policy and withdraws it on membership removal", async () => {
    await create();
    await accept();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
      [owner],
    );
    const snap = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    await db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,1,1,true)", [
      actor,
      owner,
      second,
      snap.draftHash,
      "a".repeat(64),
    ]);
    const approved = async () =>
      (
        await db.query<{ ok: boolean }>(
          "SELECT public.read_publication_approval($1,'p','a',$2) ok",
          [owner, "a".repeat(64)],
        )
      ).rows[0].ok;
    expect(await approved()).toBe(true);
    await change(1, true);
    expect(await approved()).toBe(false);
  });
  it.each([
    { sameVersion: true, approved: true, kept: true },
    { sameVersion: false, approved: true, kept: false },
    { sameVersion: true, approved: false, kept: false },
  ])(
    "preserves an earlier independent owner grant only for the same approved version %j",
    async ({ sameVersion, approved, kept }) => {
      await create();
      await accept();
      await db.query(
        "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
        [owner],
      );
      await db.query("SELECT public.set_publication_approval($1,'p','a',1,$2,true)", [
        owner,
        "a".repeat(64),
      ]);
      const snap = (
        await db.query<{ result: { draftHash: string; workspaceRevision: number } }>(
          "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
          [actor, owner],
        )
      ).rows[0].result;
      await db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,$4,$5,$6,1,1,$7)", [
        actor,
        owner,
        second,
        snap.workspaceRevision,
        snap.draftHash,
        (sameVersion ? "a" : "b").repeat(64),
        approved,
      ]);
      expect(
        (await db.query("SELECT delegate_actor_id FROM public.publication_approvals")).rows[0],
      ).toEqual({ delegate_actor_id: kept ? null : actor });
      await change(1, true);
      expect((await db.query("SELECT approved FROM public.publication_approvals")).rows[0]).toEqual(
        { approved: kept },
      );
    },
  );
  it("persists the reviewed image hashes and clears them on explicit legacy owner approval", async () => {
    await create();
    await accept();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
      [owner],
    );
    const snap = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    const images = Array.from({ length: 40 }, (_, i) => ({
      key: `content_im${i}`,
      byteHash: "b".repeat(64),
    }));
    await db.query(
      "SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,1,1,true,$6::jsonb)",
      [actor, owner, second, snap.draftHash, "a".repeat(64), JSON.stringify(images)],
    );
    const read = async () =>
      (
        await db.query<{ result: unknown }>(
          "SELECT public.read_publication_reviewed_images($1,'p','a',$2) result",
          [owner, "a".repeat(64)],
        )
      ).rows[0].result;
    expect(await read()).toEqual({ images });
    await db.query("SELECT public.set_publication_approval($1,'p','a',2,$2,true)", [
      owner,
      "a".repeat(64),
    ]);
    expect(await read()).toEqual({ images: null });
  });
  it("preserves later owner approval across policy changes and member removal", async () => {
    await create();
    await accept();
    await change();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'separate_reviewers')",
      [owner],
    );
    const snap = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    await db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,2,1,true)", [
      actor,
      owner,
      second,
      snap.draftHash,
      "a".repeat(64),
    ]);
    await db.query("SELECT public.set_publication_approval($1,'p','a',2,$2,true)", [
      owner,
      "a".repeat(64),
    ]);
    await change(2, true);
    await db.query("SELECT public.set_project_team_approval_policy($1,$1,'p',1,'disabled')", [
      owner,
    ]);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "SELECT public.read_publication_approval($1,'p','a',$2) ok",
          [owner, "a".repeat(64)],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (await db.query("SELECT delegate_actor_id FROM public.publication_approvals")).rows[0],
    ).toEqual({ delegate_actor_id: null });
  });
  it("policy changes cannot revive an old grant", async () => {
    await create();
    await accept();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
      [owner],
    );
    const snap = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    await db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,1,1,true)", [
      actor,
      owner,
      second,
      snap.draftHash,
      "a".repeat(64),
    ]);
    await db.query("SELECT public.set_project_team_approval_policy($1,$1,'p',1,'disabled')", [
      owner,
    ]);
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',2,'editors_can_approve')",
      [owner],
    );
    expect(
      (
        await db.query<{ ok: boolean }>(
          "SELECT public.read_publication_approval($1,'p','a',$2) ok",
          [owner, "a".repeat(64)],
        )
      ).rows[0].ok,
    ).toBe(false);
  });

  it("rejects a stale stored grant at read time when membership is expired", async () => {
    await create();
    await accept();
    await db.query(
      "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'editors_can_approve')",
      [owner],
    );
    const snap = (
      await db.query<{ result: { draftHash: string } }>(
        "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
        [actor, owner],
      )
    ).rows[0].result;
    await db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$5,1,1,true)", [
      actor,
      owner,
      second,
      snap.draftHash,
      "a".repeat(64),
    ]);
    // Model time passing without a membership mutation's eager invalidation.
    await db.exec(
      "ALTER TABLE public.project_team_members DISABLE TRIGGER invalidate_project_team_approvals; UPDATE public.project_team_members SET expires_at=now()-interval '1 second'; ALTER TABLE public.project_team_members ENABLE TRIGGER invalidate_project_team_approvals;",
    );
    expect((await db.query("SELECT approved FROM public.publication_approvals")).rows[0]).toEqual({
      approved: true,
    });
    expect(
      (
        await db.query<{ ok: boolean }>(
          "SELECT public.read_publication_approval($1,'p','a',$2) ok",
          [owner, "a".repeat(64)],
        )
      ).rows[0].ok,
    ).toBe(false);
  });
  it.each(["own", "owner-rewrite", "owner-noop"])(
    "binds reviewer separation to the actual current draft: %s",
    async (mode) => {
      await create();
      await accept();
      const before = (
        await db.query<{ result: { draftHash: string } }>(
          "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
          [actor, owner],
        )
      ).rows[0].result;
      await db.query("SELECT public.save_project_team_draft($1,$2,'p','a',$3,$4,1,$5)", [
        actor,
        owner,
        second,
        before.draftHash,
        { markdown: "My edit" },
      ]);
      if (mode === "owner-rewrite")
        await db.exec(
          "UPDATE workspace_entities SET data=data || '{\"markdown\":\"Owner rewritten version\"}' WHERE collection='content'; UPDATE workspace_meta SET rev=rev+1",
        );
      if (mode === "owner-noop") {
        const hash = (
          await db.query<{ hash: string }>(
            "SELECT read_project_team_snapshot($1,$2,'p','a')->>'draftHash' hash",
            [actor, owner],
          )
        ).rows[0].hash;
        await db.query("SELECT save_project_team_draft($1,$1,'p','a',$2,$3,1,$4)", [
          owner,
          other,
          hash,
          { markdown: "My edit" },
        ]);
      }
      await change();
      await db.query(
        "SELECT public.set_project_team_approval_policy($1,$1,'p',0,'separate_reviewers')",
        [owner],
      );
      const after = (
        await db.query<{ result: { draftHash: string } }>(
          "SELECT public.read_project_team_snapshot($1,$2,'p','a') result",
          [actor, owner],
        )
      ).rows[0].result;
      const review = db.query(
        "SELECT public.save_project_team_approval($1,$2,'p','a',$3,$6,$4,$5,2,1,true)",
        [actor, owner, other, after.draftHash, "a".repeat(64), mode === "owner-rewrite" ? 3 : 2],
      );
      if (mode === "owner-rewrite") await expect(review).resolves.toBeDefined();
      else await expect(review).rejects.toThrow("team_independent_reviewer_required");
    },
  );

  it("limits private review context to the exact assigned project and asset", async () => {
    await create();
    await accept();
    await db.exec(
      `INSERT INTO public.workspace_entities VALUES('${other}','content','other','{"projectId":"p","liveUrl":"https://other.example/private"}') ON CONFLICT DO NOTHING`,
    );
    const result = (
      await db.query<{
        result: {
          actorId: string;
          project: { id: string };
          asset: { id: string };
          links: unknown[];
        };
      }>("SELECT public.read_project_team_review_context($1,$2,'p','a') result", [actor, owner])
    ).rows[0].result;
    expect(result).toMatchObject({
      actorId: actor,
      project: { id: "p" },
      asset: { id: "a" },
      links: [],
    });
    await expect(
      db.query("SELECT public.read_project_team_review_context($1,$2,'p','a')", [actor, other]),
    ).rejects.toThrow();
    await change(1, true);
    await expect(
      db.query("SELECT public.read_project_team_review_context($1,$2,'p','a')", [actor, owner]),
    ).rejects.toThrow();
  });
  it("restricts all lifecycle functions and private tables to service-mediated calls", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of [
        "project_team_invitations",
        "project_team_audit",
        "project_team_members",
        "project_team_comments",
        "project_team_edits",
        "project_team_approval_policy",
        "project_team_approval_history",
      ])
        await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toThrow(
          /permission denied/,
        );
      if (role !== "service_role") {
        await expect(create()).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.read_project_team_review_context($1,$2,'p','a')", [actor, owner]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.read_project_team_approval_policy($1,$2,'p')", [actor, owner]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.set_project_team_approval_policy($1,$1,'p',0,'disabled')", [
            owner,
          ]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,1,$4,$4,1,1,true)", [
            actor,
            owner,
            second,
            "a".repeat(64),
          ]),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("SELECT public.save_project_team_draft($1,$2,'p','a',$3,$4,1,$5)", [
            actor,
            owner,
            second,
            "a".repeat(64),
            { markdown: "Edit" },
          ]),
        ).rejects.toThrow(/permission denied/);
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

describe("shared-project notification recipient controls", () => {
  const settings = async (who = actor) =>
    (
      await db.query<{
        result: {
          assigned: boolean;
          optedIn: boolean;
          revision: number;
          membershipRevision: number;
        };
      }>("SELECT public.read_project_team_notification_recipient($1,$2,'p',$3) result", [
        who,
        owner,
        actor,
      ])
    ).rows[0].result;
  const set = (who: string, action: string, enabled: boolean, revision: number, membership = 1) =>
    db.query("SELECT public.set_project_team_notification_recipient($1,$2,'p',$3,$4,$5,$6,$7)", [
      who,
      owner,
      actor,
      action,
      enabled,
      revision,
      membership,
    ]);
  it.each([false, true])(
    "retains consent audit history and never blocks opting out: recent=%s",
    async (recent) => {
      await create();
      await accept();
      await set(owner, "assign", true, 0);
      await set(actor, "opt_in", true, 1);
      await db.query(
        "INSERT INTO project_team_notification_recipient_audit(owner_id,project_id,recipient_id,actor_id,action,enabled,revision,created_at) SELECT $1,'p',$2,$2,'opt_in',true,2,now()-CASE WHEN $3 THEN interval '1 minute' ELSE interval '2 hours' END FROM generate_series(1,10000)",
        [owner, actor, recent],
      );
      if (recent)
        await expect(set(actor, "opt_in", true, 2)).rejects.toThrow("team_recipient_capacity");
      else await set(actor, "opt_in", true, 2);
      await set(actor, "opt_in", false, recent ? 2 : 3);
      expect(await settings()).toMatchObject({ optedIn: false });
    },
  );
  it("requires independent owner assignment and recipient consent with revision checks", async () => {
    await create();
    await accept();
    expect(await settings()).toMatchObject({ assigned: false, optedIn: false, revision: 0 });
    await set(owner, "assign", true, 0);
    expect(await settings()).toMatchObject({ assigned: true, optedIn: false, revision: 1 });
    await expect(set(owner, "opt_in", true, 1)).rejects.toThrow("team_recipient_unavailable");
    await expect(set(actor, "assign", true, 1)).rejects.toThrow("team_recipient_unavailable");
    await set(actor, "opt_in", true, 1);
    expect(await settings(owner)).toMatchObject({ assigned: true, optedIn: true, revision: 2 });
    await expect(set(actor, "opt_in", false, 1)).rejects.toThrow("team_recipient_changed");
    await set(actor, "opt_in", false, 2);
    expect(await settings()).toMatchObject({ assigned: true, optedIn: false });
    expect(
      (
        await db.query(
          "SELECT actor_id,action,enabled FROM public.project_team_notification_recipient_audit ORDER BY event_id",
        )
      ).rows,
    ).toEqual([
      { actor_id: owner, action: "assign", enabled: true },
      { actor_id: actor, action: "opt_in", enabled: true },
      { actor_id: actor, action: "opt_in", enabled: false },
    ]);
  });
  it("invalidates old assignment and consent after role changes or removal", async () => {
    await create();
    await accept();
    await set(owner, "assign", true, 0);
    await set(actor, "opt_in", true, 1);
    await change();
    expect(await settings()).toMatchObject({
      assigned: false,
      optedIn: false,
      membershipRevision: 2,
    });
    await expect(set(actor, "opt_in", true, 2)).rejects.toThrow("team_recipient_changed");
    await set(owner, "assign", true, 2, 2);
    expect(await settings()).toMatchObject({ assigned: true, optedIn: false });
    await change(2, true);
    expect(await settings(owner)).toMatchObject({ assigned: false, optedIn: false });
    await expect(settings()).rejects.toThrow();
  });
  it("admits only current assigned and consenting verified recipients", async () => {
    await create();
    await accept();
    const eligible = async (revision = 2) =>
      (
        await db.query<{ ok: boolean }>(
          "SELECT public.project_team_notification_recipient_eligible($1,'p',$2,$3,1) ok",
          [owner, actor, revision],
        )
      ).rows[0].ok;
    expect(await eligible(0)).toBe(false);
    await set(owner, "assign", true, 0);
    await set(actor, "opt_in", true, 1);
    expect(await eligible()).toBe(true);
    expect(await eligible(1)).toBe(false);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1", [
      actor,
    ]);
    expect(await eligible()).toBe(false);
    await db.query(
      "UPDATE auth.users SET banned_until=NULL,email='changed@example.test' WHERE id=$1",
      [actor],
    );
    expect(await eligible()).toBe(false);
    await db.query("UPDATE auth.users SET email='member@example.test' WHERE id=$1", [actor]);
    await set(actor, "opt_in", false, 2);
    expect(await eligible(3)).toBe(false);
  });
  it("denies unrelated accounts, expired membership and browser-role access", async () => {
    await create();
    await accept();
    await expect(settings(other)).rejects.toThrow("team_recipient_unavailable");
    await db.exec("UPDATE public.project_team_members SET expires_at=now()-interval '1 second'");
    await expect(set(owner, "assign", true, 0)).rejects.toThrow("team_recipient_changed");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(settings(owner)).rejects.toThrow("permission denied");
      await expect(set(owner, "assign", true, 0)).rejects.toThrow("permission denied");
      await expect(
        db.query("SELECT * FROM public.project_team_notification_recipients"),
      ).rejects.toThrow("permission denied");
      await db.exec("RESET ROLE");
    }
  });
});

describe("scoped team notification outbox", () => {
  const queue = async () =>
    (
      await db.query<{ id: string | null }>(
        "SELECT public.queue_project_team_notification_digest($1,'p',$2) id",
        [owner, actor],
      )
    ).rows[0].id;
  const claim = async () =>
    (
      await db.query<{ id: string; lease_token: string }>(
        "SELECT * FROM public.claim_project_team_notification_digest()",
      )
    ).rows[0];
  const begin = async (c: Awaited<ReturnType<typeof claim>>) =>
    (
      await db.query<{ body: unknown }>(
        "SELECT public.begin_project_team_notification_delivery($1,$2,encode(sha256(convert_to('member@example.test','UTF8')),'hex')) body",
        [c.id, c.lease_token],
      )
    ).rows[0].body;
  const prepare = async () => {
    await create();
    await accept();
    await db.query(
      "SELECT public.set_project_team_notification_recipient($1,$1,'p',$2,'assign',true,0,1)",
      [owner, actor],
    );
    await db.query(
      "SELECT public.set_project_team_notification_recipient($1,$2,'p',$1,'opt_in',true,1,1)",
      [actor, owner],
    );
    await db.query(
      "SELECT public.sync_operational_notifications($1,1,clock_timestamp(),$2::jsonb)",
      [
        owner,
        JSON.stringify([
          {
            key: "event",
            projectId: "p",
            targetId: "a",
            title: "Draft",
            kind: "approval_due",
            detail: { timeZone: "UTC", private: "must not escape" },
          },
        ]),
      ],
    );
  };
  it("still refuses excessive outstanding work across recipients", async () => {
    await prepare();
    await db.query(
      "INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES($1,'p',$2,'viewer')",
      [owner, other],
    );
    await db.query(
      "INSERT INTO public.project_team_notification_outbox(owner_id,project_id,recipient_id,settings_revision,membership_revision,status) SELECT $1,'p',$2,1,1,(ARRAY['pending','leased','sending'])[1+(i%3)] FROM generate_series(1,10000) i",
      [owner, other],
    );
    await expect(queue()).rejects.toThrow("team_notification_capacity");
  });
  it("allows new work after 10000 terminal digests without deleting deduplication history", async () => {
    await prepare();
    await db.query(
      "INSERT INTO public.project_team_notification_outbox(owner_id,project_id,recipient_id,settings_revision,membership_revision,status,created_at) SELECT $1,'p',$2,2,1,(ARRAY['accepted','cancelled','failed','unknown'])[1+(i%4)],now()-interval '2 hours' FROM generate_series(1,10000) i",
      [owner, actor],
    );
    expect(await queue()).toEqual(expect.any(String));
    expect(
      (await db.query("SELECT count(*)::int n FROM public.project_team_notification_outbox"))
        .rows[0],
    ).toEqual({ n: 10001 });
    expect(await queue()).toBeNull();
  });
  it("queues once per recipient and returns only scoped safe current event fields", async () => {
    await prepare();
    expect(
      (await db.query("SELECT * FROM public.project_team_notification_scan_targets()")).rows,
    ).toEqual([{ owner_id: owner, project_id: "p", recipient_id: actor }]);
    expect(await queue()).toEqual(expect.any(String));
    expect(await queue()).toBeNull();
    const c = await claim();
    expect(await begin(c)).toEqual({
      locale: "en",
      items: [
        {
          id: expect.any(String),
          projectId: "p",
          targetId: "a",
          title: "Draft",
          kind: "approval_due",
          dueAt: null,
          detail: { timeZone: "UTC" },
        },
      ],
    });
    expect(
      (
        await db.query(
          "SELECT public.finish_project_team_notification_delivery($1,$2,'accepted') ok",
          [c.id, c.lease_token],
        )
      ).rows[0],
    ).toEqual({ ok: true });
    await db.exec(
      "UPDATE public.project_team_notification_outbox SET created_at=now()-interval '2 hours'",
    );
    expect(await queue()).toBeNull();
  });
  it("cancels when consent changes or the underlying incident resolves", async () => {
    await prepare();
    await queue();
    const c = await claim();
    await db.query(
      "SELECT public.set_project_team_notification_recipient($1,$2,'p',$1,'opt_in',false,2,1)",
      [actor, owner],
    );
    expect(await begin(c)).toBeNull();
    expect(
      (await db.query("SELECT status FROM public.project_team_notification_outbox")).rows[0],
    ).toEqual({ status: "cancelled" });
  });
  it("cancels resolved incidents and refuses stale source scans", async () => {
    await prepare();
    await queue();
    const c = await claim();
    await db.exec("UPDATE public.workspace_meta SET rev=2");
    await expect(begin(c)).rejects.toThrow("team_notification_source_stale");
    await db.exec(
      "UPDATE public.workspace_meta SET rev=1; UPDATE public.operational_notifications SET active=false",
    );
    expect(await begin(c)).toBeNull();
  });
  it("cancels if the verified current address no longer matches the resolved recipient", async () => {
    await prepare();
    await queue();
    const c = await claim();
    await db.query("UPDATE auth.users SET email='new@example.test' WHERE id=$1", [actor]);
    await db.query(
      `UPDATE auth.identities SET identity_data='{"email":"new@example.test","email_verified":true}' WHERE user_id=$1`,
      [actor],
    );
    expect(await begin(c)).toBeNull();
  });
  it("holds uncertain sends and only retries failures before transport", async () => {
    await prepare();
    await queue();
    const c = await claim();
    await db.query(
      "SELECT public.finish_project_team_notification_delivery($1,$2,'preflight_unavailable')",
      [c.id, c.lease_token],
    );
    await db.exec(
      "UPDATE public.project_team_notification_outbox SET available_at=now()-interval '1 minute'",
    );
    const retry = await claim();
    expect(retry.lease_token).not.toBe(c.lease_token);
    await begin(retry);
    await db.exec(
      "UPDATE public.project_team_notification_outbox SET lease_until=now()-interval '1 minute'",
    );
    expect(await claim()).toBeUndefined();
    expect(
      (await db.query("SELECT status FROM public.project_team_notification_outbox")).rows[0],
    ).toEqual({ status: "unknown" });
  });
  it("scopes history and denies direct browser access", async () => {
    await prepare();
    await queue();
    await expect(
      db.query("SELECT public.read_project_team_notification_history($1,$2,'p',$3)", [
        other,
        owner,
        actor,
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ body: { deliveries: unknown[] } }>(
          "SELECT public.read_project_team_notification_history($1,$2,'p',$1) body",
          [actor, owner],
        )
      ).rows[0].body.deliveries,
    ).toHaveLength(1);
    await db.exec("SET ROLE authenticated");
    await expect(queue()).rejects.toThrow("permission denied");
    await expect(claim()).rejects.toThrow("permission denied");
    await expect(db.query("SELECT * FROM public.project_team_notification_outbox")).rejects.toThrow(
      "permission denied",
    );
    await db.exec("RESET ROLE");
  });
});

describe("explicit saved invitation email delivery", () => {
  const request = async (email = "member@example.test", who = owner) =>
    (
      await db.query<{ id: string }>(
        "SELECT public.request_project_team_invitation_delivery($1,'p',$2,$3,'editor') id",
        [who, invite, email],
      )
    ).rows[0].id;
  const claim = async () =>
    (
      await db.query<{ id: string; lease_token: string }>(
        "SELECT * FROM public.claim_project_team_invitation_delivery()",
      )
    ).rows[0];
  const begin = async (c: Awaited<ReturnType<typeof claim>>) =>
    (
      await db.query<{ ok: boolean }>(
        "SELECT public.begin_project_team_invitation_delivery($1,$2,encode(sha256(convert_to('member@example.test','UTF8')),'hex'),'editor') ok",
        [c.id, c.lease_token],
      )
    ).rows[0].ok;
  it("requires owner review of the exact saved recipient and is retry-idempotent", async () => {
    await create();
    await expect(request("wrong@example.test")).rejects.toThrow("team_invitation_delivery_changed");
    await expect(request("member@example.test", other)).rejects.toThrow();
    const id = await request();
    expect(await request()).toBe(id);
    expect(
      (await db.query("SELECT * FROM public.project_team_invitation_deliveries")).rows,
    ).toHaveLength(1);
    const c = await claim();
    expect(await begin(c)).toBe(true);
    await db.query("SELECT public.finish_project_team_invitation_delivery($1,$2,'accepted')", [
      c.id,
      c.lease_token,
    ]);
    expect(await request()).toBe(id);
    expect(await claim()).toBeUndefined();
  });
  it.each(["revoke", "expire", "accept"])("cancels %s before transport", async (action) => {
    await create();
    await request();
    const c = await claim();
    if (action === "revoke") await revoke();
    else if (action === "accept") await accept();
    else
      await db.exec(
        "UPDATE public.project_team_invitations SET expires_at=now()-interval '1 second'",
      );
    expect(await begin(c)).toBe(false);
    expect(
      (await db.query("SELECT status FROM public.project_team_invitation_deliveries")).rows[0],
    ).toEqual({ status: "cancelled" });
  });
  it("holds expired sends as unknown and denies direct browser calls", async () => {
    await create();
    await request();
    const c = await claim();
    await begin(c);
    await db.exec(
      "UPDATE public.project_team_invitation_deliveries SET lease_until=now()-interval '1 second'",
    );
    expect(await claim()).toBeUndefined();
    expect(
      (await db.query("SELECT status FROM public.project_team_invitation_deliveries")).rows[0],
    ).toEqual({ status: "unknown" });
    await db.exec("SET ROLE authenticated");
    await expect(request()).rejects.toThrow("permission denied");
    await expect(claim()).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  });
});
