import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), run: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("./ga4-daily.server", () => ({ runGa4DailySyncProd: mocks.run }));
import { Route } from "@/routes/api.google.analytics.daily-sync";
const post = (
  Route.options as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const call = (auth?: string) =>
  post({
    request: new Request("https://example.test/api/google/analytics/daily-sync", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    }),
  });
const counts = {
  targets: 1,
  synced: 1,
  skippedFresh: 0,
  fetchFailed: 0,
  saveFailed: 0,
  errors: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: "synthetic-ga4-secret", error: null });
  mocks.run.mockResolvedValue(counts);
});
it("rejects a missing or wrong Bearer before running", async () => {
  expect((await call()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect((await call("Bearer wrong")).status).toBe(403);
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("ga4_daily_cron_secret");
});
it("fails closed when the vault secret cannot be read, without leaking the error", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
  const r = await call("Bearer synthetic-ga4-secret");
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("private detail");
  expect(mocks.run).not.toHaveBeenCalled();
});
it("answers 200 only when every due target was fetched and saved", async () => {
  const r = await call("Bearer synthetic-ga4-secret");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, ...counts });
});
it("answers 502 with counts when a fetch or save failed", async () => {
  mocks.run.mockResolvedValue({ ...counts, synced: 0, fetchFailed: 1, errors: { expired: 1 } });
  const r = await call("Bearer synthetic-ga4-secret");
  expect(r.status).toBe(502);
  expect(await r.json()).toMatchObject({
    ok: false,
    synced: 0,
    fetchFailed: 1,
    errors: { expired: 1 },
  });
});
it("hides a thrown run error behind a finite code", async () => {
  mocks.run.mockRejectedValue(new Error("raw provider text"));
  const r = await call("Bearer synthetic-ga4-secret");
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("raw provider text");
});
