/**
 * Daily GA4 report for the Synergy pilot — SERVER ONLY.
 *
 * pg_cron 'ga4-synergy-daily-sync' (05:40 UTC) POSTs to
 * /api/google/analytics/daily-sync with a Bearer secret that lives only in
 * Vault ('ga4_daily_cron_secret'). Every selection of the pinned pilot property
 * goes through the SAME syncGa4 path as the panel's refresh (owner + Synergy
 * rollout guard, property re-verified with the owner's token), and the result
 * is stored in ga4_daily_reports — not in the workspace, where a tab holding an
 * older copy of the project would overwrite it on its next save. The panel
 * overlays this row for display, so it works without the panel being open.
 *
 * Counts tell a fetch+save apart from a skip: `synced` only after both the
 * fetch and the write succeeded. Only finite codes are returned or stored.
 */
import { db, Ga4Error, ga4ErrorCode, must, syncGa4 } from "./ga4.server";
import type { Ga4SyncErrorCode } from "./types";

/** The single property the pilot may fetch daily (Synergy Massage GA4). */
export const GA4_DAILY_PROPERTY_ID = "528831108";
/** UTC calendar date of an ISO/PostgREST timestamp ("" when unparseable). */
const utcDate = (v: string) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
};

export interface Ga4DailyTarget {
  userId: string;
  projectId: string;
  lastSuccessAt: string | null;
}
type SyncResult = Awaited<ReturnType<typeof syncGa4>>;

export interface Ga4DailyDeps {
  listTargets: () => Promise<Ga4DailyTarget[]>;
  sync: (args: {
    userId: string;
    projectId: string;
    expectedPropertyId: string;
  }) => Promise<SyncResult>;
  saveSuccess: (t: Ga4DailyTarget, res: SyncResult, attemptAt: string) => Promise<void>;
  saveFailure: (t: Ga4DailyTarget, code: Ga4SyncErrorCode, attemptAt: string) => Promise<void>;
  now: () => Date;
}

export interface Ga4DailyResult {
  targets: number;
  /** Fetched from GA4 and written to ga4_daily_reports. */
  synced: number;
  /** Not fetched: already saved successfully on the same UTC calendar date. */
  skippedFresh: number;
  /** Guard, token, Google or response failure; nothing new was stored. */
  fetchFailed: number;
  /** Fetched, but the write failed; nothing new was stored. */
  saveFailed: number;
  errors: Partial<Record<Ga4SyncErrorCode, number>>;
}

export async function runGa4DailySync(deps: Ga4DailyDeps): Promise<Ga4DailyResult> {
  const out: Ga4DailyResult = {
    targets: 0,
    synced: 0,
    skippedFresh: 0,
    fetchFailed: 0,
    saveFailed: 0,
    errors: {},
  };
  const targets = await deps.listTargets();
  out.targets = targets.length;
  for (const t of targets) {
    const now = deps.now();
    const at = now.toISOString();
    // Same UTC date, not an interval: a late-evening release check must not skip the next 05:40 run.
    if (t.lastSuccessAt && utcDate(t.lastSuccessAt) === at.slice(0, 10)) {
      out.skippedFresh++;
      continue;
    }
    let res: SyncResult;
    try {
      // syncGa4 rejects a changed selection before any token or Google request.
      res = await deps.sync({
        userId: t.userId,
        projectId: t.projectId,
        expectedPropertyId: GA4_DAILY_PROPERTY_ID,
      });
      // Belt and braces: never store another property.
      if (res.snapshot.propertyId !== GA4_DAILY_PROPERTY_ID) throw new Ga4Error("not_available");
    } catch (e) {
      const code = ga4ErrorCode(e);
      out.fetchFailed++;
      out.errors[code] = (out.errors[code] ?? 0) + 1;
      await deps.saveFailure(t, code, at).catch(() => {});
      continue;
    }
    try {
      await deps.saveSuccess(t, res, at);
      out.synced++;
    } catch {
      out.saveFailed++;
      out.errors.failed = (out.errors.failed ?? 0) + 1;
    }
  }
  return out;
}

// ---- production wiring (service role) ----

async function listTargetsProd(): Promise<Ga4DailyTarget[]> {
  const d = await db();
  const props = (await must(
    d
      .from("ga4_project_properties")
      .select("user_id,project_id")
      .eq("property_id", GA4_DAILY_PROPERTY_ID),
  )) as { user_id: string; project_id: string }[] | null;
  const daily = (await must(
    d
      .from("ga4_daily_reports")
      .select("user_id,project_id,last_success_at")
      .eq("property_id", GA4_DAILY_PROPERTY_ID),
  )) as { user_id: string; project_id: string; last_success_at: string | null }[] | null;
  return (props ?? []).map((p) => ({
    userId: p.user_id,
    projectId: p.project_id,
    lastSuccessAt:
      daily?.find((r) => r.user_id === p.user_id && r.project_id === p.project_id)
        ?.last_success_at ?? null,
  }));
}

async function upsertDaily(row: Record<string, unknown>): Promise<void> {
  await must(
    (await db()).from("ga4_daily_reports").upsert(row, { onConflict: "user_id,project_id" }),
  );
}

export function runGa4DailySyncProd(): Promise<Ga4DailyResult> {
  return runGa4DailySync({
    listTargets: listTargetsProd,
    sync: syncGa4,
    saveSuccess: (t, res, at) =>
      upsertDaily({
        user_id: t.userId,
        project_id: t.projectId,
        property_id: res.snapshot.propertyId,
        period_start: res.periodStart,
        period_end: res.periodEnd,
        snapshot: res.snapshot,
        last_attempt_at: at,
        last_success_at: res.snapshot.fetchedAt,
        last_error: null,
        updated_at: at,
      }),
    // Columns not listed keep their stored values: the last good snapshot stays readable.
    saveFailure: (t, code, at) =>
      upsertDaily({
        user_id: t.userId,
        project_id: t.projectId,
        property_id: GA4_DAILY_PROPERTY_ID,
        last_attempt_at: at,
        last_error: code,
        updated_at: at,
      }),
    now: () => new Date(),
  });
}
