/**
 * Bounded weekly observation — strict server adapter (audit packet, 28 Oct 2026).
 *
 * Reads the OPTIONAL durable policy installed by
 * supabase/migrations/20261028170000_bounded_weekly_test_windows.sql and builds
 * the final pre-dispatch guard that the weekly runner hands to the three
 * provider cores. Deliberate boundaries:
 *
 * - No provisioning from ordinary callers. Registration is the privileged
 *   `register_weekly_test_window` RPC and is NOT exposed here; this module can
 *   only read, guard and stop. Nothing in it can create, renew or extend a
 *   window, mint an allowance or issue a permit.
 * - No browser/MCP surface. There is no server function, route or validator
 *   here; every export is server-only and takes a trusted owner/project scope.
 * - A project with no window row yields `null` and the runner keeps its exact
 *   current behaviour.
 */
import { z } from "zod";
import type { KnowledgeRpc } from "./project-knowledge.server";

export class WeeklyTestWindowUnavailableError extends Error {
  constructor() {
    super("weekly_test_window_unavailable");
  }
}
/** The window refuses NEW paid work. Never retried and never refunded: a
 * refusal at this boundary means the attempt is abandoned, not replayed. */
export class WeeklyTestWindowClosedError extends Error {
  constructor(readonly detail = "closed") {
    super("weekly_test_window_closed");
  }
}

export const WEEKLY_TEST_WINDOW_RPC_TIMEOUT_MS = 10_000;
/** Maximum authorized lifetime: two slots x (research + content + image) at the
 * audited 2026-09-08 native reserves. The SQL policy enforces the same bound. */
export const WEEKLY_TEST_WINDOW_LIFETIME_MICROUSD = 2_200_000;
export const WEEKLY_TEST_WINDOW_MAX_ALLOWANCES = 6;

const scopeSchema = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export type WeeklyTestWindowScope = z.infer<typeof scopeSchema>;
export const weeklyTestWindowStageSchema = z.enum(["research", "content", "image"]);
export type WeeklyTestWindowStage = z.infer<typeof weeklyTestWindowStageSchema>;

const instant = z.string().datetime({ offset: true });
const contractSchema = z
  .object({
    provider: z.literal("openai"),
    model: z.string().min(1).max(160),
    operation: z.string().min(1).max(80),
    ceilingMicrousd: z.number().int().positive().max(WEEKLY_TEST_WINDOW_LIFETIME_MICROUSD),
  })
  .strict();
export const weeklyTestWindowSchema = z
  .object({
    windowId: z.string().uuid(),
    ownerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    startsAt: instant,
    endsAt: instant,
    expectedRevision: z.number().int().positive(),
    expectedConfiguration: z.record(z.string(), z.unknown()),
    lifetimeCeilingMicrousd: z.number().int().positive().max(WEEKLY_TEST_WINDOW_LIFETIME_MICROUSD),
    revoked: z.boolean(),
    revokedAt: instant.nullable(),
    /** Server-computed effective status. Operator evidence only; reading it can
     * never renew, extend or reactivate the policy. */
    state: z.enum(["absent", "pending", "active", "expired", "revoked"]),
    fresh: z.boolean(),
    serverNow: instant,
    remainingMs: z.number().int().min(0),
    slots: z.array(instant).length(2),
    contracts: z.object({
      research: contractSchema,
      content: contractSchema,
      image: contractSchema,
    }),
    authorizedMicrousd: z.number().int().min(0).max(WEEKLY_TEST_WINDOW_LIFETIME_MICROUSD),
    allowances: z
      .array(
        z
          .object({
            publishAt: instant,
            stage: weeklyTestWindowStageSchema,
            requestId: z.string().uuid(),
            jobId: z.string().uuid(),
            provider: z.string().min(1).max(80),
            model: z.string().min(1).max(160),
            operation: z.string().min(1).max(80),
            ceilingMicrousd: z.number().int().positive(),
            period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
            expiresAt: instant,
          })
          .strict(),
      )
      .max(WEEKLY_TEST_WINDOW_MAX_ALLOWANCES),
  })
  .strict();
export type WeeklyTestWindow = z.infer<typeof weeklyTestWindowSchema>;

/**
 * One RPC round trip that fails closed.
 *
 * A reply is only usable when it is an object that carries no error AND an
 * explicitly present payload. A missing field, an `undefined` payload or a
 * non-object envelope is an UNREADABLE answer, never evidence that the project
 * has no policy: only an explicit SQL null may ever mean "no policy", so it is
 * the single value allowed through to the caller as null.
 */
async function call(
  name: string,
  args: Record<string, unknown>,
  injected?: KnowledgeRpc,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new WeeklyTestWindowUnavailableError()),
          WEEKLY_TEST_WINDOW_RPC_TIMEOUT_MS,
        );
      }),
    ]);
    if (!result || typeof result !== "object" || result.error)
      throw new WeeklyTestWindowUnavailableError();
    if (!("data" in result) || result.data === undefined)
      throw new WeeklyTestWindowUnavailableError();
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}

/** Every policy payload must prove it describes THIS owner and project. An
 * unrelated positive response can never be accepted as this scope's answer. */
function parseScoped(data: unknown, scope: WeeklyTestWindowScope): WeeklyTestWindow {
  const parsed = weeklyTestWindowSchema.safeParse(data);
  if (!parsed.success) throw new WeeklyTestWindowUnavailableError();
  if (parsed.data.ownerId !== scope.ownerId || parsed.data.projectId !== scope.projectId)
    throw new WeeklyTestWindowUnavailableError();
  return parsed.data;
}

/** The optional policy for one project, or null when the project is not part of
 * the bounded observation. An unreadable policy is NEVER defaulted to "absent":
 * it throws, so a registered project cannot lose its bound by a read outage. */
export async function readWeeklyTestWindow(
  target: WeeklyTestWindowScope,
  rpc?: KnowledgeRpc,
): Promise<WeeklyTestWindow | null> {
  const scope = scopeSchema.parse(target);
  const data = await call(
    "read_weekly_test_window",
    { p_user: scope.ownerId, p_project: scope.projectId },
    rpc,
  );
  // Only an explicit SQL null establishes "no policy"; `call` has already
  // refused a missing or undefined payload.
  if (data === null) return null;
  return parseScoped(data, scope);
}

/** Privileged stop. Takes effect for fresh admission immediately, including
 * while a stage is running/unknown or a lease is active, and needs no local
 * monitor. It never cancels a stage, never erases uncertainty and never
 * releases money that is already reserved. */
export async function revokeWeeklyTestWindow(
  target: WeeklyTestWindowScope,
  rpc?: KnowledgeRpc,
): Promise<WeeklyTestWindow> {
  const scope = scopeSchema.parse(target);
  const data = await call(
    "revoke_weekly_test_window",
    { p_user: scope.ownerId, p_project: scope.projectId },
    rpc,
  );
  // Same owner/project identity check the read applies: a positive answer about
  // another scope is not this scope's stop.
  const parsed = parseScoped(data, scope);
  if (!parsed.revoked) throw new WeeklyTestWindowUnavailableError();
  return parsed;
}

/** Does the window still admit NEW paid work right now, from the LOCAL clock?
 * This is a cheap pre-filter; the authoritative answer always comes from the
 * fresh database guard below. */
export function weeklyTestWindowOpen(window: WeeklyTestWindow, now = Date.now()): boolean {
  return (
    window.state === "active" &&
    window.fresh &&
    !window.revoked &&
    now >= Date.parse(window.startsAt) &&
    now < Date.parse(window.endsAt)
  );
}

/** The authoritative slot whitelist, as instants. Ordinary weekly planning may
 * advance to another week; only these two publication instants may ever be
 * prepared, so the caller filters its candidate slots through this. */
export function weeklyTestWindowAllows(window: WeeklyTestWindow, publishAt: string): boolean {
  const target = Date.parse(publishAt);
  return Number.isFinite(target) && window.slots.some((slot) => Date.parse(slot) === target);
}

export interface WeeklyTestWindowGuard {
  /** Forwarded to the provider adapter so an in-flight dispatch is cancelled at
   * T1. Cancelling a supplier request already in flight is BEST EFFORT: its
   * outcome stays unknown until evidence exists. */
  signal: AbortSignal;
  /** Run immediately before the ACTUAL provider call, after monetary admission. */
  beforeDispatch: () => Promise<void>;
  /** Clear the local T1 timer. Safe to call more than once. */
  release: () => void;
}

/**
 * Build the final gate for one bound attempt.
 *
 * Ordering matters and is deliberate: the local deadline/abort is rechecked
 * AFTER the awaited fresh database guard. A guard that legitimately passed just
 * before T1 must not authorize a dispatch whose acknowledgement only arrived
 * afterwards, so the last thing before returning is a fresh local check.
 *
 * The local wall clock is NOT trusted on its own. `Date.now()` can trail the
 * database, jump when the host clock is adjusted, or be adjusted backwards by
 * NTP, any of which would let a stale "still open" answer through. The guard
 * therefore also maintains a MONOTONIC cutoff derived from the server's own
 * `remainingMs`, measured from the instant the request was SENT, so the whole
 * round trip is charged against the remaining time. Both bounds must hold, the
 * monotonic bound is never extended once established, and the real cancellation
 * timer is re-armed to the earliest of them, so an in-flight dispatch is aborted
 * without the two clocks having to agree.
 */
export function createWeeklyTestWindowGuard(args: {
  scope: WeeklyTestWindowScope;
  window: WeeklyTestWindow;
  publishAt: string;
  stage: WeeklyTestWindowStage;
  requestId: string;
  jobId: string;
  now?: () => number;
  /** Injectable monotonic source (milliseconds, arbitrary origin) so the cutoff
   * is deterministic in tests. Defaults to the real `performance.now()`. */
  monotonic?: () => number;
  rpc?: KnowledgeRpc;
}): WeeklyTestWindowGuard {
  const scope = scopeSchema.parse(args.scope);
  const stage = weeklyTestWindowStageSchema.parse(args.stage);
  const requestId = z.string().uuid().parse(args.requestId);
  const jobId = z.string().uuid().parse(args.jobId);
  const publishAt = instant.parse(args.publishAt);
  const contract = args.window.contracts[stage];
  const now = args.now ?? (() => Date.now());
  const monotonic = args.monotonic ?? (() => performance.now());
  const deadline = Date.parse(args.window.endsAt);
  /** Earliest monotonic instant the window may still be open at. Only ever
   * lowered: a later server answer can never buy back time. */
  let monotonicDeadline = Number.POSITIVE_INFINITY;
  const controller = new AbortController();
  const stop = (detail: string) => {
    if (!controller.signal.aborted) controller.abort(new WeeklyTestWindowClosedError(detail));
  };
  if (!weeklyTestWindowAllows(args.window, publishAt)) stop("off_list_slot");
  if (!weeklyTestWindowOpen(args.window, now())) stop("window_closed");
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Monotonic instant the armed cutoff timer is scheduled for. */
  let armedAt = Number.POSITIVE_INFINITY;
  /** (Re-)arm the real cancellation timer to the EARLIEST known bound, so an
   * in-flight provider request is aborted even if the wall clock disagrees. A
   * later or equal bound never replaces an earlier armed one. */
  const arm = (fireAt: number) => {
    if (controller.signal.aborted || !(fireAt < armedAt)) return;
    clearTimeout(timer);
    armedAt = fireAt;
    timer = setTimeout(() => stop("deadline"), Math.max(0, fireAt - monotonic()));
    // A pending cutoff timer must never keep a worker process alive by itself.
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  arm(monotonic() + Math.max(0, deadline - now()));
  const refuse = (detail: string) => {
    stop(detail);
    throw new WeeklyTestWindowClosedError(detail);
  };
  return {
    signal: controller.signal,
    release: () => clearTimeout(timer),
    beforeDispatch: async () => {
      if (controller.signal.aborted) refuse("aborted");
      if (now() >= deadline) refuse("deadline");
      if (monotonic() >= monotonicDeadline) refuse("monotonic_deadline");
      // Anchor the server's remaining time to the instant the request was SENT.
      const sentAt = monotonic();
      const data = await call(
        "assert_weekly_test_window_dispatch",
        {
          p_user: scope.ownerId,
          p_project: scope.projectId,
          p_request: requestId,
          p_job: jobId,
          p_publish: publishAt,
          p_stage: stage,
          p_provider: contract.provider,
          p_model: contract.model,
          p_operation: contract.operation,
          p_ceiling: contract.ceilingMicrousd,
        },
        args.rpc,
      );
      const confirmation = z
        .object({
          ok: z.literal(true),
          windowId: z.literal(args.window.windowId),
          serverNow: instant,
          endsAt: instant,
          remainingMs: z.number().int(),
        })
        .safeParse(data);
      if (!confirmation.success) refuse("unconfirmed");
      const ack = confirmation.data!;
      if (!Number.isFinite(ack.remainingMs) || ack.remainingMs <= 0) refuse("server_deadline");
      if (Date.parse(ack.endsAt) !== deadline) refuse("window_changed");
      // The server reports both an explicit remaining time and the two instants
      // it derived from. Inconsistent timing is resolved CONSERVATIVELY: take
      // whichever of the two is smaller, and refuse outright if either is
      // unusable. A server clock that is ahead of ours can only shorten.
      const derived = Date.parse(ack.endsAt) - Date.parse(ack.serverNow);
      const serverRemaining = Number.isFinite(derived)
        ? Math.min(ack.remainingMs, derived)
        : ack.remainingMs;
      if (!(serverRemaining > 0)) refuse("server_deadline");
      // Measured from when the request was SENT, so the ENTIRE round trip is
      // subtracted from the server's remaining time rather than being added to
      // it. Never extends a bound established by an earlier acknowledgement.
      monotonicDeadline = Math.min(monotonicDeadline, sentAt + serverRemaining);
      arm(monotonicDeadline);
      // Recheck AFTER the awaited acknowledgement — see the note above.
      if (controller.signal.aborted) refuse("aborted_during_guard");
      if (now() >= deadline) refuse("deadline_during_guard");
      if (monotonic() >= monotonicDeadline) refuse("monotonic_deadline_during_guard");
    },
  };
}
