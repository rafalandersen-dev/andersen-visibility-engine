/**
 * Legacy Paddle subscription management (server-only).
 * Stripe is the selected replacement; its isolated owner sandbox does not
 * activate paid plans. New Paddle checkout stays closed regardless of legacy
 * configuration until the commercial migration and acceptance are completed.
 * Existing signed webhooks and caller-scoped portal management remain intact.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
function paddleApiKey(): string {
  return (process.env.PADDLE_API_KEY ?? "").trim();
}
function paddleEnv(): "sandbox" | "production" {
  return (process.env.PADDLE_ENVIRONMENT ?? "").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}
/** UI-safe status — booleans only, never the key itself. */
export const getPaddleStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    configured: Boolean(paddleApiKey()),
    environment: paddleEnv(),
    checkoutAvailable: false,
  }));

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
  // Keep the validated, authenticated legacy endpoint for old clients, but do
  // not create a transaction or grant access under the paid-launch hold.
  .handler(async () => ({
    configured: false,
    checkoutAvailable: false,
    message:
      "New paid subscriptions are on hold pending payment setup and verification. Existing subscribers can still manage their linked subscription.",
  }));

/**
 * Creates short-lived, authenticated Paddle portal links on demand. The UI
 * uses the subscription-specific cancellation deep link when available, so
 * cancelling is a visible first-class account action rather than a support
 * request or a hidden settings path.
 *
 * The Paddle customer/subscription ids are resolved SERVER-side from the
 * caller's own entitlement row (P1-10). They used to arrive in the request
 * body, which let any authenticated user mint a portal session — including
 * the cancellation deep link — for any other customer's billing account.
 */
export const createPaddlePortalSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
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
      // The caller's OWN Paddle ids, from the service-role entitlements row —
      // never from the request body.
      const { readEntitlement } = await import("./entitlements.server");
      const entitlement = await readEntitlement(context.userId as string);
      const customerId = entitlement.providerCustomerId ?? "";
      const subscriptionId = entitlement.providerSubscriptionId ?? "";
      if (!customerId) {
        return {
          configured: true,
          message:
            "Your billing account is not linked to Paddle yet. Email billing@milogrowth.com and we will process the request immediately.",
        };
      }
      const base =
        paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
      try {
        const response = await fetch(
          `${base}/customers/${encodeURIComponent(customerId)}/portal-sessions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "Paddle-Version": "1",
            },
            body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
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
            (subscription) => subscription.id === subscriptionId,
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
