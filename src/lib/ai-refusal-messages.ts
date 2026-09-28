/**
 * Bounded localization of the KNOWN refusal/recovery sentences that the quality score and Improve server
 * functions (and their shared gateway/usage/expense boundaries) can surface. They cross the server-function
 * boundary as plain `Error` messages (`mapGatewayError` flattens every class to `new Error(message)` and the
 * usage/expense errors are thrown as-is), so no error class, `code` or other property is relied upon here:
 * only the EXACT authored English sentence is matched, and anything else is left exactly as received for the
 * existing handling (no loose substring classification, no provider text, no headers, no stack). The English
 * copy of every key equals the server sentence; a parity test pins the map against the server modules.
 *
 * Meaning is preserved, not softened: "input too large" is refused BEFORE any spend; "incomplete", "invalid
 * response" and both timeouts describe ONE attempted call that Milo did not retry and whose provider cost may
 * still apply; an Improve refusal leaves the original draft unchanged and an evaluation refusal never changes
 * content.
 */
type T = (key: string, vars?: Record<string, string | number>) => string;

const EXACT: ReadonlyMap<string, string> = new Map<string, string>([
  // ai-text-bounds.server.ts — AiTextBoundaryError reasons
  [
    "There is too much source text for one AI request. Reduce the input and try again.",
    "quality.refusal.inputTooLarge",
  ],
  ["This AI request could not confirm its processing limits.", "quality.refusal.invalidLimits"],
  [
    "AI generation timed out. The provider may still have processed the request; Milo did not retry it.",
    "quality.refusal.timeout",
  ],
  [
    "The AI service returned an invalid or oversized text response. Milo did not retry it.",
    "quality.refusal.invalidResponse",
  ],
  [
    "The AI service did not complete its answer for this whole draft. Milo kept the draft unchanged and did not retry it.",
    "quality.refusal.incompleteOutput",
  ],
  // ai-expense.server.ts — AiExpenseUnavailableError reasons
  [
    "AI generation timed out. The provider may still have charged for this attempt; Milo did not retry it.",
    "quality.refusal.expenseTimeout",
  ],
  [
    "This AI model has no verified cost limit yet. Generation is paused; your existing content remains available.",
    "quality.refusal.expenseUnpriced",
  ],
  [
    "AI is available on this account once the owner grants it a budget. Your existing content remains available.",
    "quality.refusal.expenseManualBudget",
  ],
  [
    "AI work is paused because its cost budget could not be confirmed. Your existing content remains available.",
    "quality.refusal.expenseUnconfirmed",
  ],
  // ai-provider.server.ts
  [
    "AI generation is not configured. The workspace owner needs to connect the AI service.",
    "quality.refusal.providerUnconfigured",
  ],
  // ai-usage.server.ts
  [
    "Milo cannot verify your AI usage right now. AI work is paused; please try again later. You can still read and edit your content.",
    "quality.refusal.usageUnavailable",
  ],
  // ai-error-diagnostics.server.ts — classified gateway messages ("timeout" shares the boundary sentence)
  ["AI is busy right now (rate limit). Please retry in a moment.", "quality.refusal.rateLimit"],
  [
    "AI credits or quota are exhausted. The workspace owner needs to review the AI billing balance.",
    "quality.refusal.quotaBilling",
  ],
  [
    "The AI service rejected the connected credentials. The workspace owner needs to reconnect the AI key.",
    "quality.refusal.authRejected",
  ],
  [
    "The configured AI model is unavailable. The workspace owner needs to review the AI model configuration.",
    "quality.refusal.modelUnavailable",
  ],
  [
    "The saved AI key is not in a usable format. The workspace owner needs to re-enter it.",
    "quality.refusal.malformedCredential",
  ],
  [
    "AI could not process this request. Please adjust the content and try again.",
    "quality.refusal.badRequest",
  ],
  [
    "The AI service returned an unexpected format. Please try again.",
    "quality.refusal.responseFormat",
  ],
  [
    "The AI service had a temporary server error. Please try again shortly.",
    "quality.refusal.providerServerError",
  ],
  [
    "Milo could not reach the AI service (network problem). Please try again shortly.",
    "quality.refusal.network",
  ],
  ["AI generation failed unexpectedly. Please try again.", "quality.refusal.unknown"],
]);

/** The one templated sentence (ai-usage.server.ts UsageLimitError), anchored end to end; only the two
 * buckets these actions draw from are localized — any other bucket stays as received. */
const USAGE_LIMIT =
  /^You have used all (\d+) (draft improvements|Milo Score runs) on your plan this month\. They reset on the 1st — or upgrade for more\.$/;
const BUCKET_KEY: Readonly<Record<string, string>> = {
  "draft improvements": "quality.refusal.bucket.improveDraft",
  "Milo Score runs": "quality.refusal.bucket.miloScore",
};

/** The translation key for an exact authored sentence, or `null` for anything else. */
export function aiRefusalKey(message: string): string | null {
  return EXACT.get(message) ?? (USAGE_LIMIT.test(message) ? "quality.refusal.usageLimit" : null);
}

/** The translated sentence for an exact authored message, or `null` (the caller keeps its existing handling). */
export function aiRefusalText(message: string, t: T): string | null {
  const exact = EXACT.get(message);
  if (exact) return t(exact);
  const limit = USAGE_LIMIT.exec(message);
  if (limit)
    return t("quality.refusal.usageLimit", {
      count: Number(limit[1]),
      bucket: t(BUCKET_KEY[limit[2]]),
    });
  return null;
}

/** For a thrown value: the translated known refusal, or `null`. */
export function aiRefusalMessage(error: unknown, t: T): string | null {
  return error instanceof Error ? aiRefusalText(error.message, t) : null;
}
