/**
 * CR — first-message admission and retained recovery (22 October 2026).
 *
 * Live: one first message on deployed CO received "Team access is busy" (a NOWAIT /
 * admission refusal, i.e. a confirmed rollback), saved no turn and made no AI call,
 * then the browser lost its recovery state. These tests pin the server half:
 * - only a confirmed-rollback TeamAdmissionBusyError is retried, a bounded number
 *   of times, under an absolute budget, with the identical request and a fresh
 *   admission (and therefore a fresh storage membership check) per attempt;
 * - uncertain or final failures are never retried;
 * - an exhausted busy becomes the typed `notSaved` response, never a guessed save;
 * - against the real SQL, a retried first message is one turn and an identical
 *   recovery does not duplicate it.
 * The browser half is covered by the pure helpers here and by the real-component
 * harness (scripts/milo-conversation-browser, component group "first-message busy…").
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginConversationTurn,
  MILO_BEGIN_BUSY_ATTEMPTS,
  MILO_BEGIN_BUSY_BUDGET_MS,
} from "./milo-conversation.server";
import { conversationPage } from "./milo-conversation";
import {
  awaitingFirstConfirmation,
  conversationReadEnabled,
  retainedSendOutcome,
  sendOutcome,
} from "./milo-conversation.ui";
import { TeamAdmissionBusyError } from "./project-team-admission";
import type { TeamReadRpc } from "./project-team-read.server";

const actor = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const turnId = "00000000-0000-4000-8000-000000000004";
const lease = "00000000-0000-4000-8000-000000000005";
const input = {
  ownerId,
  projectId: "p",
  conversationId,
  turnId,
  body: "Review our brand and research",
  locale: "en",
  allowProviderChecks: false,
};
const savedTurn = {
  turnId,
  ordinal: 1,
  body: input.body,
  locale: "en",
  state: "pending",
  events: [],
  createdAt: "2026-10-22T19:09:00Z",
  updatedAt: "2026-10-22T19:09:00Z",
};
type Reply = { data?: unknown; error?: unknown } | Error | (() => Promise<never>);
/** Scripted storage: each begin attempt consumes the next reply; acquire/release
 * succeed unless scripted. Records every call with its exact arguments. */
function storage(begins: Reply[], acquires: Reply[] = [], releaseFails = false) {
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  let b = 0,
    a = 0;
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    calls.push({ name, params: structuredClone(params) });
    if (name === "acquire_project_team_preview") {
      const reply = acquires[a++];
      if (reply) return reply as { data: unknown; error: unknown };
      return { data: lease, error: null };
    }
    if (name === "release_project_team_preview")
      return releaseFails ? { data: null, error: { code: "XX000" } } : { data: null, error: null };
    const reply = begins[Math.min(b++, begins.length - 1)];
    if (reply instanceof Error) throw reply;
    if (typeof reply === "function") return reply();
    return { data: null, error: null, ...reply };
  });
  return { rpc: rpc as unknown as TeamReadRpc, calls };
}
const busy = { error: { code: "55P03", message: "milo_conversation_busy" } };
const ok = { data: { created: true, turn: savedTurn } };
const begins = <T extends { name: string }>(calls: T[]) =>
  calls.filter((c) => c.name === "begin_milo_conversation_turn");

afterEach(() => {
  vi.useRealTimers();
});

describe("CR bounded rollback-only begin retry", () => {
  it("retries a confirmed 55P03 rollback with the identical request and succeeds", async () => {
    const s = storage([busy, ok]);
    const result = await beginConversationTurn(actor, input, s.rpc);
    expect(result).toMatchObject({ created: true, turn: { turnId } });
    const attempts = begins(s.calls);
    expect(attempts).toHaveLength(2);
    expect(attempts[1].params).toEqual(attempts[0].params);
    expect(attempts[0].params).toMatchObject({
      p_actor: actor,
      p_owner: ownerId,
      p_conversation: conversationId,
      p_turn: turnId,
      p_body: input.body,
      p_allow_checks: false,
    });
    // A fresh admission per attempt, each released: acquire, begin, release × 2.
    expect(s.calls.map((c) => c.name)).toEqual([
      "acquire_project_team_preview",
      "begin_milo_conversation_turn",
      "release_project_team_preview",
      "acquire_project_team_preview",
      "begin_milo_conversation_turn",
      "release_project_team_preview",
    ]);
  });

  it("retries an admission-capacity refusal (begin never ran) the same way", async () => {
    const s = storage([ok], [{ data: null, error: { message: "team_preview_capacity" } }]);
    await beginConversationTurn(actor, input, s.rpc);
    expect(begins(s.calls)).toHaveLength(1);
    expect(s.calls.filter((c) => c.name === "acquire_project_team_preview")).toHaveLength(2);
  });

  it("stops after the attempt cap and surfaces the busy rollback", async () => {
    const s = storage([busy]);
    await expect(beginConversationTurn(actor, input, s.rpc)).rejects.toBeInstanceOf(
      TeamAdmissionBusyError,
    );
    expect(begins(s.calls)).toHaveLength(MILO_BEGIN_BUSY_ATTEMPTS);
    expect(MILO_BEGIN_BUSY_ATTEMPTS).toBe(3);
  });

  it("never starts an attempt past the absolute budget", async () => {
    vi.useFakeTimers();
    const slowBusy = () =>
      new Promise<never>((resolve) =>
        setTimeout(() => resolve(busy as never), MILO_BEGIN_BUSY_BUDGET_MS - 20),
      );
    const s = storage([slowBusy]);
    const settled = beginConversationTurn(actor, input, s.rpc).catch((error) => error);
    await vi.advanceTimersByTimeAsync(MILO_BEGIN_BUSY_BUDGET_MS + 500);
    expect(await settled).toBeInstanceOf(TeamAdmissionBusyError);
    expect(begins(s.calls)).toHaveLength(1);
  });

  it.each([
    ["a stalled backoff past the budget starts no further admission or begin", true],
    ["an on-time backoff permits the next identical attempt", false],
  ])("%s", async (_, stall) => {
    vi.useFakeTimers();
    const s = storage([busy, ok]);
    const settled = beginConversationTurn(actor, input, s.rpc).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    // Attempt 1 completes (acquire, refused begin, release) and the 40 ms backoff is armed.
    await vi.advanceTimersByTimeAsync(0);
    expect(s.calls.map((c) => c.name)).toEqual([
      "acquire_project_team_preview",
      "begin_milo_conversation_turn",
      "release_project_team_preview",
    ]);
    // An event-loop stall: the wall clock jumps past the absolute budget while the
    // backoff timer is still pending, then the delayed timer fires.
    if (stall) vi.setSystemTime(Date.now() + MILO_BEGIN_BUSY_BUDGET_MS + 100);
    await vi.advanceTimersByTimeAsync(40);
    const outcome = await settled;
    if (stall) {
      expect("error" in outcome && outcome.error).toBeInstanceOf(TeamAdmissionBusyError);
      expect(s.calls).toHaveLength(3); // no second acquire, begin or release
    } else {
      expect(outcome).toMatchObject({ value: { created: true } });
      const attempts = begins(s.calls);
      expect(attempts).toHaveLength(2);
      expect(attempts[1].params).toEqual(attempts[0].params);
    }
  });

  it.each([
    ["a thrown transport failure", new Error("fetch failed")],
    ["a non-55P03 storage error", { error: { code: "P0001", message: "milo_conversation_busy" } }],
    ["revoked membership", { error: { code: "P0001", message: "milo_conversation_unavailable" } }],
    ["a capacity refusal", { error: { code: "P0001", message: "milo_conversation_capacity" } }],
  ] as [string, Reply][])("does not retry %s", async (_, reply) => {
    const s = storage([reply, ok]);
    await expect(beginConversationTurn(actor, input, s.rpc)).rejects.toThrow(
      "Team access could not be updated or confirmed",
    );
    expect(begins(s.calls)).toHaveLength(1);
  });

  it("does not retry an uncertain timeout, even though the begin may still commit", async () => {
    vi.useFakeTimers();
    const s = storage([() => new Promise<never>(() => {})]);
    const settled = beginConversationTurn(actor, input, s.rpc).catch((error) => error);
    await vi.advanceTimersByTimeAsync(11000);
    const error = await settled;
    expect(error).not.toBeInstanceOf(TeamAdmissionBusyError);
    expect(begins(s.calls)).toHaveLength(1);
  });

  it("a membership change between attempts is rechecked and ends the retry", async () => {
    const s = storage([
      busy,
      { error: { code: "P0001", message: "milo_conversation_unavailable" } },
    ]);
    await expect(beginConversationTurn(actor, input, s.rpc)).rejects.toThrow();
    expect(begins(s.calls)).toHaveLength(2);
  });

  it("a release failure after a committed begin can never turn it into a retry", async () => {
    const s = storage([ok], [], true);
    await expect(beginConversationTurn(actor, input, s.rpc)).resolves.toMatchObject({
      created: true,
    });
    expect(begins(s.calls)).toHaveLength(1);
  });
});

describe("CR typed send outcome", () => {
  it("the browser treats only the typed rollback as not saved and only its own turn as saved", () => {
    expect(sendOutcome({ notSaved: "busy" }, turnId)).toBe("notSaved");
    expect(sendOutcome({ turn: savedTurn }, turnId)).toBe("saved");
    for (const response of [
      undefined,
      null,
      "busy",
      {},
      { notSaved: "other" },
      { turn: { ...savedTurn, turnId: lease } },
      { turn: null },
    ])
      expect(sendOutcome(response, turnId)).toBe("uncertain");
  });

  it("a busy recovery of a once-uncertain request never downgrades it to not saved", () => {
    // The busy refusal proves only that the recovery attempt did not commit; the
    // original attempt whose response was lost may have saved and queued work.
    expect(retainedSendOutcome("notSaved", true)).toBe("uncertain");
    expect(retainedSendOutcome("notSaved", false)).toBe("notSaved");
    for (const ever of [true, false]) {
      expect(retainedSendOutcome("saved", ever)).toBe("saved");
      expect(retainedSendOutcome("uncertain", ever)).toBe("uncertain");
    }
  });

  it("a new conversation is never read alongside its begin, nor while authorization fails", () => {
    const fresh = { fresh: true, concealed: false };
    expect(conversationReadEnabled(fresh)).toBe(false);
    expect(conversationReadEnabled({ ...fresh, outcome: "notSaved" })).toBe(false);
    expect(conversationReadEnabled({ ...fresh, outcome: "saved" })).toBe(true);
    expect(conversationReadEnabled({ ...fresh, outcome: "uncertain" })).toBe(true);
    expect(conversationReadEnabled({ fresh: false, concealed: false })).toBe(true);
    for (const outcome of [undefined, "saved", "uncertain", "notSaved"] as const)
      for (const isFresh of [true, false])
        expect(conversationReadEnabled({ fresh: isFresh, concealed: true, outcome })).toBe(false);
    expect(awaitingFirstConfirmation({ fresh: true, outcome: "uncertain" })).toBe(true);
    for (const outcome of [undefined, "saved", "notSaved"] as const)
      expect(awaitingFirstConfirmation({ fresh: true, outcome })).toBe(false);
    expect(awaitingFirstConfirmation({ fresh: false, outcome: "uncertain" })).toBe(false);
  });
});

describe("CR against the real conversation SQL", () => {
  const owner = ownerId;
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
      INSERT INTO auth.users(id) VALUES('${owner}'),('${actor}');
      CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
      CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
      INSERT INTO public.workspace_meta(user_id) VALUES('${owner}');`);
    for (const name of [
      "20260911020000_project_team_reads.sql",
      "20260913120000_milo_conversations.sql",
      "20260914120000_milo_provider_check_consent.sql",
    ])
      await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  }, 30000);
  beforeEach(async () => {
    await db.exec(`TRUNCATE public.workspace_entities,public.project_team_members,public.milo_conversations,public.milo_conversation_turns,public.project_team_preview_limits;
      INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{"name":"Synergy"}');
      INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${actor}','editor');`);
  });
  afterAll(async () => {
    await db?.close();
  });
  const sql: TeamReadRpc = async (name, params) => {
    const entries = Object.entries(params);
    try {
      const rows = await db.query<{ result: unknown }>(
        `SELECT public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) result`,
        entries.map(([, value]) => value),
      );
      return { data: rows.rows[0].result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };
  /** Real SQL behind the real admission wrapper; the first `refusals` begin calls are
   * refused with 55P03 before reaching storage, as a concurrent NOWAIT holder would. */
  const contended = (refusals: number) => {
    let left = refusals;
    const seen: string[] = [];
    const rpc: TeamReadRpc = async (name, params) => {
      seen.push(name);
      if (name === "begin_milo_conversation_turn" && left > 0) {
        left--;
        return { data: null, error: { code: "55P03", message: "milo_conversation_busy" } };
      }
      return sql(name, params);
    };
    return { rpc, seen };
  };
  const turns = async () =>
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM public.milo_conversation_turns"))
      .rows[0].n;
  const leases = async () =>
    (
      await db.query<{ n: number }>(
        "SELECT coalesce(sum((SELECT count(*) FROM jsonb_object_keys(leases))),0)::int n FROM public.project_team_preview_limits",
      )
    ).rows[0].n;

  it("a contended first message becomes exactly one saved turn and releases every lease", async () => {
    const c = contended(2);
    const result = await beginConversationTurn(actor, input, c.rpc);
    expect(result.created).toBe(true);
    expect(c.seen.filter((n) => n === "begin_milo_conversation_turn")).toHaveLength(3);
    expect(await turns()).toBe(1);
    expect(await leases()).toBe(0);
  });

  it("an exhausted contention saves nothing and leaves no lease behind", async () => {
    await expect(beginConversationTurn(actor, input, contended(3).rpc)).rejects.toBeInstanceOf(
      TeamAdmissionBusyError,
    );
    expect(await turns()).toBe(0);
    expect(await leases()).toBe(0);
  });

  it("recovering the identical request after an uncertain save never duplicates the turn", async () => {
    await beginConversationTurn(actor, input, sql);
    const again = await beginConversationTurn(actor, input, contended(1).rpc);
    expect(again.created).toBe(false);
    expect(await turns()).toBe(1);
    const page = conversationPage.parse(
      (
        await sql("read_milo_conversation", {
          p_actor: actor,
          p_owner: owner,
          p_project: "p",
          p_conversation: conversationId,
          p_after: 0,
        })
      ).data,
    );
    expect(page.turns.map((t) => t.turnId)).toEqual([turnId]);
    await expect(
      beginConversationTurn(actor, { ...input, body: "Different text" }, sql),
    ).rejects.toThrow();
  });

  it("a membership revoked between attempts is refused by storage on the retry", async () => {
    let left = 1;
    const rpc: TeamReadRpc = async (name, params) => {
      if (name === "begin_milo_conversation_turn" && left > 0) {
        left--;
        await db.exec("UPDATE public.project_team_members SET active=false");
        return { data: null, error: { code: "55P03", message: "milo_conversation_busy" } };
      }
      return sql(name, params);
    };
    await expect(beginConversationTurn(actor, input, rpc)).rejects.toThrow();
    expect(await turns()).toBe(0);
  });
});
