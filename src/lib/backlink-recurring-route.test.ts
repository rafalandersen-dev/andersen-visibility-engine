import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  backlinks: vi.fn(),
  weekly: vi.fn(),
  monthly: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("./backlink-recurring-executor.server", () => ({
  runBacklinkRecurringScheduler: mocks.backlinks,
}));
vi.mock("./weekly-executor.server", () => ({ runWeeklyAutoScheduler: mocks.weekly }));
vi.mock("./auto-scheduler.server", () => ({ runMonthlyAutoScheduler: mocks.monthly }));
import { Route } from "@/routes/api.auto-scheduler.run";
const post = (
  Route.options as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const call = (auth?: string, engine = "backlinks") =>
  post({
    request: new Request(`https://example.test/api/auto-scheduler/run?engine=${engine}`, {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: "synthetic-scheduler-secret", error: null });
  mocks.backlinks.mockResolvedValue({ considered: 1, stored: 1, held: 0, unknown: 0, skipped: 0 });
  mocks.weekly.mockResolvedValue({ processed: 0 });
  mocks.monthly.mockResolvedValue({ planned: 0, workspaces: 0, projects: [] });
});
it("rejects anonymous access before any database or worker invocation", async () => {
  expect((await call()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.backlinks).not.toHaveBeenCalled();
});
it("rejects an incorrect secret without selecting any worker", async () => {
  expect((await call("Bearer wrong")).status).toBe(403);
  expect(mocks.backlinks).not.toHaveBeenCalled();
  expect(mocks.weekly).not.toHaveBeenCalled();
  expect(mocks.monthly).not.toHaveBeenCalled();
});
it("fails closed for an unavailable secret", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  const r = await call("Bearer synthetic-scheduler-secret");
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("private");
  expect(mocks.backlinks).not.toHaveBeenCalled();
});
it("selects only the requested private backlinks worker and returns aggregate counts", async () => {
  const r = await call("Bearer synthetic-scheduler-secret");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    ok: true,
    engine: "backlinks",
    considered: 1,
    stored: 1,
    held: 0,
    unknown: 0,
    skipped: 0,
  });
  expect(mocks.backlinks).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.weekly).not.toHaveBeenCalled();
  expect(mocks.monthly).not.toHaveBeenCalled();
});
it("does not expose internal worker errors or retry a failed worker", async () => {
  mocks.backlinks.mockRejectedValue(Error("private target and transport"));
  const r = await call("Bearer synthetic-scheduler-secret");
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("private");
  expect(mocks.backlinks).toHaveBeenCalledOnce();
});
it.each(["weekly", "monthly"])("preserves selection of the existing %s engine", async (engine) => {
  expect((await call("Bearer synthetic-scheduler-secret", engine)).status).toBe(200);
  expect(mocks[engine as "weekly" | "monthly"]).toHaveBeenCalledOnce();
  expect(mocks.backlinks).not.toHaveBeenCalled();
});
it("refuses an unknown engine after authentication", async () => {
  expect((await call("Bearer synthetic-scheduler-secret", "invalid")).status).toBe(400);
  expect(mocks.backlinks).not.toHaveBeenCalled();
  expect(mocks.monthly).not.toHaveBeenCalled();
});
