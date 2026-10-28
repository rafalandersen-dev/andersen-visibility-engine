/**
 * Caller-facing Stripe lifecycle server functions.
 *
 * PUBLIC PAID ACTIVATION IS HELD IN CODE. `liveModeAllowed()` returns false
 * unconditionally — there is no environment variable, header, role or input
 * that can open live checkout from here. Removing the hold is a deliberate code
 * change plus a release decision, not a configuration flip.
 *
 * Everything else is caller-scoped: the owner, the Stripe account, the mode,
 * the customer, the prices and the return URLs are resolved on the server from
 * the authenticated identity. The client may send only a request id, a plan id
 * and a seat count; a customer id, price id, owner id or account id in the
 * request body is rejected by the strict validator.
 *
 * Test-mode acceptance is additionally gated on an explicit, service-configured
 * owner UUID allowlist that is EMPTY by default, so a freshly deployed
 * environment has no reachable Stripe checkout at all.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
// Type-only imports: this module stays free of server/node runtime imports so
// the client bundle keeps nothing but the validators above.
import type { PlanId } from "./billing";
import type { StripeMode } from "./stripe-lifecycle";

/** The paid-launch hold. Deliberately a constant, not configuration. */
export function liveModeAllowed(): boolean {
  return false;
}

/** Sellable plans only: freePreview is never checked out. */
export const stripeCheckoutInput = z
  .object({
    requestId: z.string().uuid(),
    planId: z.enum(["starter", "growth", "pro", "agency"]),
    seatQuantity: z.number().int().min(0).max(1000).optional(),
  })
  .strict();
export const stripePortalInput = z.object({ requestId: z.string().uuid() }).strict();

/** The mode this caller may use: test only, and only when explicitly
 * allowlisted. Live is never returned while the activation hold stands. */
function resolveMode(
  userId: string,
  config: { sandboxOwners: ReadonlySet<string>; checkoutReady: (mode: StripeMode) => boolean },
): StripeMode | null {
  if (liveModeAllowed()) return "live";
  if (!config.sandboxOwners.has(userId.toLowerCase())) return null;
  return config.checkoutReady("test") ? "test" : null;
}

/** UI-safe status: booleans and the hold reason only, never ids, keys, prices
 * or account configuration. */
export const getStripeLifecycleStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stripeLifecycleConfig } = await import("./stripe-lifecycle.server");
    const config = stripeLifecycleConfig();
    const mode = resolveMode(String(context.userId), config);
    return {
      liveCheckoutHeld: !liveModeAllowed(),
      sandboxAvailable: mode === "test",
      portalAvailable: mode !== null,
      message:
        "New paid Stripe subscriptions are held pending payment setup, acceptance and release.",
    };
  });

export const createStripeLifecycleCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripeCheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = String(context.userId);
    const { stripeLifecycleConfig, createStripeLifecycleCheckout } =
      await import("./stripe-lifecycle.server");
    const mode = resolveMode(userId, stripeLifecycleConfig());
    // The hold is applied BEFORE any provider or database access.
    if (mode === null) return { ok: false as const, reason: "held" };
    const result = await createStripeLifecycleCheckout({
      userId,
      requestId: data.requestId,
      planId: data.planId as PlanId,
      seatQuantity: data.seatQuantity ?? 0,
      mode,
    });
    return result.ok
      ? { ok: true as const, checkoutUrl: result.checkoutUrl, reused: result.reused }
      : { ok: false as const, reason: result.reason };
  });

export const createStripeLifecyclePortalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stripePortalInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = String(context.userId);
    const { stripeLifecycleConfig, createStripeLifecyclePortal } =
      await import("./stripe-lifecycle.server");
    const mode = resolveMode(userId, stripeLifecycleConfig());
    if (mode === null) return { ok: false as const, reason: "held" };
    const result = await createStripeLifecyclePortal({
      userId,
      requestId: data.requestId,
      mode,
    });
    return result.ok
      ? { ok: true as const, portalUrl: result.portalUrl }
      : { ok: false as const, reason: result.reason };
  });
