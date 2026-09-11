import { describe, it, expect, vi } from "vitest";
import { startTechnicalRun, stepTechnicalRun } from "./technical-crawl.server";
import { robotsEvidence } from "./technical-robots";
import { startTechnicalCrawl } from "./technical-crawl";
import { fitTechnicalCrawlState, parseTechnicalCrawlState } from "./technical-crawl-state";
const user = "00000000-0000-4000-8000-000000000001",
  runId = "00000000-0000-4000-8000-000000000002",
  lease = "00000000-0000-4000-8000-000000000003";
const now = "2026-09-11T00:00:00.000Z",
  target = { projectId: "p", runId };
function setup() {
  let record = {
    user_id: user,
    project_id: "p",
    run_id: runId,
    website_value: "https://example.test",
    origin: "https://example.test",
    status: "preparing",
    revision: 1,
    state: {} as unknown,
    created_at: now,
    updated_at: now,
    lease_token: lease,
    lease_until: "2026-09-11T00:01:00Z",
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_technical_crawl_context")
      return { data: { website: "https://example.test", revision: 1 }, error: null };
    if (name === "save_technical_crawl_step") {
      if (record.status === "cancelled") return { data: false, error: null };
      record = { ...record, status: args.p_status as string, state: args.p_state, revision: 2 };
      return { data: true, error: null };
    }
    return { data: record, error: null };
  });
  const robots = vi.fn(async () => robotsEvidence(404));
  const fetcher = vi.fn(() => vi.fn(async () => ({ state: "failed" as const })));
  return {
    rpc,
    robots,
    fetcher,
    now: () => new Date(now),
    cancel: () => {
      record.status = "cancelled";
    },
    malformed: () => {
      record.status = "running";
      record.state = { origin: "https://other.test" };
    },
  };
}
describe("authenticated crawl controller core", () => {
  it("uses canonical server website and rejects browser owner/URL overrides", async () => {
    const d = setup();
    const result = await startTechnicalRun(user, target, d.rpc);
    expect(result.origin).toBe("https://example.test");
    expect(JSON.stringify(result)).not.toContain(lease);
    d.rpc.mockClear();
    await expect(
      startTechnicalRun(user, { ...target, website: "https://other.test" }, d.rpc),
    ).rejects.toThrow();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("claims before fetching and returns only the persisted state", async () => {
    const d = setup();
    const result = await stepTechnicalRun(user, target, d);
    expect(d.rpc.mock.calls[0][0]).toBe("claim_technical_crawl");
    expect(d.robots).toHaveBeenCalledWith("https://example.test");
    expect(result?.status).toBe("running");
    expect(result?.revision).toBe(2);
    expect(JSON.stringify(result)).not.toContain(lease);
  });
  it("does not turn a rejected late save into success", async () => {
    const d = setup();
    d.robots.mockImplementation(async () => {
      d.cancel();
      return robotsEvidence(404);
    });
    const result = await stepTechnicalRun(user, target, d);
    expect(result?.status).toBe("cancelled");
    expect(result?.state).toBeNull();
  });
  it("holds malformed saved state without external requests", async () => {
    const d = setup();
    d.malformed();
    const result = await stepTechnicalRun(user, target, d);
    expect(result?.status).toBe("failed");
    expect(d.robots).not.toHaveBeenCalled();
    expect(d.fetcher).not.toHaveBeenCalled();
  });
  it("does not execute a step when another lease owns it", async () => {
    const d = setup();
    d.rpc.mockResolvedValueOnce({ data: null as never, error: null });
    await stepTechnicalRun(user, target, d);
    expect(d.robots).not.toHaveBeenCalled();
    expect(d.fetcher).not.toHaveBeenCalled();
  });
  it("bounds saved queue state with explicit partial coverage", () => {
    const state = startTechnicalCrawl({
      siteUrl: "https://example.test",
      now,
      robots: robotsEvidence(404),
      robotsFetchedAt: now,
    });
    state.queue = Array.from({ length: 2000 }, (_, i) => ({
      url: "https://example.test/" + i + "x".repeat(2000),
      depth: null,
    }));
    const fitted = fitTechnicalCrawlState(state);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).byteLength).toBeLessThanOrEqual(
      2500000,
    );
    expect(fitted.status).toBe("completed");
    expect(fitted.coverageLimits).toContain("storage_limit");
    expect(parseTechnicalCrawlState(fitted, state.origin)).toEqual(fitted);
  });
});
