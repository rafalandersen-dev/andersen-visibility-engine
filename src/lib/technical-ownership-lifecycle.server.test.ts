import { describe, it, expect, vi } from "vitest";
import {
  issueCrawlOwnership,
  readCrawlOwnership,
  verifyCrawlOwnership,
  revokeCrawlOwnership,
} from "./technical-ownership-lifecycle.server";
const owner = "00000000-0000-4000-8000-000000000001",
  attempt = "00000000-0000-4000-8000-000000000002";
const now = Date.parse("2026-09-11T12:00:00Z"),
  target = { projectId: "p" };
function setup() {
  const proof = {
    user_id: owner,
    project_id: "p",
    website_value: "https://example.test/path",
    origin: "https://example.test",
    token: "a".repeat(64),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 86400000).toISOString(),
    verified_until: null,
    revoked_at: null,
    attempt_token: attempt,
    attempt_until: new Date(now + 15000).toISOString(),
  };
  const rpc = vi.fn(
    async (
      name: string,
      _args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: unknown }> => ({
      data:
        name === "read_technical_crawl_context"
          ? { website: proof.website_value }
          : name === "finish_technical_ownership_verification"
            ? true
            : proof,
      error: null,
    }),
  );
  const verify = vi.fn(async () => true);
  return { proof, rpc, verify, now: () => now };
}
describe("authenticated saved ownership lifecycle", () => {
  it("issues against the saved website with a server-generated token", async () => {
    const d = setup();
    const result = await issueCrawlOwnership(owner, target, d.rpc);
    expect(d.rpc).toHaveBeenLastCalledWith(
      "issue_technical_crawl_ownership",
      expect.objectContaining({
        p_user: owner,
        p_project: "p",
        p_website: d.proof.website_value,
        p_origin: d.proof.origin,
        p_token: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(result.name).toBe("_milo-crawl.example.test");
    expect(result).not.toHaveProperty("attempt_token");
  });
  it("verifies only the saved admitted token and commits the exact attempt", async () => {
    const d = setup();
    await verifyCrawlOwnership(owner, target, d);
    expect(d.verify).toHaveBeenCalledExactlyOnceWith(d.proof.origin, d.proof.token);
    expect(d.rpc).toHaveBeenNthCalledWith(2, "finish_technical_ownership_verification", {
      p_user: owner,
      p_project: "p",
      p_attempt: attempt,
      p_verified: true,
    });
    expect(d.rpc).toHaveBeenLastCalledWith("read_technical_crawl_ownership", {
      p_user: owner,
      p_project: "p",
    });
  });
  it("rejects browser proof fields before any RPC or DNS", async () => {
    const d = setup();
    await expect(
      verifyCrawlOwnership(owner, { ...target, token: d.proof.token, verified: true }, d),
    ).rejects.toThrow();
    expect(d.rpc).not.toHaveBeenCalled();
    expect(d.verify).not.toHaveBeenCalled();
  });
  it.each(["scope", "stale", "revoked", "website"])(
    "rejects %s admitted records before DNS",
    async (kind) => {
      const d = setup();
      if (kind === "scope") d.proof.user_id = attempt;
      if (kind === "stale") d.proof.attempt_until = new Date(now + 1000).toISOString();
      if (kind === "revoked") Object.assign(d.proof, { revoked_at: new Date(now).toISOString() });
      if (kind === "website") d.proof.website_value = "https://other.test";
      await expect(verifyCrawlOwnership(owner, target, d)).rejects.toThrow();
      expect(d.verify).not.toHaveBeenCalled();
    },
  );
  it("records DNS uncertainty as false without replaying verification", async () => {
    const d = setup();
    d.verify.mockRejectedValueOnce(new Error("private resolver detail"));
    await verifyCrawlOwnership(owner, target, d);
    expect(d.verify).toHaveBeenCalledOnce();
    expect(d.rpc).toHaveBeenNthCalledWith(
      2,
      "finish_technical_ownership_verification",
      expect.objectContaining({ p_verified: false }),
    );
  });
  it("refuses failed admission before DNS and sanitizes database errors", async () => {
    const d = setup();
    d.rpc.mockResolvedValueOnce({ data: null, error: { message: "private detail" } });
    await expect(verifyCrawlOwnership(owner, target, d)).rejects.toThrow(
      "technical_ownership_unavailable",
    );
    expect(d.verify).not.toHaveBeenCalled();
  });
  it("reads and revokes without DNS", async () => {
    const d = setup();
    await readCrawlOwnership(owner, target, d.rpc);
    await revokeCrawlOwnership(owner, target, d.rpc);
    expect(d.rpc).toHaveBeenCalledWith("revoke_technical_crawl_ownership", {
      p_user: owner,
      p_project: "p",
    });
    expect(d.verify).not.toHaveBeenCalled();
  });
});
