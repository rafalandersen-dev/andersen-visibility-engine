/**
 * AI spend metering.
 *
 * The plan limits have been advertised on the pricing page since launch and
 * enforced in exactly zero places: `monthlyContentGenerations`,
 * `monthlyMiloScores` and their siblings had no call sites at all. Until now the
 * only thing limiting AI spend was how many clicks it took a user to generate
 * something — which is precisely the friction the redesign is removing, so this
 * has to land before generation gets easier.
 *
 * Enforced at the single chokepoint every AI server function passes through,
 * downstream of `requireSupabaseAuth` (so the user is known and verified) and
 * upstream of the model call (so a refusal costs nothing). Every other candidate
 * fails: a disabled button is a button, the client store is browser memory, the
 * in-flight `once()` guard is a per-tab Set that dies on reload, and a Postgres
 * trigger would fire after the money was already spent.
 *
 * The claim is atomic in Postgres. Read-decide-write in three steps would let
 * two tabs both pass the check at the cap boundary.
 */
import { PLAN_LIMITS, getCurrentPlanId, type PlanId, type PlanLimits } from "./billing";
import type { SubscriptionPlan } from "./billing";

/** Which advertised limit a given AI call draws from. */
export type UsageBucket =
  | "contentGeneration"
  | "improveDraft"
  | "miloScore"
  | "audit"
  | "authority"
  | "gscImport"
  | "aiCredits";

const BUCKET_LIMIT: Record<UsageBucket, keyof PlanLimits> = {
  contentGeneration: "monthlyContentGenerations",
  improveDraft: "monthlyImproveDrafts",
  miloScore: "monthlyMiloScores",
  audit: "monthlyAudits",
  authority: "monthlyAuthorityGenerations",
  gscImport: "monthlyGscImports",
  aiCredits: "monthlyAiCredits",
};

/**
 * Owners get a raised ceiling, never an absent one.
 *
 * `canUseFeature` starts with `if (opts.isOwner) return true`, and copying that
 * precedent here would mean the account with five projects and the MCP connector
 * attached is the one account that can never hit a wall — while a gateway 402
 * from its spend would stop AI for every paying customer at once.
 */
export const OWNER_MULTIPLIER = 10;

/** Calendar month in UTC. Stable across timezones and trivially human-readable. */
export function usagePeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** -1 means unlimited: still recorded, so spend stays visible. */
export function capFor(plan: PlanId, bucket: UsageBucket, isOwner = false): number {
  const limits = PLAN_LIMITS[plan];
  const raw = limits?.[BUCKET_LIMIT[bucket]];
  const cap = typeof raw === "number" ? raw : 0;
  if (cap < 0) return -1;
  return isOwner ? cap * OWNER_MULTIPLIER : cap;
}

export class UsageLimitError extends Error {
  readonly code = "usage_limit";
  constructor(
    readonly bucket: UsageBucket,
    readonly used: number,
    readonly cap: number,
    message: string,
  ) {
    super(message);
    this.name = "UsageLimitError";
  }
}

const FRIENDLY: Record<UsageBucket, string> = {
  contentGeneration: "content generations",
  improveDraft: "draft improvements",
  miloScore: "Milo Score runs",
  audit: "site audits",
  authority: "authority analyses",
  gscImport: "Search Console imports",
  aiCredits: "AI credits",
};

type Claim = { used: number; cap: number; allowed: boolean };

/**
 * Claim `units` from a bucket, or throw. Returns the post-claim usage so a
 * caller can surface "3 of 10 used" without a second query.
 */
export async function claimAiUsage(args: {
  userId: string;
  bucket: UsageBucket;
  isOwner?: boolean;
  units?: number;
  now?: Date;
  /** Test seam; production resolves the plan from the workspace. */
  planOverride?: PlanId;
}): Promise<Claim> {
  const { userId, bucket } = args;
  const units = args.units ?? 1;
  // The plan is read SERVER-side from the caller's own workspace. Accepting it
  // as an argument from the browser would let anyone declare themselves Pro.
  const plan = args.planOverride ?? (await resolvePlan(userId));
  const cap = capFor(plan, bucket, args.isOwner);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Proxy — call rpc as a METHOD. PostgREST returns a builder, not a Promise,
  // so this is awaited rather than .catch()-ed.
  const admin = supabaseAdmin as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await admin.rpc("claim_ai_usage", {
    p_user: userId,
    p_period: usagePeriod(args.now),
    p_bucket: bucket,
    p_cap: cap,
    p_units: units,
  });

  if (error) {
    // Fail OPEN on an infrastructure error. A metering outage must not take the
    // whole product down for paying customers; the spend alert is the backstop.
    console.error("[ai-usage] claim failed, allowing the call", { bucket, message: error.message });
    return { used: 0, cap, allowed: true };
  }

  const row = Array.isArray(data) ? (data[0] as Claim | undefined) : undefined;
  if (!row) return { used: 0, cap, allowed: true };
  if (!row.allowed) {
    throw new UsageLimitError(
      bucket,
      row.used,
      cap,
      `You have used all ${cap} ${FRIENDLY[bucket]} on your plan this month. They reset on the 1st — or upgrade for more.`,
    );
  }
  return row;
}

/** Read the caller's plan from their own workspace blob. Defaults to free. */
async function resolvePlan(userId: string): Promise<PlanId> {
  try {
    const { readWorkspaceRow } = await import("./workspace.server");
    const row = await readWorkspaceRow(userId);
    const sub = row?.data?.subscription as SubscriptionPlan | undefined;
    return getCurrentPlanId(sub);
  } catch {
    // Unknown plan must not mean "unlimited".
    return "freePreview";
  }
}
