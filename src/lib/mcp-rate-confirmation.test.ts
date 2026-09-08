import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, RATE_BUCKETS, RateLimitUnavailableError } from "./oauth.server";
afterEach(() => vi.restoreAllMocks());
describe("confirmed MCP write limits", () => {
  it.each([0, -1, NaN, Infinity, 1.5, 2147483648, null, "1"])(
    "denies malformed counter %s",
    async (count) => {
      await expect(
        checkRateLimit(RATE_BUCKETS.write, "synthetic-token", {
          nowMs: 0,
          failureMode: "deny",
          bump: vi.fn().mockResolvedValue(count),
        }),
      ).rejects.toBeInstanceOf(RateLimitUnavailableError);
    },
  );
  it("denies an unavailable counter without logging its exception or bearer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      checkRateLimit(RATE_BUCKETS.write, "private-bearer", {
        nowMs: 0,
        failureMode: "deny",
        bump: vi.fn().mockRejectedValue(new Error("private-database-response")),
      }),
    ).rejects.toThrow("The write limit could not be confirmed.");
    expect(log).not.toHaveBeenCalled();
  });
  it("preserves the actual configured write allowance and denial", async () => {
    const args = { nowMs: 0, failureMode: "deny" as const, bump: vi.fn().mockResolvedValue(30) };
    expect((await checkRateLimit(RATE_BUCKETS.write, "synthetic", args)).allowed).toBe(true);
    args.bump.mockResolvedValue(31);
    expect((await checkRateLimit(RATE_BUCKETS.write, "synthetic", args)).allowed).toBe(false);
  });
});
