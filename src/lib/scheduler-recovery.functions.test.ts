import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), middleware: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { kind: "authenticated" },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: (value: unknown) => {
        mocks.middleware(value);
        return builder;
      },
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { context: unknown; data?: unknown }) =>
        fn({ ...args, data: args.data === undefined ? undefined : validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./scheduler-recovery.server", () => ({ inspectSchedulerRecovery: mocks.inspect }));
vi.mock("./operational-notifications.server", () => ({
  listOperationalNotifications: vi.fn(),
  refreshOperationalNotifications: vi.fn(),
}));
import { getSchedulerRecoveryFn } from "./operational-notifications.functions";
const call = (data: unknown) =>
  (getSchedulerRecoveryFn as unknown as (args: unknown) => Promise<unknown>)({
    context: { userId: "authenticated-owner" },
    data,
  });
beforeEach(() => {
  mocks.inspect
    .mockReset()
    .mockResolvedValue({ state: "absent", checkedAt: "2026-09-07T10:00:00Z" });
});
describe("authenticated recovery inspection action", () => {
  it("retains authentication middleware and derives the owner from the session", async () => {
    await call({ projectId: "project" });
    expect(
      mocks.middleware.mock.calls.every(
        ([value]) => JSON.stringify(value) === JSON.stringify([{ kind: "authenticated" }]),
      ),
    ).toBe(true);
    expect(mocks.inspect).toHaveBeenCalledWith("authenticated-owner", "project");
  });
  it("refuses user, token and control overrides before source access", () => {
    expect(() =>
      call({ projectId: "project", userId: "other", reset: true, leaseToken: "untrusted" }),
    ).toThrow();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("hides internal errors and foreign-project distinctions", async () => {
    for (const message of ["private provider response", "recovery_project_unavailable"]) {
      mocks.inspect.mockRejectedValueOnce(new Error(message));
      await expect(call({ projectId: "project" })).rejects.toThrow(
        "Saved automation records are temporarily unavailable.",
      );
    }
  });
});
