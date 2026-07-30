/**
 * Paddle billing webhook — the ONLY path that grants paid access.
 *
 * Security posture:
 *  - Every request is verified against PADDLE_WEBHOOK_SECRET (HMAC-SHA256 over
 *    "<ts>:<raw body>", timing-safe compare, ±5 min freshness). Unsigned,
 *    badly signed or stale requests get 401 and are logged.
 *  - Idempotent: the Paddle event id is claimed in billing_webhook_events
 *    before the entitlement is touched, so a redelivery is a no-op.
 *  - Writes go to public.entitlements with the service role. The browser can
 *    only read that table, so a user can never promote themselves.
 *  - canceled / past_due downgrade to freePreview — a lapsed payment really
 *    loses access.
 *  - Malformed bodies return 400 rather than throwing.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { isPlanId } from "@/lib/entitlements";
import type { PlanId, SubscriptionStatus } from "@/lib/billing";

const MAX_SKEW_SECONDS = 300;

function secret(): string {
  return (process.env.PADDLE_WEBHOOK_SECRET ?? "").trim();
}

/** Parse "ts=123;h1=abc" (Paddle-Signature). */
function parseSignatureHeader(header: string): { ts: string; h1: string } | null {
  const parts = header.split(";");
  let ts = "";
  let h1 = "";
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k?.trim() === "ts") ts = (v ?? "").trim();
    if (k?.trim() === "h1") h1 = (v ?? "").trim();
  }
  return ts && h1 ? { ts, h1 } : null;
}

function verifySignature(header: string | null, rawBody: string, key: string): boolean {
  if (!header) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const tsSeconds = Number(parsed.ts);
  if (!Number.isFinite(tsSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - tsSeconds) > MAX_SKEW_SECONDS) return false;

  const expected = createHmac("sha256", key).update(`${parsed.ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parsed.h1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Reverse-lookup a plan from a Paddle price id via the PADDLE_PRICE_* env. */
function planFromPriceId(priceId: string): PlanId | null {
  if (!priceId) return null;
  const map: Record<string, PlanId> = {
    STARTER: "starter",
    GROWTH: "growth",
    PRO: "pro",
    AGENCY: "agency",
  };
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("PADDLE_PRICE_") || (value ?? "").trim() !== priceId) continue;
    const planKey = name.slice("PADDLE_PRICE_".length).split("_")[0];
    const plan = map[planKey];
    if (plan) return plan;
  }
  return null;
}

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  data?: Record<string, unknown>;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Pull the plan out of custom_data, then the price ids. Unknown → freePreview. */
function resolvePlan(data: Record<string, unknown>): PlanId {
  const custom = (data.custom_data ?? {}) as Record<string, unknown>;
  const declared = str(custom.plan_id) ?? str(custom.planId);
  if (isPlanId(declared) && declared !== "freePreview") return declared;

  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const price = (item as { price?: { id?: unknown }; price_id?: unknown }) ?? {};
    const priceId = str(price.price?.id) ?? str(price.price_id);
    const plan = priceId ? planFromPriceId(priceId) : null;
    if (plan) return plan;
  }
  return "freePreview";
}

/** The user this event belongs to: only ever from custom_data set at checkout. */
function resolveUserId(data: Record<string, unknown>): string | undefined {
  const custom = (data.custom_data ?? {}) as Record<string, unknown>;
  return str(custom.user_id) ?? str(custom.userId);
}

const DOWNGRADE_EVENTS = new Set([
  "subscription.canceled",
  "subscription.cancelled",
  "subscription.past_due",
  "subscription.paused",
]);
const GRANT_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.resumed",
  "transaction.completed",
]);

export const Route = createFileRoute("/api/public/webhooks/paddle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = secret();
        if (!key) {
          console.error("[paddle-webhook] PADDLE_WEBHOOK_SECRET is not configured — rejecting");
          return new Response("Webhook not configured", { status: 503 });
        }

        const rawBody = await request.text().catch(() => "");
        const signature = request.headers.get("paddle-signature");
        if (!verifySignature(signature, rawBody, key)) {
          console.warn("[paddle-webhook] rejected request with missing/invalid signature");
          return new Response("Invalid signature", { status: 401 });
        }

        let event: PaddleEvent;
        try {
          const parsed = rawBody ? JSON.parse(rawBody) : null;
          if (!parsed || typeof parsed !== "object") throw new Error("not an object");
          event = parsed as PaddleEvent;
        } catch {
          console.warn("[paddle-webhook] malformed JSON body");
          return new Response("Malformed payload", { status: 400 });
        }

        const eventId = str(event.event_id);
        const eventType = str(event.event_type);
        const data = (event.data ?? {}) as Record<string, unknown>;
        if (!eventId || !eventType) {
          console.warn("[paddle-webhook] payload missing event_id/event_type");
          return new Response("Malformed payload", { status: 400 });
        }

        const relevant = GRANT_EVENTS.has(eventType) || DOWNGRADE_EVENTS.has(eventType);
        if (!relevant) return Response.json({ ok: true, ignored: eventType });

        const userId = resolveUserId(data);
        if (!userId) {
          // Nothing to key on: acknowledge so Paddle stops retrying, but log loudly.
          console.error("[paddle-webhook] no user_id in custom_data — cannot apply", {
            eventType,
            eventId,
          });
          return Response.json({ ok: true, skipped: "no_user" });
        }

        let claimed = false;
        let release: ((id: string) => Promise<void>) | null = null;
        try {
          const { claimWebhookEvent, writeEntitlement, releaseWebhookEvent } = await import(
            "@/lib/entitlements.server"
          );
          release = releaseWebhookEvent;
          const fresh = await claimWebhookEvent(eventId, eventType);
          if (!fresh) return Response.json({ ok: true, duplicate: true });
          claimed = true;

          const customerId = str(data.customer_id);
          const subscriptionId = str(data.subscription_id) ?? str(data.id);
          const nextBilledAt =
            str(data.next_billed_at) ??
            str((data.current_billing_period as { ends_at?: unknown } | undefined)?.ends_at);

          if (DOWNGRADE_EVENTS.has(eventType)) {
            await writeEntitlement({
              userId,
              planId: "freePreview",
              status: eventType.includes("past_due") ? "pastDue" : "cancelled",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              providerCustomerId: customerId ?? null,
              providerSubscriptionId: subscriptionId ?? null,
            });
            console.log("[paddle-webhook] downgraded to free", { eventType, eventId });
            return Response.json({ ok: true, applied: "downgrade" });
          }

          const planId = resolvePlan(data);
          const paddleStatus = str(data.status);
          // Fail closed: only an explicitly active/trialing subscription grants
          // the plan; anything else stays on free.
          const grants =
            planId !== "freePreview" &&
            (eventType === "transaction.completed" ||
              paddleStatus === "active" ||
              paddleStatus === "trialing" ||
              eventType === "subscription.activated");
          const status: SubscriptionStatus = grants ? "active" : "freePreview";

          await writeEntitlement({
            userId,
            planId: grants ? planId : "freePreview",
            status,
            currentPeriodEnd: grants ? (nextBilledAt ?? null) : null,
            cancelAtPeriodEnd: data.scheduled_change != null,
            providerCustomerId: customerId ?? null,
            providerSubscriptionId: subscriptionId ?? null,
          });
          console.log("[paddle-webhook] entitlement applied", { eventType, eventId, grants });
          return Response.json({ ok: true, applied: grants ? "grant" : "free" });
        } catch (e) {
          // 500 makes Paddle retry; the idempotency claim keeps that safe.
          console.error("[paddle-webhook] processing failed", {
            eventType,
            eventId,
            message: e instanceof Error ? e.message : "unknown",
          });
          // Un-claim so Paddle's retry is applied instead of skipped as a dupe.
          if (claimed && release) await release(eventId);
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
