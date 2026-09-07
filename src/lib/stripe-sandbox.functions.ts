import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getStripeSandboxStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    const { stripeSandboxConfig } = await import("./stripe-sandbox.server");
    const config = stripeSandboxConfig();
    return { available: config.checkoutReady && config.webhookReady };
  });

export const createStripeSandboxCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    const { createStripeSandboxCheckout, stripeSandboxConfig } =
      await import("./stripe-sandbox.server");
    if (!stripeSandboxConfig().webhookReady) return { ok: false as const };
    try {
      return {
        ok: true as const,
        ...(await createStripeSandboxCheckout(context.userId, data.requestId)),
      };
    } catch {
      return { ok: false as const };
    }
  });
