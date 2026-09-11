import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api.notifications.sweep";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sweep: vi.fn(), email: vi.fn(), team: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("./operational-notifications.server", () => ({
  runOperationalNotificationSweep: mocks.sweep,
}));
vi.mock("./operational-email.server", () => ({ runOperationalEmailWorker: mocks.email }));
vi.mock("./project-team-delivery.server", () => ({ runTeamNotificationWorker: mocks.team }));
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
  vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "false");
  vi.stubEnv("TEAM_NOTIFICATION_EMAIL_ENABLED", "false");
  mocks.team.mockResolvedValue({ enabled: true, queued: 1, processed: 1, failed: 0 });
  mocks.email.mockResolvedValue({ enabled: true, processed: 1 });
  mocks.rpc.mockResolvedValue({ data: "synthetic-cron-secret", error: null });
  mocks.sweep.mockResolvedValue({ scanned: 2, failed: 0, stale: 0 });
});
afterEach(() => vi.unstubAllEnvs());
describe("private notification sweep route", () => {
  it("requires a separate team gate and private authentication", async () => {
    await call("Bearer synthetic-cron-secret");
    expect(mocks.team).not.toHaveBeenCalled();
    vi.stubEnv("TEAM_NOTIFICATION_EMAIL_ENABLED", "true");
    expect((await call()).status).toBe(401);
    expect(mocks.team).not.toHaveBeenCalled();
    expect((await call("Bearer synthetic-cron-secret")).status).toBe(200);
    expect(mocks.team).toHaveBeenCalledTimes(1);
  });
  it("keeps email off without the release gate", async () => {
    await call("Bearer synthetic-cron-secret");
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("requires private authorization even when email is enabled", async () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "true");
    expect((await call()).status).toBe(401);
    expect(mocks.email).not.toHaveBeenCalled();
    expect((await call("Bearer synthetic-cron-secret")).status).toBe(200);
    expect(mocks.email).toHaveBeenCalledTimes(1);
  });
  it("reports a worker failure without exposing transport details", async () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "true");
    mocks.email.mockRejectedValueOnce(new Error("private transport details"));
    const response = await call("Bearer synthetic-cron-secret");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private transport details");
  });
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
