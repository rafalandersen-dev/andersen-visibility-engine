import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { conversationPage, conversationTurn } from "./milo-conversation";
import {
  beginConversationTurn,
  claimConversationTurn,
  advanceConversationTurn,
  assertConversationExecution,
  readConversation,
} from "./milo-conversation.server";
import type { TeamReadRpc } from "./project-team-read.server";
import { runConversationSpecialists } from "./milo-specialist-executor.server";
import { runSpecialistTool } from "./milo-specialist-tools.server";

const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const conversationId = "00000000-0000-4000-8000-000000000004";
const turnId = "00000000-0000-4000-8000-000000000005";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
    INSERT INTO auth.users(id) VALUES('${owner}'),('${actor}'),('${other}');
    CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
    CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
    INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');`);
  for (const name of [
    "20260911020000_project_team_reads.sql",
    "20260913120000_milo_conversations.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE public.workspace_entities,public.project_team_members,public.milo_conversations,public.milo_conversation_turns,public.project_team_preview_limits;
    UPDATE auth.users SET deleted_at=NULL,banned_until=NULL;
    INSERT INTO public.workspace_entities VALUES
      ('${owner}','projects','p','{"name":"Assigned","publishSecret":"fixture-private"}'),
      ('${owner}','projects','q','{"name":"Other project"}'),
      ('${other}','projects','p','{"name":"Other client"}');
    INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${actor}','editor');`);
});
afterAll(async () => {
  await db?.close();
});

async function query<T = Record<string, unknown>>(sql: string, params: unknown[]) {
  return (await db.query<{ result: T }>(`SELECT public.${sql} result`, params)).rows[0].result;
}
const start = (
  who = actor,
  account = owner,
  project = "p",
  conversation = conversationId,
  turn = turnId,
  body = "Review our SEO",
  locale = "pl",
) =>
  query<{ created: boolean; turn: unknown }>("begin_milo_conversation_turn($1,$2,$3,$4,$5,$6,$7)", [
    who,
    account,
    project,
    conversation,
    turn,
    body,
    locale,
  ]);
const read = (
  who = actor,
  account = owner,
  project = "p",
  conversation = conversationId,
  after = 0,
) => query("read_milo_conversation($1,$2,$3,$4,$5)", [who, account, project, conversation, after]);
const claim = (who = actor, conversation = conversationId, turn = turnId) =>
  query<{ acquired: boolean; attemptId: string | null; turn: { state: string } }>(
    "claim_milo_conversation_turn($1,$2,'p',$3,$4)",
    [who, owner, conversation, turn],
  );
const advance = (
  attempt: string | null,
  state = "completed",
  expected = 0,
  events: unknown[] = [{ kind: "assistant", role: "seo", text: "Saved audit reviewed." }],
) =>
  query("advance_milo_conversation_turn($1,$2,'p',$3,$4,$5,$6,$7,$8)", [
    actor,
    owner,
    conversationId,
    turnId,
    attempt,
    expected,
    JSON.stringify(events),
    state,
  ]);
const cancel = (who = actor, conversation = conversationId, turn = turnId) =>
  query("cancel_milo_conversation_turn($1,$2,'p',$3,$4)", [who, owner, conversation, turn]);
const rpc: TeamReadRpc = async (name, params) => {
  const entries = Object.entries(params);
  try {
    return {
      data: await query(
        `${name}(${entries.map(([key], index) => `${key}=>$${index + 1}`).join(",")})`,
        entries.map(([, value]) => value),
      ),
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
};

describe("durable actor-private project conversations", () => {
  it("stores the owner's explicit generation choice and rejects replay upgrades or delegated approval", async () => {
    const approved = await query<{ created: boolean; turn: { allowDraftGeneration: boolean } }>(
      "begin_milo_conversation_turn($1,$1,'p',$2,$3,'Generate a draft','pl',true)",
      [owner, conversationId, turnId],
    );
    expect(approved.turn.allowDraftGeneration).toBe(true);
    await expect(
      query("begin_milo_conversation_turn($1,$1,'p',$2,$3,'Generate a draft','pl',false)", [
        owner,
        conversationId,
        turnId,
      ]),
    ).rejects.toThrow("conflict");
    await expect(
      query("begin_milo_conversation_turn($1,$2,'p',$3,$4,'Generate a draft','pl',true)", [
        actor,
        owner,
        randomUUID(),
        randomUUID(),
      ]),
    ).rejects.toThrow("invalid");
  });
  it("checks cancellation, claim identity and current membership at the final dispatch boundary", async () => {
    await start();
    const taken = await claim();
    const check = (attempt = taken.attemptId) =>
      query("check_milo_conversation_execution($1,$2,'p',$3,$4,$5)", [
        actor,
        owner,
        conversationId,
        turnId,
        attempt,
      ]);
    expect(await check()).toBe(true);
    await expect(check(randomUUID())).rejects.toThrow("unavailable");
    await db.exec("UPDATE project_team_members SET revision=2");
    await expect(check()).rejects.toThrow("unavailable");
    await db.exec("UPDATE project_team_members SET revision=1");
    await cancel();
    await expect(check()).rejects.toThrow("unavailable");
  });
  it("executes a saved task through real SQL claims, actual shared-draft tools and retained specialist events", async () => {
    await db.query(
      "INSERT INTO workspace_entities(user_id,collection,entity_id,data) VALUES($1,'content','a',$2)",
      [
        owner,
        {
          projectId: "p",
          title: "Stored article",
          status: "Draft",
          updatedAt: "2026-09-13",
          markdown: "## Actual section\nSaved project content.",
          metaTitle: "Stored title",
          metaDescription: "Stored description",
          publishSecret: "fixture-private",
        },
      ],
    );
    await start();
    const replies = [
      JSON.stringify({
        handoff: "SEO przejmuje sprawdzenie artykułu.",
        assignments: [
          {
            role: "seo",
            task: "Check current draft structure",
            tools: [{ name: "draft_seo_review", assetId: "a" }],
          },
        ],
      }),
      "Sprawdziłem zapisany artykuł: zawiera jedną sekcję H2. Nie uruchomiłem crawla.",
    ];
    const unavailable = async (): Promise<never> => {
      throw new Error("Private owner tool must not run for this collaborator");
    };
    const target = { ownerId: owner, projectId: "p", conversationId, turnId };
    const result = await runConversationSpecialists(actor, target, {
      claim: (who, input) => claimConversationTurn(who, input, rpc),
      read: (who, input) => readConversation(who, input, rpc),
      assert: (who, input, attempt) => assertConversationExecution(who, input, attempt, rpc),
      advance: (who, input, change) => advanceConversationTurn(who, input, change, rpc),
      tool: (input, context) =>
        runSpecialistTool(input, context, {
          rpc,
          workspace: unavailable,
          knowledge: unavailable,
          weekly: unavailable,
          generate: unavailable,
        }),
      model: async ({ context, prompt }) => {
        await context.beforeDispatch!();
        expect(prompt).not.toContain("fixture-private");
        return replies.shift()!;
      },
    });
    expect(result.state).toBe("completed");
    const saved = await readConversation(
      actor,
      { ownerId: owner, projectId: "p", conversationId },
      rpc,
    );
    expect(
      saved.turns[0].events.find(
        (event) => event.tool === "draft_seo_review" && event.state === "completed",
      )?.text,
    ).toContain("h2Count");
    expect(saved.turns[0].events.at(-1)).toMatchObject({
      kind: "assistant",
      role: "seo",
      text: "Sprawdziłem zapisany artykuł: zawiera jedną sekcję H2. Nie uruchomiłem crawla.",
    });
    expect((await claim()).acquired).toBe(false);
  });
  it("retains the exact task and deduplicates a submission before and after execution", async () => {
    expect((await start()).created).toBe(true);
    expect((await start()).created).toBe(false);
    const taken = await claim();
    expect(taken.acquired).toBe(true);
    expect(await claim()).toMatchObject({ acquired: false, attemptId: null });
    await advance(taken.attemptId);
    expect((await start()).created).toBe(false);
    const page = conversationPage.parse(await read());
    expect(page.turnCount).toBe(1);
    expect(page.turns[0]).toMatchObject({
      body: "Review our SEO",
      locale: "pl",
      state: "completed",
    });
    expect(JSON.stringify(page)).not.toContain(taken.attemptId);
    expect(JSON.stringify(page)).not.toContain("fixture-private");
    expect(await query("list_milo_conversations($1,$2,'p')", [actor, owner])).toMatchObject({
      conversations: [{ conversationId, turnCount: 1, title: "Review our SEO" }],
    });
  });
  it("rejects request reuse with changed content, language or conversation", async () => {
    await start();
    await expect(start(actor, owner, "p", conversationId, turnId, "Changed")).rejects.toThrow(
      "conflict",
    );
    await expect(
      start(actor, owner, "p", conversationId, turnId, "Review our SEO", "en"),
    ).rejects.toThrow("conflict");
    await expect(start(actor, owner, "p", randomUUID())).rejects.toThrow("conflict");
  });
  it("isolates identical project IDs across owners and immutable conversation scopes", async () => {
    await start();
    for (const call of [
      read(actor, other),
      read(actor, owner, "q"),
      start(actor, other),
      start(owner, owner),
      start(actor, owner, "q"),
    ])
      await expect(call).rejects.toThrow(/unavailable|conflict/);
    await start(other, other, "p", randomUUID(), randomUUID());
    expect((await db.query("SELECT count(*)::int n FROM milo_conversations")).rows[0]).toEqual({
      n: 2,
    });
  });
  it("does not share a participant's chat with another member or the project owner", async () => {
    await start();
    await db.query(
      "INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES($1,'p',$2,'reviewer')",
      [owner, other],
    );
    for (const who of [owner, other]) {
      await expect(read(who)).rejects.toThrow("unavailable");
      await expect(cancel(who)).rejects.toThrow("unavailable");
      await expect(claim(who)).rejects.toThrow("unavailable");
      expect(await query("list_milo_conversations($1,$2,'p')", [who, owner])).toMatchObject({
        conversations: [],
      });
    }
  });
  it.each(["active=false,revision=2", "expires_at=now()-interval '1 second'"])(
    "rechecks member access on history, exact replay and execution: %s",
    async (change) => {
      await start();
      const taken = await claim();
      await db.exec(`UPDATE project_team_members SET ${change}`);
      for (const operation of [
        () => read(),
        () => start(),
        () => claim(),
        () => advance(taken.attemptId),
        () => cancel(),
      ])
        await expect(operation()).rejects.toThrow("unavailable");
    },
  );
  it.each([actor, owner])(
    "blocks existing conversations when account %s is suspended or deleted",
    async (who) => {
      await start();
      for (const change of ["banned_until=now()+interval '1 hour'", "deleted_at=now()"]) {
        await db.exec(
          `UPDATE auth.users SET banned_until=NULL,deleted_at=NULL; UPDATE auth.users SET ${change} WHERE id='${who}'`,
        );
        await expect(read()).rejects.toThrow(/unavailable/);
        await expect(start()).rejects.toThrow(/unavailable/);
        await expect(claim()).rejects.toThrow(/unavailable/);
      }
    },
  );
  it("refuses results created under an older membership revision after regrant", async () => {
    await start();
    const taken = await claim();
    await db.exec("UPDATE project_team_members SET revision=3,role='viewer'");
    await expect(advance(taken.attemptId)).rejects.toThrow("unavailable");
    await expect(claim()).rejects.toThrow("unavailable");
    await cancel();
    expect((await start(actor, owner, "p", conversationId, randomUUID())).created).toBe(true);
  });
  it("permits only one active turn and preserves ordered durable events", async () => {
    await start();
    await expect(start(actor, owner, "p", conversationId, randomUUID())).rejects.toThrow("busy");
    const taken = await claim();
    await advance(taken.attemptId, "running", 0, [
      { kind: "handoff", role: "lead", text: "SEO specialist takes over." },
    ]);
    await expect(advance(taken.attemptId)).rejects.toThrow("conflict");
    await expect(advance(randomUUID(), "completed", 1)).rejects.toThrow("conflict");
    await advance(taken.attemptId, "completed", 1);
    const second = await start(actor, owner, "p", conversationId, randomUUID(), "What next?");
    expect(conversationTurn.parse(second.turn).ordinal).toBe(2);
    const page = conversationPage.parse(await read());
    expect(page.turns[0].events.map((event) => event.role)).toEqual(["lead", "seo"]);
    expect(page.turns.map((turn) => turn.body)).toEqual(["Review our SEO", "What next?"]);
  });
  it("keeps lease expiry uncertain, never reclaims it, and rejects late output", async () => {
    await start();
    const taken = await claim();
    await db.exec("UPDATE milo_conversation_turns SET lease_until=now()-interval '1 second'");
    expect(conversationPage.parse(await read()).turns[0].state).toBe("unknown");
    expect(await claim()).toMatchObject({
      acquired: false,
      attemptId: null,
      turn: { state: "unknown" },
    });
    await expect(advance(taken.attemptId)).rejects.toThrow("conflict");
    await start(actor, owner, "p", conversationId, randomUUID(), "Check retained results");
    expect(conversationPage.parse(await read()).turns.map((turn) => turn.state)).toEqual([
      "unknown",
      "pending",
    ]);
  });
  it.each([false, true])(
    "cancels pending or running work and prevents later claim/output: claimed=%s",
    async (claimed) => {
      await start();
      const taken = claimed ? await claim() : null;
      expect(conversationTurn.parse(await cancel()).state).toBe("cancelled");
      expect(conversationTurn.parse(await cancel()).state).toBe("cancelled");
      expect(await claim()).toMatchObject({ acquired: false, attemptId: null });
      if (taken) await expect(advance(taken.attemptId)).rejects.toThrow("conflict");
      await start(actor, owner, "p", conversationId, randomUUID());
    },
  );
  it("does not rewrite completed evidence when cancellation arrives late", async () => {
    await start();
    const taken = await claim();
    await advance(taken.attemptId);
    expect(conversationTurn.parse(await cancel()).state).toBe("completed");
  });
  it("bounds UTF-8 input, locale, event count and event bytes in the actual database", async () => {
    for (const body of [" ", "ą".repeat(4001)])
      await expect(start(actor, owner, "p", conversationId, turnId, body)).rejects.toThrow(
        "invalid",
      );
    await expect(
      start(actor, owner, "p", conversationId, turnId, "Text", "../../en"),
    ).rejects.toThrow("invalid");
    await start();
    const taken = await claim();
    await expect(advance(taken.attemptId, "running", 0, Array(25).fill({}))).rejects.toThrow();
    await expect(
      advance(taken.attemptId, "running", 0, [{ text: "a".repeat(140000) }]),
    ).rejects.toThrow();
    await expect(advance(taken.attemptId, "running", -1)).rejects.toThrow("invalid");
    await expect(advance(taken.attemptId, "running", 0, [])).rejects.toThrow("invalid");
    expect(conversationPage.parse(await read()).turns[0].events).toEqual([]);
  });
  it("paginates retained history in stable order without treating a page as complete memory", async () => {
    await start();
    await cancel();
    await db.query(
      "INSERT INTO milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state) SELECT gen_random_uuid(),$1,$2,n,'Earlier task','pl',1,'completed' FROM generate_series(2,23) n",
      [conversationId, actor],
    );
    await db.exec("UPDATE milo_conversations SET turn_count=23");
    const first = conversationPage.parse(await read());
    expect(first).toMatchObject({ hasMore: true, nextAfter: 20, turnCount: 23 });
    const second = conversationPage.parse(await read(actor, owner, "p", conversationId, 20));
    expect(second).toMatchObject({ hasMore: false, nextAfter: 23 });
    expect(second.turns.map((turn) => turn.ordinal)).toEqual([21, 22, 23]);
    await expect(read(actor, owner, "p", conversationId, -1)).rejects.toThrow("invalid");
  });
  it("enforces actor-wide rate limits across projects but preserves exact replay", async () => {
    await start();
    await cancel();
    await db.query(
      "INSERT INTO milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state) SELECT gen_random_uuid(),$1,$2,n,'Earlier task','pl',1,'completed' FROM generate_series(2,10) n",
      [conversationId, actor],
    );
    await db.exec("UPDATE milo_conversations SET turn_count=10");
    expect((await start()).created).toBe(false);
    await expect(start(actor, owner, "p", randomUUID(), randomUUID())).rejects.toThrow("capacity");
    await db.exec("UPDATE milo_conversation_turns SET created_at=now()-interval '2 minutes'");
    expect((await start(actor, owner, "p", randomUUID(), randomUUID())).created).toBe(true);
  });
  it("removes conversation data with project deletion", async () => {
    await start();
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [owner],
    );
    expect((await db.query("SELECT * FROM milo_conversation_turns")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM milo_conversations")).rows).toHaveLength(0);
    await expect(read()).rejects.toThrow("unavailable");
  });
  it("retains the hourly cap after the minute window ends", async () => {
    await start();
    await cancel();
    await db.query(
      "INSERT INTO milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,state,created_at) SELECT gen_random_uuid(),$1,$2,n,'Earlier task','pl',1,'completed',now()-interval '2 minutes' FROM generate_series(2,60) n",
      [conversationId, actor],
    );
    await db.exec(
      "UPDATE milo_conversations SET turn_count=60; UPDATE milo_conversation_turns SET created_at=now()-interval '2 minutes'",
    );
    await expect(start(actor, owner, "p", randomUUID(), randomUUID())).rejects.toThrow("capacity");
    await db.exec("UPDATE milo_conversation_turns SET created_at=now()-interval '2 hours'");
    expect((await start(actor, owner, "p", conversationId, randomUUID())).created).toBe(true);
  });
  it("bounds retained conversations and turns without deleting previous history", async () => {
    await start();
    await cancel();
    await db.exec("UPDATE milo_conversations SET turn_count=500");
    await expect(start(actor, owner, "p", conversationId, randomUUID())).rejects.toThrow(
      "capacity",
    );
    await db.query(
      "INSERT INTO milo_conversations(conversation_id,actor_id,owner_id,project_id,title) SELECT gen_random_uuid(),$1,$2,'p','Earlier conversation' FROM generate_series(1,199)",
      [actor, owner],
    );
    await expect(start(actor, owner, "p", randomUUID(), randomUUID())).rejects.toThrow("capacity");
    expect(conversationPage.parse(await read()).turns[0].body).toBe("Review our SEO");
  });
  it("refuses cumulative event overflow atomically while preserving earlier evidence", async () => {
    await start();
    const taken = await claim();
    const events = Array.from({ length: 12 }, () => ({
      kind: "assistant",
      role: "seo",
      text: "a".repeat(8000),
    }));
    await advance(taken.attemptId, "running", 0, events);
    await expect(advance(taken.attemptId, "completed", 12, events)).rejects.toThrow();
    const page = conversationPage.parse(await read());
    expect(page.turns[0].events).toHaveLength(12);
    expect(page.turns[0].state).toBe("running");
  });
  it("restricts direct tables and actor-asserting functions to trusted service entries", async () => {
    await start();
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM public.milo_conversations")).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query("SELECT * FROM public.milo_conversation_turns")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        query("assert_milo_conversation_access($1,$2,'p')", [actor, owner]),
      ).rejects.toThrow(/permission denied/);
      if (role === "service_role") expect(conversationPage.parse(await read()).actorId).toBe(actor);
      else
        for (const operation of [
          () => start(),
          () => read(),
          () => claim(),
          () => cancel(),
          () => advance(randomUUID()),
          () =>
            query("check_milo_conversation_execution($1,$2,'p',$3,$4,$5)", [
              actor,
              owner,
              conversationId,
              turnId,
              randomUUID(),
            ]),
          () => query("list_milo_conversations($1,$2,'p')", [actor, owner]),
        ])
          await expect(operation()).rejects.toThrow(/permission denied/);
      await db.exec("RESET ROLE");
    }
  });
  it("runs storage through actual admitted server projections without exposing claims", async () => {
    const input = { ownerId: owner, projectId: "p", conversationId, turnId };
    await beginConversationTurn(
      actor,
      { ...input, body: "What needs improving?", locale: "en" },
      rpc,
    );
    const taken = await claimConversationTurn(actor, input, rpc);
    await advanceConversationTurn(
      actor,
      input,
      {
        attemptId: taken.attemptId!,
        expected: 0,
        events: [{ kind: "assistant", role: "seo", text: "Current saved evidence reviewed." }],
        state: "completed",
      },
      rpc,
    );
    const page = await readConversation(
      actor,
      { ownerId: owner, projectId: "p", conversationId },
      rpc,
    );
    expect(page.turns[0].state).toBe("completed");
    expect(JSON.stringify(page)).not.toContain(taken.attemptId);
    expect((await db.query("SELECT leases FROM project_team_preview_limits")).rows).toEqual([
      { leases: {} },
      { leases: {} },
    ]);
  });
});
