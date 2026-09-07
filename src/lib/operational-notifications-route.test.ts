import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api.notifications.sweep";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sweep: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("./operational-notifications.server", () => ({
  runOperationalNotificationSweep: mocks.sweep,
}));
const post = (
  Route.options as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const call = (auth?: string) =>
  post({
    request: new Request("https://example.com/api/notifications/sweep", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: "synthetic-cron-secret", error: null });
  mocks.sweep.mockResolvedValue({ scanned: 2, failed: 0, stale: 0 });
});
describe("private notification sweep route", () => {
  it("rejects an anonymous request before DB access", async () => {
    expect((await call()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
  it("rejects a wrong secret without running the sweep", async () => {
    expect((await call("Bearer wrong")).status).toBe(403);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
  it("fails closed when configuration is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    const r = await call("Bearer something");
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private");
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
  it("returns counts only after authenticated server authorization", async () => {
    const r = await call("Bearer synthetic-cron-secret");
    expect(await r.json()).toEqual({ ok: true, scanned: 2, failed: 0, stale: 0 });
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
  });
});
