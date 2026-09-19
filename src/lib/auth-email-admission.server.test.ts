import { describe, expect, it, vi } from "vitest";
import { admitAuthEmail } from "./auth-email-admission.server";
const now = Date.parse("2026-09-12T13:15:37Z");
const secret = "synthetic-test-key";
const email = "Person@example.invalid";
const counter = () => ({ rpc: vi.fn().mockResolvedValue({ data: 1, error: null }) });
describe("shared authentication email admission", () => {
  it("normalizes recipients and stores only keyed digests in fixed UTC windows", async () => {
    const a = counter(),
      b = counter();
    await admitAuthEmail(a, email, secret, now);
    await admitAuthEmail(b, " person@EXAMPLE.invalid ", secret, now);
    expect(a.rpc.mock.calls).toEqual(b.rpc.mock.calls);
    expect(a.rpc.mock.calls.map((c) => c[1].p_window_start)).toEqual([
      "2026-09-12T13:15:00.000Z",
      "2026-09-12T13:00:00.000Z",
      "2026-09-12T13:00:00.000Z",
    ]);
    for (const [, args] of a.rpc.mock.calls) expect(args.p_key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(a.rpc.mock.calls)).not.toContain("example.invalid");
    expect(JSON.stringify(a.rpc.mock.calls)).not.toContain(secret);
  });
  it("separates recipient counters while sharing the service cap", async () => {
    const a = counter(),
      b = counter();
    await admitAuthEmail(a, email, secret, now);
    await admitAuthEmail(b, "another@example.invalid", secret, now);
    expect(a.rpc.mock.calls[0][1].p_key).not.toBe(b.rpc.mock.calls[0][1].p_key);
    expect(a.rpc.mock.calls[2][1].p_key).toBe(b.rpc.mock.calls[2][1].p_key);
  });
  it.each([null, 0, -1, 1.5, "1", 2_147_483_648])("denies malformed counter %s", async (data) => {
    const db = counter();
    db.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(admitAuthEmail(db, email, secret, now)).rejects.toThrow("temporarily unavailable");
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["response", "rejection"])("sanitizes database %s errors", async (mode) => {
    const db = counter();
    if (mode === "response")
      db.rpc.mockResolvedValueOnce({ data: 1, error: { message: "private diagnostic" } });
    else db.rpc.mockRejectedValueOnce(new Error("private diagnostic"));
    await expect(admitAuthEmail(db, email, secret, now)).rejects.toThrow(
      "Email requests are temporarily unavailable. Please try again later.",
    );
  });
  it.each([
    [2, 1],
    [7, 2],
    [121, 3],
  ])("stops at over-limit count %s", async (count, calls) => {
    const db = counter();
    for (let i = 1; i < calls; i++) db.rpc.mockResolvedValueOnce({ data: 1, error: null });
    db.rpc.mockResolvedValueOnce({ data: count, error: null });
    await expect(admitAuthEmail(db, email, secret, now)).rejects.toThrow("Too many email requests");
    expect(db.rpc).toHaveBeenCalledTimes(calls);
  });
  it("accepts each limit inclusively", async () => {
    const db = counter();
    for (const data of [1, 6, 120]) db.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(admitAuthEmail(db, email, secret, now)).resolves.toBeUndefined();
  });
  it("fails before the counter if the server key is missing", async () => {
    const db = counter();
    await expect(admitAuthEmail(db, email, "", now)).rejects.toThrow("temporarily unavailable");
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
