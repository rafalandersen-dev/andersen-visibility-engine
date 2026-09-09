import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ status: vi.fn(), run: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./owner-benchmark.server", () => ({
  getOwnerBenchmarkStatus: mocks.status,
  runOwnerBenchmarkStage: mocks.run,
}));
import { getOwnerBenchmarkStatusFn, runOwnerBenchmarkStageFn } from "./owner-benchmark.functions";
const user = "00000000-0000-4000-8000-000000000011",
  runId = "00000000-0000-4000-8000-000000000012";
const call = (fn: unknown, role: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { userId: user, supabase: { rpc: vi.fn(async () => role) } },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ state: "ready" });
  mocks.run.mockResolvedValue({ outcome: "completed_stage" });
});
describe("owner benchmark authorization boundary", () => {
  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: "unavailable" } },
  ])(
    "refuses absent or unverified owner roles before reading configuration or generating",
    async (role) => {
      await expect(call(getOwnerBenchmarkStatusFn, role, { runId })).rejects.toThrow("Forbidden");
      await expect(call(runOwnerBenchmarkStageFn, role, { runId, stage: "scan" })).rejects.toThrow(
        "Forbidden",
      );
      expect(mocks.status).not.toHaveBeenCalled();
      expect(mocks.run).not.toHaveBeenCalled();
    },
  );
  it("takes identity from the authenticated server context and only forwards the chosen stage", async () => {
    await call(runOwnerBenchmarkStageFn, { data: true, error: null }, { runId, stage: "article" });
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(user, runId, "article");
  });
  it.each([
    { userId: "injected" },
    { attempt: { requestId: "injected" } },
    { snapshot: {} },
    { provider: "alternate" },
    { retry: true },
  ])("rejects injected privileged input %j", (injection) => {
    expect(() =>
      call(
        runOwnerBenchmarkStageFn,
        { data: true, error: null },
        { runId, stage: "scan", ...injection },
      ),
    ).toThrow();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("returns an uncertain outcome without exposing server or supplier errors", async () => {
    mocks.run.mockRejectedValue(new Error("private failure details"));
    expect(
      await call(runOwnerBenchmarkStageFn, { data: true, error: null }, { runId, stage: "image" }),
    ).toEqual({ outcome: "uncertain" });
  });
  it("status only reads and cannot start a test", async () => {
    await call(getOwnerBenchmarkStatusFn, { data: true, error: null }, { runId });
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith(user, runId);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
