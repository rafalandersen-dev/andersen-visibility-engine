/**
 * Paddle-first checkout architecture (server-only). Paddle is the intended
 * Merchant of Record. This sprint builds the architecture: env-driven product
 * IDs, graceful "not configured" handling and a checkout-session creator. The
 * Paddle API key is read server-side only and never returned to the client.
 *
 * DEFERRED (documented): webhook handling + subscription sync. Until a webhook
 * confirms payment, checkout only moves the local status to "checkoutPending" —
 * paid status is never granted purely client-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BillingMarket, PlanId } from "./billing";

const MARKET_SUFFIX: Record<BillingMarket, string> = {
  Poland: "PL",
  Sweden: "SE",
  Denmark: "DK",
  "United Kingdom": "UK",
  "European Union": "EU",
  Other: "EU",
};
const PLAN_KEY: Record<PlanId, string> = {
  freePreview: "FREE",
  starter: "STARTER",
  growth: "GROWTH",
  pro: "PRO",
};

function paddleApiKey(): string {
  return (process.env.PADDLE_API_KEY ?? "").trim();
}
function paddleEnv(): "sandbox" | "production" {
  return (process.env.PADDLE_ENVIRONMENT ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox";
}
function priceIdFor(market: BillingMarket, plan: PlanId): string {
  const key = `PADDLE_PRICE_${PLAN_KEY[plan]}_${MARKET_SUFFIX[market]}`;
  return (process.env[key] ?? "").trim();
}

/** UI-safe status — booleans only, never the key itself. */
export const getPaddleStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ configured: Boolean(paddleApiKey()), environment: paddleEnv() }));

export const createPaddleCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        planId: z.enum(["freePreview", "starter", "growth", "pro"]),
        billingMarket: z.enum(["Poland", "Sweden", "Denmark", "United Kingdom", "European Union", "Other"]),
        billingEmail: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ configured: boolean; checkoutUrl?: string; message?: string; error?: string }> => {
    const key = paddleApiKey();
    if (!key) {
      return { configured: false, message: "Checkout is not configured yet. Contact support to activate this plan." };
    }
    const priceId = priceIdFor(data.billingMarket as BillingMarket, data.planId as PlanId);
    if (!priceId) {
      return { configured: false, message: "Checkout is not configured for this plan/market yet. Contact support to activate it." };
    }

    // Architecture in place: create a Paddle transaction and return its checkout URL.
    // (Runs only when both the API key and the price id env are present.)
    const base = paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
    try {
      const res = await fetch(`${base}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          items: [{ price_id: priceId, quantity: 1 }],
          ...(data.billingEmail ? { customer: { email: data.billingEmail } } : {}),
        }),
      });
      const raw = await res.text().catch(() => "");
      let body: unknown;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
      if (!res.ok) {
        console.warn("[billing.functions] paddle transaction failed", { status: res.status });
        return { configured: true, error: "Could not start checkout right now. Please try again or contact support." };
      }
      const url =
        body && typeof body === "object" && "data" in body
          ? ((body as { data?: { checkout?: { url?: string } } }).data?.checkout?.url ?? "")
          : "";
      return { configured: true, checkoutUrl: url || undefined, message: url ? undefined : "Checkout created — complete payment in Paddle." };
    } catch {
      return { configured: true, error: "Could not reach the payment provider. Please try again later." };
    }
  });
