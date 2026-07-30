/**
 * Paddle-first checkout architecture (server-only). Paddle is the intended
 * Merchant of Record. This sprint builds the architecture: env-driven product
 * IDs, graceful "not configured" handling and a checkout-session creator. The
 * Paddle API key is read server-side only and never returned to the client.
 *
 * Paid access is granted ONLY by the signed Paddle webhook
 * (src/routes/api/public/webhooks/paddle.ts) writing public.entitlements with
 * the service role. Checkout passes the Supabase user id in `custom_data` so
 * the webhook can map the subscription back to the account.
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
  // Checkout works once the owner creates the PADDLE_PRICE_AGENCY_* prices —
  // until then priceIdFor returns "" and the checkout fn responds with the
  // graceful "not configured for this plan/market" message.
  agency: "AGENCY",
};

function paddleApiKey(): string {
  return (process.env.PADDLE_API_KEY ?? "").trim();
}
function paddleEnv(): "sandbox" | "production" {
  return (process.env.PADDLE_ENVIRONMENT ?? "").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
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
        planId: z.enum(["freePreview", "starter", "growth", "pro", "agency"]),
        billingMarket: z.enum([
          "Poland",
          "Sweden",
          "Denmark",
          "United Kingdom",
          "European Union",
          "Other",
        ]),
        billingEmail: z.string().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      configured: boolean;
      checkoutUrl?: string;
      message?: string;
      error?: string;
    }> => {
      const key = paddleApiKey();
      if (!key) {
        return {
          configured: false,
          message: "Checkout is not configured yet. Contact support to activate this plan.",
        };
      }
      const priceId = priceIdFor(data.billingMarket as BillingMarket, data.planId as PlanId);
      if (!priceId) {
        return {
          configured: false,
          message:
            "Checkout is not configured for this plan/market yet. Contact support to activate it.",
        };
      }

      // Architecture in place: create a Paddle transaction and return its checkout URL.
      // (Runs only when both the API key and the price id env are present.)
      const base =
        paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
      try {
        const res = await fetch(`${base}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            items: [{ price_id: priceId, quantity: 1 }],
            ...(data.billingEmail ? { customer: { email: data.billingEmail } } : {}),
            // The webhook keys entitlements on this; without it a payment
            // cannot be attributed to an account.
            custom_data: { user_id: context.userId, plan_id: data.planId },
          }),
        });
        const raw = await res.text().catch(() => "");
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = undefined;
        }
        if (!res.ok) {
          console.warn("[billing.functions] paddle transaction failed", { status: res.status });
          return {
            configured: true,
            error: "Could not start checkout right now. Please try again or contact support.",
          };
        }
        const url =
          body && typeof body === "object" && "data" in body
            ? ((body as { data?: { checkout?: { url?: string } } }).data?.checkout?.url ?? "")
            : "";
        return {
          configured: true,
          checkoutUrl: url || undefined,
          message: url ? undefined : "Checkout created — complete payment in Paddle.",
        };
      } catch {
        return {
          configured: true,
          error: "Could not reach the payment provider. Please try again later.",
        };
      }
    },
  );

/**
 * Creates short-lived, authenticated Paddle portal links on demand. The UI
 * uses the subscription-specific cancellation deep link when available, so
 * cancelling is a visible first-class account action rather than a support
 * request or a hidden settings path.
 */
export const createPaddlePortalSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        customerId: z.string().min(1),
        subscriptionId: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      configured: boolean;
      overviewUrl?: string;
      cancelUrl?: string;
      message?: string;
      error?: string;
    }> => {
      const key = paddleApiKey();
      if (!key) {
        return {
          configured: false,
          message:
            "Subscription management is not configured yet. Contact support and we will handle your request immediately.",
        };
      }
      const base =
        paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
      try {
        const response = await fetch(
          `${base}/customers/${encodeURIComponent(data.customerId)}/portal-sessions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "Paddle-Version": "1",
            },
            body: JSON.stringify(
              data.subscriptionId ? { subscription_ids: [data.subscriptionId] } : {},
            ),
          },
        );
        const raw = await response.text().catch(() => "");
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = undefined;
        }
        if (!response.ok) {
          console.warn("[billing.functions] paddle portal session failed", {
            status: response.status,
          });
          return {
            configured: true,
            error:
              "Could not open subscription management right now. Please try again or contact support.",
          };
        }
        const portal =
          body && typeof body === "object" && "data" in body
            ? (
                body as {
                  data?: {
                    urls?: {
                      general?: { overview?: string };
                      subscriptions?: Array<{ id?: string; cancel_subscription?: string }>;
                    };
                  };
                }
              ).data?.urls
            : undefined;
        return {
          configured: true,
          overviewUrl: portal?.general?.overview,
          cancelUrl: portal?.subscriptions?.find(
            (subscription) => subscription.id === data.subscriptionId,
          )?.cancel_subscription,
        };
      } catch {
        return {
          configured: true,
          error: "Could not reach the billing provider. Please try again later.",
        };
      }
    },
  );
