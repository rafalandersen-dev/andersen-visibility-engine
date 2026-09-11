import { it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  run: vi.fn(),
  recover: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const b = {
      middleware: (items: unknown[]) => {
        h.registered.push(items);
        return b;
      },
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (a: unknown) => unknown) => (a: { data: unknown; context: unknown }) =>
        fn({ ...a, data: parse(a.data) }),
    };
    return b;
  },
}));
vi.mock("./backlink-monitoring-history.server", () => ({
  readBacklinkMonitoringHistory: h.read,
  recoverBacklinkMonitoringAccounting: h.recover,
}));
vi.mock("./backlink-monitoring-lifecycle.server", () => ({ runBacklinkMonitoring: h.run }));
import {
  readBacklinkMonitoringHistoryFn,
  requestBacklinkMonitoringFn,
  recoverBacklinkMonitoringAccountingFn,
} from "./backlink-monitoring.functions";
const user = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002";
const invoke = (fn: unknown, data: unknown) =>
  (fn as (a: unknown) => Promise<unknown>)({ data, context: { userId: user } });
const run = {
  projectId: "p",
  requestId,
  dateFrom: "2026-09-01",
  dateTo: "2026-09-02",
  includeSubdomains: false,
};
it("authenticates all endpoints and derives the actor from the session", async () => {
  expect(h.registered).toEqual([[h.auth], [h.auth], [h.auth]]);
  await invoke(readBacklinkMonitoringHistoryFn, { projectId: "p" });
  expect(h.read).toHaveBeenCalledWith(user, { projectId: "p" });
  await invoke(requestBacklinkMonitoringFn, run);
  expect(h.run).toHaveBeenCalledWith(user, run);
  await invoke(recoverBacklinkMonitoringAccountingFn, { projectId: "p", requestId });
  expect(h.recover).toHaveBeenCalledWith(user, { projectId: "p", requestId });
});
it.each(["userId", "target", "lease_token", "providerReportedCostUsd"])(
  "refuses client-supplied %s",
  (key) => {
    expect(() => invoke(requestBacklinkMonitoringFn, { ...run, [key]: "untrusted" })).toThrow();
  },
);
it("does not expose internal errors or imply a safe retry after an uncertain response", async () => {
  h.run.mockRejectedValueOnce(new Error("private-provider-detail"));
  expect(await invoke(requestBacklinkMonitoringFn, run)).toEqual({
    state: "unavailable",
    requestId,
  });
});
