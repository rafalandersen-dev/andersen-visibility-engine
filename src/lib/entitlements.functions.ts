/**
 * Entitlement read/override RPCs.
 *
 * The browser never writes entitlements. It reads its own via this function
 * (which also serves SSR-safe display), and the owner can apply a manual
 * beta/comped override — verified server-side against public.user_roles, not
 * against anything the caller sends.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FREE_ENTITLEMENT, effectivePlanId, type Entitlement } from "./entitlements";
import { PLAN_IDS } from "./billing";

export const getMyEntitlementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ entitlement: Entitlement; effectivePlanId: string }> => {
    const { readEntitlement } = await import("./entitlements.server");
    const entitlement = await readEntitlement(context.userId);
    return { entitlement, effectivePlanId: effectivePlanId(entitlement) };
  });

/**
 * Owner-only manual override (beta / comped / reset to free).
 *
 * The owner role is NOT sufficient. A manual write replaces whatever the
 * entitlement row says, so applying one on top of a live or unresolved Stripe
 * agreement would silently contradict the provider — and the UI's disabled
 * state is no protection at all against a direct call to this function. The
 * narrow server-side clearance below therefore runs for every manual status,
 * including the Free reset, and FAILS CLOSED: unknown, stale, malformed or
 * unreadable billing state holds the write instead of allowing it.
 *
 * It deliberately does not reach the provider, add a policy or widen this
 * endpoint: valid manual and Paddle accounts keep the behaviour they have
 * today, and the clearance only refuses what it can positively see is
 * unresolved or cannot see at all.
 */
export const setManualEntitlementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        planId: z.enum(PLAN_IDS as [string, ...string[]]),
        status: z.enum(["manualBeta", "manualComped", "freePreview"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ entitlement: Entitlement }> => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Forbidden");

    const { evaluateManualEntitlementClearance } = await import("./stripe-commercial.server");
    const clearance = await evaluateManualEntitlementClearance(String(context.userId));
    // A finite local code only: no provider text, id, key or operator detail.
    if (!clearance.allowed) throw new Error(`manual_override_held:${clearance.reason}`);

    const { writeEntitlement, readEntitlement } = await import("./entitlements.server");
    const free = data.status === "freePreview";
    await writeEntitlement({
      userId: context.userId,
      planId: free ? "freePreview" : (data.planId as Entitlement["planId"]),
      status: data.status as Entitlement["status"],
      provider: "manual",
    });
    return { entitlement: free ? FREE_ENTITLEMENT : await readEntitlement(context.userId) };
  });
