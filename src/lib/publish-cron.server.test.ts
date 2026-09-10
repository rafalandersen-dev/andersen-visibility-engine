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
  it("claims only one row even if the caller asks for twenty, leaving unstarted rows pending", async () => {
    mocked.publish.mockResolvedValue({
      publishedAt: "2026-09-10T10:00:00Z",
      platform: "wordpress",
    });
    expect(await runScheduledPublishes(20)).toMatchObject({ claimed: 1, published: 1 });
    expect(mocked.rpc).toHaveBeenCalledWith("claim_scheduled_publishes", {
      batch_size: 1,
      max_attempts: 3,
    });
    expect(mocked.publish).toHaveBeenCalledExactlyOnceWith("owner", "a");
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
