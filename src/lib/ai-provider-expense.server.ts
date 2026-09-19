import { DEFAULT_MODEL_ID } from "./ai-router";
import { PLAN_LIMITS, type PlanId } from "./billing";
import { OWNER_MULTIPLIER, resolveOwnerResult } from "./ai-usage.server";
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

/** Platform-wide monthly ceiling on native provider reservations. The owner has
 * approved USD 50/month as the platform cap, so that is the default;
 * `AI_GLOBAL_MONTHLY_CAP_USD` may still override it. It is a deployment-wide kill
 * switch, not a customer allowance; reservations are retained until reconciled,
 * so it bounds attempts, not measured spend. Owner instruction 2026-09-19. */
export const DEFAULT_GLOBAL_MONTHLY_CAP_MICROUSD = 50_000_000;
export function globalMonthlyCapMicrousd(): number {
  const raw = (process.env.AI_GLOBAL_MONTHLY_CAP_USD ?? "").trim();
  if (!raw) return DEFAULT_GLOBAL_MONTHLY_CAP_MICROUSD;
  const usd = Number(raw);
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(usd) || usd <= 0 || usd > 1_000_000)
    throw new AiExpenseUnavailableError("global_cap_invalid");
  return Math.round(usd * 1_000_000);
}

/** An account's monthly ceiling is exactly what its plan already allows: every
 * text allowance at the text reserve plus every image allowance at the image
 * reserve. All buckets whose handlers call generateBudgetedText are counted —
 * content, improve, Milo score, authority, AI credits and audits — so the cap
 * cannot refuse work the plan has already granted. No new price or allowance is
 * introduced; a plan change changes the cap, which an AUTO budget row then
 * follows within the month.
 *
 * `isOwner` raises the ceiling by the same OWNER_MULTIPLIER that `capFor` in
 * ai-usage.server applies to interactive quotas, so the trusted-owner monthly
 * allowance is consistent across both — the native cap can never refuse work the
 * usage quota has already granted an owner. This argument is PURE: owner status
 * is resolved server-side from user_roles by `defaultCaps` and is never accepted
 * from a caller. It defaults to false, so ordinary accounts are unaffected. */
export function planAccountCapMicrousd(plan: PlanId, isOwner = false): number {
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.freePreview;
  const base =
    (limits.monthlyContentGenerations +
      limits.monthlyImproveDrafts +
      limits.monthlyMiloScores +
      limits.monthlyAuthorityGenerations +
      limits.monthlyAiCredits +
      limits.monthlyAudits) *
      NATIVE_TEXT_RESERVE_MICROUSD +
    limits.monthlyImageGenerations * NATIVE_IMAGE_RESERVE_MICROUSD;
  return isOwner ? base * OWNER_MULTIPLIER : base;
}

/** A stalled entitlement lookup must not hang a native AI attempt after its
 * usage claim: the plan resolution is bounded, and a timeout fails the attempt
 * before any reservation or provider dispatch. Consistent with
 * AI_USAGE_LOOKUP_TIMEOUT_MS so both server-side lookups use the same time limit. */
export const AI_ENTITLEMENT_LOOKUP_TIMEOUT_MS = 10_000;

/** Bound the entitlement lookup. A timeout throws AiExpenseUnavailableError with
 * a safe authored reason (no provider or credential content) before any
 * reservation is placed. The timer is cleared on every path, and a late lookup
 * rejection is swallowed so it never surfaces as an unhandled rejection once the
 * deadline has already failed the attempt. */
async function boundedPlanLookup<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = Promise.resolve(work);
  guarded.catch(() => {});
  try {
    return await Promise.race([
      guarded,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AiExpenseUnavailableError("entitlement_timeout")),
          AI_ENTITLEMENT_LOOKUP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Caps supplied with every reservation so a missing monthly row can be created
 * and an existing AUTO row can follow a plan change. The platform cap is
 * deterministic (config, not a lookup). The account cap is NULL when the plan or
 * the owner role is currently UNKNOWN — a transient entitlement OR role lookup
 * failure must never create or lower a paid/owner account. A missing row then
 * stays unconfigured (paused, safe) until both are known again, and an existing
 * auto row keeps its current cap.
 *
 * Both server-side lookups run together under the SAME bounded 10s deadline, so
 * neither a stalled entitlement read nor a stalled role read can hang an
 * attempt. The owner role is read only from server-owned user_roles keyed by the
 * authenticated `userId`; a caller cannot spoof it. Preserving uncertainty means
 * a successful "no owner row" is a KNOWN non-owner (cap unchanged), while a role
 * query error/throw yields an UNKNOWN cap (null) rather than silently demoting an
 * owner to the ordinary ceiling.
 *
 * `usesFreePool` is the server-derived classification for the SHARED free-account
 * circuit breaker. It bypasses the pool ONLY for a verified owner or a KNOWN
 * non-free effective plan; every uncertain role/plan (including a lookup failure)
 * conservatively uses the pool. It is derived here from the same trusted
 * server-side reads and is never accepted from a caller field. */
async function defaultCaps(
  userId: string,
): Promise<{
  accountCapMicrousd: number | null;
  globalCapMicrousd: number;
  usesFreePool: boolean;
}> {
  // Resolve the deterministic platform cap first: an invalid AI_GLOBAL_MONTHLY_CAP_USD
  // is a hard configuration error and must stop the attempt before any RPC.
  const globalCapMicrousd = globalMonthlyCapMicrousd();
  const { resolveEntitledPlanResult } = await import("./entitlements.server");
  const [plan, owner] = await boundedPlanLookup(
    Promise.all([resolveEntitledPlanResult(userId), resolveOwnerResult(userId)]),
  );
  const verifiedOwner = owner.ok && owner.isOwner;
  const knownPaid = plan.ok && plan.planId !== "freePreview";
  return {
    accountCapMicrousd:
      plan.ok && owner.ok ? planAccountCapMicrousd(plan.planId, owner.isOwner) : null,
    globalCapMicrousd,
    usesFreePool: !(verifiedOwner || knownPaid),
  };
}

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
  caps: { accountCapMicrousd: number | null; globalCapMicrousd: number; usesFreePool: boolean },
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
    defaults: {
      accountCapMicrousd: caps.accountCapMicrousd,
      globalCapMicrousd: caps.globalCapMicrousd,
    },
    // Server-derived pool classification; never sourced from a caller field.
    usesFreePool: caps.usesFreePool,
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
    request(context, modelId, NATIVE_TEXT_RESERVE_MICROUSD, await defaultCaps(context.userId)),
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
    request(
      context,
      OPENAI_IMAGE_MODEL,
      NATIVE_IMAGE_RESERVE_MICROUSD,
      await defaultCaps(context.userId),
    ),
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
