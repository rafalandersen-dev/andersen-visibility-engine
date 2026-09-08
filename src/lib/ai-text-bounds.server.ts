import { generateText, type LanguageModel } from "ai";

export const AI_TEXT_PROMPT_MAX_BYTES = 64 * 1024;
export const AI_TEXT_RESULT_MAX_BYTES = 256 * 1024;
export const AI_TEXT_MAX_OUTPUT_TOKENS = 16_000;
export const AI_TEXT_TIMEOUT_MS = 60_000;

export class AiTextBoundaryError extends Error {
  constructor(
    readonly reason: "input_too_large" | "invalid_limits" | "timeout" | "invalid_response",
  ) {
    super(
      {
        input_too_large:
          "There is too much source text for one AI request. Reduce the input and try again.",
        invalid_limits: "This AI request could not confirm its processing limits.",
        timeout:
          "AI generation timed out. The provider may still have processed the request; Milo did not retry it.",
        invalid_response:
          "The AI service returned an invalid or oversized text response. Milo did not retry it.",
      }[reason],
    );
    this.name = "AiTextBoundaryError";
  }
}

function fits(value: unknown, maxBytes: number): value is string {
  // Bound allocation before encoding as UTF-8. JS length alone undercounts
  // non-ASCII input, including Polish text, emoji and other EU languages.
  return (
    typeof value === "string" &&
    value.length <= maxBytes &&
    new TextEncoder().encode(value).byteLength <= maxBytes
  );
}

/** Shared by existing text actions. One model attempt, no tools or automatic
 * retries. Prompt/output bounds are processing controls, not an invoiced
 * supplier price or a customer result allowance.
 */
export async function generateBoundedText(
  prompt: string,
  maxOutputTokens: number,
  model: () => LanguageModel,
) {
  if (!fits(prompt, AI_TEXT_PROMPT_MAX_BYTES)) throw new AiTextBoundaryError("input_too_large");
  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > AI_TEXT_MAX_OUTPUT_TOKENS
  )
    throw new AiTextBoundaryError("invalid_limits");
  const resolvedModel = model();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new AiTextBoundaryError("timeout");
      controller.abort(error);
      reject(error);
    }, AI_TEXT_TIMEOUT_MS);
  });
  try {
    // The race bounds waiting even when a provider/SDK ignores cancellation.
    // The supplier may still charge; no retry or assumed refund follows.
    const result = await Promise.race([
      generateText({
        model: resolvedModel,
        prompt,
        maxOutputTokens,
        maxRetries: 0,
        abortSignal: controller.signal,
      }),
      deadline,
    ]);
    if (!fits(result.text, AI_TEXT_RESULT_MAX_BYTES))
      throw new AiTextBoundaryError("invalid_response");
    return result.text;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
