import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import {
  applyDraftProposal,
  readDraftProposal,
  retainDraftProposal,
} from "./milo-draft-proposal.server";
import { runConversationSpecialists } from "./milo-specialist-executor.server";
import { runSpecialistTool } from "./milo-specialist-tools.server";
import {
  advanceConversationTurn,
  assertConversationExecution,
  claimConversationTurn,
  readConversation,
} from "./milo-conversation.server";
import type { TeamReadRpc } from "./project-team-read.server";

const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
const target = {
  ownerId: owner,
  projectId: "p",
  conversationId: randomUUID(),
  turnId: randomUUID(),
  proposalId: randomUUID(),
};
let db: PGlite, attemptId: string, hash: string;
const fields = { metaTitle: "Clear new title", metaDescription: "Accurate saved description" };
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
    "20260913180000_milo_draft_proposals.sql",
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
const turnArgs = [actor, owner, "p", target.conversationId, target.turnId];
const started = {
  kind: "tool",
  role: "seo",
  tool: "draft_metadata_proposal",
  code: "tool_started",
  state: "running",
  text: "",
  operationId: target.proposalId,
};
const proposal = () => ({
  ...target,
  attemptId,
  assetId: "a",
  expectedHash: hash,
  expectedMembershipRevision: 1,
  proposal: { explanation: "Improve clarity using saved facts.", fields },
});
const retain = () => retainDraftProposal(actor, proposal(), rpc);
const read = () => readDraftProposal(actor, target, rpc);
const apply = () => applyDraftProposal(actor, target, rpc);
const conversationHistory = () =>
  readConversation(
    actor,
    { ownerId: owner, projectId: "p", conversationId: target.conversationId },
    rpc,
  );
const complete = () =>
  query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,1,$7,'completed')", [
    ...turnArgs,
    attemptId,
    [{ kind: "assistant", role: "seo", text: "Proposal retained; review before saving." }],
  ]);
const data = () =>
  query<Record<string, unknown>>("read_project_team_snapshot($1,$2,'p','a',0)", [actor, owner]);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.workspace_entities,public.project_team_members,public.milo_conversations,public.milo_conversation_turns,public.milo_draft_proposals,public.project_team_edits,public.project_team_preview_limits,public.publication_approvals,public.scheduled_publishes CASCADE;
    UPDATE auth.users SET deleted_at=NULL,banned_until=NULL; UPDATE workspace_meta SET rev=1;
    INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES
      ('${owner}','projects','p','{"name":"Client","publishSecret":"fixture-secret"}'),
      ('${owner}','projects','q','{"name":"Other project"}'),
      ('${other}','projects','p','{"name":"Other client"}'),
      ('${owner}','content','a','{"projectId":"p","title":"Saved","metaTitle":"Old title","status":"Approved","updatedAt":"2026-09-13","markdown":"Unchanged body","qualityScore":70}');
    INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${actor}','editor'),('${owner}','p','${other}','editor');`);
  await query("begin_milo_conversation_turn($1,$2,$3,$4,$5,'Improve metadata','pl')", turnArgs);
  const claimed = await query<{ attemptId: string }>(
    "claim_milo_conversation_turn($1,$2,$3,$4,$5)",
    turnArgs,
  );
  attemptId = claimed.attemptId;
  await query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'running')", [
    ...turnArgs,
    attemptId,
    [started],
  ]);
  hash = (await data()).draftHash as string;
});
afterAll(async () => {
  await db?.close();
});
describe("exact-version conversation draft proposals", () => {
  it("lets an owner review and apply their own proposal through the same scoped editor", async () => {
    const next = {
      ...target,
      conversationId: randomUUID(),
      turnId: randomUUID(),
      proposalId: randomUUID(),
    };
    const args = [owner, owner, "p", next.conversationId, next.turnId];
    await query("begin_milo_conversation_turn($1,$2,$3,$4,$5,'Improve metadata','pl')", args);
    const claimed = await query<{ attemptId: string }>(
      "claim_milo_conversation_turn($1,$2,$3,$4,$5)",
      args,
    );
    await query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'running')", [
      ...args,
      claimed.attemptId,
      [{ ...started, operationId: next.proposalId }],
    ]);
    await retainDraftProposal(owner, { ...proposal(), ...next, attemptId: claimed.attemptId }, rpc);
    await query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,1,$7,'completed')", [
      ...args,
      claimed.attemptId,
      [{ kind: "assistant", role: "seo", text: "Review changes" }],
    ]);
    expect((await applyDraftProposal(owner, next, rpc)).state).toBe("applied");
    expect((await data()).draft).toMatchObject(fields);
  });
  it("refuses browser-supplied patches, actor overrides and substituted proposal envelopes", async () => {
    await retain();
    await complete();
    await expect(
      applyDraftProposal(actor, { ...target, fields } as typeof target, rpc),
    ).rejects.toThrow();
    await expect(
      readDraftProposal(actor, { ...target, actorId: other } as typeof target, rpc),
    ).rejects.toThrow();
    const real = await read();
    const substituted: TeamReadRpc = async (name, args) =>
      name === "read_milo_draft_proposal"
        ? { data: { ...real, conversationId: randomUUID() }, error: null }
        : rpc(name, args);
    await expect(readDraftProposal(actor, target, substituted)).rejects.toThrow(
      "could not be confirmed",
    );
    expect((await db.query("SELECT * FROM project_team_edits")).rows).toHaveLength(0);
  });
  it("retains exact before/after without changing content, requires completion then uses existing review invalidation", async () => {
    await db.query(
      "INSERT INTO publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved) VALUES($1,'p','a','milo-publication-v1',$2,true)",
      [owner, "a".repeat(64)],
    );
    await db.query("INSERT INTO scheduled_publishes VALUES($1,'p','a','pending',now())", [owner]);
    await retain();
    expect((await data()).draftHash).toBe(hash);
    expect(await read()).toMatchObject({
      state: "waiting",
      before: { metaTitle: "Old title", metaDescription: "" },
      fields,
    });
    await expect(apply()).rejects.toThrow();
    await complete();
    expect((await read()).state).toBe("ready");
    const saved = await apply();
    expect(saved.state).toBe("applied");
    expect(saved.appliedAt).toBeTruthy();
    expect((await data()).draft).toMatchObject({
      ...fields,
      status: "In Review",
      markdown: "Unchanged body",
      title: "Saved",
    });
    expect((await db.query("SELECT approved FROM publication_approvals")).rows).toEqual([
      { approved: false },
    ]);
    expect((await db.query("SELECT status FROM scheduled_publishes")).rows).toEqual([
      { status: "review_required" },
    ]);
    expect(
      (
        await db.query<{ data: { qualityScoreStale: boolean } }>(
          "SELECT data FROM workspace_entities WHERE collection='content'",
        )
      ).rows[0].data.qualityScoreStale,
    ).toBe(true);
    expect((await db.query("SELECT * FROM project_team_edits")).rows).toHaveLength(1);
    const history = await conversationHistory();
    expect(history.turns[0].events.at(-1)).toMatchObject({
      tool: "draft_metadata_proposal",
      state: "completed",
      operationId: target.proposalId,
      reference: { kind: "draft_proposal", id: target.proposalId },
    });
    expect(history.turnCount).toBe(1);
  });
  it("recovers the original applied result after a lost response and never overwrites a later edit", async () => {
    await retain();
    await complete();
    const saved = await apply();
    await db.exec(
      "UPDATE workspace_entities SET data=data||'{\"metaTitle\":\"Later human edit\"}' WHERE collection='content'",
    );
    expect(await apply()).toEqual(saved);
    expect(
      (await conversationHistory()).turns[0].events.filter(
        (event) => event.state === "completed" && event.operationId === target.proposalId,
      ),
    ).toHaveLength(1);
    expect((await data()).draft).toMatchObject({ metaTitle: "Later human edit" });
    expect(
      (await db.query("SELECT rev FROM workspace_meta WHERE user_id=$1", [owner])).rows,
    ).toEqual([{ rev: 2 }]);
  });
  it("does not rebase a proposal onto another exact draft version", async () => {
    await retain();
    await complete();
    await db.exec(
      "UPDATE workspace_entities SET data=data||'{\"markdown\":\"Changed body\"}' WHERE collection='content'",
    );
    expect((await read()).state).toBe("unavailable");
    await expect(apply()).rejects.toThrow();
    expect((await data()).draft).toMatchObject({
      metaTitle: "Old title",
      markdown: "Changed body",
    });
  });
  it.each(["viewer", "reviewer"])("%s cannot retain or apply draft edits", async (role) => {
    await db.query("UPDATE project_team_members SET role=$1 WHERE actor_id=$2", [role, actor]);
    await expect(retain()).rejects.toThrow();
    expect((await db.query("SELECT * FROM milo_draft_proposals")).rows).toHaveLength(0);
  });
  it("rejects stale membership even after editor access is restored", async () => {
    await retain();
    await complete();
    await db.query("UPDATE project_team_members SET revision=revision+1 WHERE actor_id=$1", [
      actor,
    ]);
    expect((await read()).state).toBe("unavailable");
    await expect(apply()).rejects.toThrow();
  });
  it.each(["active=false", "expires_at=now()-interval '1 minute'"])(
    "denies content after membership %s",
    async (change) => {
      await retain();
      await complete();
      await db.query(`UPDATE project_team_members SET ${change} WHERE actor_id=$1`, [actor]);
      await expect(read()).rejects.toThrow();
      await expect(apply()).rejects.toThrow();
    },
  );
  it.each([owner, other])(
    "keeps proposals private from another authorized actor %s",
    async (who) => {
      await retain();
      await complete();
      await expect(readDraftProposal(who, target, rpc)).rejects.toThrow();
      await expect(applyDraftProposal(who, target, rpc)).rejects.toThrow();
    },
  );
  it.each([
    { projectId: "q" },
    { ownerId: other },
    { conversationId: randomUUID() },
    { turnId: randomUUID() },
  ])("rejects substituted scope %j", async (changed) => {
    await retain();
    await complete();
    await expect(readDraftProposal(actor, { ...target, ...changed }, rpc)).rejects.toThrow();
    await expect(applyDraftProposal(actor, { ...target, ...changed }, rpc)).rejects.toThrow();
  });
  it.each(["cancelled", "failed", "unknown"])(
    "withdraws proposals when the task is %s",
    async (state) => {
      await retain();
      await db.query("UPDATE milo_conversation_turns SET state=$1 WHERE turn_id=$2", [
        state,
        target.turnId,
      ]);
      expect((await read()).state).toBe("unavailable");
      await expect(apply()).rejects.toThrow();
      await expect(retain()).rejects.toThrow();
    },
  );
  it("rejects an expired execution and an expired review window", async () => {
    await db.query(
      "UPDATE milo_conversation_turns SET lease_until=now()-interval '1 minute' WHERE turn_id=$1",
      [target.turnId],
    );
    await expect(retain()).rejects.toThrow();
    await db.query(
      "UPDATE milo_conversation_turns SET lease_until=now()+interval '5 minutes' WHERE turn_id=$1",
      [target.turnId],
    );
    await retain();
    await complete();
    await db.exec("UPDATE milo_draft_proposals SET created_at=now()-interval '8 days'");
    expect((await read()).state).toBe("unavailable");
    await expect(apply()).rejects.toThrow();
  });
  it("withdraws a retained proposal when a running lease expires without a terminal checkpoint", async () => {
    await retain();
    await db.query(
      "UPDATE milo_conversation_turns SET lease_until=now()-interval '1 minute' WHERE turn_id=$1",
      [target.turnId],
    );
    expect((await read()).state).toBe("unavailable");
    await expect(apply()).rejects.toThrow();
  });
  it("retains once per turn, allows exact retain recovery and rejects altered replay or fabricated operation", async () => {
    await retain();
    expect(await retain()).toBe(target.proposalId);
    await expect(
      retainDraftProposal(
        actor,
        { ...proposal(), proposal: { explanation: "Changed", fields } },
        rpc,
      ),
    ).rejects.toThrow();
    await expect(
      retainDraftProposal(actor, { ...proposal(), proposalId: randomUUID() }, rpc),
    ).rejects.toThrow();
    await db.query("UPDATE milo_conversation_turns SET events=events||$1::jsonb WHERE turn_id=$2", [
      [{ ...started, operationId: other }],
      target.turnId,
    ]);
    await expect(
      retainDraftProposal(actor, { ...proposal(), proposalId: other }, rpc),
    ).rejects.toThrow();
    expect((await db.query("SELECT * FROM milo_draft_proposals")).rows).toHaveLength(1);
  });
  it.each([
    { markdown: "Full article" },
    { status: "Approved" },
    { metaTitle: null },
    { metaTitle: 1 },
    { title: " " },
    { metaDescription: "x".repeat(4001) },
    { metaDescription: "界".repeat(4000), title: "界".repeat(1000), h1: "界".repeat(1000) },
  ])("SQL rejects disallowed or oversized model patch", async (patch) => {
    await expect(
      query("retain_milo_draft_proposal($1,$2,$3,$4,$5,$6,$7,'a',$8,1,$9,'Test')", [
        ...turnArgs,
        attemptId,
        target.proposalId,
        hash,
        patch,
      ]),
    ).rejects.toThrow();
  });
  it("refuses edits while publication is already in flight", async () => {
    await retain();
    await complete();
    await db.query("INSERT INTO scheduled_publishes VALUES($1,'p','a','publishing',now())", [
      owner,
    ]);
    await expect(apply()).rejects.toThrow();
    expect((await data()).draftHash).toBe(hash);
    expect((await read()).state).toBe("ready");
  });
  it("rolls back the entire draft edit if its durable conversation receipt cannot be appended", async () => {
    await retain();
    await complete();
    await db.query("UPDATE milo_conversation_turns SET events=$1 WHERE turn_id=$2", [
      Array.from({ length: 24 }, () => ({
        kind: "assistant",
        role: "seo",
        text: "Existing bounded event",
      })),
      target.turnId,
    ]);
    await expect(apply()).rejects.toThrow();
    expect((await data()).draftHash).toBe(hash);
    expect((await read()).state).toBe("ready");
    expect((await db.query("SELECT * FROM project_team_edits")).rows).toHaveLength(0);
  });
  it("withholds all proposal APIs and table access from browser database roles", async () => {
    await retain();
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM milo_draft_proposals")).rejects.toThrow(
        "permission denied",
      );
      await expect(
        query("read_milo_draft_proposal($1,$2,$3,$4,$5,$6)", [...turnArgs, target.proposalId]),
      ).rejects.toThrow("permission denied");
      await expect(
        query("apply_milo_draft_proposal($1,$2,$3,$4,$5,$6)", [...turnArgs, target.proposalId]),
      ).rejects.toThrow("permission denied");
      await db.exec("RESET ROLE");
    }
  });
  it("runs the real executor, tool, retained SQL and explicit apply with synthetic metered model replies", async () => {
    const next: Parameters<typeof claimConversationTurn>[1] = {
      ownerId: owner,
      projectId: "p",
      conversationId: randomUUID(),
      turnId: randomUUID(),
    };
    await query(
      "begin_milo_conversation_turn($1,$2,'p',$3,$4,'Suggest a clearer meta title','pl')",
      [actor, owner, next.conversationId, next.turnId],
    );
    const replies = [
      JSON.stringify({
        handoff: "SEO reviews the metadata.",
        assignments: [
          {
            role: "seo",
            task: "Improve clarity",
            tools: [
              {
                name: "draft_metadata_proposal",
                assetId: "a",
                fields: ["metaTitle"],
                instructions: "Improve clarity",
              },
            ],
          },
        ],
      }),
      JSON.stringify({
        explanation: "Clearer title",
        fields: { metaTitle: "Proposed saved title" },
      }),
      "Review the retained proposal before saving.",
    ];
    const operations: string[] = [];
    const deps = {
      claim: (who: string, input: typeof next) => claimConversationTurn(who, input, rpc),
      read: (who: string, input: Parameters<typeof readConversation>[1]) =>
        readConversation(who, input, rpc),
      assert: (who: string, input: typeof next, attempt: string) =>
        assertConversationExecution(who, input, attempt, rpc),
      advance: (
        who: string,
        input: typeof next,
        progress: Parameters<typeof advanceConversationTurn>[2],
      ) => advanceConversationTurn(who, input, progress, rpc),
      tool: (
        tool: Parameters<typeof runSpecialistTool>[0],
        context: Parameters<typeof runSpecialistTool>[1],
      ) => runSpecialistTool(tool, context, { rpc } as Parameters<typeof runSpecialistTool>[2]),
      model: async ({
        context,
      }: {
        context: { beforeDispatch?: () => Promise<void>; attempt?: { requestId: string } };
      }) => {
        await context.beforeDispatch?.();
        operations.push(context.attempt!.requestId);
        return replies.shift()!;
      },
    };
    const result = await runConversationSpecialists(actor, next, deps);
    expect(result.state).toBe("completed");
    expect(operations).toHaveLength(3);
    expect(new Set(operations).size).toBe(3);
    const receipt = result.events.find((event) => event.reference?.kind === "draft_proposal");
    expect(receipt?.state).toBe("approval_required");
    expect((await data()).draftHash).toBe(hash);
    const proposalTarget = { ...next, proposalId: receipt!.reference!.id };
    expect((await readDraftProposal(actor, proposalTarget, rpc)).state).toBe("ready");
    expect((await applyDraftProposal(actor, proposalTarget, rpc)).state).toBe("applied");
    await runConversationSpecialists(actor, next, deps);
    expect(operations).toHaveLength(3);
  });
});
