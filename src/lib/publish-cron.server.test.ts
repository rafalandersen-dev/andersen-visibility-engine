import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  publish: vi.fn(),
  failure: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocked.rpc, from: () => ({ update: mocked.update }) },
}));
vi.mock("./publish.server", () => ({
  publishAssetServerSide: mocked.publish,
  recordScheduledPublishFailure: mocked.failure,
  isPermanentPublishError: (e: { preflightCapacity?: boolean }) => !e.preflightCapacity,
}));
import { PublishPreflightCapacityError } from "./publish-outcome";
import { runScheduledPublishes } from "./publish-cron.server";
beforeEach(() => {
  vi.resetAllMocks();
  mocked.update.mockReturnValue({ eq: mocked.eq });
  mocked.eq.mockResolvedValue({ error: null });
  mocked.failure.mockResolvedValue(undefined);
  mocked.rpc.mockImplementation(async (name) => ({
    data:
      name === "claim_scheduled_publishes"
        ? [{ id: "row", user_id: "owner", project_id: "p", asset_id: "a", attempts: 1 }]
        : [],
    error: null,
  }));
});
describe("scheduled publication refresh budget", () => {
  it("starts all twenty due rows before awaiting slow source checks, and records every outcome", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `row${i}`,
      user_id: `owner${i}`,
      project_id: "p",
      asset_id: `a${i}`,
      attempts: 1,
    }));
    mocked.rpc.mockImplementation(async (name) => ({
      data: name === "claim_scheduled_publishes" ? rows : [],
      error: null,
    }));
    let release!: () => void;
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocked.publish.mockImplementation(async () => {
      await stalled;
      return { publishedAt: "2026-09-10T10:00:00Z", platform: "wordpress" };
    });
    const run = runScheduledPublishes(20);
    await vi.waitFor(() => expect(mocked.publish).toHaveBeenCalledTimes(20));
    expect(mocked.update).not.toHaveBeenCalled();
    expect(mocked.rpc).toHaveBeenCalledWith("claim_scheduled_publishes", {
      batch_size: 20,
      max_attempts: 3,
    });
    release();
    expect(await run).toMatchObject({ claimed: 20, published: 20 });
    expect(mocked.update).toHaveBeenCalledTimes(20);
    expect(mocked.rpc.mock.calls.at(-1)?.[0]).toBe("record_cron_heartbeat");
  });
  it("bounds caller requests and does not let one failed row prevent other publications", async () => {
    mocked.rpc.mockImplementation(async (name) => ({
      data:
        name === "claim_scheduled_publishes"
          ? [
              { id: "held", user_id: "owner", project_id: "p", asset_id: "held", attempts: 1 },
              { id: "ready", user_id: "other", project_id: "p", asset_id: "ready", attempts: 1 },
            ]
          : [],
      error: null,
    }));
    mocked.publish.mockImplementation(async (_owner, asset) => {
      if (asset === "held")
        throw Object.assign(new Error("Source facts need review"), { sourceHold: true });
      return { publishedAt: "2026-09-10T10:00:00Z", platform: "wordpress" };
    });
    expect(await runScheduledPublishes(1000)).toMatchObject({
      claimed: 2,
      published: 1,
      failed: 1,
    });
    expect(mocked.rpc).toHaveBeenCalledWith("claim_scheduled_publishes", {
      batch_size: 20,
      max_attempts: 3,
    });
    expect(mocked.update).toHaveBeenCalledTimes(2);
  });
  it("records a source deadline hold before completing the request heartbeat", async () => {
    mocked.publish.mockRejectedValue(
      Object.assign(new Error("Source facts need review"), { sourceHold: true }),
    );
    expect(await runScheduledPublishes()).toMatchObject({ claimed: 1, failed: 1, retrying: 0 });
    expect(mocked.failure).toHaveBeenCalledExactlyOnceWith(
      "owner",
      "a",
      "Source facts need review",
      true,
      true,
    );
    expect(mocked.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(mocked.rpc.mock.calls.at(-1)?.[0]).toBe("record_cron_heartbeat");
  });
});

it("defers preflight failures with a separate retry budget and preserves connector attempts", async () => {
  mocked.rpc.mockImplementation(async (name) => ({
    data:
      name === "claim_scheduled_publishes"
        ? [{ id: "row", user_id: "owner", project_id: "p", asset_id: "a", attempts: 3 }]
        : [],
    error: null,
  }));
  const error = new PublishPreflightCapacityError();
  mocked.publish.mockRejectedValue(error);
  expect(await runScheduledPublishes()).toMatchObject({ retrying: 1, failed: 0 });
  expect(mocked.update).toHaveBeenCalledExactlyOnceWith({
    status: "pending",
    updated_at: expect.any(String),
    last_error: error.message,
    attempts: 2,
    preflight_attempts: 1,
    preflight_started_at: expect.any(String),
    retry_after: expect.any(String),
  });
  expect(mocked.failure).toHaveBeenCalledExactlyOnceWith("owner", "a", error.message, false);
});

it.each(["attempts", "age"])("parks unavailable preflight after its %s limit", async (limit) => {
  mocked.rpc.mockImplementation(async (name) => ({
    data:
      name === "claim_scheduled_publishes"
        ? [
            {
              id: "row",
              user_id: "owner",
              project_id: "p",
              asset_id: "a",
              attempts: 1,
              preflight_attempts: limit === "attempts" ? 11 : 1,
              preflight_started_at: new Date(
                Date.now() - (limit === "age" ? 25 : 1) * 3600000,
              ).toISOString(),
            },
          ]
        : [],
    error: null,
  }));
  mocked.publish.mockRejectedValue(new PublishPreflightCapacityError());
  expect(await runScheduledPublishes()).toMatchObject({ failed: 1, retrying: 0 });
  expect(mocked.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", retry_after: null }),
  );
});
it("backs off repeated preflight failures without changing the requested publication date", async () => {
  mocked.rpc.mockImplementation(async (name) => ({
    data:
      name === "claim_scheduled_publishes"
        ? [
            {
              id: "row",
              user_id: "owner",
              project_id: "p",
              asset_id: "a",
              attempts: 1,
              preflight_attempts: 5,
            },
          ]
        : [],
    error: null,
  }));
  mocked.publish.mockRejectedValue(new PublishPreflightCapacityError());
  const before = Date.now();
  await runScheduledPublishes();
  const patch = mocked.update.mock.calls[0][0];
  expect(Date.parse(patch.retry_after) - before).toBeGreaterThanOrEqual(32 * 60000);
  expect(patch).not.toHaveProperty("publish_at");
});

it.each(["returned error", "rejection"])(
  "does not reinterpret a published result after queue %s",
  async (failure) => {
    mocked.publish.mockResolvedValue({
      publishedAt: "2026-09-12T12:00:00Z",
      platform: "wordpress",
    });
    if (failure === "returned error")
      mocked.eq.mockResolvedValue({ error: { message: "unavailable" } });
    else mocked.eq.mockRejectedValue(new Error("unavailable"));
    expect(await runScheduledPublishes()).toMatchObject({
      claimed: 1,
      published: 0,
      failed: 0,
      retrying: 0,
      recordingFailed: 1,
    });
    expect(mocked.publish).toHaveBeenCalledOnce();
    expect(mocked.failure).not.toHaveBeenCalled();
    expect(mocked.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: "published" }),
    );
    expect(mocked.rpc).toHaveBeenLastCalledWith(
      "record_cron_heartbeat",
      expect.objectContaining({ summary: expect.objectContaining({ recordingFailed: 1 }) }),
    );
  },
);

it.each(["source hold", "preflight retry"])(
  "reports an unrecorded %s without claiming a saved queue outcome",
  async (outcome) => {
    mocked.publish.mockRejectedValue(
      outcome === "source hold"
        ? Object.assign(new Error("Source facts need review"), { sourceHold: true })
        : new PublishPreflightCapacityError(),
    );
    mocked.eq.mockRejectedValue(new Error("unavailable"));
    expect(await runScheduledPublishes()).toMatchObject({
      published: 0,
      failed: 0,
      retrying: 0,
      recordingFailed: 1,
    });
    expect(mocked.failure).toHaveBeenCalledOnce();
    expect(mocked.update).toHaveBeenCalledOnce();
    expect(mocked.rpc.mock.calls.at(-1)?.[0]).toBe("record_cron_heartbeat");
  },
);

it.each(["late success", "late rejection"])(
  "bounds a stalled queue write while preserving healthy rows and %s",
  async (outcome) => {
    vi.useFakeTimers();
    let resolve!: (value: { error: null }) => void;
    let reject!: (error: Error) => void;
    mocked.rpc.mockImplementation(async (name) => ({
      data:
        name === "claim_scheduled_publishes"
          ? [
              { id: "slow", user_id: "owner", project_id: "p", asset_id: "a", attempts: 1 },
              { id: "ready", user_id: "other", project_id: "p", asset_id: "b", attempts: 1 },
            ]
          : [],
      error: null,
    }));
    mocked.publish.mockResolvedValue({
      publishedAt: "2026-09-12T12:00:00Z",
      platform: "wordpress",
    });
    mocked.eq.mockImplementation((_column, id) =>
      id === "slow"
        ? new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          })
        : Promise.resolve({ error: null }),
    );
    try {
      const run = runScheduledPublishes();
      await vi.advanceTimersByTimeAsync(9_999);
      expect(mocked.publish).toHaveBeenCalledTimes(2);
      expect(mocked.update).toHaveBeenCalledTimes(2);
      expect(mocked.rpc.mock.calls.some(([name]) => name === "record_cron_heartbeat")).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const summary = await run;
      expect(summary).toMatchObject({
        claimed: 2,
        published: 1,
        recordingFailed: 1,
        retrying: 0,
        failed: 0,
      });
      expect(mocked.rpc.mock.calls.at(-1)?.[0]).toBe("record_cron_heartbeat");
      if (outcome === "late success") resolve({ error: null });
      else reject(new Error("late failure"));
      await vi.advanceTimersByTimeAsync(0);
      expect(summary).toMatchObject({ published: 1, recordingFailed: 1 });
      expect(mocked.failure).not.toHaveBeenCalled();
      expect(mocked.publish).toHaveBeenCalledTimes(2);
      expect(mocked.update).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  },
);

it.each(["acknowledged", "returned error", "rejected", "missing response"])(
  "reports %s heartbeat without changing publication outcome",
  async (outcome) => {
    mocked.publish.mockResolvedValue({
      publishedAt: "2026-09-12T12:00:00Z",
      platform: "wordpress",
    });
    const original = mocked.rpc.getMockImplementation()!;
    mocked.rpc.mockImplementation(async (name, ...args) => {
      if (name !== "record_cron_heartbeat") return original(name, ...args);
      if (outcome === "rejected") throw new Error("unavailable");
      if (outcome === "missing response") return undefined;
      return {
        data: null,
        error: outcome === "returned error" ? { message: "unavailable" } : null,
      };
    });
    expect(await runScheduledPublishes()).toMatchObject({
      published: 1,
      recordingFailed: 0,
      heartbeatRecorded: outcome === "acknowledged",
    });
    expect(mocked.publish).toHaveBeenCalledOnce();
    expect(mocked.update).toHaveBeenCalledOnce();
    expect(mocked.failure).not.toHaveBeenCalled();
  },
);

it("returns completed batch results when heartbeat acknowledgement stalls", async () => {
  vi.useFakeTimers();
  let finish!: (value: { data: null; error: null }) => void;
  const original = mocked.rpc.getMockImplementation()!;
  mocked.rpc.mockImplementation((name, ...args) =>
    name === "record_cron_heartbeat"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : original(name, ...args),
  );
  mocked.publish.mockResolvedValue({ publishedAt: "2026-09-12T12:00:00Z", platform: "wordpress" });
  try {
    const pending = runScheduledPublishes();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result).toMatchObject({ published: 1, heartbeatRecorded: false });
    finish({ data: null, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(result.heartbeatRecorded).toBe(false);
    expect(mocked.publish).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
