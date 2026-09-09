import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  capFor,
  claimAiUsage,
  remainingAiUsage,
  UsageLimitError,
  UsageUnavailableError,
  assertImageGenerationAllowed,
  AI_USAGE_LOOKUP_TIMEOUT_MS,
} from "./ai-usage.server";
import { generateContentCore, generateOpportunitiesCore } from "./ai.functions";
import { generateArticleImageCore } from "./image-gen.functions";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  plan: vi.fn(),
  owner: vi.fn(),
  usage: vi.fn(),
  model: vi.fn(),
  image: vi.fn(),
}));
vi.mock("./entitlements.server", () => ({ resolveEntitledPlan: mocks.plan }));
vi.mock("ai", () => ({ generateText: mocks.model }));
vi.mock("./image-gen.server", () => ({
  generateImageBytes: mocks.image,
  generateImageResult: mocks.image,
  ImageGenError: class extends Error {},
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from(table: string) {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: table === "user_roles" ? mocks.owner : mocks.usage,
      };
      return query;
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_METERING_ENFORCED", "true");
  mocks.plan.mockResolvedValue("pro");
  mocks.owner.mockResolvedValue({ data: null, error: null });
  mocks.usage.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const args = { userId: "user", bucket: "contentGeneration" as const };
const cap = capFor("pro", "contentGeneration");
const confirmation = (used = 1, allowed = true, rpcCap = cap) => ({
  data: [{ used, cap: rpcCap, allowed }],
  error: null,
});

describe("bounded usage admission", () => {
  it.each(["plan", "owner"] as const)(
    "stops a hanging %s lookup before a quota mutation, even after a late answer",
    async (kind) => {
      vi.useFakeTimers();
      let finish!: (result: unknown) => void;
      mocks[kind].mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const result = expect(claimAiUsage(args)).rejects.toBeInstanceOf(UsageUnavailableError);
      await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS + 1);
      await result;
      finish(kind === "plan" ? "pro" : { data: { role: "owner" }, error: null });
      await vi.runAllTimersAsync();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    { kind: "text", core: generateContentCore, enforcement: "true" },
    { kind: "image", core: generateArticleImageCore, enforcement: "true" },
    { kind: "text", core: generateContentCore, enforcement: "false" },
    { kind: "image", core: generateArticleImageCore, enforcement: "false" },
  ] as const)(
    "never starts $kind work after a late claim in enforcement mode $enforcement",
    async ({ core, enforcement }) => {
      vi.stubEnv("AI_METERING_ENFORCED", enforcement);
      vi.useFakeTimers();
      let reply!: (result: unknown) => void;
      let claimEntered!: () => void;
      const entered = new Promise<void>((resolve) => {
        claimEntered = resolve;
      });
      mocks.rpc.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            reply = resolve;
            claimEntered();
          }),
      );
      const result = expect(core("user", {} as never)).rejects.toBeInstanceOf(
        UsageUnavailableError,
      );
      await entered;
      await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS + 1);
      await result;
      const claimedCap = mocks.rpc.mock.calls[0][1].p_cap;
      reply(confirmation(1, true, claimedCap));
      await vi.runAllTimersAsync();
      expect(mocks.model).not.toHaveBeenCalled();
      expect(mocks.image).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("bounds the remaining-usage read without turning a timeout into free quota", async () => {
    vi.useFakeTimers();
    mocks.usage.mockImplementationOnce(() => new Promise(() => {}));
    const result = expect(remainingAiUsage(args)).rejects.toBeInstanceOf(UsageUnavailableError);
    await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS + 1);
    await result;
  });
  it("bounds the image entitlement gate before claiming or generating", async () => {
    vi.useFakeTimers();
    mocks.plan.mockImplementationOnce(() => new Promise(() => {}));
    const result = expect(assertImageGenerationAllowed({ userId: "user" })).rejects.toBeInstanceOf(
      UsageUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS + 1);
    await result;
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
});

describe("confirmed usage before paid work", () => {
  it("accepts a valid atomic claim and resolves plan server-side", async () => {
    mocks.rpc.mockResolvedValue(confirmation(2));
    await expect(
      claimAiUsage({ ...args, units: 2, now: new Date("2026-09-30T23:59:59Z") }),
    ).resolves.toEqual({ used: 2, cap, allowed: true });
    expect(mocks.plan).toHaveBeenCalledWith("user");
    expect(mocks.rpc).toHaveBeenCalledWith("claim_ai_usage", {
      p_user: "user",
      p_period: "2026-09",
      p_bucket: "contentGeneration",
      p_cap: cap,
      p_units: 2,
    });
  });

  it.each(["true", "false", ""])(
    "blocks infrastructure failure in enforcement mode %s",
    async (flag) => {
      vi.stubEnv("AI_METERING_ENFORCED", flag);
      mocks.rpc.mockResolvedValue({ data: null, error: { message: "private provider detail" } });
      await expect(claimAiUsage(args)).rejects.toBeInstanceOf(UsageUnavailableError);
      mocks.rpc.mockRejectedValue(new Error("private provider detail"));
      await expect(claimAiUsage(args)).rejects.toMatchObject({ code: "usage_unavailable" });
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private provider detail",
      );
    },
  );

  it.each([
    null,
    [],
    {},
    [
      { used: 1, cap, allowed: true },
      { used: 2, cap, allowed: true },
    ],
    [null],
    [{ used: 1, cap, allowed: "true" }],
    [{ used: "1", cap, allowed: true }],
    [{ used: -1, cap, allowed: true }],
    [{ used: 0.5, cap, allowed: true }],
    [{ used: NaN, cap, allowed: true }],
    [{ used: Infinity, cap, allowed: true }],
    [{ used: 0, cap, allowed: true }],
    [{ used: cap + 1, cap, allowed: true }],
    [{ used: 1, cap: -1, allowed: true }],
    [{ used: 0, cap, allowed: false }],
  ])("rejects a missing or inconsistent confirmation %#", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(claimAiUsage(args)).rejects.toBeInstanceOf(UsageUnavailableError);
  });

  it("keeps an exhausted allowance distinct from an unavailable meter", async () => {
    mocks.rpc.mockResolvedValue(confirmation(cap, false));
    await expect(claimAiUsage(args)).rejects.toMatchObject({ code: "usage_limit", used: cap, cap });
    await expect(claimAiUsage(args)).rejects.toBeInstanceOf(UsageLimitError);
  });

  it("refuses a first image claim against zero, including an old RPC incorrectly allowing it", async () => {
    mocks.plan.mockResolvedValue("starter");
    mocks.rpc.mockResolvedValue(confirmation(0, false, 0));
    await expect(claimAiUsage({ ...args, bucket: "imageGeneration" })).rejects.toMatchObject({
      code: "usage_limit",
      cap: 0,
    });
    mocks.rpc.mockResolvedValue(confirmation(1, true, 0));
    await expect(claimAiUsage({ ...args, bucket: "imageGeneration" })).rejects.toBeInstanceOf(
      UsageUnavailableError,
    );
  });

  it.each([0, -1, 0.1, NaN, Infinity, 2147483648])(
    "rejects invalid units %s before touching the meter",
    async (units) => {
      await expect(claimAiUsage({ ...args, units })).rejects.toBeInstanceOf(RangeError);
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("requires a valid record in beta, while background work always enforces the cap", async () => {
    vi.stubEnv("AI_METERING_ENFORCED", "false");
    mocks.rpc.mockResolvedValue(confirmation(cap + 1, true, -1));
    await expect(claimAiUsage(args)).resolves.toMatchObject({ used: cap + 1, cap, allowed: true });
    mocks.rpc.mockResolvedValue(confirmation(cap, false));
    await expect(claimAiUsage({ ...args, enforceLimit: true })).rejects.toBeInstanceOf(
      UsageLimitError,
    );
    expect(mocks.rpc.mock.calls[1][1].p_cap).toBe(cap);
  });

  it("does not invoke either text or image providers after a failed claim", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(generateContentCore("user", {} as never)).rejects.toBeInstanceOf(
      UsageUnavailableError,
    );
    await expect(generateOpportunitiesCore("user", {} as never)).rejects.toBeInstanceOf(
      UsageUnavailableError,
    );
    await expect(generateArticleImageCore("user", {} as never)).rejects.toBeInstanceOf(
      UsageUnavailableError,
    );
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it("passes background enforcement to the real content/discovery cores in beta", async () => {
    vi.stubEnv("AI_METERING_ENFORCED", "false");
    mocks.rpc.mockImplementation(async (fn, params) => ({
      error: null,
      data: [
        {
          used: params.p_cap,
          allowed: false,
          cap: params.p_cap,
          ...(fn === "claim_generation_usage"
            ? { receipt_id: params.p_id, claim_status: "denied" }
            : {}),
        },
      ],
    }));
    await expect(
      generateContentCore("user", {} as never, { enforceLimit: true }),
    ).rejects.toBeInstanceOf(UsageLimitError);
    await expect(
      generateOpportunitiesCore("user", {} as never, { enforceLimit: true }),
    ).rejects.toBeInstanceOf(UsageLimitError);
    expect(mocks.rpc.mock.calls.every((call) => call[1].p_cap >= 0)).toBe(true);
    expect(mocks.model).not.toHaveBeenCalled();
  });
});

describe("server-owned remaining usage", () => {
  it("uses the server entitlement, counts existing usage and recognizes a missing counter", async () => {
    await expect(remainingAiUsage(args)).resolves.toBe(cap);
    mocks.usage.mockResolvedValue({ data: { used: 3 }, error: null });
    await expect(remainingAiUsage(args)).resolves.toBe(cap - 3);
    mocks.plan.mockResolvedValue("freePreview");
    await expect(remainingAiUsage(args)).resolves.toBe(
      Math.max(0, capFor("freePreview", args.bucket) - 3),
    );
  });

  it("applies the same finite owner ceiling as claims", async () => {
    mocks.owner.mockResolvedValue({ data: { role: "owner" }, error: null });
    await expect(remainingAiUsage(args)).resolves.toBe(capFor("pro", args.bucket, true));
  });

  it.each([
    { data: null, error: { message: "db unavailable" } },
    { data: {}, error: null },
    { data: { used: "4" }, error: null },
    { data: { used: -1 }, error: null },
    { data: { used: 1.5 }, error: null },
    { data: undefined, error: null },
  ])("pauses on failed or invalid usage reads %#", async (response) => {
    mocks.usage.mockResolvedValue(response);
    await expect(remainingAiUsage(args)).rejects.toBeInstanceOf(UsageUnavailableError);
  });

  it("pauses when a usage read throws", async () => {
    mocks.usage.mockRejectedValue(new Error("connection closed"));
    await expect(remainingAiUsage(args)).rejects.toBeInstanceOf(UsageUnavailableError);
  });
});
