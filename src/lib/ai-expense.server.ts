/** Internal supplier money, never the customer's article/image result allowance.
 * Callers supply a server-verified maximum cost and stable attempt ID. Budgets
 * must be provisioned explicitly; unknown supplier cost never becomes free.
 */
export type ExpenseOutcome = "succeeded" | "failed" | "uncertain";
export interface ExpenseEvidence {
  actualMicrousd: number | null;
  costSource?: string;
  providerRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
}
export interface ExpenseRequest {
  requestId: string;
  userId: string;
  jobId: string;
  provider: string;
  model: string;
  operation: string;
  ceilingMicrousd: number;
}
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
const MAX_ATTEMPT_COST = 1_000_000_000_000;
export const AI_EXPENSE_RPC_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set([
  "budget_unconfigured",
  "budget_paused",
  "budget_exhausted",
  "duplicate_request",
  "permit_required",
  "permit_invalid",
]);
export class AiExpenseUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(
      reason === "provider_timeout"
        ? "AI generation timed out. The provider may still have charged for this attempt; Milo did not retry it."
        : reason === "unpriced_provider"
          ? "This AI model has no verified cost limit yet. Generation is paused; your existing content remains available."
          : "AI work is paused because its cost budget could not be confirmed. Your existing content remains available.",
    );
    this.name = "AiExpenseUnavailableError";
  }
}
function safeInteger(n: unknown, max = Number.MAX_SAFE_INTEGER): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max;
}
function bounded(s: unknown, length: number): s is string {
  return typeof s === "string" && s.trim().length > 0 && s.length <= length;
}
function validateRequest(r: ExpenseRequest) {
  if (
    ![r.requestId, r.userId, r.jobId].every((id) => UUID.test(id)) ||
    !safeInteger(r.ceilingMicrousd, MAX_ATTEMPT_COST) ||
    r.ceilingMicrousd === 0 ||
    !bounded(r.provider, 80) ||
    !bounded(r.model, 160) ||
    !bounded(r.operation, 80)
  ) {
    throw new AiExpenseUnavailableError("invalid_request");
  }
}
function validEvidence(e: ExpenseEvidence) {
  return (
    (e.actualMicrousd === null ||
      (safeInteger(e.actualMicrousd, MAX_ATTEMPT_COST) && bounded(e.costSource, 200))) &&
    (e.providerRequestId === undefined || bounded(e.providerRequestId, 200)) &&
    (e.costSource === undefined || bounded(e.costSource, 200)) &&
    (e.inputTokens === undefined || safeInteger(e.inputTokens)) &&
    (e.outputTokens === undefined || safeInteger(e.outputTokens))
  );
}
async function rpc(): Promise<Rpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { rpc: Rpc };
  return async (name, args) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new AiExpenseUnavailableError("accounting_timeout")),
        AI_EXPENSE_RPC_TIMEOUT_MS,
      );
    });
    try {
      // A late database commit may retain a reservation. It never authorizes
      // provider execution after the caller has lost admission confirmation.
      return await Promise.race([admin.rpc(name, args), deadline]);
    } finally {
      clearTimeout(timer);
    }
  };
}
function oneRow(data: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object") return;
  return data[0];
}
export async function reserveAiExpense(request: ExpenseRequest): Promise<void> {
  validateRequest(request);
  let response;
  try {
    response = await (
      await rpc()
    )("reserve_ai_expense", {
      p_request: request.requestId,
      p_user: request.userId,
      p_job: request.jobId,
      p_provider: request.provider,
      p_model: request.model,
      p_operation: request.operation,
      p_ceiling: request.ceilingMicrousd,
    });
  } catch {
    throw new AiExpenseUnavailableError("reservation_unavailable");
  }
  const row = oneRow(response?.data);
  if (
    response?.error ||
    !row ||
    typeof row.period !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)
  ) {
    throw new AiExpenseUnavailableError("reservation_unconfirmed");
  }
  if (row.allowed === true && row.reason === "reserved") return;
  if (row.allowed === false && typeof row.reason === "string" && REASONS.has(row.reason)) {
    throw new AiExpenseUnavailableError(row.reason);
  }
  throw new AiExpenseUnavailableError("reservation_unconfirmed");
}
export async function reconcileAiExpense(
  request: ExpenseRequest,
  evidence: ExpenseEvidence,
  outcome: ExpenseOutcome,
) {
  validateRequest(request);
  if (!validEvidence(evidence) || !["succeeded", "failed", "uncertain"].includes(outcome)) {
    throw new AiExpenseUnavailableError("invalid_evidence");
  }
  const response = await (
    await rpc()
  )("reconcile_ai_expense", {
    p_request: request.requestId,
    p_user: request.userId,
    p_actual: evidence.actualMicrousd,
    p_outcome: outcome,
    p_cost_source: evidence.costSource ?? null,
    p_provider_request: evidence.providerRequestId ?? null,
    p_input_tokens: evidence.inputTokens ?? null,
    p_output_tokens: evidence.outputTokens ?? null,
  });
  const row = oneRow(response?.data);
  const state = evidence.actualMicrousd === null ? "unknown" : "settled";
  const overrun =
    evidence.actualMicrousd !== null && evidence.actualMicrousd > request.ceilingMicrousd;
  if (response?.error || !row || row.state !== state || row.overrun !== overrun) {
    throw new AiExpenseUnavailableError("reconciliation_unconfirmed");
  }
  return { state, overrun } as { state: "unknown" | "settled"; overrun: boolean };
}
/** One reservation permits one callback invocation. No automatic retries.
 * A failed reconciliation keeps the reservation and preserves usable output.
 * Callers must honor the abort signal and enforce the reserved model/token cap.
 */
export async function withReservedAiExpense<T>(
  request: ExpenseRequest,
  execute: (signal: AbortSignal) => Promise<{ value: T; evidence: ExpenseEvidence }>,
  timeoutMs = 60_000,
): Promise<{ value: T; accounting: "unknown" | "settled" | "pending"; overrun: boolean | null }> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new AiExpenseUnavailableError("invalid_timeout");
  }
  await reserveAiExpense(request);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new AiExpenseUnavailableError("provider_timeout");
      // Settle the deadline before notifying the callback: cancellation is
      // best effort and must not let a late success release this reservation.
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  let result: { value: T; evidence: ExpenseEvidence };
  try {
    result = await Promise.race([execute(controller.signal), deadline]);
  } catch (error) {
    // Exceptions/timeouts cannot establish whether the supplier charged.
    try {
      await reconcileAiExpense(request, { actualMicrousd: null }, "uncertain");
    } catch {
      console.error("[ai-expense] reconciliation pending");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  try {
    const { state, overrun } = await reconcileAiExpense(request, result.evidence, "succeeded");
    return { value: result.value, accounting: state, overrun };
  } catch {
    console.error("[ai-expense] reconciliation pending");
    return { value: result.value, accounting: "pending", overrun: null };
  }
}
