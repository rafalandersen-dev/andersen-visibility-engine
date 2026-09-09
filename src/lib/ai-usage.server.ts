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
 * Plans resolve from server-owned entitlements. AI_METERING_ENFORCED controls
 * interactive quota enforcement, not whether an unrecorded call is allowed:
 * every claim must return a valid confirmation before costly work starts.
 * Background callers can require enforcement even during a record-only beta.
 * This counter is not yet a monetary budget or a delivered-result allowance.
 */
import { PLAN_LIMITS, type PlanId, type PlanLimits } from "./billing";

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

export class UsageUnavailableError extends Error {
  readonly code = "usage_unavailable";
  constructor(readonly bucket: UsageBucket) {
    super(
      "Milo cannot verify your AI usage right now. AI work is paused; please try again later. You can still read and edit your content.",
    );
    this.name = "UsageUnavailableError";
  }
}

const MAX_USAGE = 2_147_483_647;
export const AI_USAGE_LOOKUP_TIMEOUT_MS = 10_000;

/** A late entitlement read must not claim quota, and a late quota claim must
 * not start a provider after the caller has already received an error. A claim
 * may still commit in Postgres; that uncertain usage is not assumed refunded.
 */
async function boundedUsageLookup<T>(bucket: UsageBucket, work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new UsageUnavailableError(bucket)),
          AI_USAGE_LOOKUP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function validUsed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_USAGE;
}

function unavailable(bucket: UsageBucket, reason: string): never {
  // Log a bounded reason, never provider responses, credentials or user data.
  console.error("[ai-usage] work paused", { bucket, reason });
  throw new UsageUnavailableError(bucket);
}

function confirmedClaim(data: unknown, cap: number, units: number): Claim | undefined {
  if (!Array.isArray(data) || data.length !== 1) return undefined;
  const row = data[0] as Partial<Claim> | null;
  if (!row || !validUsed(row.used) || row.cap !== cap || typeof row.allowed !== "boolean")
    return undefined;
  if (row.allowed && (row.used < units || (cap >= 0 && row.used > cap))) return undefined;
  if (!row.allowed && (cap < 0 || row.used + units <= cap)) return undefined;
  return row as Claim;
}

/**
 * Claim `units` from a bucket, or throw. Returns the post-claim usage so a
 * caller can surface "3 of 10 used" without a second query.
 */
export async function claimAiUsage(args: {
  userId: string;
  bucket: UsageBucket;
  units?: number;
  now?: Date;
  /** Server-only background work must enforce quotas even in record-only beta. */
  enforceLimit?: boolean;
  /** Test seams; production resolves both server-side. */
  planOverride?: PlanId;
  isOwnerOverride?: boolean;
}): Promise<Claim> {
  const { userId, bucket } = args;
  const units = args.units ?? 1;
  if (!Number.isInteger(units) || units <= 0 || units > MAX_USAGE) {
    throw new RangeError("AI usage units must be a positive PostgreSQL integer.");
  }
  // Entitlements and owner roles are resolved server-side, never from a workspace blob.
  const [plan, isOwner] = await boundedUsageLookup(
    bucket,
    Promise.all([
      args.planOverride !== undefined ? Promise.resolve(args.planOverride) : resolvePlan(userId),
      args.isOwnerOverride !== undefined
        ? Promise.resolve(args.isOwnerOverride)
        : resolveOwner(userId),
    ]),
  );
  const realCap = capFor(plan, bucket, isOwner);
  // Record-only mode may exceed the plan cap, but still requires a confirmed claim.
  const enforcing =
    args.enforceLimit === true || (process.env.AI_METERING_ENFORCED ?? "").trim() === "true";
  const cap = enforcing ? realCap : -1;

  let response: { data: unknown; error: { message: string } | null };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Proxy — call rpc as a METHOD. PostgREST returns a builder, not a Promise,
    // so this is awaited rather than .catch()-ed.
    const admin = supabaseAdmin as unknown as {
      rpc: (
        fn: string,
        params: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };

    response = await boundedUsageLookup(
      bucket,
      admin.rpc("claim_ai_usage", {
        p_user: userId,
        p_period: usagePeriod(args.now),
        p_bucket: bucket,
        p_cap: cap,
        p_units: units,
      }),
    );
  } catch {
    return unavailable(bucket, "claim_transport_failed");
  }
  if (!response || response.error) return unavailable(bucket, "claim_failed");
  const row = confirmedClaim(response.data, cap, units);
  if (!row) return unavailable(bucket, "claim_unconfirmed");
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

/** Planning hint only. The atomic claim remains authoritative for each operation. */
export async function remainingAiUsage(args: {
  userId: string;
  bucket: UsageBucket;
  now?: Date;
}): Promise<number> {
  const [plan, isOwner] = await boundedUsageLookup(
    args.bucket,
    Promise.all([resolvePlan(args.userId), resolveOwner(args.userId)]),
  );
  const cap = capFor(plan, args.bucket, isOwner);
  if (cap < 0) return -1;
  let response: { data: { used?: unknown } | null; error: unknown };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    response = await boundedUsageLookup(
      args.bucket,
      supabaseAdmin
        .from("ai_usage")
        .select("used")
        .eq("user_id", args.userId)
        .eq("period", usagePeriod(args.now))
        .eq("bucket", args.bucket)
        .maybeSingle(),
    );
  } catch {
    return unavailable(args.bucket, "usage_read_transport_failed");
  }
  if (!response || response.error) return unavailable(args.bucket, "usage_read_failed");
  // Unlike a claim, an absent counter is valid: no successful use this month.
  const used = response.data === null ? 0 : response.data?.used;
  if (!validUsed(used)) return unavailable(args.bucket, "usage_read_invalid");
  return Math.max(0, cap - used);
}

export class ImageGenerationGateError extends Error {
  readonly code = "feature_gate";
  constructor(message: string) {
    super(message);
    this.name = "ImageGenerationGateError";
  }
}

/**
 * Hard plan gate for AI image generation — Pro/Agency only (owner decision
 * 2026-08-17). Unlike the metered buckets this is NOT behind
 * AI_METERING_ENFORCED: an image call is the most expensive single AI click in
 * the product, and the entitled plan resolves from the service-role-only
 * entitlements table, so this gate is trustworthy today. The owner bypass
 * follows the raised-ceiling philosophy above — the owner account keeps the
 * feature (batch tooling depends on it) while spend stays visible through the
 * recorded imageGeneration bucket.
 */
export async function assertImageGenerationAllowed(args: {
  userId: string;
  /** Test seams; production resolves both server-side. */
  planOverride?: PlanId;
  isOwnerOverride?: boolean;
}): Promise<void> {
  const [plan, isOwner] = await boundedUsageLookup(
    "imageGeneration",
    Promise.all([
      args.planOverride !== undefined
        ? Promise.resolve(args.planOverride)
        : resolvePlan(args.userId),
      args.isOwnerOverride !== undefined
        ? Promise.resolve(args.isOwnerOverride)
        : resolveOwner(args.userId),
    ]),
  );
  if (isOwner) return;
  if (!PLAN_LIMITS[plan].imageGenerationEnabled) {
    throw new ImageGenerationGateError(
      "AI image generation is included in the Pro and Agency plans. Upgrade to generate images — or upload your own.",
    );
  }
}

/**
 * The caller's plan, from public.entitlements — a service-role-write-only
 * table. The old source (workspace_meta.subscription) was client-writable, so
 * a user could PATCH themselves onto the agency tier. Fails closed: no row,
 * non-paid status, lapsed period or a read error all resolve to freePreview.
 */
async function resolvePlan(userId: string): Promise<PlanId> {
  try {
    const { resolveEntitledPlan } = await import("./entitlements.server");
    return await resolveEntitledPlan(userId);
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
