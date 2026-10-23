/**
 * CU — ordinary conversation reads intermittently hid saved history (23 October 2026).
 *
 * Live, after a full reload of a completed conversation: listMiloConversationsFn
 * (function id 71a57520…, identified from the build's sha256 of
 * "src/lib/milo-conversation.functions.ts--listMiloConversationsFn_createServerFn_handler")
 * returned "Team access is busy" while the concurrent readMiloConversationFn
 * (9f98a5a4…) and listMyProjectTeamsFn (aa25b139…) succeeded. All three acquire the
 * same per-actor preview admission, which refuses a concurrent acquire on its actor
 * try-lock and allows two active leases; the directory error then conceals the page.
 *
 * Correction pinned here: the three page reads retry ONLY a refused acquire (which
 * grants no lease and counts nothing), at most 3 times under an absolute budget,
 * and the directory read also gets the page read's existing clean-rollback 55P03
 * retry on the same lease (its access check takes FOR SHARE NOWAIT locks). Access
 * refusals and transport/storage errors are never retried.
 * Stubbed RPC for exact sequencing; real PGlite SQL for the actual lease cap, rate
 * refusal, revocation, scope, counters and lease cleanup. No provider or paid work.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listConversations,
  MILO_READ_CONTENTION_ATTEMPTS,
  MILO_READ_DEADLINE_MS,
  readConversation,
} from "./milo-conversation.server";
import { listMyProjectTeams } from "./project-team-membership.server";
import {
  admittedReadRpc,
  READ_ADMISSION_ATTEMPTS,
  READ_ADMISSION_BUDGET_MS,
} from "./project-team-read-admission.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
import type { TeamReadRpc } from "./project-team-read.server";

const owner = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000004";
const lease = "00000000-0000-4000-8000-000000000005";
const directory = { actorId: actor, ownerId: owner, projectId: "p", conversations: [] };
const capacity = { data: null, error: { message: "team_preview_capacity" } };
const nowait = { data: null, error: { code: "55P03", message: "lock not available" } };

/** Scripted storage: acquire replies are consumed in order (then granted); the read
 * replies with `read` unless overridden. Records every call name. */
function stub(acquires: unknown[], read: unknown = { data: directory, error: null }) {
  const calls: string[] = [];
  let a = 0;
  const rpc = vi.fn(async (name: string) => {
    calls.push(name);
    if (name === "acquire_project_team_preview") {
      const reply = acquires[a++];
      if (reply instanceof Error) throw reply;
      return (reply as object) ?? { data: lease, error: null };
    }
    if (name === "release_project_team_preview") return { data: null, error: null };
    return read as { data: unknown; error: unknown };
  });
  return { rpc: rpc as unknown as TeamReadRpc, calls };
}
const count = (calls: string[], name: string) => calls.filter((c) => c === name).length;
afterEach(() => vi.useRealTimers());

describe("CU directory read admission", () => {
  it("reproduces the live case: a refused acquire on the directory is recovered, then released", async () => {
    // Previously the first refusal surfaced as "Team access is busy" (see cu-evidence probe).
    const s = stub([capacity]);
    await expect(
      listConversations(actor, { ownerId: owner, projectId: "p", offset: 0 }, s.rpc),
    ).resolves.toEqual(directory);
    expect(s.calls).toEqual([
      "acquire_project_team_preview",
      "acquire_project_team_preview",
      "list_milo_conversations",
      "release_project_team_preview",
    ]);
  });

  it("treats a NOWAIT refusal of the limits row the same way", async () => {
    const s = stub([nowait, capacity]);
    await listConversations(actor, { ownerId: owner, projectId: "p", offset: 0 }, s.rpc);
    expect(count(s.calls, "acquire_project_team_preview")).toBe(3);
    expect(count(s.calls, "list_milo_conversations")).toBe(1);
  });

  it("stops at the attempt bound with busy, without reading or leasing", async () => {
    const s = stub([capacity, capacity, capacity, capacity]);
    await expect(
      listConversations(actor, { ownerId: owner, projectId: "p", offset: 0 }, s.rpc),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(count(s.calls, "acquire_project_team_preview")).toBe(READ_ADMISSION_ATTEMPTS);
    expect(count(s.calls, "list_milo_conversations")).toBe(0);
    expect(count(s.calls, "release_project_team_preview")).toBe(0);
  });

  it("never starts an acquire after the absolute budget, even after a stalled pause", async () => {
    vi.useFakeTimers();
    const s = stub([capacity]);
    const settled = listConversations(
      actor,
      { ownerId: owner, projectId: "p", offset: 0 },
      s.rpc,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.calls).toEqual(["acquire_project_team_preview"]);
    vi.setSystemTime(Date.now() + READ_ADMISSION_BUDGET_MS + 100);
    await vi.advanceTimersByTimeAsync(30);
    expect(await settled).toBeInstanceOf(TeamAdmissionBusyError);
    expect(s.calls).toEqual(["acquire_project_team_preview"]);
  });

  it("an expired budget starts no acquire at all (and so releases nothing)", async () => {
    const s = stub([]);
    await expect(
      admittedReadRpc(actor, s.rpc, { acquireUntil: Date.now() - 1 })("list_milo_conversations", {
        p_actor: actor,
        p_owner: owner,
        p_project: "p",
      }),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(s.calls).toEqual([]);
  });

  it("a wrapper invoked after its budget elapsed starts no acquire", async () => {
    vi.useFakeTimers();
    const s = stub([]);
    const admitted = admittedReadRpc(actor, s.rpc, {
      acquireUntil: Date.now() + READ_ADMISSION_BUDGET_MS,
    });
    vi.setSystemTime(Date.now() + READ_ADMISSION_BUDGET_MS + 1);
    await expect(
      admitted("list_milo_conversations", { p_actor: actor, p_owner: owner, p_project: "p" }),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(s.calls).toEqual([]);
  });
});

describe("CU directory read contention (same lease, shared deadline)", () => {
  /** Acquire granted; the directory read replies in order (then succeeds). */
  function directoryReads(replies: unknown[]) {
    const s = stub([]);
    let r = 0;
    const rpc: TeamReadRpc = async (name, args) => {
      if (name !== "list_milo_conversations") return s.rpc(name, args);
      s.calls.push(name);
      const reply = replies[r++];
      return (reply as { data: unknown; error: unknown }) ?? { data: directory, error: null };
    };
    return { rpc, calls: s.calls };
  }
  const list = (rpc: TeamReadRpc) =>
    listConversations(actor, { ownerId: owner, projectId: "p", offset: 0 }, rpc);

  it("a 55P03 from the directory read's NOWAIT access check is retried on the same lease", async () => {
    const d = directoryReads([nowait]);
    await expect(list(d.rpc)).resolves.toEqual(directory);
    expect(d.calls).toEqual([
      "acquire_project_team_preview",
      "list_milo_conversations",
      "list_milo_conversations",
      "release_project_team_preview",
    ]);
  });

  it("stops at the read-attempt bound with busy, then releases its single lease", async () => {
    const d = directoryReads(Array(MILO_READ_CONTENTION_ATTEMPTS + 2).fill(nowait));
    await expect(list(d.rpc)).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(count(d.calls, "list_milo_conversations")).toBe(MILO_READ_CONTENTION_ATTEMPTS);
    expect(count(d.calls, "acquire_project_team_preview")).toBe(1);
    expect(count(d.calls, "release_project_team_preview")).toBe(1);
  });

  it("starts no directory read past the shared absolute deadline", async () => {
    vi.useFakeTimers();
    const d = directoryReads([nowait, nowait]);
    const settled = list(d.rpc).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(count(d.calls, "list_milo_conversations")).toBe(1);
    vi.setSystemTime(Date.now() + MILO_READ_DEADLINE_MS + 1);
    await vi.advanceTimersByTimeAsync(100);
    expect(await settled).toBeInstanceOf(TeamAdmissionBusyError);
    expect(count(d.calls, "list_milo_conversations")).toBe(1);
    expect(count(d.calls, "release_project_team_preview")).toBe(1);
  });

  it.each([
    [
      "an access refusal",
      { data: null, error: { code: "P0001", message: "milo_conversation_unavailable" } },
    ],
    ["a storage error", { data: null, error: { code: "XX000", message: "internal" } }],
  ])("does not retry %s from the directory read, and releases", async (_, reply) => {
    const d = directoryReads([reply]);
    await expect(list(d.rpc)).rejects.toThrow("Team access could not be updated or confirmed");
    expect(d.calls).toEqual([
      "acquire_project_team_preview",
      "list_milo_conversations",
      "release_project_team_preview",
    ]);
  });

  it("does not retry a thrown transport failure of the directory read", async () => {
    const s = stub([]);
    let reads = 0;
    const rpc: TeamReadRpc = async (name, args) => {
      if (name !== "list_milo_conversations") return s.rpc(name, args);
      s.calls.push(name);
      reads++;
      throw new Error("fetch failed");
    };
    await expect(list(rpc)).rejects.toThrow("Team access could not be updated or confirmed");
    expect(reads).toBe(1);
    expect(count(s.calls, "release_project_team_preview")).toBe(1);
  });
});

describe("CU acquire refusals: non-retryable", () => {
  it.each([
    ["a transport failure", new Error("fetch failed")],
    ["an access refusal", { data: null, error: { message: "team_preview_unavailable" } }],
    ["a storage error", { data: null, error: { code: "XX000", message: "internal" } }],
  ])("does not retry %s at acquire", async (_, reply) => {
    const s = stub([reply]);
    await expect(
      listConversations(actor, { ownerId: owner, projectId: "p", offset: 0 }, s.rpc),
    ).rejects.toThrow("Team access could not be updated or confirmed");
    expect(s.calls).toEqual(["acquire_project_team_preview"]);
  });
});

describe("CU other page reads", () => {
  it("the conversation page recovers a refused acquire and keeps its own read-contention retry", async () => {
    const page = {
      actorId: actor,
      ownerId: owner,
      projectId: "p",
      conversationId,
      title: "Saved",
      turnCount: 0,
      turns: [],
      nextAfter: 0,
      hasMore: false,
    };
    let reads = 0;
    const s = stub([capacity]);
    const rpc: TeamReadRpc = async (name, args) =>
      name === "read_milo_conversation"
        ? (s.calls.push(name), ++reads === 1 ? nowait : { data: page, error: null })
        : s.rpc(name, args);
    await expect(
      readConversation(actor, { ownerId: owner, projectId: "p", conversationId, after: 0 }, rpc),
    ).resolves.toMatchObject({ conversationId });
    expect(s.calls).toEqual([
      "acquire_project_team_preview",
      "acquire_project_team_preview",
      "read_milo_conversation",
      "read_milo_conversation",
      "release_project_team_preview",
    ]);
  });

  it("actor project discovery recovers a refused acquire with the same opt-in", async () => {
    const teams = { actorId: actor, projects: [], invitations: [] };
    const s = stub([capacity], { data: teams, error: null });
    const result = await listMyProjectTeams(
      actor,
      admittedReadRpc(actor, s.rpc, { acquireUntil: Date.now() + READ_ADMISSION_BUDGET_MS }),
    );
    expect(result.actorId).toBe(actor);
    expect(count(s.calls, "acquire_project_team_preview")).toBe(2);
    expect(count(s.calls, "list_my_project_teams")).toBe(1);
  });

  it("reads that did not opt in keep their single acquire", async () => {
    const s = stub([capacity]);
    await expect(
      admittedReadRpc(actor, s.rpc)("list_milo_conversations", {
        p_actor: actor,
        p_owner: owner,
        p_project: "p",
      }),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(s.calls).toEqual(["acquire_project_team_preview"]);
  });
});

describe("CU against the real admission SQL", () => {
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
      INSERT INTO public.workspace_entities VALUES('${owner}','projects','p','{"name":"Synergy"}'),('${owner}','projects','q','{"name":"Other"}');
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
  /** Two reads already in flight for this actor: the actor's two lease slots. */
  const holdTwo = async () => {
    const held: string[] = [];
    for (let i = 0; i < 2; i++)
      held.push(
        (
          await sql("acquire_project_team_preview", {
            p_actor: actor,
            p_owner: owner,
            p_project: "p",
          })
        ).data as string,
      );
    return held;
  };
  const release = (held: string) =>
    sql("release_project_team_preview", { p_actor: actor, p_owner: owner, p_lease: held });
  const actorRow = async () =>
    (
      await db.query<{ hour_count: number; minute_count: number; active: number }>(
        `SELECT hour_count, minute_count, (SELECT count(*) FROM jsonb_object_keys(leases))::int active
         FROM public.project_team_preview_limits WHERE scope='actor' AND account_id='${actor}'`,
      )
    ).rows[0];
  const observe = (onRefused?: (attempt: number) => Promise<void>) => {
    const calls: string[] = [];
    let refusals = 0;
    const rpc: TeamReadRpc = async (name, params) => {
      calls.push(name);
      const result = await sql(name, params);
      if (name === "acquire_project_team_preview" && result.error) await onRefused?.(++refusals);
      return result;
    };
    return { rpc, calls };
  };
  const list = (rpc: TeamReadRpc, projectId = "p") =>
    listConversations(actor, { ownerId: owner, projectId, offset: 0 }, rpc);

  it("the real two-lease cap refuses a third concurrent read; it succeeds once a slot frees", async () => {
    const held = await holdTwo();
    expect(await actorRow()).toMatchObject({ hour_count: 2, active: 2 });
    const o = observe(async (attempt) => {
      if (attempt === 1) await release(held[0]);
    });
    await expect(list(o.rpc)).resolves.toMatchObject({ actorId: actor, conversations: [] });
    expect(count(o.calls, "acquire_project_team_preview")).toBe(2);
    // The refused acquire counted nothing; the successful one counted once and released.
    expect(await actorRow()).toMatchObject({ hour_count: 3, active: 1 });
  });

  it("an exhausted cap surfaces busy after the bound, counting and leasing nothing", async () => {
    await holdTwo();
    const o = observe();
    await expect(list(o.rpc)).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(count(o.calls, "acquire_project_team_preview")).toBe(READ_ADMISSION_ATTEMPTS);
    expect(count(o.calls, "list_milo_conversations")).toBe(0);
    expect(await actorRow()).toMatchObject({ hour_count: 2, active: 2 });
  });

  it("a real per-minute rate refusal is bounded and consumes no budget", async () => {
    await db.exec(`INSERT INTO public.project_team_preview_limits(scope,account_id,hour_start,hour_count,minute_start,minute_count)
      VALUES('actor','${actor}',clock_timestamp(),60,clock_timestamp(),60)`);
    const o = observe();
    await expect(list(o.rpc)).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(count(o.calls, "acquire_project_team_preview")).toBe(READ_ADMISSION_ATTEMPTS);
    expect(count(o.calls, "list_milo_conversations")).toBe(0);
    expect(await actorRow()).toMatchObject({ hour_count: 60, minute_count: 60, active: 0 });
  });

  it("revoked membership and a foreign project are refused once, never retried", async () => {
    for (const [setup, projectId] of [
      ["UPDATE public.project_team_members SET active=false", "p"],
      ["SELECT 1", "q"],
    ] as const) {
      await db.exec(setup);
      const o = observe();
      await expect(list(o.rpc, projectId)).rejects.toThrow(
        "Team access could not be updated or confirmed",
      );
      expect(o.calls).toEqual(["acquire_project_team_preview"]);
    }
  });

  it("a membership revoked between attempts is rechecked and ends the retry", async () => {
    const held = await holdTwo();
    const o = observe(async (attempt) => {
      if (attempt !== 1) return;
      await release(held[0]);
      await db.exec("UPDATE public.project_team_members SET active=false");
    });
    await expect(list(o.rpc)).rejects.toThrow("Team access could not be updated or confirmed");
    expect(count(o.calls, "acquire_project_team_preview")).toBe(2);
    expect(count(o.calls, "list_milo_conversations")).toBe(0);
    expect(await actorRow()).toMatchObject({ hour_count: 2, active: 1 });
  });
});
