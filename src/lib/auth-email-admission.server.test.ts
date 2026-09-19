import { describe, expect, it, vi } from "vitest";
import { admitAuthEmail, type AuthEmailCounter } from "./auth-email-admission.server";

const now = Date.parse("2026-09-12T13:15:37Z");
const secret = "synthetic-test-key";
const email = "Person@example.invalid";
const source = "203.0.113.7";

// Records every rpc call and always reports a first-in-window count.
const counter = () => ({ rpc: vi.fn().mockResolvedValue({ data: 1, error: null }) });

// Stateful in-memory counter so accumulation and isolation can be exercised
// without any live database.
function memoryCounter() {
  const rows = new Map<string, number>();
  return {
    rows,
    rpc: vi.fn(
      async (_name: string, args: { p_bucket: string; p_key: string; p_window_start: string }) => {
        const cell = `${args.p_bucket}|${args.p_key}|${args.p_window_start}`;
        const next = (rows.get(cell) ?? 0) + 1;
        rows.set(cell, next);
        return { data: next, error: null };
      },
    ),
  };
}

const admit = (
  c: AuthEmailCounter,
  overrides: Partial<{
    email: string;
    source: string | null | undefined;
    action: "signup" | "recovery";
  }> = {},
  at = now,
) => admitAuthEmail(c, { email, source, action: "signup", secret, ...overrides }, at);

describe("per-source per-action authentication email admission", () => {
  it("normalizes recipients and stores only keyed digests in fixed UTC windows", async () => {
    const a = counter();
    const b = counter();
    await admit(a);
    await admit(b, { email: " person@EXAMPLE.invalid " });
    expect(a.rpc.mock.calls).toEqual(b.rpc.mock.calls);
    expect(a.rpc.mock.calls.map((c) => c[1].p_window_start)).toEqual([
      "2026-09-12T13:15:00.000Z",
      "2026-09-12T13:00:00.000Z",
      "2026-09-12T13:15:00.000Z",
      "2026-09-12T13:00:00.000Z",
    ]);
    for (const [, args] of a.rpc.mock.calls) expect(args.p_key).toMatch(/^[a-f0-9]{64}$/);
    const dumped = JSON.stringify(a.rpc.mock.calls);
    expect(dumped).not.toContain("example.invalid");
    expect(dumped).not.toContain(source);
    expect(dumped).not.toContain(secret);
  });

  it("keys sources per action while sharing recipient counters across actions", async () => {
    const rec = counter();
    await admit(rec, { source: "203.0.113.1", action: "signup" });
    await admit(rec, { source: "203.0.113.1", action: "recovery" });
    await admit(rec, { source: "203.0.113.2", action: "signup" });
    const signupA = rec.rpc.mock.calls.slice(0, 4);
    const recoveryA = rec.rpc.mock.calls.slice(4, 8);
    const signupB = rec.rpc.mock.calls.slice(8, 12);
    // Source counters run first: source keys (calls 0-1) differ by action and by source.
    expect(signupA[0][1].p_key).not.toBe(recoveryA[0][1].p_key);
    expect(signupA[1][1].p_key).not.toBe(recoveryA[1][1].p_key);
    expect(signupA[0][1].p_key).not.toBe(signupB[0][1].p_key);
    // Recipient keys (calls 2-3) are identical across actions and sources.
    expect(signupA[2][1].p_key).toBe(recoveryA[2][1].p_key);
    expect(signupA[3][1].p_key).toBe(recoveryA[3][1].p_key);
    expect(signupA[2][1].p_key).toBe(signupB[2][1].p_key);
  });

  it("denies many varied recipients from one source while other source and recovery stay usable", async () => {
    const db = memoryCounter();
    // First three signups (distinct recipients) from one source succeed in a minute.
    for (let i = 0; i < 3; i++)
      await expect(
        admit(db, { email: `u${i}@x.invalid`, action: "signup" }),
      ).resolves.toBeUndefined();
    // The fourth, still a fresh recipient, is stopped by the per-source-minute quota.
    await expect(admit(db, { email: "u3@x.invalid", action: "signup" })).rejects.toThrow(
      "Too many email requests",
    );
    // Recovery from the same source has its own quota and remains available.
    await expect(admit(db, { email: "u4@x.invalid", action: "recovery" })).resolves.toBeUndefined();
    // A different source is unaffected by the first source's exhaustion.
    await expect(
      admit(db, { email: "u5@x.invalid", source: "198.51.100.9", action: "signup" }),
    ).resolves.toBeUndefined();
  });

  it("rejects an over-quota source before it can create or touch any recipient counter", async () => {
    const db = memoryCounter();
    // Fill the per-source minute quota (3) with distinct recipients from one source.
    for (let i = 0; i < 3; i++)
      await expect(admit(db, { email: `seed${i}@x.invalid` })).resolves.toBeUndefined();

    // Snapshot the shared recipient counter rows; the rejected burst must leave
    // them untouched — no new rows and no incremented values.
    const recipientRows = () =>
      new Map([...db.rows].filter(([cell]) => cell.startsWith("auth_email_recipient_")));
    const before = recipientRows();
    expect(before.size).toBe(6); // minute + hour rows for the three seeded recipients

    // Many fresh recipient names from the now-exhausted source are each rejected
    // at the per-source quota before any recipient counter RPC runs.
    for (let i = 0; i < 8; i++)
      await expect(admit(db, { email: `fresh${i}@x.invalid` })).rejects.toThrow(
        "Too many email requests",
      );
    expect(recipientRows()).toEqual(before);

    // A different source can still request one of those fresh names: its recipient
    // allowance was never consumed by the exhausted source.
    await expect(
      admit(db, { email: "fresh0@x.invalid", source: "198.51.100.9" }),
    ).resolves.toBeUndefined();

    // The exhausted source keeps its separate per-action recovery quota.
    await expect(
      admit(db, { email: "fresh1@x.invalid", action: "recovery" }),
    ).resolves.toBeUndefined();
  });

  it("enforces the per-source hourly quota across separate minute windows", async () => {
    const db = memoryCounter();
    let at = now;
    for (let i = 0; i < 20; i++) {
      await expect(admit(db, { email: `h${i}@x.invalid` }, at)).resolves.toBeUndefined();
      at += 60_000;
    }
    await expect(admit(db, { email: "h20@x.invalid" }, at)).rejects.toThrow(
      "Too many email requests",
    );
  });

  it("canonicalizes source, groups IPv6 by /64, and never stores a raw address", async () => {
    const a = counter();
    const b = counter();
    const c = counter();
    // Equivalent notation and a rotated interface identifier inside the same /64.
    await admit(a, { source: "2001:db8:1:2::1" });
    await admit(b, { source: "2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd" });
    await admit(c, { source: "2001:db8:1:3::1" });
    // Source counters run first, so the source-minute key is the first rpc call.
    const sourceKey = (r: ReturnType<typeof counter>) => r.rpc.mock.calls[0][1].p_key;
    expect(sourceKey(a)).toBe(sourceKey(b));
    expect(sourceKey(a)).not.toBe(sourceKey(c));
    for (const [, args] of a.rpc.mock.calls) expect(args.p_key).toMatch(/^[a-f0-9]{64}$/);
    // The raw address contains colons, which never appear in a hex digest or bucket.
    expect(JSON.stringify(a.rpc.mock.calls)).not.toContain("2001:db8");
  });

  it("treats IPv4 and its IPv4-mapped IPv6 form as one source", async () => {
    const a = counter();
    const b = counter();
    await admit(a, { source: "192.0.2.55" });
    await admit(b, { source: "::ffff:192.0.2.55" });
    // Source-minute key is the first rpc call under the source-first order.
    expect(a.rpc.mock.calls[0][1].p_key).toBe(b.rpc.mock.calls[0][1].p_key);
  });

  it.each([
    undefined,
    null,
    "",
    "   ",
    "not-an-ip",
    "999.999.999.999",
    "12345",
    "example.com",
    "2001:db8::z",
  ])("refuses a missing or malformed source before any counter call: %s", async (bad) => {
    const db = counter();
    await expect(admit(db, { source: bad as string | null | undefined })).rejects.toThrow(
      "temporarily unavailable",
    );
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("refuses an unknown action before any counter call", async () => {
    const db = counter();
    await expect(admit(db, { action: "bogus" as never })).rejects.toThrow(
      "temporarily unavailable",
    );
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("fails before the counter if the server key is missing", async () => {
    const db = counter();
    await expect(
      admitAuthEmail(db as never, { email, source, action: "signup", secret: "" }, now),
    ).rejects.toThrow("temporarily unavailable");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([null, 0, -1, 1.5, "1", 2_147_483_648])("denies malformed counter %s", async (data) => {
    const db = counter();
    db.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(admit(db)).rejects.toThrow("temporarily unavailable");
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["response", "rejection"])("sanitizes database %s errors", async (mode) => {
    const db = counter();
    if (mode === "response")
      db.rpc.mockResolvedValueOnce({ data: 1, error: { message: "private diagnostic" } });
    else db.rpc.mockRejectedValueOnce(new Error("private diagnostic"));
    await expect(admit(db)).rejects.toThrow(
      "Email requests are temporarily unavailable. Please try again later.",
    );
  });

  it.each([
    // Rules run in order: source-minute (3), source-hour (20), recipient-minute
    // (1), recipient-hour (6). Each row exceeds the limit of the call it lands on.
    [4, 1],
    [21, 2],
    [2, 3],
    [7, 4],
  ])("stops at over-limit count %s on call %s", async (count, calls) => {
    const db = counter();
    for (let i = 1; i < calls; i++) db.rpc.mockResolvedValueOnce({ data: 1, error: null });
    db.rpc.mockResolvedValueOnce({ data: count, error: null });
    await expect(admit(db)).rejects.toThrow("Too many email requests");
    expect(db.rpc).toHaveBeenCalledTimes(calls);
  });

  it("accepts each limit inclusively", async () => {
    const db = counter();
    // Inclusive limits in rule order: source-minute 3, source-hour 20,
    // recipient-minute 1, recipient-hour 6.
    for (const data of [3, 20, 1, 6]) db.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(admit(db)).resolves.toBeUndefined();
  });
});
