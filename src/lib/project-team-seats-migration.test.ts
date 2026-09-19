import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
/** Seat allowances per business account (owner decision 2026-09-14) enforced by the
 * candidate migration under the existing owner lock. Limits come from the server; NULL
 * limits keep the pre-seat behaviour. */
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
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
    INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{"name":"Assigned"}'),('${owner}','projects','q','{"name":"Second"}'),('${other}','projects','p','{"name":"Other"}');`);
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
    "20260914150000_project_team_seats.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.project_team_invitation_deliveries,public.project_team_notification_items,public.project_team_notification_outbox,public.project_team_notification_recipient_audit,public.project_team_notification_recipients,public.project_team_members,public.project_team_invitations,public.project_team_audit;
    UPDATE public.workspace_meta SET rev=1;`);
});
afterAll(async () => {
  await db?.close();
});
const invite = (
  n: number,
  email: string,
  role: string,
  limits?: [number | null, number | null],
  project = "p",
) =>
  limits
    ? db.query("SELECT public.create_project_team_invitation($1,$1,$2,$3,$4,$5,$6,$7)", [
        owner,
        project,
        id(n),
        email,
        role,
        limits[0],
        limits[1],
      ])
    : db.query("SELECT public.create_project_team_invitation($1,$1,$2,$3,$4,$5)", [
        owner,
        project,
        id(n),
        email,
        role,
      ]);
const seats = async () => {
  const { rows } = await db.query<{ working: number; viewer: number }>(
    "SELECT * FROM public.count_project_team_seats($1)",
    [owner],
  );
  return rows[0];
};
describe("team seat allowances", () => {
  it("counts the owner as one working seat and nobody else on an empty account", async () => {
    expect(await seats()).toEqual({ working: 1, viewer: 0 });
  });
  it("keeps the previous behaviour when no limits are supplied", async () => {
    for (let n = 1; n <= 4; n++) await invite(n, `editor${n}@example.test`, "editor");
    expect(await seats()).toEqual({ working: 5, viewer: 0 });
  });
  it("refuses a working seat beyond the plan while viewer seats stay separate", async () => {
    await invite(1, "one@example.test", "editor", [2, 1]);
    await expect(invite(2, "two@example.test", "reviewer", [2, 1])).rejects.toThrow(
      /team_seat_limit/,
    );
    await invite(3, "look@example.test", "viewer", [2, 1]);
    await expect(invite(4, "peek@example.test", "viewer", [2, 1])).rejects.toThrow(
      /team_seat_limit/,
    );
    expect(await seats()).toEqual({ working: 2, viewer: 1 });
    // A refused invitation leaves no trace and no audit event.
    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*)::text n FROM public.project_team_invitations WHERE owner_id=$1",
      [owner],
    );
    expect(rows[0].n).toBe("2");
  });
  it("counts one person once across the account's projects", async () => {
    await invite(1, "one@example.test", "editor", [2, 0]);
    await invite(2, "one@example.test", "editor", [2, 0], "q");
    await invite(3, "one@example.test", "viewer", [2, 0], "q").catch(() => undefined);
    expect(await seats()).toEqual({ working: 2, viewer: 0 });
    await expect(invite(4, "two@example.test", "editor", [2, 0], "q")).rejects.toThrow(
      /team_seat_limit/,
    );
  });
  it("frees a reserved seat when the pending invitation is revoked", async () => {
    await invite(1, "one@example.test", "editor", [2, 0]);
    await expect(invite(2, "two@example.test", "editor", [2, 0])).rejects.toThrow(
      /team_seat_limit/,
    );
    await db.query("SELECT public.revoke_project_team_invitation($1,$1,'p',$2)", [owner, id(1)]);
    await invite(2, "two@example.test", "editor", [2, 0]);
    expect(await seats()).toEqual({ working: 2, viewer: 0 });
  });
  it("needs a free seat to promote a viewer or demote the last working role, but not to move between working roles", async () => {
    await invite(1, "member@example.test", "viewer", [2, 1]);
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3)", [
      actor,
      owner,
      id(1),
    ]);
    await invite(2, "one@example.test", "editor", [2, 1]);
    const change = (expected: number, role: string, limits?: [number, number]) =>
      limits
        ? db.query<{ revision: string }>(
            "SELECT public.change_project_team_member($1,$1,'p',$2,$3,$4,false,$5,$6)::text revision",
            [owner, actor, expected, role, limits[0], limits[1]],
          )
        : db.query<{ revision: string }>(
            "SELECT public.change_project_team_member($1,$1,'p',$2,$3,$4,false)::text revision",
            [owner, actor, expected, role],
          );
    await expect(change(1, "editor", [2, 1])).rejects.toThrow(/team_seat_limit/);
    expect(await seats()).toEqual({ working: 2, viewer: 1 });
    expect((await change(1, "editor")).rows[0].revision).toBe("2");
    expect(await seats()).toEqual({ working: 3, viewer: 0 });
    expect((await change(2, "reviewer", [2, 1])).rows[0].revision).toBe("3");
    // Demoting the member's last working role to viewer needs a viewer seat: with zero
    // viewer seats it is refused. Previously the pre-update working classification skipped
    // this check, so the successful demotion could leave the viewer count above its cap.
    await expect(change(3, "viewer", [2, 0])).rejects.toThrow(/team_seat_limit/);
    expect(await seats()).toEqual({ working: 3, viewer: 0 });
    // One free viewer seat lets the same demotion through and moves the person's seat.
    expect((await change(3, "viewer", [2, 1])).rows[0].revision).toBe("4");
    expect(await seats()).toEqual({ working: 2, viewer: 1 });
  });
  it("refuses demoting the last working role when the viewer allowance is already full", async () => {
    await invite(1, "member@example.test", "editor", [5, 1]);
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3)", [
      actor,
      owner,
      id(1),
    ]);
    await invite(2, "look@example.test", "viewer", [5, 1]);
    expect(await seats()).toEqual({ working: 2, viewer: 1 });
    // The lone viewer seat is taken, so demoting the working member would need a second.
    await expect(
      db.query("SELECT public.change_project_team_member($1,$1,'p',$2,1,'viewer',false,5,1)", [
        owner,
        actor,
      ]),
    ).rejects.toThrow(/team_seat_limit/);
    expect(await seats()).toEqual({ working: 2, viewer: 1 });
  });
  it("adds no viewer seat when a demoted member still holds a working role on another project", async () => {
    await invite(1, "member@example.test", "editor", [5, 0]);
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3)", [
      actor,
      owner,
      id(1),
    ]);
    await invite(2, "member@example.test", "editor", [5, 0], "q");
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'q',$3)", [
      actor,
      owner,
      id(2),
    ]);
    expect(await seats()).toEqual({ working: 2, viewer: 0 });
    // Dropping the 'p' role to viewer leaves the member working via 'q'; even with no
    // viewer allowance the change succeeds and creates no viewer seat.
    expect(
      (
        await db.query<{ revision: string }>(
          "SELECT public.change_project_team_member($1,$1,'p',$2,1,'viewer',false,5,0)::text revision",
          [owner, actor],
        )
      ).rows[0].revision,
    ).toBe("2");
    expect(await seats()).toEqual({ working: 2, viewer: 0 });
  });
  it("adds no viewer seat when a demoted member still has a pending working invitation elsewhere", async () => {
    await invite(1, "member@example.test", "editor", [5, 0]);
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3)", [
      actor,
      owner,
      id(1),
    ]);
    await invite(2, "member@example.test", "reviewer", [5, 0], "q");
    expect(await seats()).toEqual({ working: 2, viewer: 0 });
    // A working invitation still pending on 'q' keeps the member a working person, so the
    // demotion on 'p' consumes no viewer seat even at a zero viewer allowance.
    expect(
      (
        await db.query<{ revision: string }>(
          "SELECT public.change_project_team_member($1,$1,'p',$2,1,'viewer',false,5,0)::text revision",
          [owner, actor],
        )
      ).rows[0].revision,
    ).toBe("2");
    expect(await seats()).toEqual({ working: 2, viewer: 0 });
  });
  it("removes access unconditionally, ignoring seat allowances even when over the limit", async () => {
    await invite(1, "member@example.test", "editor");
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3)", [
      actor,
      owner,
      id(1),
    ]);
    await invite(2, "look@example.test", "viewer");
    expect(await seats()).toEqual({ working: 2, viewer: 1 });
    // Removal never consults the allowance: the tightest limits cannot block it. It frees
    // the working seat and leaves the untouched viewer invitation in place.
    expect(
      (
        await db.query<{ revision: string }>(
          "SELECT public.change_project_team_member($1,$1,'p',$2,1,NULL::text,true,1,0)::text revision",
          [owner, actor],
        )
      ).rows[0].revision,
    ).toBe("2");
    expect(await seats()).toEqual({ working: 1, viewer: 1 });
  });
  it("keeps the owner-only authorization and optimistic revision guard under the seat check", async () => {
    await invite(1, "member@example.test", "editor", [5, 5]);
    await db.query("SELECT public.accept_project_team_invitation($1,$2,'p',$3)", [
      actor,
      owner,
      id(1),
    ]);
    // A non-owner actor is refused before any seat evaluation.
    await expect(
      db.query("SELECT public.change_project_team_member($1,$2,'p',$1,1,'reviewer',false,5,5)", [
        actor,
        owner,
      ]),
    ).rejects.toThrow(/team_membership_unavailable/);
    // A stale expected revision still loses to the optimistic-lock guard; the seat check
    // is skipped when the expected row is absent so it cannot mask the conflict.
    await expect(
      db.query("SELECT public.change_project_team_member($1,$1,'p',$2,99,'reviewer',false,5,5)", [
        owner,
        actor,
      ]),
    ).rejects.toThrow(/team_membership_changed/);
    // The valid owner change still succeeds and advances the revision by one.
    expect(
      (
        await db.query<{ revision: string }>(
          "SELECT public.change_project_team_member($1,$1,'p',$2,1,'reviewer',false,5,5)::text revision",
          [owner, actor],
        )
      ).rows[0].revision,
    ).toBe("2");
  });
  it("rejects malformed limits and keeps the seat functions service-only", async () => {
    await expect(invite(1, "one@example.test", "editor", [0, 1])).rejects.toThrow(
      /team_seat_unavailable/,
    );
    await db.exec("SET ROLE anon");
    await expect(seats()).rejects.toThrow(/permission denied/);
    await expect(invite(2, "two@example.test", "editor", [2, 1])).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("RESET ROLE; SET ROLE service_role");
    expect(await seats()).toEqual({ working: 1, viewer: 0 });
    await db.exec("RESET ROLE");
  });
});
