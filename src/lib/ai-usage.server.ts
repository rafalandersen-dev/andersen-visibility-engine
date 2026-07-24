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
 *
 * ENFORCEMENT IS GATED. Usage is always RECORDED, but a refusal only fires when
 * AI_METERING_ENFORCED is set. During the invite-only beta it is off: nobody has
 * a subscription yet, so enforcing would wall every tester (and the owner) at the
 * free-preview caps from the moment this shipped. Runaway spend is still bounded
 * because generation remains an eleven-click gauntlet — the meter had to be READY
 * before that changes, not enforcing before the plan source is trustworthy.
 *
 * The plan source is NOT yet trustworthy: it lives in a client-writable blob (see
 * resolvePlan). Enforcement must not be switched on until the plan moves to a
 * service-role-only column written by the Paddle webhook. That is tracked with
 * the billing fixes that gate the paid launch.
 */
import { PLAN_LIMITS, isActivePaid, type PlanId, type PlanLimits } from "./billing";
import type { SubscriptionPlan } from "./billing";

/** Which advertised limit a given AI call draws from. */
export type UsageBucket =
  | "contentGeneration"
  | "improveDraft"
  | "miloScore"
  | "audit"
  | "authority"
  | "gscImport"
  | "imageGeneration"
  | "linkVerify"
  | "aiCredits";

const BUCKET_LIMIT: Record<UsageBucket, keyof PlanLimits> = {
  contentGeneration: "monthlyContentGenerations",
  improveDraft: "monthlyImproveDrafts",
  miloScore: "monthlyMiloScores",
  audit: "monthlyAudits",
  authority: "monthlyAuthorityGenerations",
  gscImport: "monthlyGscImports",
  imageGeneration: "monthlyImageGenerations",
  linkVerify: "monthlyLinkVerifications",
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
  imageGeneration: "image generations",
  linkVerify: "link verifications",
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
  units?: number;
  now?: Date;
  /** Test seams; production resolves both server-side. */
  planOverride?: PlanId;
  isOwnerOverride?: boolean;
}): Promise<Claim> {
  const { userId, bucket } = args;
  const units = args.units ?? 1;
  // Both resolved SERVER-side. The plan lives in a client-writable blob today, so
  // this is a mistake-guard, not yet a trust boundary — enforcement stays gated
  // until it moves off the blob. isOwner comes from the user_roles table, which
  // the client cannot write.
  const [plan, isOwner] = await Promise.all([
    args.planOverride !== undefined ? Promise.resolve(args.planOverride) : resolvePlan(userId),
    args.isOwnerOverride !== undefined
      ? Promise.resolve(args.isOwnerOverride)
      : resolveOwner(userId),
  ]);
  const realCap = capFor(plan, bucket, isOwner);
  // When enforcement is off we still RECORD every claim (pass -1 = never refuse)
  // but never block. This keeps spend visible during the beta without walling it.
  const enforcing = (process.env.AI_METERING_ENFORCED ?? "").trim() === "true";
  const cap = enforcing ? realCap : -1;

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
      realCap,
      `You have used all ${realCap} ${FRIENDLY[bucket]} on your plan this month. They reset on the 1st — or upgrade for more.`,
    );
  }
  return { ...row, cap: realCap };
}

/**
 * The caller's plan, from their workspace. Only an ACTIVE PAID subscription
 * grants its caps: a `checkoutPending` status (what the billing page writes on
 * "Choose Pro" before Paddle confirms) or a self-declared blob resolves to
 * freePreview. getCurrentPlanId used to ignore status entirely, so clicking
 * "Choose Pro" with Paddle unconfigured silently granted Pro caps.
 */
async function resolvePlan(userId: string): Promise<PlanId> {
  try {
    const { readWorkspaceRow } = await import("./workspace.server");
    const row = await readWorkspaceRow(userId);
    const sub = row?.data?.subscription as SubscriptionPlan | undefined;
    return isActivePaid(sub) && sub ? sub.planId : "freePreview";
  } catch {
    // Unknown plan must not mean "unlimited".
    return "freePreview";
  }
}

/** Owner role, from the table the client cannot write. Never trusts a caller. */
async function resolveOwner(userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (
              c: string,
              v: string,
            ) => {
              maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
            };
          };
        };
      };
    };
    const { data } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}
