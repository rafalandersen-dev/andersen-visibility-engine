import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  text: vi.fn(),
  image: vi.fn(),
  stage: vi.fn(),
  plan: vi.fn(),
  knowledge: vi.fn(),
}));
vi.mock("./project-knowledge.server", () => ({ loadProjectKnowledgeContext: h.knowledge }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: <T>(fn: T): T => fn,
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (value: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./entitlements.server", () => ({ resolveEntitledPlan: h.plan }));
vi.mock("./ai-provider-expense.server", () => ({
  generateBudgetedText: h.text,
  generateBudgetedImage: h.image,
}));
vi.mock("./image-storage.functions", () => ({ stageValidatedImageBytes: h.stage }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: h.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return q;
    },
  },
}));
import { generateContentCore, generateContentAssetFn, generateContentFn } from "./ai.functions";
import { generateArticleImageCore, generateArticleImageFn } from "./image-gen.functions";
import { withGenerationUsage } from "./generation-usage.server";
import { AI_USAGE_LOOKUP_TIMEOUT_MS, UsageUnavailableError } from "./ai-usage.server";

const user = "00000000-0000-4000-8000-000000000001";
const attempt = {
  requestId: "00000000-0000-4000-8000-000000000002",
  jobId: "00000000-0000-4000-8000-000000000003",
};
const project = {
  id: "p",
  name: "Business",
  businessName: "Business",
  primaryLanguage: "English",
  businessType: "Studio",
  toneOfVoice: "clear",
};
const opportunity = {
  id: "o",
  title: "A guide",
  language: "English",
  recommendedCta: "Contact",
  businessValue: "Useful information",
};
const content = {
  project,
  services: [],
  opportunity,
  assetType: "article",
} as unknown as Parameters<typeof generateContentCore>[1];
const imageArgs = { projectId: "p", assetId: "a", concept: "A quiet studio", project };
const usage = {
  userId: user,
  bucket: "contentGeneration",
  operation: "generateContentCore",
} as const;
const fn = (handler: unknown, data: unknown) =>
  (handler as (args: unknown) => Promise<unknown>)({ data, context: { userId: user } });

function reply(name: string, p: Record<string, unknown>) {
  if (name === "claim_generation_usage")
    return {
      error: null,
      data: [
        { used: 1, cap: p.p_cap, allowed: true, receipt_id: p.p_id, claim_status: "reserved" },
      ],
    };
  if (name === "record_generation_result")
    return { error: null, data: [{ receipt_id: p.p_id, state: "retained" }] };
  if (name === "settle_generation_usage")
    return { error: null, data: [{ receipt_id: p.p_id, state: p.p_outcome }] };
  throw new Error("Unexpected RPC");
}
const retained = () => h.rpc.mock.calls.filter((c) => c[0] === "record_generation_result");
const settlements = () => h.rpc.mock.calls.filter((c) => c[0] === "settle_generation_usage");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_METERING_ENFORCED", "true");
  h.plan.mockResolvedValue("pro");
  h.knowledge.mockResolvedValue({ context: "", references: [], conflicts: [], omitted: 0 });
  h.rpc.mockImplementation(async (name, p) => reply(name, p));
  h.text.mockResolvedValue(
    JSON.stringify({ markdown: "## A usable generated draft\n\nActual text." }),
  );
  h.image.mockResolvedValue(new Uint8Array([1, 2, 3]));
  h.stage.mockResolvedValue({ path: `${user}/p/a/image.webp`, previewUrl: "private-preview" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("confirmed generation quota and technical failures", () => {
  it.each(["text", "image", "legacy"])(
    "uses fresh authenticated knowledge and retains exact references for %s",
    async (kind) => {
      const references = [
        {
          recordId: user,
          recordRevision: 2,
          sourceId: attempt.jobId,
          sourceRevision: 3,
          sourceFingerprint: "a".repeat(64),
        },
      ];
      h.knowledge.mockResolvedValue({
        context: "Approved scoped voice: understated",
        references,
        conflicts: [],
        omitted: 0,
      });
      if (kind === "text") await generateContentCore(user, content);
      else if (kind === "image") await generateArticleImageCore(user, imageArgs);
      else await fn(generateContentAssetFn, { ...content, kind: "article" });
      expect(h.knowledge.mock.calls[0].slice(0, 2)).toEqual([
        { ownerId: user, projectId: "p" },
        kind === "image" ? "visual" : "text",
      ]);
      const provider = kind === "image" ? h.image : h.text;
      expect(provider.mock.calls[0][1]).toContain("Approved scoped voice: understated");
      expect(h.knowledge.mock.invocationCallOrder[0]).toBeLessThan(
        provider.mock.invocationCallOrder[0],
      );
      expect(retained()[0][1].p_result.output.knowledgeReferences).toEqual(references);
    },
  );
  it.each(["text", "image"])(
    "makes no provider call when %s knowledge cannot be authorized",
    async (kind) => {
      h.knowledge.mockRejectedValue(new Error("knowledge unavailable"));
      await expect(
        kind === "image"
          ? generateArticleImageCore(user, imageArgs)
          : generateContentCore(user, content),
      ).rejects.toThrow("knowledge unavailable");
      expect(h.text).not.toHaveBeenCalled();
      expect(h.image).not.toHaveBeenCalled();
      expect(retained()).toEqual([]);
    },
  );
  it("completes one result and correlates server quota to the provider expense identity", async () => {
    const result = await generateContentCore(user, content);
    expect(result.markdown).toContain("usable generated draft");
    const p = h.rpc.mock.calls[0][1];
    expect(p).toMatchObject({
      p_user: user,
      p_bucket: "contentGeneration",
      p_operation: "generateContentCore",
      p_cap: 120,
    });
    expect(h.text.mock.calls[0][0]).toMatchObject({
      userId: user,
      attempt: { requestId: p.p_native_attempt, jobId: p.p_id },
    });
    expect(settlements()).toEqual([]);
    expect(retained()).toHaveLength(1);
    expect(retained()[0][1]).toMatchObject({
      p_user: user,
      p_id: p.p_id,
      p_result: {
        kind: "content",
        assetId: result.resultId,
        output: { markdown: result.markdown },
      },
    });
    expect(result.resultId).toBe(p.p_id);
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.text.mock.invocationCallOrder[0]);
  });
  it.each(["text", "image"])(
    "preserves the trusted benchmark %s attempt identity",
    async (kind) => {
      if (kind === "text")
        await generateContentCore(user, content, { attempt, enforceLimit: true });
      else await generateArticleImageCore(user, imageArgs, { attempt });
      expect(h.rpc.mock.calls[0][1].p_native_attempt).toBe(attempt.requestId);
      expect((kind === "text" ? h.text : h.image).mock.calls[0][0].attempt).toEqual(attempt);
    },
  );
  it.each(["true", "false"])(
    "returns one unit after a provider failure in enforcement mode %s",
    async (mode) => {
      vi.stubEnv("AI_METERING_ENFORCED", mode);
      h.text.mockRejectedValue(new Error("private-provider-error"));
      await expect(generateContentCore(user, content)).rejects.toThrow();
      expect(h.rpc.mock.calls[0][1].p_cap).toBe(mode === "true" ? 120 : -1);
      expect(settlements()).toHaveLength(1);
      expect(settlements()[0][1].p_outcome).toBe("released");
      expect(h.text).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private-provider-error",
      );
    },
  );
  it.each(["not JSON", "{}", '{"markdown":"   "}', '{"h1":"Only a title"}'])(
    "rejects unusable output %s without charging a fabricated placeholder",
    async (output) => {
      h.text.mockResolvedValue(output);
      await expect(generateContentCore(user, content)).rejects.toThrow();
      expect(settlements()[0][1].p_outcome).toBe("released");
    },
  );
  it("includes local prompt failures in the confirmed refund boundary", async () => {
    await expect(
      generateContentCore(user, { ...content, project: null } as never),
    ).rejects.toThrow();
    expect(h.text).not.toHaveBeenCalled();
    expect(settlements()[0][1].p_outcome).toBe("released");
  });
  it.each(["provider", "storage"])(
    "returns an image unit when %s fails and never completes the result",
    async (where) => {
      (where === "provider" ? h.image : h.stage).mockRejectedValue(new Error("technical failure"));
      await expect(generateArticleImageCore(user, imageArgs)).rejects.toThrow();
      expect(settlements()[0][1].p_outcome).toBe("released");
      expect(h.image).toHaveBeenCalledTimes(1);
      if (where === "provider") expect(h.stage).not.toHaveBeenCalled();
    },
  );
  it("completes image quota after private staging", async () => {
    await expect(generateArticleImageCore(user, imageArgs)).resolves.toMatchObject({
      path: `${user}/p/a/image.webp`,
    });
    expect(h.stage.mock.invocationCallOrder[0]).toBeLessThan(h.rpc.mock.invocationCallOrder[1]);
    expect(settlements()).toEqual([]);
    expect(retained()[0][1].p_result).toMatchObject({
      kind: "image",
      assetId: "a",
      output: { path: `${user}/p/a/image.webp` },
    });
    expect(retained()[0][1].p_result.output).not.toHaveProperty("previewUrl");
  });
  it("keeps the image feature gate before any receipt or paid work", async () => {
    h.plan.mockResolvedValue("starter");
    await expect(generateArticleImageCore(user, imageArgs)).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.image).not.toHaveBeenCalled();
  });
  it("the legacy article wrapper also releases failures under the authenticated owner", async () => {
    h.text.mockRejectedValue(new Error("technical failure"));
    await expect(
      fn(generateContentAssetFn, { ...content, kind: "article", userId: "victim" }),
    ).rejects.toThrow();
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_user: user,
      p_operation: "generateContentAssetFn",
    });
    expect(settlements()[0][1].p_outcome).toBe("released");
  });
  it.each(["text", "image"])(
    "ignores browser-injected receipt and expense identity for %s",
    async (kind) => {
      await fn(kind === "text" ? generateContentFn : generateArticleImageFn, {
        ...(kind === "text" ? content : imageArgs),
        userId: "victim",
        generationReceipt: { id: "forged" },
        attempt,
      });
      expect(h.rpc.mock.calls[0][1].p_user).toBe(user);
      expect(h.rpc.mock.calls[0][1].p_id).not.toBe("forged");
      expect(h.rpc.mock.calls[0][1].p_native_attempt).not.toBe(attempt.requestId);
    },
  );
  it.each([
    null,
    [],
    [{ used: 1, cap: 120, allowed: true }],
    [{ used: 1, cap: 120, allowed: true, receipt_id: "wrong", claim_status: "reserved" }],
  ])("does not start work or refund an unconfirmed claim %#", async (data) => {
    h.rpc.mockResolvedValue({ data, error: null });
    await expect(generateContentCore(user, content)).rejects.toBeInstanceOf(UsageUnavailableError);
    expect(h.text).not.toHaveBeenCalled();
    expect(settlements()).toEqual([]);
  });
  it("does not accept a replay as new admission even if the recorded state was reserved", async () => {
    h.rpc.mockImplementation(async (_, p) => ({
      error: null,
      data: [
        { used: 1, cap: p.p_cap, allowed: false, receipt_id: p.p_id, claim_status: "replayed" },
      ],
    }));
    await expect(generateContentCore(user, content)).rejects.toBeInstanceOf(UsageUnavailableError);
    expect(h.text).not.toHaveBeenCalled();
    expect(settlements()).toEqual([]);
  });
  it.each(["completed", "released"])(
    "an unavailable %s settlement preserves the original result/error",
    async (outcome) => {
      h.rpc.mockImplementation(async (name, p) =>
        name === "settle_generation_usage"
          ? { data: null, error: { message: "private-database-response" } }
          : reply(name, p),
      );
      const original = new Error("original failure");
      const result = withGenerationUsage(usage, async () => {
        if (outcome === "released") throw original;
        return "usable result";
      });
      if (outcome === "released") await expect(result).rejects.toBe(original);
      else await expect(result).resolves.toBe("usable result");
      expect(settlements()).toHaveLength(1);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private-database-response",
      );
      expect(vi.mocked(console.error)).toHaveBeenCalledWith(
        "[generation-usage] settlement unconfirmed",
        expect.objectContaining({ outcome }),
      );
    },
  );
  it("bounds a settlement timeout without a late provider retry or a false refund promise", async () => {
    vi.useFakeTimers();
    let done!: (value: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.rpc.mockImplementation((name, p) =>
      name === "settle_generation_usage"
        ? new Promise((resolve) => {
            done = resolve;
            entered();
          })
        : Promise.resolve(reply(name, p)),
    );
    const work = vi.fn(async () => "usable result");
    const result = withGenerationUsage(usage, work);
    await started;
    await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS + 1);
    await expect(result).resolves.toBe("usable result");
    done(reply("settle_generation_usage", settlements()[0][1]));
    await vi.runAllTimersAsync();
    expect(work).toHaveBeenCalledTimes(1);
    expect(settlements()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
