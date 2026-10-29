/**
 * Caller-facing Stripe COMMERCIAL server functions.
 *
 * EVERY FINANCIAL MUTATION IS HELD IN CODE. `liveCommercialMutationsAllowed()`
 * returns false unconditionally — there is no environment variable, header, role
 * or input that can open a live plan change, seat change, cancellation or
 * reversal from here. Removing the hold is a deliberate code change plus a
 * release decision, not a configuration flip. Test mode additionally requires
 * the caller's UUID in the existing service-configured sandbox owner allowlist,
 * which is EMPTY by default, so a freshly deployed environment has no reachable
 * commercial endpoint at all.
 *
 * There is deliberately NO refund endpoint. Refunds are approved by a trusted
 * operator and executed from the service module only
 * (`executeApprovedRefund`), which matches the existing support-by-email policy;
 * no caller may initiate, approve or amend one, and no "approved" flag crosses
 * this boundary.
 *
 * The client may send only: a request/operation/quote id, a target plan, a seat
 * count, and the amount and currency it displayed. The amount is never used as
 * authority — it is COMPARED with the durable server-side quote, and a mismatch
 * is a tamper refusal. A customer, account, mode, subscription, price, item or
 * owner id in the request body is rejected by the strict validator.
 *
 * One READ endpoint was added for the billing screen:
 * `getStripeCommercialSummaryFn`. It is not gated by the sandbox allowlist,
 * because seeing your own state is not a mutation — the availability of every
 * action travels inside its answer, and the hold is unchanged.
 *
 * This module registers no route: these are server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
// Type-only imports keep this module free of server/node runtime imports, so the
// client bundle carries nothing but the validators below.
import type { PlanId } from "./billing";
import type { StripeMode } from "./stripe-lifecycle";

/** The dormant hold for commercial mutations. Deliberately a constant. */
export function liveCommercialMutationsAllowed(): boolean {
  return false;
}

const uuid = z.string().uuid();
const sellablePlan = z.enum(["starter", "growth", "pro", "agency"]);

export const stripeChangePreviewInput = z
  .object({
    quoteId: uuid,
    planId: sellablePlan,
    seatQuantity: z.number().int().min(0).max(1000),
  })
  .strict();

export const stripeChangeConfirmInput = z
  .object({
    operationId: uuid,
    quoteId: uuid,
    planId: sellablePlan,
    seatQuantity: z.number().int().min(0).max(1000),
    /** Integer smallest units, echoed back from the preview purely so the server
     * can refuse a confirmation of something other than what was shown. */
    amountMinor: z.number().int().min(0),
    currency: z.string().regex(/^[a-z]{3}$/),
  })
  .strict();

export const stripeCancelInput = z.object({ operationId: uuid }).strict();
export const stripeReverseCancelInput = z
  .object({ operationId: uuid, cancelOperationId: uuid })
  .strict();

/** The mode this caller may use: test only, and only when explicitly
 * allowlisted. Live is never returned while the hold stands. */
function resolveMode(
  userId: string,
  config: { sandboxOwners: ReadonlySet<string>; checkoutReady: (mode: StripeMode) => boolean },
): StripeMode | null {
  if (liveCommercialMutationsAllowed()) return "live";
  if (!config.sandboxOwners.has(userId.toLowerCase())) return null;
  return config.checkoutReady("test") ? "test" : null;
}

/** UI-safe status: booleans and the hold message only, never ids, keys, prices,
 * account configuration or operator state. */
export const getStripeCommercialStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stripeLifecycleConfig } = await import("./stripe-lifecycle.server");
    const mode = resolveMode(String(context.userId), stripeLifecycleConfig());
    return {
      liveChangesHeld: !liveCommercialMutationsAllowed(),
      sandboxAvailable: mode === "test",
      refundSelfServiceAvailable: false,
      message:
        "Plan, seat and cancellation changes are held pending payment setup, acceptance and release. Refunds are handled by support.",
    };
  });

/**
 * The caller's own billing summary and durable operation discovery.
 *
 * This is a READ. It is deliberately NOT gated by `resolveMode`: the standing
 * hold and the empty sandbox allowlist stop mutations, but a held account must
 * still be able to see what it has and whether anything is unresolved. The
 * availability of each action travels inside the answer instead.
 *
 * It exists because `getMyEntitlementFn` cannot serve a billing screen: it
 * resolves a read failure to Free, and the mapper behind it normalises a
 * malformed provider to Paddle and an unknown plan to Free. A transport or
 * validation rejection here must be shown as UNAVAILABLE, never as verified
 * Free and never as a verified provider.
 */
export const getStripeCommercialSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readCommercialAccountSummary } = await import("./stripe-commercial.server");
    return readCommercialAccountSummary(String(context.userId));
  });

export const prepareStripeSubscriptionChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripeChangePreviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = String(context.userId);
    const { stripeLifecycleConfig } = await import("./stripe-lifecycle.server");
    const mode = resolveMode(userId, stripeLifecycleConfig());
    // The hold is applied BEFORE any provider or database access.
    if (mode === null) return { ok: false as const, reason: "held" };
    const { prepareSubscriptionChange } = await import("./stripe-commercial.server");
    const result = await prepareSubscriptionChange({
      userId,
      quoteId: data.quoteId,
      mode,
      targetPlanId: data.planId as PlanId,
      targetSeatQuantity: data.seatQuantity,
    });
    if (!result.ok) return { ok: false as const, reason: result.reason };
    // Only UI-safe fields: currency, integer amounts, times and the effective
    // date. No price id, item id, subscription id, customer id or account id.
    //
    // The two amounts are SEPARATE and must stay separate: `amountMinor` is
    // what the provider charges NOW (zero for a period-end reduction), while
    // `recurringEstimateMinor` is the provider's long-term estimate of one full
    // period at the target items. The estimate is not a promise of the next
    // debit, which is why its own wording travels with it.
    return {
      ok: true as const,
      quoteId: result.quoteId,
      direction: result.direction,
      amountMinor: result.amountDueMinor,
      recurringEstimateMinor: result.recurringEstimateMinor,
      recurringEstimateIncludesAdjustments: result.recurringEstimateIncludesAdjustments,
      recurringEstimateNote: result.recurringEstimateNote,
      currency: result.currency,
      effectiveAt: result.effectiveAt,
      immediate: result.immediate,
      expiresAt: result.expiresAt,
      planId: result.targetPlanId,
      seatQuantity: result.targetSeatQuantity,
      workingSeatAllowance: result.workingSeatAllowance,
      viewerSeatAllowance: result.viewerSeatAllowance,
      projectAllowance: result.projectAllowance,
      effectiveNote: result.effectiveNote,
    };
  });

export const confirmStripeSubscriptionChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripeChangeConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = String(context.userId);
    const { stripeLifecycleConfig } = await import("./stripe-lifecycle.server");
    const mode = resolveMode(userId, stripeLifecycleConfig());
    if (mode === null) return { ok: false as const, reason: "held" };
    const { confirmSubscriptionChange } = await import("./stripe-commercial.server");
    const result = await confirmSubscriptionChange({
      userId,
      operationId: data.operationId,
      quoteId: data.quoteId,
      mode,
      targetPlanId: data.planId as PlanId,
      targetSeatQuantity: data.seatQuantity,
      expectedAmountMinor: data.amountMinor,
      expectedCurrency: data.currency,
    });
    return result.ok
      ? {
          ok: true as const,
          state: result.state,
          direction: result.direction,
          effectiveAt: result.effectiveAt,
          currency: result.currency,
          amountMinor: result.amountDueMinor,
          note: result.note,
        }
      : { ok: false as const, reason: result.reason };
  });

export const cancelStripeSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripeCancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = String(context.userId);
    const { stripeLifecycleConfig } = await import("./stripe-lifecycle.server");
    const mode = resolveMode(userId, stripeLifecycleConfig());
    if (mode === null) return { ok: false as const, reason: "held" };
    const { requestSubscriptionCancellation } = await import("./stripe-commercial.server");
    const result = await requestSubscriptionCancellation({
      userId,
      operationId: data.operationId,
      mode,
    });
    return result.ok
      ? {
          ok: true as const,
          cancelAtPeriodEnd: result.cancelAtPeriodEnd,
          effectiveAt: result.effectiveAt,
          note: result.note,
        }
      : { ok: false as const, reason: result.reason };
  });

export const reverseStripeCancellationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripeReverseCancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = String(context.userId);
    const { stripeLifecycleConfig } = await import("./stripe-lifecycle.server");
    const mode = resolveMode(userId, stripeLifecycleConfig());
    if (mode === null) return { ok: false as const, reason: "held" };
    const { reverseSubscriptionCancellation } = await import("./stripe-commercial.server");
    const result = await reverseSubscriptionCancellation({
      userId,
      operationId: data.operationId,
      cancelOperationId: data.cancelOperationId,
      mode,
    });
    return result.ok
      ? {
          ok: true as const,
          cancelAtPeriodEnd: result.cancelAtPeriodEnd,
          effectiveAt: result.effectiveAt,
          note: result.note,
        }
      : { ok: false as const, reason: result.reason };
  });
