/**
 * Entitlement storage access — SERVER ONLY (service role).
 *
 * public.entitlements is readable by its owner and writable by nobody except
 * the service role, so every write path in the product funnels through here:
 * the Paddle webhook and the owner-gated manual override. Never import this
 * from client code.
 */
import {
  FREE_ENTITLEMENT,
  entitlementFromRow,
  effectivePlanId,
  type Entitlement,
} from "./entitlements";
import type { PlanId, SubscriptionStatus } from "./billing";

type Row = Record<string, unknown>;
type Admin = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => Promise<{ data: Row | null; error: { message?: string } | null }>;
      };
    };
    upsert: (
      values: Row,
      options?: { onConflict?: string },
    ) => Promise<{ error: { message?: string; code?: string } | null }>;
    insert: (values: Row) => Promise<{ error: { message?: string; code?: string } | null }>;
    delete: () => {
      eq: (c: string, v: string) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** Read a user's entitlement. Any failure resolves to the free tier. */
export async function readEntitlement(userId: string): Promise<Entitlement> {
  if (!userId) return FREE_ENTITLEMENT;
  try {
    const db = await admin();
    const { data, error } = await db
      .from("entitlements")
      .select(
        "plan_id,status,current_period_end,cancel_at_period_end,provider,provider_customer_id,provider_subscription_id,updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[entitlements] read failed, falling back to free", { message: error.message });
      return FREE_ENTITLEMENT;
    }
    return entitlementFromRow(data);
  } catch (e) {
    console.error("[entitlements] read threw, falling back to free", {
      message: e instanceof Error ? e.message : "unknown",
    });
    return FREE_ENTITLEMENT;
  }
}

/** The effective plan for a user, fail-closed to freePreview. */
export async function resolveEntitledPlan(userId: string): Promise<PlanId> {
  return effectivePlanId(await readEntitlement(userId));
}

export interface EntitlementWrite {
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  provider?: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

/** Upsert an entitlement row (service role). Throws on failure so callers can 500. */
export async function writeEntitlement(w: EntitlementWrite): Promise<void> {
  const db = await admin();
  const { error } = await db.from("entitlements").upsert(
    {
      user_id: w.userId,
      plan_id: w.planId,
      status: w.status,
      current_period_end: w.currentPeriodEnd ?? null,
      cancel_at_period_end: w.cancelAtPeriodEnd ?? false,
      provider: w.provider ?? "paddle",
      provider_customer_id: w.providerCustomerId ?? null,
      provider_subscription_id: w.providerSubscriptionId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`entitlement_write_failed: ${error.message ?? "unknown"}`);
}

/**
 * Idempotency guard: record the provider event id BEFORE applying it. Returns
 * false when the same event was already processed (duplicate delivery).
 */
export async function claimWebhookEvent(
  eventId: string,
  eventType: string,
  provider = "paddle",
): Promise<boolean> {
  const db = await admin();
  const { error } = await db.from("billing_webhook_events").insert({
    event_id: eventId,
    provider,
    event_type: eventType,
  });
  if (!error) return true;
  // 23505 = unique_violation → already handled.
  if (error.code === "23505" || /duplicate key/i.test(error.message ?? "")) return false;
  throw new Error(`webhook_claim_failed: ${error.message ?? "unknown"}`);
}

/**
 * Release a claimed event id so a failed apply can be retried by the provider.
 * Best-effort: a failure here only means the retry is skipped as a duplicate.
 */
export async function releaseWebhookEvent(eventId: string): Promise<void> {
  try {
    const db = await admin();
    await db.from("billing_webhook_events").delete().eq("event_id", eventId);
  } catch {
    /* best effort */
  }
}
