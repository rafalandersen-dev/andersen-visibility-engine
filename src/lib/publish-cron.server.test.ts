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
  isPermanentPublishError: () => true,
}));
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
