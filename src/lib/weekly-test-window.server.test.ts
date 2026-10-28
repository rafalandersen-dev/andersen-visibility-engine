import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bounded weekly observation — adapter and PROVIDER-BOUNDARY coverage.
 *
 * The provider cases below run the real `generateBudgetedText` /
 * `generateBudgetedImage` money path with the real guard, and assert on the
 * actual supplier `fetch` spy. Those assertions deliberately live at the test
 * level, OUTSIDE any product try/catch, so a swallowed failure inside the
 * runner cannot hide a dispatch.
 */
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetch: vi.fn(),
  entitledPlan: vi.fn(),
  rolesRead: vi.fn(),
  guardRpc: vi.fn(),
}));
vi.mock("./entitlements.server", () => ({
  resolveEntitledPlan: async () => "pro",
  resolveEntitledPlanResult: mocks.entitledPlan,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: () => mocks.rolesRead() };
      return q;
    },
  },
}));

import {
  WEEKLY_TEST_WINDOW_LIFETIME_MICROUSD,
  WEEKLY_TEST_WINDOW_MAX_ALLOWANCES,
  WEEKLY_TEST_WINDOW_RPC_TIMEOUT_MS,
  WeeklyTestWindowClosedError,
  WeeklyTestWindowUnavailableError,
  createWeeklyTestWindowGuard,
  readWeeklyTestWindow,
  revokeWeeklyTestWindow,
  weeklyTestWindowAllows,
  weeklyTestWindowOpen,
  type WeeklyTestWindow,
  type WeeklyTestWindowStage,
} from "./weekly-test-window.server";
import {
  NATIVE_IMAGE_RESERVE_MICROUSD,
  NATIVE_TEXT_RESERVE_MICROUSD,
  generateBudgetedImage,
  generateBudgetedText,
} from "./ai-provider-expense.server";
import { DEFAULT_MODEL_ID } from "./ai-router";
import { OPENAI_IMAGE_MODEL } from "./image-gen.server";

const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const windowId = "00000000-0000-4000-8000-0000000000aa";
const requestId = "00000000-0000-4000-8000-0000000000bb";
const jobId = "00000000-0000-4000-8000-0000000000cc";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const CONTRACTS = {
  research: {
    provider: "openai" as const,
    model: DEFAULT_MODEL_ID,
    operation: "generateOpportunitiesCore",
    ceilingMicrousd: NATIVE_TEXT_RESERVE_MICROUSD,
  },
  content: {
    provider: "openai" as const,
    model: DEFAULT_MODEL_ID,
    operation: "generateContentCore",
    ceilingMicrousd: NATIVE_TEXT_RESERVE_MICROUSD,
  },
  image: {
    provider: "openai" as const,
    model: OPENAI_IMAGE_MODEL,
    operation: "generateArticleImageCore",
    ceilingMicrousd: NATIVE_IMAGE_RESERVE_MICROUSD,
  },
};
/** A logical clock the tests advance explicitly, so "T1 passed while the guard
 * was awaiting" is deterministic rather than wall-clock dependent. */
let clock = 0;
const now = () => clock;
/** A logical MONOTONIC source, deliberately independent of the wall clock
 * above: advancing one without the other is exactly how a trailing local
 * clock, a delayed acknowledgement and a host clock adjustment are reproduced
 * without any real waiting. */
let mono = 0;
const monotonic = () => mono;
/** A raw RPC envelope exactly as a driver could hand one back, including the
 * shapes the declared type forbids (missing key, undefined payload, non-object)
 * — the ones that must never be read as "this project has no policy". */
const rawRpc = (result: unknown) =>
  vi.fn(async () => result) as unknown as NonNullable<Parameters<typeof readWeeklyTestWindow>[1]>;
let slotA: string;
let slotB: string;
let slotOff: string;
let base: WeeklyTestWindow;

function makeWindow(overrides: Partial<WeeklyTestWindow> = {}): WeeklyTestWindow {
  return { ...base, ...overrides };
}
const reserved = { data: [{ allowed: true, reason: "reserved", period: "2026-10" }], error: null };
const unknown = { data: [{ state: "unknown", overrun: false }], error: null };
function completion() {
  return new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: 0,
      model: DEFAULT_MODEL_ID,
      choices: [
        { index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { headers: { "content-type": "application/json", "x-request-id": "req_synthetic_text" } },
  );
}
const imageResponse = () =>
  new Response(
    JSON.stringify({
      data: [{ b64_json: png.toString("base64") }],
      usage: { input_tokens: 20, output_tokens: 1370 },
    }),
    { headers: { "content-type": "application/json", "x-request-id": "req_synthetic_image" } },
  );
const guardOk = (remainingMs: number, endsAt = base.endsAt) => ({
  data: { ok: true, windowId, serverNow: new Date(clock).toISOString(), endsAt, remainingMs },
  error: null,
});
function guardFor(
  stage: WeeklyTestWindowStage,
  overrides: { window?: WeeklyTestWindow; publishAt?: string } = {},
) {
  return createWeeklyTestWindowGuard({
    scope,
    window: overrides.window ?? base,
    publishAt: overrides.publishAt ?? slotA,
    stage,
    requestId,
    jobId,
    now,
    monotonic,
    rpc: mocks.guardRpc,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  vi.stubGlobal("fetch", mocks.fetch);
  clock = Date.parse("2026-10-28T17:00:00.000Z");
  mono = 0;
  slotA = new Date(clock + 3 * 86400_000).toISOString();
  slotB = new Date(clock + 5 * 86400_000).toISOString();
  slotOff = new Date(clock + 6 * 86400_000).toISOString();
  base = {
    windowId,
    ownerId: scope.ownerId,
    projectId: scope.projectId,
    startsAt: new Date(clock - 3600_000).toISOString(),
    // Ten logical minutes of remaining time: long enough that the guard's own
    // real cutoff timer never fires during the test, so only the explicit
    // logical-clock jumps decide the outcome.
    endsAt: new Date(clock + 600_000).toISOString(),
    expectedRevision: 1,
    expectedConfiguration: { enabled: true, mode: "approve_first" },
    lifetimeCeilingMicrousd: WEEKLY_TEST_WINDOW_LIFETIME_MICROUSD,
    revoked: false,
    revokedAt: null,
    state: "active",
    fresh: true,
    serverNow: new Date(clock).toISOString(),
    remainingMs: 600_000,
    slots: [slotA, slotB],
    contracts: CONTRACTS,
    authorizedMicrousd: 0,
    allowances: [],
  };
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "reserve_ai_expense" ? reserved : unknown,
  );
  mocks.guardRpc.mockImplementation(async () => guardOk(600_000));
  mocks.fetch.mockImplementation(async (url: string) =>
    String(url).includes("/images/") ? imageResponse() : completion(),
  );
  mocks.entitledPlan.mockResolvedValue({ ok: true, planId: "pro" });
  mocks.rolesRead.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reading the optional policy", () => {
  it("returns null for a project that is not part of the observation", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    expect(await readWeeklyTestWindow(scope, rpc)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("read_weekly_test_window", {
      p_user: scope.ownerId,
      p_project: scope.projectId,
    });
  });
  it("parses the full policy, including its effective state and remaining time", async () => {
    const window = await readWeeklyTestWindow(
      scope,
      vi.fn(async () => ({ data: base, error: null })),
    );
    expect(window).toMatchObject({ windowId, state: "active", fresh: true });
    expect(window!.slots).toHaveLength(2);
    expect(window!.lifetimeCeilingMicrousd).toBe(2_200_000);
    expect(WEEKLY_TEST_WINDOW_MAX_ALLOWANCES).toBe(6);
  });
  it("never defaults an unreadable or malformed policy to absent", async () => {
    for (const result of [
      { data: null, error: { message: "boom" } },
      { data: { ...base, slots: [slotA] }, error: null },
      { data: { ...base, lifetimeCeilingMicrousd: 2_200_001 }, error: null },
      { data: { ...base, projectId: "other" }, error: null },
      { data: { ...base, ownerId: "00000000-0000-4000-8000-00000000ffff" }, error: null },
    ])
      await expect(
        readWeeklyTestWindow(
          scope,
          vi.fn(async () => result),
        ),
      ).rejects.toBeInstanceOf(WeeklyTestWindowUnavailableError);
  });
  it("never reads a missing or undefined payload as 'this project has no policy'", async () => {
    // Only an EXPLICIT SQL null may mean "absent". An envelope without a `data`
    // key, an undefined payload or a non-object reply is unreadable, so a
    // registered project cannot silently lose its bound to a driver quirk.
    for (const result of [
      {},
      { error: null },
      { data: undefined, error: null },
      { data: undefined },
      undefined,
      null,
      "ok",
      [],
    ])
      await expect(readWeeklyTestWindow(scope, rawRpc(result))).rejects.toBeInstanceOf(
        WeeklyTestWindowUnavailableError,
      );
    // ...and the one value that legitimately means "absent" still does.
    expect(await readWeeklyTestWindow(scope, rawRpc({ data: null, error: null }))).toBeNull();
  });
  it("applies the same envelope and scope identity checks to the stop RPC", async () => {
    const stopped = { ...base, revoked: true, revokedAt: base.serverNow, state: "revoked" };
    for (const result of [
      {},
      { error: null },
      { data: undefined, error: null },
      // "No policy" is not a stop: a revoke must prove it revoked THIS window.
      { data: null, error: null },
      { data: stopped, error: { message: "boom" } },
      // An unrelated positive answer is never accepted as this scope's stop.
      { data: { ...stopped, projectId: "other" }, error: null },
      { data: { ...stopped, ownerId: "00000000-0000-4000-8000-00000000ffff" }, error: null },
    ])
      await expect(revokeWeeklyTestWindow(scope, rawRpc(result))).rejects.toBeInstanceOf(
        WeeklyTestWindowUnavailableError,
      );
    expect(
      await revokeWeeklyTestWindow(scope, rawRpc({ data: stopped, error: null })),
    ).toMatchObject({ revoked: true, ownerId: scope.ownerId, projectId: scope.projectId });
  });
  it("fails closed when the policy read stalls", async () => {
    vi.useFakeTimers();
    const assertion = expect(
      readWeeklyTestWindow(
        scope,
        vi.fn(() => new Promise<{ data: unknown; error: unknown }>(() => {})),
      ),
    ).rejects.toBeInstanceOf(WeeklyTestWindowUnavailableError);
    await vi.advanceTimersByTimeAsync(WEEKLY_TEST_WINDOW_RPC_TIMEOUT_MS + 1);
    await assertion;
  });
  it("requires the stop RPC to confirm revocation and never fabricates it", async () => {
    const revoked = await revokeWeeklyTestWindow(
      scope,
      vi.fn(async () => ({
        data: { ...base, revoked: true, revokedAt: base.serverNow, state: "revoked" },
        error: null,
      })),
    );
    expect(revoked).toMatchObject({ revoked: true, state: "revoked" });
    await expect(
      revokeWeeklyTestWindow(
        scope,
        vi.fn(async () => ({ data: base, error: null })),
      ),
    ).rejects.toBeInstanceOf(WeeklyTestWindowUnavailableError);
  });
});

describe("local policy evaluation", () => {
  it.each([
    ["pending", { state: "pending" as const }],
    ["expired", { state: "expired" as const }],
    ["revoked", { state: "revoked" as const, revoked: true }],
    ["drifted", { fresh: false }],
  ])("treats a %s policy as closed", (_label, overrides) => {
    expect(weeklyTestWindowOpen(makeWindow(overrides), clock)).toBe(false);
  });
  it("closes exactly AT T1, not after it", () => {
    const t1 = Date.parse(base.endsAt);
    expect(weeklyTestWindowOpen(base, t1 - 1)).toBe(true);
    expect(weeklyTestWindowOpen(base, t1)).toBe(false);
    expect(weeklyTestWindowOpen(base, t1 + 1)).toBe(false);
    expect(weeklyTestWindowOpen(base, Date.parse(base.startsAt) - 1)).toBe(false);
  });
  it("compares slots as instants, so a different offset for the same moment is allowed", () => {
    expect(weeklyTestWindowAllows(base, slotA)).toBe(true);
    expect(weeklyTestWindowAllows(base, slotA.replace("Z", "+00:00"))).toBe(true);
    expect(weeklyTestWindowAllows(base, slotOff)).toBe(false);
    expect(weeklyTestWindowAllows(base, "not-a-date")).toBe(false);
  });
});

describe("the final pre-dispatch guard", () => {
  it("sends the stored contract and the exact bound identity to the fresh DB check", async () => {
    const guard = guardFor("image");
    await guard.beforeDispatch();
    guard.release();
    expect(mocks.guardRpc).toHaveBeenCalledWith("assert_weekly_test_window_dispatch", {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_request: requestId,
      p_job: jobId,
      p_publish: slotA,
      p_stage: "image",
      p_provider: "openai",
      p_model: OPENAI_IMAGE_MODEL,
      p_operation: "generateArticleImageCore",
      p_ceiling: NATIVE_IMAGE_RESERVE_MICROUSD,
    });
  });
  it("refuses an off-list slot and a closed window before it ever calls the database", async () => {
    for (const guard of [
      guardFor("research", { publishAt: slotOff }),
      guardFor("research", { window: makeWindow({ state: "revoked", revoked: true }) }),
    ]) {
      expect(guard.signal.aborted).toBe(true);
      await expect(guard.beforeDispatch()).rejects.toBeInstanceOf(WeeklyTestWindowClosedError);
      guard.release();
    }
    expect(mocks.guardRpc).not.toHaveBeenCalled();
  });
  it("refuses AFTER the awaited acknowledgement when T1 passed during the check", async () => {
    // The database legitimately approved before T1; its reply landed after.
    mocks.guardRpc.mockImplementation(async () => {
      const approval = guardOk(5);
      clock = Date.parse(base.endsAt) + 1;
      return approval;
    });
    const guard = guardFor("content");
    await expect(guard.beforeDispatch()).rejects.toMatchObject({
      detail: "deadline_during_guard",
    });
    expect(mocks.guardRpc).toHaveBeenCalledOnce();
    expect(guard.signal.aborted).toBe(true);
    guard.release();
  });
  it.each([
    ["no remaining server time", () => guardOk(0)],
    ["a changed cutoff", () => guardOk(600_000, new Date(clock + 7200_000).toISOString())],
    [
      "another window",
      () => ({ data: { ...guardOk(600_000).data, windowId: requestId }, error: null }),
    ],
    ["an unconfirmed reply", () => ({ data: { ok: false }, error: null })],
  ])("refuses on %s", async (_label, reply) => {
    mocks.guardRpc.mockImplementation(async () => reply());
    const guard = guardFor("research");
    await expect(guard.beforeDispatch()).rejects.toBeInstanceOf(WeeklyTestWindowClosedError);
    expect(guard.signal.aborted).toBe(true);
    guard.release();
  });
  it("fails closed when the guard RPC itself is unavailable", async () => {
    mocks.guardRpc.mockImplementation(async () => ({ data: null, error: { message: "boom" } }));
    const guard = guardFor("research");
    await expect(guard.beforeDispatch()).rejects.toBeInstanceOf(WeeklyTestWindowUnavailableError);
    guard.release();
  });
  it("refuses when the round trip outlasted the server's own remaining time", async () => {
    // The database is AHEAD of this host: it had only 100ms left when it
    // approved, and its answer took 202ms to arrive. The local wall clock still
    // believes ten minutes remain, so only the monotonic bound can refuse.
    mocks.guardRpc.mockImplementation(async () => {
      const approval = guardOk(100);
      mono += 202;
      return approval;
    });
    const guard = guardFor("research");
    await expect(guard.beforeDispatch()).rejects.toMatchObject({
      detail: "monotonic_deadline_during_guard",
    });
    expect(clock).toBeLessThan(Date.parse(base.endsAt));
    expect(guard.signal.aborted).toBe(true);
    guard.release();
  });
  it("charges the whole round trip, not just the time after the reply", async () => {
    // 150ms of remaining time and a 149ms round trip still leaves the bound
    // ahead of us; the same reply 1ms later does not.
    for (const [trip, open] of [
      [149, true],
      [151, false],
    ] as const) {
      mono = 0;
      mocks.guardRpc.mockImplementation(async () => {
        const approval = guardOk(150);
        mono += trip;
        return approval;
      });
      const guard = guardFor("content");
      const attempt = guard.beforeDispatch();
      if (open) await expect(attempt).resolves.toBeUndefined();
      else await expect(attempt).rejects.toBeInstanceOf(WeeklyTestWindowClosedError);
      guard.release();
    }
  });
  it("never lets a later acknowledgement extend an earlier bound", async () => {
    mocks.guardRpc.mockImplementationOnce(async () => guardOk(50));
    const guard = guardFor("research");
    await guard.beforeDispatch();
    mono += 60; // the bound established above has now really passed
    mocks.guardRpc.mockImplementation(async () => guardOk(600_000));
    await expect(guard.beforeDispatch()).rejects.toMatchObject({ detail: "monotonic_deadline" });
    // Refused before the database was asked again: the bound is not negotiable.
    expect(mocks.guardRpc).toHaveBeenCalledOnce();
    guard.release();
  });
  it("resolves inconsistent server timing conservatively", async () => {
    // `remainingMs` disagrees with the server's own serverNow/endsAt pair: the
    // SMALLER of the two is binding, and a non-positive derived span refuses.
    const reply = (serverNow: string, remainingMs: number) => ({
      data: { ok: true, windowId, serverNow, endsAt: base.endsAt, remainingMs },
      error: null,
    });
    mocks.guardRpc.mockImplementation(async () => {
      const approval = reply(new Date(Date.parse(base.endsAt) - 50).toISOString(), 600_000);
      mono += 60;
      return approval;
    });
    await expect(guardFor("image").beforeDispatch()).rejects.toMatchObject({
      detail: "monotonic_deadline_during_guard",
    });
    mono = 0;
    mocks.guardRpc.mockImplementation(async () => reply(base.endsAt, 600_000));
    await expect(guardFor("image").beforeDispatch()).rejects.toMatchObject({
      detail: "server_deadline",
    });
  });
  it("re-arms the real cancellation timer to the server's earlier bound", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(clock);
    mocks.guardRpc.mockImplementation(async () => guardOk(100));
    const guard = guardFor("content");
    await guard.beforeDispatch();
    expect(guard.signal.aborted).toBe(false);
    // The local absolute cutoff is still ten minutes away, but the in-flight
    // request is now aborted on the server's 100ms bound instead.
    await vi.advanceTimersByTimeAsync(101);
    expect(guard.signal.aborted).toBe(true);
    guard.release();
  });
  it("aborts its signal at T1 without any operator action", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(clock);
    // No injected clock here: the default `Date.now()` cutoff timer must fire
    // on its own, proving expiry needs no local monitor or operator action.
    const guard = createWeeklyTestWindowGuard({
      scope,
      window: base,
      publishAt: slotA,
      stage: "research",
      requestId,
      jobId,
      rpc: mocks.guardRpc,
    });
    expect(guard.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(Date.parse(base.endsAt) - Date.now() + 1);
    expect(guard.signal.aborted).toBe(true);
    guard.release();
  });
});

describe("the actual provider is never reached after the cutoff", () => {
  const stages = [
    ["research", "text"],
    ["content", "text"],
    ["image", "image"],
  ] as const;
  const dispatch = (
    kind: "text" | "image",
    stage: WeeklyTestWindowStage,
    guard: ReturnType<typeof guardFor>,
  ) => {
    const context = {
      userId: scope.ownerId,
      operation: CONTRACTS[stage].operation,
      attempt: { requestId, jobId },
      signal: guard.signal,
      beforeDispatch: guard.beforeDispatch,
    };
    return kind === "text"
      ? generateBudgetedText(context, "private source", 3000)
      : generateBudgetedImage(context, "private image prompt");
  };

  it.each(stages)(
    "%s: holding monetary admission across T1 then releasing it still dispatches nothing",
    async (stage, kind) => {
      // Money admission is slow and lands AFTER T1 — exactly the audit's
      // "hold the reservation across the cutoff, then release it" case.
      mocks.rpc.mockImplementation(async (name: string) => {
        if (name === "reserve_ai_expense") {
          clock = Date.parse(base.endsAt) + 1;
          return reserved;
        }
        return unknown;
      });
      const guard = guardFor(stage);
      await expect(dispatch(kind, stage, guard)).rejects.toThrow();
      guard.release();
      // Assertions OUTSIDE any product catch: the real supplier call never ran.
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
        "reserve_ai_expense",
        "reconcile_ai_expense",
      ]);
      // The reservation is retained as uncertain: no refund, and no retry.
      expect(mocks.rpc.mock.calls[1][1]).toMatchObject({
        p_request: requestId,
        p_actual: null,
        p_outcome: "uncertain",
      });
    },
  );

  it.each(stages)(
    "%s: a revoked policy during the final check dispatches nothing",
    async (stage, kind) => {
      mocks.guardRpc.mockImplementation(async () => ({
        data: null,
        error: { message: "weekly_test_window_closed" },
      }));
      const guard = guardFor(stage);
      await expect(dispatch(kind, stage, guard)).rejects.toThrow();
      guard.release();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.guardRpc).toHaveBeenCalledOnce();
    },
  );

  it.each(stages)(
    "%s: a late guard acknowledgement that crosses T1 dispatches nothing",
    async (stage, kind) => {
      mocks.guardRpc.mockImplementation(async () => {
        const approval = guardOk(3);
        clock = Date.parse(base.endsAt) + 1;
        return approval;
      });
      const guard = guardFor(stage);
      await expect(dispatch(kind, stage, guard)).rejects.toThrow();
      guard.release();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.guardRpc).toHaveBeenCalledOnce();
      expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
        "reserve_ai_expense",
        "reconcile_ai_expense",
      ]);
    },
  );

  it.each(stages)(
    "%s: a delayed acknowledgement from a server ahead of this host dispatches nothing",
    async (stage, kind) => {
      // Server-ahead / local-behind: the database had 100ms left when it
      // approved and its reply took 202ms to arrive, while this host's wall
      // clock still reports ten minutes of window. Only the monotonic bound
      // measured from the request's departure can stop this.
      mocks.guardRpc.mockImplementation(async () => {
        const approval = guardOk(100);
        mono += 202;
        return approval;
      });
      const guard = guardFor(stage);
      await expect(dispatch(kind, stage, guard)).rejects.toThrow();
      guard.release();
      // Assertions OUTSIDE any product catch: the real supplier call never ran.
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(guard.signal.aborted).toBe(true);
      expect(clock).toBeLessThan(Date.parse(base.endsAt));
      expect(mocks.guardRpc).toHaveBeenCalledOnce();
      expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
        "reserve_ai_expense",
        "reconcile_ai_expense",
      ]);
      expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_actual: null, p_outcome: "uncertain" });
    },
  );

  it.each(stages)(
    "%s: a backwards wall-clock adjustment cannot resurrect an elapsed cutoff",
    async (stage, kind) => {
      // The host clock is stepped an hour BACK while the guard is awaiting, so
      // every absolute comparison says the window reopened. Monotonic time did
      // not move back, and the bound already passed.
      mocks.guardRpc.mockImplementation(async () => {
        const approval = guardOk(100);
        mono += 150;
        clock -= 3_600_000;
        return approval;
      });
      const guard = guardFor(stage);
      await expect(dispatch(kind, stage, guard)).rejects.toThrow();
      guard.release();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(guard.signal.aborted).toBe(true);
      expect(now()).toBeLessThan(Date.parse(base.endsAt));
      expect(mocks.guardRpc).toHaveBeenCalledOnce();
    },
  );

  it.each(stages)(
    "%s: an already aborted window dispatches nothing and reserves nothing",
    async (stage, kind) => {
      const guard = guardFor(stage, { window: makeWindow({ revoked: true, state: "revoked" }) });
      await expect(dispatch(kind, stage, guard)).rejects.toThrow();
      guard.release();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.guardRpc).not.toHaveBeenCalled();
    },
  );

  it.each(stages)(
    "%s: an open window reserves, revalidates and only then dispatches once",
    async (stage, kind) => {
      const guard = guardFor(stage);
      await expect(dispatch(kind, stage, guard)).resolves.toBeDefined();
      guard.release();
      expect(mocks.guardRpc).toHaveBeenCalledOnce();
      expect(mocks.fetch).toHaveBeenCalledOnce();
      // Money admission, then the fresh policy check, then the supplier call.
      expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.guardRpc.mock.invocationCallOrder[0],
      );
      expect(mocks.guardRpc.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.fetch.mock.invocationCallOrder[0],
      );
      expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
        p_request: requestId,
        p_job: jobId,
        p_provider: "openai",
        p_model: CONTRACTS[stage].model,
        p_ceiling: CONTRACTS[stage].ceilingMicrousd,
      });
      // No prompt, policy identity or supplier body leaks into the ledger.
      expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("private");
    },
  );

  it("keeps the unguarded provider contract unchanged for every other caller", async () => {
    // No signal and no hook: the ordinary behaviour must be bit-for-bit intact.
    const context = { userId: scope.ownerId, operation: "generateArticleImageCore" };
    expect(await generateBudgetedImage(context, "ordinary prompt")).toEqual(new Uint8Array(png));
    expect(mocks.guardRpc).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_ai_expense",
      "reconcile_ai_expense",
    ]);
  });
});
