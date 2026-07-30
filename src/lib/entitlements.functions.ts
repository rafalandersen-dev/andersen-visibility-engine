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

/** Owner-only manual override (beta / comped / reset to free). */
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
