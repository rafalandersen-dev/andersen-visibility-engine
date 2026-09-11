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
    CREATE TABLE public.scheduled_publishes(user_id uuid,project_id text,asset_id text,status text,updated_at timestamptz);
    CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb);
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,collection,entity_id));
    ALTER TABLE public.workspace_entities ADD COLUMN updated_at timestamptz DEFAULT now();
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');
    INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{"name":"Assigned"}'),('${other}','projects','p','{"name":"Other"}');`);
  for (const file of [
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
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.project_team_approval_history,public.project_team_approval_policy,public.output_knowledge_reviews,public.project_team_edits,public.scheduled_publishes,public.publication_approvals,public.project_team_comments,public.project_team_members,public.project_team_invitations,public.project_team_audit;
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
  it("does not let an editor approve their own edit by switching to Reviewer under separation", async () => {
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
    await expect(
      db.query("SELECT public.save_project_team_approval($1,$2,'p','a',$3,2,$4,$5,2,1,true)", [
        actor,
        owner,
        other,
        after.draftHash,
        "a".repeat(64),
      ]),
    ).rejects.toThrow("team_independent_reviewer_required");
  });

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
