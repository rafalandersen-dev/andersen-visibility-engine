/**
 * Entitlements — the authoritative answer to "what plan is this account on".
 *
 * Pure, client+server safe. The DATA lives in public.entitlements, a table the
 * browser can only READ (RLS: select own row; no insert/update/delete policy at
 * all). Writes happen exclusively through the service role, from the Paddle
 * webhook or an owner-gated server function.
 *
 * Everything here FAILS CLOSED: missing, malformed, expired or unreadable
 * entitlement data resolves to `freePreview`, never to a paid tier.
 */
import type { PlanId, SubscriptionStatus } from "./billing";
import { PLAN_IDS } from "./billing";

export interface Entitlement {
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  provider: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  updatedAt?: string;
}

export const FREE_ENTITLEMENT: Entitlement = {
  planId: "freePreview",
  status: "freePreview",
  cancelAtPeriodEnd: false,
  provider: "none",
};

/** Statuses that actually grant a paid plan. */
const PAID_STATUSES: SubscriptionStatus[] = ["active", "manualBeta", "manualComped"];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as string[]).includes(value);
}

/**
 * Resolve the effective plan. Anything unexpected — unknown plan id, non-paid
 * status, lapsed period end — degrades to freePreview.
 */
export function effectivePlanId(e: Entitlement | null | undefined, now = new Date()): PlanId {
  if (!e || !isPlanId(e.planId) || e.planId === "freePreview") return "freePreview";
  if (!PAID_STATUSES.includes(e.status)) return "freePreview";
  if (e.currentPeriodEnd) {
    const end = Date.parse(e.currentPeriodEnd);
    if (Number.isFinite(end) && end <= now.getTime()) return "freePreview";
  }
  return e.planId;
}

export function isEntitlementPaid(e: Entitlement | null | undefined, now = new Date()): boolean {
  return effectivePlanId(e, now) !== "freePreview";
}

/** Map a raw DB row (snake_case) to the app shape, defensively. */
export function entitlementFromRow(row: Record<string, unknown> | null | undefined): Entitlement {
  if (!row || typeof row !== "object") return FREE_ENTITLEMENT;
  const planId = isPlanId(row.plan_id) ? row.plan_id : "freePreview";
  const status = typeof row.status === "string" ? (row.status as SubscriptionStatus) : "freePreview";
  return {
    planId,
    status,
    currentPeriodEnd:
      typeof row.current_period_end === "string" ? row.current_period_end : undefined,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    provider: typeof row.provider === "string" ? row.provider : "paddle",
    providerCustomerId:
      typeof row.provider_customer_id === "string" ? row.provider_customer_id : undefined,
    providerSubscriptionId:
      typeof row.provider_subscription_id === "string" ? row.provider_subscription_id : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}
