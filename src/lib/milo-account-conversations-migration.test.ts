import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { listAccountConversations } from "./milo-conversation-account.server";
import { accountConversationCursor } from "./milo-conversation-account";
import { eraseConversation, exportConversationPage } from "./milo-conversation-lifecycle.server";
import { readConversation } from "./milo-conversation.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
import type { TeamReadRpc } from "./project-team-read.server";
const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003",
  secondOwner = "00000000-0000-4000-8000-000000000004";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE auth.identities(user_id uuid,identity_data jsonb);
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','owner@example.test',now()),('${actor}','member@example.test',now()),('${other}','other@example.test',now()),('${secondOwner}','second@example.test',now());
    CREATE TABLE public.scheduled_publishes(user_id uuid,project_id text,asset_id text,status text,updated_at timestamptz);
    CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb);
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}'),('${secondOwner}');`);
  await db.exec(`
    CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
    CREATE SCHEMA net;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
    RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE request_id bigint; BEGIN
      INSERT INTO net.requests(url,body,timeout_ms) VALUES(url,body,timeout_milliseconds) RETURNING id INTO request_id; RETURN request_id;
    END; $$;
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid $$;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;
  `);
  for (const file of [
    "20260907150000_operational_notifications.sql",
    "20260907170000_operational_email_outbox.sql",
    "20260909200000_project_knowledge.sql",
    "20260910100000_source_refresh.sql",
    "20260911000000_output_knowledge_integrity.sql",
    "20260911010000_output_knowledge_reviews.sql",
    "20260911020000_project_team_reads.sql",
    "20260911030000_project_team_membership.sql",
    "20260910170000_publication_approval.sql",
    "20260911050000_project_team_edits.sql",
    "20260911060000_project_team_approval_policy.sql",
    "20260913120000_milo_conversations.sql",
    "20260913160000_milo_conversation_dispatch.sql",
    "20260913180000_milo_draft_proposals.sql",
    "20260913200000_milo_conversation_lifecycle.sql",
    "20260914090000_milo_account_conversations.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 30000);
const query = async <T = unknown>(sql: string, params: unknown[] = []) =>
  (await db.query<{ result: T }>(`SELECT public.${sql} result`, params)).rows[0].result;
const rpc: TeamReadRpc = async (name, params) => {
  try {
    return {
      data: await query(
        `${name}(${Object.keys(params)
          .map((key, i) => `${key}=>$${i + 1}`)
          .join(",")})`,
        Object.values(params),
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};
const start = async (who: string, ownerId: string, projectId: string, body: string) => {
  const conversationId = randomUUID();
  await query("begin_milo_conversation_turn($1,$2,$3,$4,$5,$6,'pl')", [
    who,
    ownerId,
    projectId,
    conversationId,
    randomUUID(),
    body,
  ]);
  return { ownerId, projectId, conversationId };
};
const list = (who = actor, before?: { createdAt: string; conversationId: string }) =>
  listAccountConversations(who, before ? { before } : {}, rpc);
const count = async (table: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::integer n FROM public.${table}`)).rows[0].n;
const leasesEmpty = async () =>
  (await db.query<{ leases: object }>("SELECT leases FROM project_team_preview_limits")).rows.every(
    (row) => Object.keys(row.leases).length === 0,
  );
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE workspace_entities,project_team_members,milo_conversations,milo_conversation_turns,milo_draft_proposals,milo_erased_conversations,milo_erased_turns,project_team_edits,project_team_preview_limits,milo_conversation_dispatch_attempts,net.requests CASCADE;
    UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;
    INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES
      ('${owner}','projects','p','{"name":"CLIENT_NAME_P"}'),
      ('${owner}','projects','q','{"name":"CLIENT_NAME_Q"}'),
      ('${secondOwner}','projects','p','{"name":"SECOND_CLIENT_NAME"}');
    INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES
      ('${owner}','p','${actor}','editor'),('${owner}','q','${actor}','viewer'),
      ('${secondOwner}','p','${actor}','editor'),('${owner}','p','${other}','editor');`);
});
afterAll(async () => {
  await db?.close();
});
describe("account-level private conversation directory", () => {
  it("lists only the actor's own conversations across clients, including owners with identical project IDs", async () => {
    const first = await start(actor, owner, "p", "ACTOR_TITLE_FIRST");
    const second = await start(actor, secondOwner, "p", "ACTOR_TITLE_SECOND");
    const ownerOwn = await start(owner, owner, "p", "OWNER_PRIVATE_TITLE");
    const otherOwn = await start(other, owner, "p", "OTHER_PRIVATE_TITLE");
    const mine = await list();
    expect(mine.hasMore).toBe(false);
    expect(mine.conversations.map((entry) => entry.conversationId).sort()).toEqual(
      [first.conversationId, second.conversationId].sort(),
    );
    expect(mine.conversations.every((entry) => entry.access === "available")).toBe(true);
    expect(mine.conversations.find((e) => e.ownerId === secondOwner)?.title).toBe(
      "ACTOR_TITLE_SECOND",
    );
    const text = JSON.stringify(mine);
    for (const hidden of ["OWNER_PRIVATE_TITLE", "OTHER_PRIVATE_TITLE", "CLIENT_NAME", "Private"])
      expect(text).not.toContain(hidden);
    // A project owner never discovers a member's private history.
    const ownerView = await list(owner);
    expect(ownerView.conversations.map((entry) => entry.conversationId)).toEqual([
      ownerOwn.conversationId,
    ]);
    expect(JSON.stringify(ownerView)).not.toContain(otherOwn.conversationId);
    expect(await leasesEmpty()).toBe(true);
  });
  it("revoked and expired access expose identifiers only and still allow the existing known-own erasure", async () => {
    const revoked = await start(actor, owner, "p", "REVOKED_SECRET_TITLE");
    const expired = await start(actor, owner, "q", "EXPIRED_SECRET_TITLE");
    const kept = await start(actor, secondOwner, "p", "STILL_AVAILABLE_TITLE");
    await db.query(
      "UPDATE project_team_members SET active=false WHERE owner_id=$1 AND project_id='p' AND actor_id=$2",
      [owner, actor],
    );
    await db.query(
      "UPDATE project_team_members SET expires_at=clock_timestamp()-interval '1 second' WHERE owner_id=$1 AND project_id='q' AND actor_id=$2",
      [owner, actor],
    );
    const page = await list();
    const byId = new Map(page.conversations.map((entry) => [entry.conversationId, entry]));
    expect(byId.get(revoked.conversationId)).toEqual({
      ...revoked,
      access: "unavailable",
      title: null,
      createdAt: expect.any(String),
    });
    expect(byId.get(expired.conversationId)).toMatchObject({ access: "unavailable", title: null });
    expect(byId.get(kept.conversationId)).toMatchObject({
      access: "available",
      title: "STILL_AVAILABLE_TITLE",
    });
    const text = JSON.stringify(page);
    for (const hidden of ["REVOKED_SECRET_TITLE", "EXPIRED_SECRET_TITLE", "CLIENT_NAME", "Private"])
      expect(text).not.toContain(hidden);
    // Discovery grants no read, export or new-turn authority in that client.
    await expect(readConversation(actor, revoked, rpc)).rejects.toThrow();
    await expect(exportConversationPage(actor, expired, rpc)).rejects.toThrow();
    await expect(
      query("begin_milo_conversation_turn($1,$2,'p',$3,$4,'Again','pl')", [
        actor,
        owner,
        revoked.conversationId,
        randomUUID(),
      ]),
    ).rejects.toThrow();
    for (const target of [revoked, expired]) {
      expect(await eraseConversation(actor, target, rpc)).toEqual({
        ...target,
        actorId: actor,
        erased: true,
      });
      // A lost response is recovered with the identical immutable target.
      expect((await eraseConversation(actor, target, rpc)).erased).toBe(true);
    }
    expect((await list()).conversations.map((entry) => entry.conversationId)).toEqual([
      kept.conversationId,
    ]);
    // Erasure retains retired IDs and original creation timestamps for limits.
    expect(await count("milo_erased_conversations")).toBe(2);
    expect(await count("milo_erased_turns")).toBe(2);
    expect(await leasesEmpty()).toBe(true);
  });
  it("hides titles while a client owner is suspended and restores them only when access is current again", async () => {
    const target = await start(actor, owner, "p", "SUSPENDED_CLIENT_TITLE");
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [
      owner,
    ]);
    expect((await list()).conversations).toEqual([
      { ...target, access: "unavailable", title: null, createdAt: expect.any(String) },
    ]);
    await db.query("UPDATE auth.users SET banned_until=NULL WHERE id=$1", [owner]);
    expect((await list()).conversations[0]).toMatchObject({
      access: "available",
      title: "SUSPENDED_CLIENT_TITLE",
    });
  });
  it("does not list or recreate conversations retired by project deletion", async () => {
    const deleted = await start(actor, owner, "q", "DELETED_PROJECT_TITLE");
    const kept = await start(actor, owner, "p", "KEPT_TITLE");
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='q'",
      [owner],
    );
    const page = await list();
    expect(page.conversations.map((entry) => entry.conversationId)).toEqual([kept.conversationId]);
    expect(JSON.stringify(page)).not.toContain("DELETED_PROJECT_TITLE");
    expect(await count("milo_erased_conversations")).toBe(1);
    expect((await eraseConversation(actor, deleted, rpc)).erased).toBe(true);
    expect(await count("milo_conversations")).toBe(1);
  });
  it("pages exactly across identical timestamps, excludes other actors and stays stable when entries are erased between pages", async () => {
    await db.query(
      `INSERT INTO milo_conversations(conversation_id,actor_id,owner_id,project_id,title,created_at)
       SELECT gen_random_uuid(),$1,$2,CASE WHEN i%2=0 THEN 'p' ELSE 'q' END,'Title '||i,
         CASE WHEN i<=30 THEN timestamptz '2026-09-13 10:00:00.123456+00' ELSE timestamptz '2026-09-13 09:00:00+00'+(i||' microseconds')::interval END
       FROM generate_series(1,60) i`,
      [actor, owner],
    );
    await start(other, owner, "p", "OTHER_ACTOR_TITLE");
    const order = (
      await db.query<{ id: string }>(
        "SELECT conversation_id::text id FROM milo_conversations WHERE actor_id=$1 ORDER BY created_at DESC,conversation_id DESC",
        [actor],
      )
    ).rows.map((row) => row.id);
    expect(order).toHaveLength(60);
    const first = await list();
    expect(first.conversations).toHaveLength(25);
    expect(first.hasMore).toBe(true);
    // Erase one already-read entry and one not yet read before continuing.
    const readErased = first.conversations[3],
      unreadErased = order[40];
    await eraseConversation(
      actor,
      {
        ownerId: readErased.ownerId,
        projectId: readErased.projectId,
        conversationId: readErased.conversationId,
      },
      rpc,
    );
    const unread = await db.query<{ owner_id: string; project_id: string }>(
      "SELECT owner_id,project_id FROM milo_conversations WHERE conversation_id=$1",
      [unreadErased],
    );
    await eraseConversation(
      actor,
      {
        ownerId: unread.rows[0].owner_id,
        projectId: unread.rows[0].project_id,
        conversationId: unreadErased,
      },
      rpc,
    );
    const pages = [first];
    while (pages.at(-1)!.hasMore) {
      pages.push(await list(actor, accountConversationCursor(pages.at(-1)!.conversations.at(-1)!)));
      expect(pages.length).toBeLessThanOrEqual(4);
    }
    const seen = pages.flatMap((page) => page.conversations.map((entry) => entry.conversationId));
    expect(pages.map((page) => page.conversations.length)).toEqual([25, 25, 9]);
    expect(seen).toEqual(order.filter((id) => id !== unreadErased));
    expect(new Set(seen).size).toBe(seen.length);
    expect(JSON.stringify(pages)).not.toContain("OTHER_ACTOR_TITLE");
    expect(await leasesEmpty()).toBe(true);
  });
  it("rejects forged input, half cursors and wrong-scope or reordered responses", async () => {
    const target = await start(actor, owner, "p", "SCOPE_TITLE");
    await start(actor, secondOwner, "p", "SECOND_SCOPE_TITLE");
    for (const forged of [
      { actorId: other },
      { ownerId: owner },
      { projectId: "p" },
      { offset: 0 },
      { before: { createdAt: "yesterday", conversationId: target.conversationId } },
      { before: { createdAt: "2026-09-13T10:00:00Z" } },
    ])
      await expect(listAccountConversations(actor, forged as never, rpc)).rejects.toThrow();
    await expect(query("list_my_milo_conversations($1,now(),NULL)", [actor])).rejects.toThrow(
      "milo_conversation_invalid",
    );
    const replace =
      (
        change: (data: { actorId: string; conversations: Record<string, unknown>[] }) => unknown,
      ): TeamReadRpc =>
      async (name, params) => {
        const result = await rpc(name, params);
        return name === "list_my_milo_conversations"
          ? { data: change(structuredClone(result.data) as never), error: null }
          : result;
      };
    for (const change of [
      (data: { actorId: string }) => ({ ...data, actorId: other }),
      (data: { conversations: Record<string, unknown>[] }) => ({
        ...data,
        conversations: [...data.conversations].reverse(),
      }),
      (data: { conversations: Record<string, unknown>[] }) => ({
        ...data,
        conversations: data.conversations.map((entry) => ({ ...entry, access: "unavailable" })),
      }),
      (data: { conversations: Record<string, unknown>[] }) => ({ ...data, hasMore: true }),
      (data: { conversations: Record<string, unknown>[] }) => ({
        ...data,
        conversations: data.conversations.map((entry) => ({ ...entry, body: "leak" })),
      }),
    ])
      await expect(listAccountConversations(actor, {}, replace(change as never))).rejects.toThrow();
    expect(await leasesEmpty()).toBe(true);
  });
  it("uses bounded actor-only request admission without any project scope and reports capacity as busy", async () => {
    await start(actor, owner, "p", "ADMISSION_TITLE");
    await db.query("UPDATE project_team_members SET active=false WHERE actor_id=$1", [actor]);
    expect((await list()).conversations).toHaveLength(1);
    const held = [
      await query<string>("acquire_project_team_preview($1,$1,NULL)", [actor]),
      await query<string>("acquire_project_team_preview($1,$1,NULL)", [actor]),
    ];
    await expect(list()).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    for (const lease of held) await query("release_project_team_preview($1,$1,$2)", [actor, lease]);
    expect((await list()).conversations).toHaveLength(1);
    const budget = await db.query<{ minute_count: number }>(
      "SELECT minute_count FROM project_team_preview_limits WHERE scope='actor' AND account_id=$1",
      [actor],
    );
    // Two direct acquisitions plus two admitted listings; the rejected attempt consumed none.
    expect(budget.rows[0].minute_count).toBe(4);
    expect(await leasesEmpty()).toBe(true);
  });
  it("rejects suspended and removed actors before listing", async () => {
    await start(actor, owner, "p", "ACTOR_STATE_TITLE");
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [
      actor,
    ]);
    await expect(list()).rejects.toThrow();
    await expect(query("list_my_milo_conversations($1)", [actor])).rejects.toThrow();
    await db.query("UPDATE auth.users SET banned_until=NULL,deleted_at=now() WHERE id=$1", [actor]);
    await expect(list()).rejects.toThrow();
  });
  it("is a service-only RPC", async () => {
    await start(actor, owner, "p", "GRANT_TITLE");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(query("list_my_milo_conversations($1)", [actor])).rejects.toThrow(
        "permission denied",
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    expect(
      (await query<{ conversations: unknown[] }>("list_my_milo_conversations($1)", [actor]))
        .conversations,
    ).toHaveLength(1);
    await db.exec("RESET ROLE");
  });
});
