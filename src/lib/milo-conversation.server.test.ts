import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceConversationTurn,
  beginConversationTurn,
  claimConversationTurn,
  listConversations,
  readConversation,
  MILO_READ_CONTENTION_ATTEMPTS,
  MILO_READ_DEADLINE_MS,
} from "./milo-conversation.server";
import { conversationSend } from "./milo-conversation";
import { TeamAdmissionBusyError } from "./project-team-admission";
const actor = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const turnId = "00000000-0000-4000-8000-000000000004";
const lease = "00000000-0000-4000-8000-000000000005";
const target = { ownerId, projectId: "p", conversationId };
const input = { ...target, turnId, body: "Review SEO", locale: "pl" };
const turn = {
  turnId,
  ordinal: 1,
  body: input.body,
  locale: input.locale,
  state: "pending",
  events: [],
  createdAt: "2026-09-13T12:00:00Z",
  updatedAt: "2026-09-13T12:00:00Z",
};
function responding(data: unknown) {
  return vi.fn(async (name: string, _params: Record<string, unknown>) => ({
    data:
      name === "acquire_project_team_preview"
        ? lease
        : name === "release_project_team_preview"
          ? null
          : data,
    error: null,
  }));
}
describe("conversation server authority and response validation", () => {
  it("rejects forged actor, roles, events and claim identities before storage access", async () => {
    const rpc = responding(null);
    for (const extra of [
      { actorId: ownerId },
      { role: "seo" },
      { events: [] },
      { attemptId: lease },
      { state: "completed" },
    ])
      expect(() => conversationSend.parse({ ...input, ...extra })).toThrow();
    await expect(beginConversationTurn("forged", input, rpc)).rejects.toThrow();
    await expect(
      beginConversationTurn(actor, { ...input, body: "ą".repeat(4001) }, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps the authenticated participant distinct from the client owner", async () => {
    const rpc = responding({ created: true, turn });
    await beginConversationTurn(actor, input, rpc);
    expect(rpc).toHaveBeenCalledWith("begin_milo_conversation_turn", {
      p_actor: actor,
      p_owner: ownerId,
      p_project: "p",
      p_conversation: conversationId,
      p_turn: turnId,
      p_body: input.body,
      p_locale: "pl",
    });
    expect(rpc).toHaveBeenLastCalledWith("release_project_team_preview", {
      p_actor: actor,
      p_owner: ownerId,
      p_lease: lease,
    });
  });
  it("sends the separate provider-check consent and refuses a stored response without it", async () => {
    const consented = { ...input, allowProviderChecks: true };
    const rpc = responding({ created: true, turn: { ...turn, allowProviderChecks: true } });
    await beginConversationTurn(actor, consented, rpc);
    expect(rpc).toHaveBeenCalledWith(
      "begin_milo_conversation_turn",
      expect.objectContaining({ p_allow_checks: true }),
    );
    for (const stored of [{ ...turn, allowProviderChecks: false }, turn])
      await expect(
        beginConversationTurn(actor, consented, responding({ created: true, turn: stored })),
      ).rejects.toThrow();
  });
  it("refuses substituted task content or identity in stored responses", async () => {
    for (const change of [{ body: "Other message" }, { turnId: lease }, { locale: "en" }])
      await expect(
        beginConversationTurn(
          actor,
          input,
          responding({ created: true, turn: { ...turn, ...change } }),
        ),
      ).rejects.toThrow();
  });
  it("refuses substituted owners, actors, projects, conversations and skipped history", async () => {
    const page = {
      ...target,
      actorId: actor,
      title: "SEO",
      turnCount: 1,
      turns: [turn],
      nextAfter: 1,
      hasMore: false,
    };
    for (const change of [
      { actorId: ownerId },
      { ownerId: actor },
      { projectId: "q" },
      { conversationId: lease },
      { nextAfter: 0 },
      { hasMore: true },
      { turns: [{ ...turn, ordinal: 2 }] },
    ])
      await expect(
        readConversation(actor, target, responding({ ...page, ...change })),
      ).rejects.toThrow();
    expect(await readConversation(actor, target, responding(page))).toEqual(page);
  });
  it("refuses claim tokens when a stored claim was not acquired", async () => {
    for (const data of [
      { acquired: false, attemptId: lease, turn },
      { acquired: true, attemptId: null, turn },
      { acquired: true, attemptId: lease, turn },
    ])
      await expect(
        claimConversationTurn(actor, { ...target, turnId }, responding(data)),
      ).rejects.toThrow();
  });
  it("accepts only exact server events and detects missing or changed evidence", async () => {
    const change = {
      attemptId: lease,
      expected: 0,
      events: [{ kind: "assistant" as const, role: "seo" as const, text: "Evidence reviewed" }],
      state: "completed" as const,
    };
    const result = { ...turn, state: "completed", events: change.events };
    expect(
      await advanceConversationTurn(actor, { ...target, turnId }, change, responding(result)),
    ).toEqual(result);
    for (const data of [
      { ...result, events: [] },
      { ...result, state: "running" },
      { ...result, events: [{ ...change.events[0], text: "Changed" }] },
    ])
      await expect(
        advanceConversationTurn(actor, { ...target, turnId }, change, responding(data)),
      ).rejects.toThrow();
  });
  it("refuses arbitrary result URLs, unknown tools and oversized event sequences before dispatch", async () => {
    const rpc = responding(null);
    const change = {
      attemptId: lease,
      expected: 0,
      events: [
        {
          kind: "assistant" as const,
          role: "seo" as const,
          text: "Result",
          href: "https://untrusted.example",
        },
      ],
      state: "completed" as const,
    };
    await expect(
      advanceConversationTurn(actor, { ...target, turnId }, change, rpc),
    ).rejects.toThrow();
    await expect(
      advanceConversationTurn(
        actor,
        { ...target, turnId },
        { ...change, expected: 24, events: [{ kind: "status", role: "lead", text: "State" }] },
        rpc,
      ),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects directory scope substitution without returning another client's history", async () => {
    await expect(
      listConversations(
        actor,
        { ownerId, projectId: "p" },
        responding({ actorId: ownerId, ownerId, projectId: "p", conversations: [] }),
      ),
    ).rejects.toThrow();
  });
  it("contains storage errors without leaking database details", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "fixture-private database detail" },
    }));
    await expect(beginConversationTurn(actor, input, rpc)).rejects.not.toThrow("fixture-private");
    expect(rpc).toHaveBeenCalledOnce();
  });
});

describe("browser continuity read shares one bounded deadline across admission and retries", () => {
  afterEach(() => vi.useRealTimers());
  const page = {
    ...target,
    actorId: actor,
    title: "SEO",
    turnCount: 1,
    turns: [turn],
    nextAfter: 1,
    hasMore: false,
  };
  // A rpc whose read_milo_conversation call consumes fake time before returning a busy
  // (55P03) or ok result; the preview acquire optionally consumes `acquireDelayMs` of
  // fake time so a slow admission can spend the shared budget before the read. `launches`
  // counts read attempts STARTED (so a post-deadline attempt would show up), not settled.
  const readMock = (readDelayMs: number, reads: Array<"busy" | "ok">, acquireDelayMs = 0) => {
    let launches = 0,
      acquires = 0,
      releases = 0;
    const rpc = vi.fn(async (name: string, _params: Record<string, unknown>) => {
      if (name === "acquire_project_team_preview") {
        if (acquireDelayMs) await new Promise((resolve) => setTimeout(resolve, acquireDelayMs));
        acquires += 1;
        return { data: lease, error: null };
      }
      if (name === "release_project_team_preview") {
        releases += 1;
        return { data: null, error: null };
      }
      const index = launches;
      launches += 1;
      await new Promise((resolve) => setTimeout(resolve, readDelayMs));
      return reads[Math.min(index, reads.length - 1)] === "busy"
        ? { data: null, error: { code: "55P03", message: "lock_not_available" } }
        : { data: page, error: null };
    });
    return {
      rpc,
      get launches() {
        return launches;
      },
      get acquires() {
        return acquires;
      },
      get releases() {
        return releases;
      },
    };
  };

  it("does not launch a read attempt past the shared deadline (a slow 55P03 crossing it is not retried)", async () => {
    vi.useFakeTimers();
    // The single attempt takes longer than the whole deadline; when it settles the
    // deadline has passed, so NO retry is launched and the lease is released.
    const m = readMock(MILO_READ_DEADLINE_MS + 1000, ["busy", "busy", "busy", "busy"]);
    const promise = readConversation(actor, target, m.rpc);
    // Attach the rejection handler BEFORE advancing time, so the rejection that fires
    // during advanceTimersByTimeAsync is never briefly unhandled.
    const settled = promise.then(() => "resolved").catch((error) => error);
    await vi.advanceTimersByTimeAsync(MILO_READ_DEADLINE_MS + 1000);
    expect(await settled).toBeInstanceOf(TeamAdmissionBusyError);
    expect(m.launches).toBe(1); // no fresh attempt past the deadline
    expect(m.acquires).toBe(1);
    expect(m.releases).toBe(1); // admission released once the actual work settled
  });

  it("retries up to the shared deadline, then stops before launching a further attempt", async () => {
    vi.useFakeTimers();
    // 3 s attempts under a 5 s deadline: attempt 1 retries, attempt 2 crosses the
    // deadline on settle, so a third attempt is never launched — the deadline, not the
    // attempt cap, bounds the sequence.
    const m = readMock(3000, ["busy", "busy", "busy", "busy"]);
    const promise = readConversation(actor, target, m.rpc);
    const settled = promise.then(() => "resolved").catch((error) => error);
    await vi.advanceTimersByTimeAsync(3000); // attempt 1 settles (t=3 s)
    expect(m.launches).toBe(1);
    await vi.advanceTimersByTimeAsync(100); // backoff → attempt 2 launches (still < 5 s)
    expect(m.launches).toBe(2);
    await vi.advanceTimersByTimeAsync(3000); // attempt 2 settles (t≈6 s ≥ deadline)
    expect(await settled).toBeInstanceOf(TeamAdmissionBusyError);
    expect(m.launches).toBe(2);
    expect(m.launches).toBeLessThan(MILO_READ_CONTENTION_ATTEMPTS);
    expect(m.acquires).toBe(1);
    expect(m.releases).toBe(1);
  });

  it("recovers a fast transient 55P03 within the deadline on a single preview lease", async () => {
    vi.useFakeTimers();
    const m = readMock(0, ["busy", "ok"]);
    const promise = readConversation(actor, target, m.rpc);
    await vi.advanceTimersByTimeAsync(100); // attempt 1 (busy) + 20 ms backoff + attempt 2 (ok)
    await expect(promise).resolves.toEqual(page);
    expect(m.launches).toBe(2);
    expect(m.acquires).toBe(1);
    expect(m.releases).toBe(1);
  });

  it("skips the storage read entirely when admission alone has already spent the budget, still releasing the lease", async () => {
    vi.useFakeTimers();
    // The preview acquire itself consumes more than the whole read budget, so the FIRST
    // read attempt is refused before it launches (the deadline covers the admission
    // delay). No storage read RPC runs, and the acquired lease is released exactly once.
    const m = readMock(0, ["busy"], MILO_READ_DEADLINE_MS + 1000);
    const promise = readConversation(actor, target, m.rpc);
    const settled = promise.then(() => "resolved").catch((error) => error);
    await vi.advanceTimersByTimeAsync(MILO_READ_DEADLINE_MS + 1000);
    expect(await settled).toBeInstanceOf(TeamAdmissionBusyError);
    expect(m.launches).toBe(0); // storage read never launched past the deadline
    expect(m.acquires).toBe(1);
    expect(m.releases).toBe(1); // acquired lease released despite skipping the read
  });

  it("holds the lease for an in-flight read that outlives the caller timeout, with no early release or extra attempt", async () => {
    vi.useFakeTimers();
    // A read attempt launched before the deadline but slower than the 10 s caller
    // (teamCall) timeout. The caller times out, but the transport is NOT cancelled: the
    // one in-flight read keeps its lease and is never released early, and no second
    // attempt is launched. When it finally settles, the lease is released.
    const m = readMock(11000, ["busy", "busy"]);
    const promise = readConversation(actor, target, m.rpc);
    const settled = promise.then(() => "resolved").catch(() => "rejected");
    await vi.advanceTimersByTimeAsync(10000); // caller (teamCall) 10 s timeout fires here
    expect(m.launches).toBe(1); // the read is still in flight; no second attempt
    expect(m.releases).toBe(0); // NOT released early while the actual read runs
    await vi.advanceTimersByTimeAsync(1000); // the in-flight read settles at t=11 s
    expect(await settled).toBe("rejected");
    expect(m.launches).toBe(1); // still exactly one attempt — no post-timeout relaunch
    expect(m.releases).toBe(1); // lease released only once the actual work settled
  });
});
