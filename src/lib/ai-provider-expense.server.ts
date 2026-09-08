import { DEFAULT_MODEL_ID } from "./ai-router";
import { modelFor, AiProviderConfigurationError } from "./ai-provider.server";
import { generateBoundedTextResult, validateTextRequest } from "./ai-text-bounds.server";
import { generateImageResult, validateImageRequest, OPENAI_IMAGE_MODEL } from "./image-gen.server";
import {
  AiExpenseUnavailableError,
  withReservedAiExpense,
  type ExpenseEvidence,
  type ExpenseRequest,
} from "./ai-expense.server";

/** Conservative per-attempt reserves, not customer prices or measured invoices.
 * 2026-09-08 standard tariffs and fixed request bounds:
 * text: (65,536 + 1,024 framing) tokens * $2.50/M incl. cache writes
 *       + 16,000 completion/reasoning tokens * $12/M = $0.3584 < $0.50.
 * image: (8,192 + 1,024 framing) text tokens * $5/M + $0.041 rounded
 *        published medium 1536x1024 output estimate < $0.10.
 * Text byte bounds conservatively cover UTF-8 tokenization. No tools, edits,
 * input images, automatic quality, batch, priority service or retries.
 * Retain each entire reserve until independently verified cost reconciliation.
 * See evidence/native-provider-expense-2026-09-08.md for rates and limitations.
 */
export const NATIVE_TEXT_RESERVE_MICROUSD = 500_000;
export const NATIVE_IMAGE_RESERVE_MICROUSD = 100_000;

export interface NativeExpenseContext {
  userId: string;
  operation: string;
  /** Only a trusted server runner may provide a preallocated attempt. Never
   * forward this from browser/MCP inputs. Reuse the identity after uncertainty
   * so the ledger refuses another provider call instead of granting a retry.
   */
  attempt?: { requestId: string; jobId: string };
}

function request(
  context: NativeExpenseContext,
  model: string,
  ceilingMicrousd: number,
): ExpenseRequest {
  // Created once per server invocation, reused throughout reservation and
  // reconciliation. No provider retry occurs inside an attempt. A user retry
  // is a new attempt and requires its own account + global reservation.
  const requestId = context.attempt?.requestId ?? crypto.randomUUID();
  return {
    userId: context.userId,
    operation: context.operation,
    requestId,
    jobId: context.attempt?.jobId ?? requestId,
    provider: "openai",
    model,
    ceilingMicrousd,
  };
}

function counter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Allowlist counters only; no raw supplier body, prompts, images or secrets
 * enter the ledger. Missing usage is unknown and never converted to zero.
 */
function evidence(
  usage: unknown,
  providerRequestId: unknown,
  kind: "text" | "image",
): ExpenseEvidence {
  const data = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  const input = data[kind === "text" ? "prompt_tokens" : "input_tokens"];
  const output = data[kind === "text" ? "completion_tokens" : "output_tokens"];
  return {
    actualMicrousd: null,
    ...(counter(input) ? { inputTokens: input } : {}),
    ...(counter(output) ? { outputTokens: output } : {}),
    ...(typeof providerRequestId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(providerRequestId)
      ? { providerRequestId }
      : {}),
  };
}

export async function generateBudgetedText(
  context: NativeExpenseContext,
  prompt: string,
  maxOutputTokens: number,
  modelId = DEFAULT_MODEL_ID,
) {
  validateTextRequest(prompt, maxOutputTokens);
  // An evaluation candidate needs its own verified price contract before it
  // can spend. Never apply OpenAI's reserve to an arbitrary OpenRouter model.
  if (modelId !== DEFAULT_MODEL_ID) throw new AiExpenseUnavailableError("unpriced_provider");
  const model = modelFor(modelId);
  const result = await withReservedAiExpense(
    request(context, modelId, NATIVE_TEXT_RESERVE_MICROUSD),
    async (signal) => {
      const result = await generateBoundedTextResult(prompt, maxOutputTokens, () => model, signal);
      return {
        value: result.text,
        evidence: evidence(result.usage, result.providerRequestId, "text"),
      };
    },
    120_000,
  );
  return result.value;
}

export async function generateBudgetedImage(context: NativeExpenseContext, prompt: string) {
  validateImageRequest(prompt);
  if (!(process.env.OPENAI_API_KEY ?? "").trim()) throw new AiProviderConfigurationError();
  const result = await withReservedAiExpense(
    request(context, OPENAI_IMAGE_MODEL, NATIVE_IMAGE_RESERVE_MICROUSD),
    async (signal) => {
      const result = await generateImageResult(prompt, signal);
      return {
        value: result.bytes,
        evidence: evidence(result.usage, result.providerRequestId, "image"),
      };
    },
    120_000,
  );
  return result.value;
}
