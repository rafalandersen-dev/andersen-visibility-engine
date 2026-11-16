/**
 * Stripe subscription lifecycle webhook.
 *
 * The handler is a thin shell: signature verification, mode detection, the
 * durable receipt, the fenced lease, the authoritative re-read and the atomic
 * projection all live in `stripe-lifecycle.server.ts`, so this route adds no
 * trust of its own. The legacy isolated sandbox endpoint
 * (`/api/public/webhooks/stripe-sandbox`) is
 * unchanged and keeps its own secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { receiveStripeWebhook } from "@/lib/stripe-lifecycle.server";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: ({ request }) => receiveStripeWebhook(request),
    },
  },
});
