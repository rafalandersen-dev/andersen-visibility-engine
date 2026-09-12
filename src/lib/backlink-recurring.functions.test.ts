import { expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  middleware: [] as unknown[][],
  read: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const builder = {
      middleware: (v: unknown[]) => {
        h.middleware.push(v);
        return builder;
      },
      inputValidator: (v: typeof parse) => {
        parse = v;
        return builder;
      },
      handler: (fn: (v: unknown) => unknown) => (v: { data: unknown; context: unknown }) =>
        fn({ ...v, data: parse(v.data) }),
    };
    return builder;
  },
}));
vi.mock("./backlink-recurring-config.server", () => ({
  readBacklinkMonitorConfig: h.read,
  saveBacklinkMonitorConfig: h.save,
}));
import {
  readBacklinkMonitorConfigFn,
  saveBacklinkMonitorConfigFn,
} from "./backlink-recurring.functions";
const user = "00000000-0000-4000-8000-000000000001",
  change = "00000000-0000-4000-8000-000000000002";
const input = {
  projectId: "p",
  changeId: change,
  expectedRevision: 0,
  expectedWebsite: "https://example.test",
  settings: {
    enabled: false,
    cadence: "weekly",
    lookbackDays: 7,
    includeSubdomains: false,
    monthlyCapMicrousd: 0,
  },
};
const invoke = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: user } });
it("authenticates both operations and takes the owner only from the verified session", async () => {
  expect(h.middleware).toEqual([[h.auth], [h.auth]]);
  await invoke(readBacklinkMonitorConfigFn, { projectId: "p" });
  expect(h.read).toHaveBeenCalledWith(user, { projectId: "p" });
  await invoke(saveBacklinkMonitorConfigFn, input);
  expect(h.save).toHaveBeenCalledWith(user, input);
});
it.each(["userId", "lease", "nextDueAt", "monitorId"])(
  "rejects supplied operational authority %s",
  (key) => {
    expect(() => invoke(saveBacklinkMonitorConfigFn, { ...input, [key]: "forged" })).toThrow();
  },
);
it("does not expose private backend details or automatically retry an uncertain save", async () => {
  h.save.mockClear().mockRejectedValueOnce(Error("private internal detail"));
  expect(await invoke(saveBacklinkMonitorConfigFn, input)).toEqual({ state: "unavailable" });
  expect(h.save).toHaveBeenCalledOnce();
});
