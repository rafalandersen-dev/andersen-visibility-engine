import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LanguageModel } from "ai";
import {
  generateBoundedText,
  AI_TEXT_PROMPT_MAX_BYTES,
  AI_TEXT_RESULT_MAX_BYTES,
  AI_TEXT_TIMEOUT_MS,
  AiTextBoundaryError,
} from "./ai-text-bounds.server";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generate }));
const model = vi.fn(() => "synthetic-test-model" as LanguageModel);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockResolvedValue({ text: "{}" });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("bounded text provider attempts", () => {
  it("accepts the exact byte ceiling with the existing output cap and one attempt", async () => {
    expect(await generateBoundedText("x".repeat(AI_TEXT_PROMPT_MAX_BYTES), 8000, model)).toBe("{}");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 8000,
        maxRetries: 0,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty("tools");
  });
  it.each([
    "x".repeat(AI_TEXT_PROMPT_MAX_BYTES + 1),
    "ą".repeat(AI_TEXT_PROMPT_MAX_BYTES / 2 + 1),
    "😀".repeat(AI_TEXT_PROMPT_MAX_BYTES / 4 + 1),
  ])("refuses oversized UTF-8 input before resolving a provider", async (prompt) => {
    await expect(generateBoundedText(prompt, 8000, model)).rejects.toMatchObject({
      reason: "input_too_large",
    });
    expect(model).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 16001, Infinity, NaN])(
    "refuses an invalid output budget %s before provider access",
    async (limit) => {
      await expect(generateBoundedText("short", limit, model)).rejects.toMatchObject({
        reason: "invalid_limits",
      });
      expect(model).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
    },
  );
  it("accepts a multibyte response at the exact ceiling", async () => {
    const text = "ą".repeat(AI_TEXT_RESULT_MAX_BYTES / 2);
    mocks.generate.mockResolvedValue({ text });
    expect(await generateBoundedText("input", 16000, model)).toBe(text);
  });
  it.each([
    undefined,
    null,
    {},
    "x".repeat(AI_TEXT_RESULT_MAX_BYTES + 1),
    "ą".repeat(AI_TEXT_RESULT_MAX_BYTES / 2 + 1),
  ])("rejects malformed or excessive result text without retry", async (text) => {
    mocks.generate.mockResolvedValue({ text });
    await expect(generateBoundedText("input", 1000, model)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("returns at the total deadline even if the provider ignores abort", async () => {
    vi.useFakeTimers();
    mocks.generate.mockReturnValue(new Promise(() => {}));
    const run = generateBoundedText("input", 3000, model);
    const check = expect(run).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(AI_TEXT_TIMEOUT_MS);
    await check;
    expect(mocks.generate.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not turn late supplier success into a second result or attempt", async () => {
    vi.useFakeTimers();
    let finish: ((result: { text: string }) => void) | undefined;
    mocks.generate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const run = generateBoundedText("input", 3000, model);
    const check = expect(run).rejects.toBeInstanceOf(AiTextBoundaryError);
    await vi.advanceTimersByTimeAsync(AI_TEXT_TIMEOUT_MS);
    await check;
    finish?.({ text: "late content" });
    await vi.runAllTimersAsync();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("cleans up its timer on provider failure without retrying", async () => {
    vi.useFakeTimers();
    const error = new Error("provider failed");
    mocks.generate.mockRejectedValue(error);
    await expect(generateBoundedText("input", 1000, model)).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
