import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { exportConversationPage, eraseConversation } from "./milo-conversation-lifecycle.server";
import { buildConversationExport } from "./milo-conversation-lifecycle";
import { retainDraftProposal, applyDraftProposal } from "./milo-draft-proposal.server";
import type { TeamReadRpc } from "./project-team-read.server";
const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
const target = { ownerId: owner, projectId: "p", conversationId: randomUUID() };
const turnId = randomUUID(),
  proposalId = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE auth.identities(user_id uuid,identity_data jsonb);
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${owner}','owner@example.test',now()),('${actor}','member@example.test',now()),('${other}','other@example.test',now());
    CREATE TABLE public.scheduled_publishes(user_id uuid,project_id text,asset_id text,status text,updated_at timestamptz);
    CREATE TABLE public.ai_generation_results(receipt_id uuid PRIMARY KEY,user_id uuid,payload jsonb);
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');`);
  await db.exec(`
    CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
    CREATE SCHEMA net;
    CREATE TABLE net.control(fail boolean DEFAULT false); INSERT INTO net.control DEFAULT VALUES;
    CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,timeout_ms integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
    RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE request_id bigint; BEGIN
      IF (SELECT fail FROM net.control) THEN RAISE EXCEPTION 'fixture_transport_failure'; END IF;
      IF headers->>'Authorization'<>'Bearer fixture-only' THEN RAISE EXCEPTION 'fixture_auth_invalid'; END IF;
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
const turnArgs = [actor, owner, "p", target.conversationId, turnId];
const begin = (conversation = target.conversationId, turn = turnId, who = actor) =>
  query("begin_milo_conversation_turn($1,$2,'p',$3,$4,'Private question','pl')", [
    who,
    owner,
    conversation,
    turn,
  ]);
const exportPage = () => exportConversationPage(actor, target, rpc);
const erase = () => eraseConversation(actor, target, rpc);
const count = async (table: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::integer n FROM public.${table}`)).rows[0].n;
async function proposal() {
  const claimed = await query<{ attemptId: string }>(
    "claim_milo_conversation_turn($1,$2,$3,$4,$5)",
    turnArgs,
  );
  await query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'running')", [
    ...turnArgs,
    claimed.attemptId,
    [
      {
        kind: "tool",
        role: "seo",
        tool: "draft_metadata_proposal",
        code: "tool_started",
        state: "running",
        text: "",
        operationId: proposalId,
      },
    ],
  ]);
  const snapshot = await query<{ draftHash: string }>(
    "read_project_team_snapshot($1,$2,'p','a',0)",
    [actor, owner],
  );
  await retainDraftProposal(
    actor,
    {
      ...target,
      turnId,
      proposalId,
      attemptId: claimed.attemptId,
      assetId: "a",
      expectedHash: snapshot.draftHash,
      expectedMembershipRevision: 1,
      proposal: { fields: { metaTitle: "Suggested" }, explanation: "Clearer metadata" },
    },
    rpc,
  );
  await query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,1,$7,'completed')", [
    ...turnArgs,
    claimed.attemptId,
    [{ kind: "assistant", role: "seo", text: "Please review." }],
  ]);
  return claimed;
}
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE workspace_entities,project_team_members,milo_conversations,milo_conversation_turns,milo_draft_proposals,milo_erased_conversations,milo_erased_turns,project_team_edits,project_team_preview_limits,milo_conversation_dispatch_attempts,net.requests CASCADE;
    UPDATE milo_conversation_dispatch_control SET enabled=true;
    DELETE FROM vault.decrypted_secrets; INSERT INTO vault.decrypted_secrets VALUES('auto_scheduler_secret','fixture-only');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${actor}','member@example.test',now()) ON CONFLICT(id) DO UPDATE SET deleted_at=NULL,banned_until=NULL;
    UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;
    INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES
      ('${owner}','projects','p','{"name":"Client","secret":"never exported"}'),
      ('${owner}','projects','q','{"name":"Other project"}'),
      ('${owner}','content','a','{"projectId":"p","title":"Saved","metaTitle":"Original","status":"Approved","markdown":"Body kept separately"}');
    INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${actor}','editor'),('${owner}','p','${other}','editor');`);
  await begin();
});
afterAll(async () => {
  await db?.close();
});
describe("private conversation export and erasure", () => {
  it("leaves already-queued ID-only deliveries unable to claim or resume deleted work", async () => {
    const queued = (
      await db.query<{ body: Record<string, string> }>("SELECT body FROM net.requests")
    ).rows;
    expect(queued).toHaveLength(1);
    expect(queued[0].body).toEqual({ ...target, turnId, actorId: actor });
    await erase();
    expect(await query("dispatch_pending_milo_turns()")).toBe(0);
    expect(await query("enqueue_milo_conversation_turn($1)", [turnId])).toBe(false);
    await expect(query("resume_milo_conversation_turn($1,$2,$3,$4,$5)", turnArgs)).rejects.toThrow(
      "milo_conversation_unavailable",
    );
    expect((await db.query("SELECT * FROM net.requests")).rows).toHaveLength(1);
    expect(await count("milo_conversation_dispatch_attempts")).toBe(1);
  });
  it("rolls back the whole erasure if a child deletion fails", async () => {
    await proposal();
    await db.exec(`CREATE FUNCTION fail_fixture_erasure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_failure'; END; $$;
      CREATE TRIGGER fail_fixture_erasure BEFORE DELETE ON milo_conversation_turns FOR EACH ROW EXECUTE FUNCTION fail_fixture_erasure();`);
    try {
      await expect(erase()).rejects.toThrow();
      expect(await count("milo_conversations")).toBe(1);
      expect(await count("milo_conversation_turns")).toBe(1);
      expect(await count("milo_draft_proposals")).toBe(1);
      expect(await count("milo_erased_conversations")).toBe(0);
      expect(await count("milo_erased_turns")).toBe(0);
    } finally {
      await db.exec(
        "DROP TRIGGER fail_fixture_erasure ON milo_conversation_turns; DROP FUNCTION fail_fixture_erasure()",
      );
    }
    expect((await erase()).erased).toBe(true);
  });
  it("exports complete messages and historical before/after with no claims, membership, project secrets or draft body", async () => {
    await proposal();
    const before = await exportPage();
    expect(before.entries[0]).toMatchObject({
      turn: { body: "Private question", state: "completed" },
      proposal: {
        before: { metaTitle: "Original" },
        fields: { metaTitle: "Suggested" },
        appliedAt: null,
      },
    });
    await applyDraftProposal(actor, { ...target, turnId, proposalId }, rpc);
    const { blob, filename } = await buildConversationExport(
      actor,
      target,
      (input) => exportConversationPage(actor, input, rpc),
      new AbortController().signal,
    );
    const text = await blob.text(),
      data = JSON.parse(text);
    expect(filename).toBe(`milo-conversation-${target.conversationId}.json`);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].proposal.appliedAt).toBeTruthy();
    expect(data.entries[0].turn.events.at(-1)).toMatchObject({
      state: "completed",
      operationId: proposalId,
    });
    for (const privateValue of [
      "attemptId",
      "membership_revision",
      "never exported",
      "Body kept separately",
      "expectedHash",
    ])
      expect(text).not.toContain(privateValue);
    await expect(
      exportConversationPage(actor, { ...target, after: 1, version: before.version }, rpc),
    ).rejects.toThrow();
  });
  it("exports all pages in order, then reauthorizes and checks the last empty page", async () => {
    await db.query(
      "UPDATE milo_conversation_turns SET state='completed',created_at=now()-interval '2 hours'",
    );
    for (let i = 2; i <= 43; i++) {
      await begin(target.conversationId, randomUUID());
      await db.query(
        "UPDATE milo_conversation_turns SET state='completed',created_at=now()-interval '2 hours' WHERE ordinal=$1",
        [i],
      );
    }
    const cursors: number[] = [];
    const result = await buildConversationExport(
      actor,
      target,
      (input) => {
        cursors.push(input.after);
        return exportConversationPage(actor, input, rpc);
      },
      new AbortController().signal,
    );
    const data = JSON.parse(await result.blob.text());
    expect(cursors).toEqual([0, 20, 40, 43]);
    expect(data.turnCount).toBe(43);
    expect(data.entries.map((e: { turn: { ordinal: number } }) => e.turn.ordinal)).toEqual(
      Array.from({ length: 43 }, (_, i) => i + 1),
    );
  });
  it("rejects a stale token after an event, new turn, proposal, or clock-based lease expiry", async () => {
    let page = await exportPage();
    await proposal();
    await expect(
      exportConversationPage(actor, { ...target, after: 1, version: page.version }, rpc),
    ).rejects.toThrow();
    page = await exportPage();
    const second = randomUUID();
    await begin(target.conversationId, second);
    await expect(
      exportConversationPage(actor, { ...target, after: 1, version: page.version }, rpc),
    ).rejects.toThrow();
    // Isolate the time projection: no state/updated_at write or revision bump.
    await query("claim_milo_conversation_turn($1,$2,'p',$3,$4)", [
      actor,
      owner,
      target.conversationId,
      second,
    ]);
    page = await exportPage();
    await db.query(
      "UPDATE milo_conversation_turns SET lease_until=clock_timestamp()-interval '1 second' WHERE ordinal=2",
    );
    await expect(
      exportConversationPage(actor, { ...target, after: 2, version: page.version }, rpc),
    ).rejects.toThrow();
    expect((await exportPage()).entries[1].turn.state).toBe("unknown");
  });
  it("omits proposals moved to another project and fences that visibility change", async () => {
    await proposal();
    const page = await exportPage();
    await db.query(
      "UPDATE workspace_entities SET data=data||'{\"projectId\":\"q\"}' WHERE collection='content'",
    );
    await expect(
      exportConversationPage(actor, { ...target, after: 1, version: page.version }, rpc),
    ).rejects.toThrow();
    const moved = await exportPage();
    expect(moved.entries[0]).toMatchObject({ proposal: null, omittedProposals: 1 });
    expect(JSON.stringify(moved)).not.toContain("Original");
    await db.query(
      "UPDATE workspace_entities SET data=data||'{\"projectId\":\"p\"}' WHERE collection='content'",
    );
    await expect(
      exportConversationPage(actor, { ...target, after: 1, version: moved.version }, rpc),
    ).rejects.toThrow();
  });
  it.each([other, owner])(
    "keeps another actor's private history unreadable and uneraseable for %s",
    async (who) => {
      await expect(exportConversationPage(who, target, rpc)).rejects.toThrow();
      await expect(eraseConversation(who, target, rpc)).rejects.toThrow();
      expect(await count("milo_conversations")).toBe(1);
      expect(await count("milo_erased_conversations")).toBe(0);
    },
  );
  it("erases messages/proposals and claims but keeps applied drafts, edit audit and unrelated conversations", async () => {
    const claimed = await proposal();
    await applyDraftProposal(actor, { ...target, turnId, proposalId }, rpc);
    await begin(randomUUID(), randomUUID(), other);
    expect(await erase()).toEqual({ ...target, actorId: actor, erased: true });
    expect(await count("milo_conversations")).toBe(1);
    expect(await count("milo_draft_proposals")).toBe(0);
    expect(await count("project_team_edits")).toBe(1);
    expect(
      (
        await db.query<{ data: { metaTitle: string } }>(
          "SELECT data FROM workspace_entities WHERE collection='content'",
        )
      ).rows[0].data.metaTitle,
    ).toBe("Suggested");
    const markers = JSON.stringify(
      (
        await db.query(
          "SELECT * FROM milo_erased_conversations c JOIN milo_erased_turns t USING(conversation_id)",
        )
      ).rows,
    );
    for (const privateValue of [
      "Private question",
      "Suggested",
      "Original",
      claimed.attemptId,
      proposalId,
    ])
      expect(markers).not.toContain(privateValue);
    await expect(exportPage()).rejects.toThrow();
    await expect(
      query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...turnArgs,
        claimed.attemptId,
      ]),
    ).rejects.toThrow();
  });
  it("recovers a lost deletion response idempotently and forbids stale conversation or turn IDs", async () => {
    await erase();
    expect(await erase()).toEqual({ ...target, actorId: actor, erased: true });
    expect(await count("milo_erased_conversations")).toBe(1);
    await expect(begin()).rejects.toThrow("milo_conversation_unavailable");
    await expect(begin(target.conversationId, randomUUID())).rejects.toThrow(
      "milo_conversation_unavailable",
    );
    await expect(begin(randomUUID(), turnId)).rejects.toThrow("milo_conversation_unavailable");
    expect(await count("milo_conversations")).toBe(0);
  });
  it("invalidates an actually live execution claim and refuses its late result", async () => {
    const claimed = await query<{ attemptId: string }>(
      "claim_milo_conversation_turn($1,$2,$3,$4,$5)",
      turnArgs,
    );
    expect(
      await query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...turnArgs,
        claimed.attemptId,
      ]),
    ).toBe(true);
    await erase();
    await expect(
      query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...turnArgs,
        claimed.attemptId,
      ]),
    ).rejects.toThrow("milo_conversation_unavailable");
    await expect(
      query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'completed')", [
        ...turnArgs,
        claimed.attemptId,
        [{ kind: "assistant", role: "lead", text: "Late result" }],
      ]),
    ).rejects.toThrow();
    await expect(query("claim_milo_conversation_turn($1,$2,$3,$4,$5)", turnArgs)).rejects.toThrow();
    expect(await count("milo_conversation_turns")).toBe(0);
  });
  it("refuses forged inputs and wrong-scope response envelopes while releasing actor admission", async () => {
    for (const extra of [{ actorId: other }, { events: [] }, { force: true }]) {
      await expect(eraseConversation(actor, { ...target, ...extra }, rpc)).rejects.toThrow();
      await expect(exportConversationPage(actor, { ...target, ...extra }, rpc)).rejects.toThrow();
    }
    const replaced: TeamReadRpc = async (name, params) =>
      name === "erase_milo_conversation"
        ? { data: { ...target, actorId: other, erased: true }, error: null }
        : rpc(name, params);
    await expect(eraseConversation(actor, target, replaced)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(await count("milo_conversations")).toBe(1);
    const leases = (
      await db.query<{ leases: object }>("SELECT leases FROM project_team_preview_limits")
    ).rows;
    expect(leases.every((row) => Object.keys(row.leases).length === 0)).toBe(true);
  });
  it("retires a not-yet-confirmed ID so a delayed initial send cannot recreate it", async () => {
    const conversationId = randomUUID();
    await eraseConversation(actor, { ...target, conversationId }, rpc);
    await expect(begin(conversationId, randomUUID())).rejects.toThrow(
      "milo_conversation_unavailable",
    );
    await expect(
      eraseConversation(actor, { ...target, projectId: "q", conversationId: randomUUID() }, rpc),
    ).rejects.toThrow();
  });
  it("bounds retired never-confirmed IDs per actor while real erasures and replays stay available", async () => {
    for (let i = 0; i < 200; i++)
      await query("erase_milo_conversation($1,$2,'p',$3)", [actor, owner, randomUUID()]);
    const extra = randomUUID();
    await expect(
      query("erase_milo_conversation($1,$2,'p',$3)", [actor, owner, extra]),
    ).rejects.toThrow("milo_conversation_capacity");
    expect(await count("milo_erased_conversations")).toBe(200);
    // Erasing a real conversation retains its turns and is not counted against the bound.
    await begin();
    await erase();
    expect(await count("milo_erased_conversations")).toBe(201);
    expect(await count("milo_erased_turns")).toBe(1);
    // Replaying an existing retirement stays idempotent at the bound.
    const { rows } = await db.query<{ conversation_id: string }>(
      "SELECT conversation_id FROM milo_erased_conversations WHERE actor_id=$1 LIMIT 1",
      [actor],
    );
    expect(
      (
        await query<{ erased: boolean }>("erase_milo_conversation($1,$2,'p',$3)", [
          actor,
          owner,
          rows[0].conversation_id,
        ])
      ).erased,
    ).toBe(true);
  });
  it("preserves creation limits across deletion without charging exact replay", async () => {
    await begin(); // same live request returns its original receipt
    await erase();
    for (let i = 1; i < 10; i++) {
      const conversationId = randomUUID();
      await begin(conversationId, randomUUID());
      await eraseConversation(actor, { ...target, conversationId }, rpc);
    }
    expect(await count("milo_erased_turns")).toBe(10);
    await expect(begin(randomUUID(), randomUUID())).rejects.toThrow("milo_conversation_capacity");
    await db.query("UPDATE milo_erased_turns SET created_at=now()-interval '2 minutes'");
    await begin(randomUUID(), randomUUID());
  });
  it("retains the original hourly creation allowance even after all sixty conversations are erased", async () => {
    let conversationId = target.conversationId;
    for (let i = 0; i < 60; i++) {
      // Place each real accepted request outside the minute window but inside
      // its original hour before erasing it through the actual SQL RPC.
      await db.query(
        "UPDATE milo_conversation_turns SET created_at=now()-interval '2 minutes' WHERE conversation_id=$1",
        [conversationId],
      );
      await query("erase_milo_conversation($1,$2,'p',$3)", [actor, owner, conversationId]);
      conversationId = randomUUID();
      if (i < 59) await begin(conversationId, randomUUID());
    }
    expect(await count("milo_erased_turns")).toBe(60);
    expect(await count("milo_conversations")).toBe(0);
    await expect(begin(conversationId, randomUUID())).rejects.toThrow("milo_conversation_capacity");
    await db.query("UPDATE milo_erased_turns SET created_at=now()-interval '2 hours'");
    await begin(conversationId, randomUUID());
  });
  it("allows erasure of known own history after revocation but cannot export, claim, or reserve a new client ID", async () => {
    await db.query("UPDATE project_team_members SET active=false WHERE actor_id=$1", [actor]);
    await expect(exportPage()).rejects.toThrow();
    await expect(begin(randomUUID(), randomUUID())).rejects.toThrow();
    await expect(
      eraseConversation(actor, { ...target, conversationId: randomUUID() }, rpc),
    ).rejects.toThrow();
    expect((await erase()).erased).toBe(true);
    expect((await erase()).erased).toBe(true);
    expect(
      (
        await db.query("SELECT * FROM project_team_preview_limits WHERE account_id=$1", [owner])
      ).rows.every((row) => JSON.stringify(row).includes('"leases":{}')),
    ).toBe(true);
  });
  it("rejects suspended and removed accounts before any erasure", async () => {
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [
      actor,
    ]);
    await expect(erase()).rejects.toThrow();
    expect(await count("milo_conversations")).toBe(1);
    await db.query("UPDATE auth.users SET banned_until=NULL,deleted_at=now() WHERE id=$1", [actor]);
    await expect(erase()).rejects.toThrow();
  });
  it("project deletion retires IDs, and auth-account deletion removes the private ID registry without breaking cascades", async () => {
    await proposal();
    await db.query("DELETE FROM workspace_entities WHERE collection='projects' AND entity_id='p'");
    expect(await count("milo_conversations")).toBe(0);
    expect(await count("milo_erased_conversations")).toBe(1);
    expect((await erase()).erased).toBe(true);
    await db.query("DELETE FROM auth.users WHERE id=$1", [actor]);
    expect(await count("milo_erased_conversations")).toBe(0);
    expect(await count("milo_erased_turns")).toBe(0);
  });
  it("auth-account deletion cascades an existing conversation and proposal without recreating private markers", async () => {
    await proposal();
    await db.query("DELETE FROM auth.users WHERE id=$1", [actor]);
    for (const table of [
      "milo_conversations",
      "milo_conversation_turns",
      "milo_draft_proposals",
      "milo_erased_conversations",
      "milo_erased_turns",
    ])
      expect(await count(table)).toBe(0);
  });
  it("uses service-only RPCs and denies direct identifier-table access", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM public.milo_erased_conversations")).rejects.toThrow(
        "permission denied",
      );
      await expect(db.query("SELECT * FROM public.milo_erased_turns")).rejects.toThrow(
        "permission denied",
      );
      if (role !== "service_role") {
        await expect(
          query("export_milo_conversation_page($1,$2,'p',$3)", [
            actor,
            owner,
            target.conversationId,
          ]),
        ).rejects.toThrow("permission denied");
        await expect(
          query("erase_milo_conversation($1,$2,'p',$3)", [actor, owner, target.conversationId]),
        ).rejects.toThrow("permission denied");
      } else
        expect(
          (
            await query<{ erased: boolean }>("erase_milo_conversation($1,$2,'p',$3)", [
              actor,
              owner,
              target.conversationId,
            ])
          ).erased,
        ).toBe(true);
      await db.exec("RESET ROLE");
    }
  });
});
