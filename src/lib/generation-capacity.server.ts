import { z } from "zod";
import type { PlanId } from "./billing";
import { effectivePlanId, entitlementFromRow, isPlanId } from "./entitlements";
import { capFor, usagePeriod } from "./ai-usage.server";
import type { GenerationCapacity } from "./scheduler-capacity";

type Response = { data: unknown; error: unknown };
interface Query extends PromiseLike<Response> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  limit(n: number): Query;
}
export interface CapacityReader {
  from(table: string): Query;
}
const entitlementSchema = z
  .array(
    z.object({
      plan_id: z.custom<PlanId>(isPlanId),
      status: z.enum([
        "freePreview",
        "checkoutPending",
        "active",
        "pastDue",
        "cancelled",
        "manualBeta",
        "manualComped",
      ]),
      current_period_end: z.string().datetime({ offset: true }).nullable(),
    }),
  )
  .max(1);
const ownerSchema = z.array(z.object({ role: z.literal("owner") })).max(1);
const usageSchema = z.array(z.object({ used: z.number().int().min(0).max(2_147_483_647) })).max(1);

/** Strict, read-only planning snapshot. A failed source is unknown, never a fabricated zero allowance. */
export async function readGenerationCapacity(
  userId: string,
  now: Date,
  db: CapacityReader,
): Promise<GenerationCapacity> {
  const period = usagePeriod(now);
  try {
    const [entitlement, owner, usage] = await Promise.all([
      db
        .from("entitlements")
        .select("plan_id,status,current_period_end")
        .eq("user_id", userId)
        .limit(2),
      db.from("user_roles").select("role").eq("user_id", userId).eq("role", "owner").limit(2),
      db
        .from("ai_usage")
        .select("used")
        .eq("user_id", userId)
        .eq("period", period)
        .eq("bucket", "contentGeneration")
        .limit(2),
    ]);
    if (entitlement.error || owner.error || usage.error) throw new Error("capacity_unavailable");
    const plan = effectivePlanId(
      entitlementFromRow(entitlementSchema.parse(entitlement.data)[0]),
      now,
    );
    const isOwner = ownerSchema.parse(owner.data).length === 1;
    const used = usageSchema.parse(usage.data)[0]?.used ?? 0;
    const cap = capFor(plan, "contentGeneration", isOwner);
    return {
      status: "verified",
      remaining: cap < 0 ? -1 : Math.max(0, cap - used),
      usagePeriod: period,
    };
  } catch {
    // Other operational notifications must remain available during metering outages.
    return { status: "unavailable", usagePeriod: period };
  }
}
