import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateBudgetedImage, generateBudgetedText } from "./ai-provider-expense.server";
import { DEFAULT_MODEL_ID } from "./ai-router";
import { AI_TEXT_TIMEOUT_MS } from "./ai-text-bounds.server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
const context = { userId: "00000000-0000-4000-8000-000000000011", operation: "owner_benchmark" };
const reserved = { data: [{ allowed: true, reason: "reserved", period: "2026-09" }], error: null };
const unknown = { data: [{ state: "unknown", overrun: false }], error: null };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function completion(usage: unknown = { prompt_tokens: 10, completion_tokens: 5 }) {
  return new Response(
    JSON.stringify({
      id: "synthetic-completion",
      object: "chat.completion",
      created: 0,
      model: DEFAULT_MODEL_ID,
      choices: [
        { index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" },
      ],
      ...(usage === undefined ? {} : { usage }),
    }),
    { headers: { "content-type": "application/json", "x-request-id": "req_synthetic_text" } },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.rpc.mockImplementation(async (name) =>
    name === "reserve_ai_expense" ? reserved : unknown,
  );
  mocks.fetch.mockImplementation(async () => completion());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native provider money admission", () => {
  for (const kind of ["text", "image"] as const) {
    const run = () =>
      kind === "text"
        ? generateBudgetedText(context, "private source", 3000)
        : generateBudgetedImage(context, "private image prompt");
    it.each([
      "budget_unconfigured",
      "budget_paused",
      "budget_exhausted",
      "duplicate_request",
      "permit_required",
      "permit_invalid",
    ])(`${kind} does no provider work after %s`, async (reason) => {
      mocks.rpc.mockResolvedValue({
        data: [{ allowed: false, reason, period: "2026-09" }],
        error: null,
      });
      await expect(run()).rejects.toMatchObject({ reason });
      expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it(`${kind} does no provider work after an ambiguous reservation`, async () => {
      mocks.rpc.mockResolvedValue({ data: [], error: null });
      await expect(run()).rejects.toMatchObject({ reason: "reservation_unconfirmed" });
      expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it(`${kind} checks configuration before reserving money`, async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      await expect(run()).rejects.toThrow("not configured");
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  }

  it("reserves once under the server user and preserves actual raw text counters", async () => {
    expect(await generateBudgetedText(context, "private source", 3000)).toBe('{"ok":true}');
    expect(mocks.rpc.mock.calls[0]).toEqual([
      "reserve_ai_expense",
      expect.objectContaining({
        p_user: context.userId,
        p_operation: "owner_benchmark",
        p_ceiling: 500_000,
        p_provider: "openai",
        p_model: DEFAULT_MODEL_ID,
      }),
    ]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0],
    );
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      max_completion_tokens: 3000,
      service_tier: "default",
      reasoning_effort: "low",
    });
    expect(payload).not.toHaveProperty("tools");
    expect(mocks.rpc.mock.calls[1]).toEqual([
      "reconcile_ai_expense",
      expect.objectContaining({
        p_request: mocks.rpc.mock.calls[0][1].p_request,
        p_user: context.userId,
        p_actual: null,
        p_outcome: "succeeded",
        p_input_tokens: 10,
        p_output_tokens: 5,
        p_provider_request: "req_synthetic_text",
      }),
    ]);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("private source");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("uses a trusted preallocated identity and refuses a second invocation after uncertainty", async () => {
    const attempt = {
      requestId: "00000000-0000-4000-8000-000000000021",
      jobId: "00000000-0000-4000-8000-000000000022",
    };
    await generateBudgetedText({ ...context, attempt }, "source", 3000);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_request: attempt.requestId,
      p_job: attempt.jobId,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ allowed: false, reason: "duplicate_request", period: "2026-09" }],
      error: null,
    });
    await expect(
      generateBudgetedText({ ...context, attempt }, "source", 3000),
    ).rejects.toMatchObject({ reason: "duplicate_request" });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("does not turn SDK default-zero counters into evidence for an empty usage object", async () => {
    mocks.fetch.mockImplementation(async () => completion({}));
    await generateBudgetedText(context, "source", 3000);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({
      p_actual: null,
      p_input_tokens: null,
      p_output_tokens: null,
    });
  });

  it("returns image bytes with the same fixed request settings and retains its reserve", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: png.toString("base64") }],
          usage: { input_tokens: 20, output_tokens: 1370, private_field: "private supplier text" },
        }),
        { headers: { "content-type": "application/json", "x-request-id": "req_synthetic_image" } },
      ),
    );
    expect(await generateBudgetedImage(context, "private image prompt")).toEqual(
      new Uint8Array(png),
    );
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_ceiling: 100_000,
      p_model: "gpt-image-2-2026-04-21",
    });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0],
    );
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      n: 1,
      size: "1536x1024",
      quality: "medium",
    });
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({
      p_actual: null,
      p_input_tokens: 20,
      p_output_tokens: 1370,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("private");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("retains the attempt on a supplier failure and never retries", async () => {
    mocks.fetch.mockResolvedValue(new Response("private supplier failure", { status: 500 }));
    await expect(generateBudgetedText(context, "source", 3000)).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_actual: null, p_outcome: "uncertain" });
  });

  it("retains the reserve when the real SDK fetch ignores cancellation", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const assertion = expect(generateBudgetedText(context, "source", 3000)).rejects.toMatchObject({
      reason: "timeout",
    });
    await vi.advanceTimersByTimeAsync(AI_TEXT_TIMEOUT_MS + 1);
    await assertion;
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_actual: null, p_outcome: "uncertain" });
  });

  it("keeps useful output after an accounting outage without retrying", async () => {
    mocks.rpc
      .mockResolvedValueOnce(reserved)
      .mockRejectedValueOnce(new Error("private accounting failure"));
    expect(await generateBudgetedText(context, "source", 3000)).toBe('{"ok":true}');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });

  it("requires a separate price contract for candidate models", async () => {
    await expect(
      generateBudgetedText(context, "source", 3000, "another-model"),
    ).rejects.toMatchObject({ reason: "unpriced_provider" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized prompts before reserving money", async () => {
    await expect(generateBudgetedText(context, "x".repeat(65_537), 3000)).rejects.toThrow(
      "too much source",
    );
    await expect(generateBudgetedImage(context, "x".repeat(8193))).rejects.toThrow("too long");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
