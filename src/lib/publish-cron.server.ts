/**
 * Scheduled-publish runner. Invoked every 5 minutes by the pg_cron job
 * 'scheduled-publish-run' through /api/publish/run-scheduled.
 *
 * Claim semantics live in Postgres (`claim_scheduled_publishes`, FOR UPDATE
 * SKIP LOCKED), so overlapping ticks can never hand the same row to two
 * runners. This module owns what happens after a row is claimed:
 *
 *   success            → row 'published', asset marked live in the workspace
 *   known failure      → row back to 'pending' for another attempt, until
 *                        max attempts, then 'failed'
 *   permanent failure  → row 'failed' immediately (retrying cannot help)
 *
 * A row left in 'publishing' means this process died mid-flight. Those are
 * NEVER republished — see reap_stale_scheduled_publishes in the migration.
 */
import {
  publishAssetServerSide,
  recordScheduledPublishFailure,
  isPermanentPublishError,
} from "./publish.server";

/** Attempts after which a repeatedly-failing row is parked for good. */
export const MAX_PUBLISH_ATTEMPTS = 3;

interface ScheduledRow {
  id: string;
  user_id: string;
  project_id: string;
  asset_id: string;
  attempts: number;
}

export interface RunSummary {
  claimed: number;
  published: number;
  retrying: number;
  failed: number;
  reaped: number;
}

/**
 * PostgREST returns a BUILDER, not a Promise. It is awaitable (thenable) but has
 * no .catch/.finally, so typing it as Promise invites `rpc(...).catch(...)` —
 * which compiles and then throws a TypeError at runtime. Declaring PromiseLike
 * makes that mistake a type error instead of a production incident.
 */
type AdminClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

async function adminClient(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // supabaseAdmin is a Proxy — call rpc/from as METHODS, never detach them.
  return supabaseAdmin as unknown as AdminClient;
}

async function setRow(
  admin: AdminClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("scheduled_publishes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[publish-cron] row update failed", { id, message: error.message });
}

/**
 * Claim and process one batch of due publishes.
 * Errors on individual rows never abort the batch.
 */
export async function runScheduledPublishes(batchSize = 20): Promise<RunSummary> {
  const admin = await adminClient();

  // Park anything a dead run left claimed, before taking new work.
  const { data: reapedData, error: reapError } = await admin.rpc("reap_stale_scheduled_publishes");
  if (reapError) console.error("[publish-cron] reap failed", reapError.message);
  const reaped = typeof reapedData === "number" ? reapedData : 0;

  const { data, error } = await admin.rpc("claim_scheduled_publishes", {
    batch_size: batchSize,
    max_attempts: MAX_PUBLISH_ATTEMPTS,
  });
  if (error) {
    console.error("[publish-cron] claim failed", error.message);
    throw new Error("claim_failed");
  }

  const rows = Array.isArray(data) ? (data as ScheduledRow[]) : [];
  const summary: RunSummary = {
    claimed: rows.length,
    published: 0,
    retrying: 0,
    failed: 0,
    reaped,
  };

  for (const row of rows) {
    try {
      const result = await publishAssetServerSide(row.user_id, row.asset_id);
      await setRow(admin, row.id, {
        status: "published",
        published_at: result.publishedAt,
        last_error: null,
      });
      summary.published += 1;
      console.info("[publish-cron] published", {
        rowId: row.id,
        platform: result.platform,
        attempts: row.attempts,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publishing failed.";
      // Duck-typed rather than instanceof: PublishNotPossibleError (cannot
      // publish), PublishRecordingFailedError (published but unrecorded) and an
      // ambiguous PublishTransportError are all non-retryable, and instanceof is
      // fragile across module instances.
      const permanent = isPermanentPublishError(e);
      // attempts was already incremented by the claim.
      const exhausted = row.attempts >= MAX_PUBLISH_ATTEMPTS;

      // Record on the asset on EVERY attempt, not only the last one. A user
      // whose credentials were rotated should see why nothing published now,
      // not after the third silent retry.
      const terminal = permanent || exhausted;
      await recordScheduledPublishFailure(row.user_id, row.asset_id, message, terminal).catch(
        (err) =>
          console.error("[publish-cron] could not record failure on asset", {
            rowId: row.id,
            message: err instanceof Error ? err.message : "error",
          }),
      );

      if (terminal) {
        await setRow(admin, row.id, { status: "failed", last_error: message });
        summary.failed += 1;
      } else {
        // Retryable means the connector PROVED nothing was created on the site,
        // so another attempt cannot produce a duplicate.
        await setRow(admin, row.id, { status: "pending", last_error: message });
        summary.retrying += 1;
      }
      console.error("[publish-cron] publish failed", {
        rowId: row.id,
        permanent,
        exhausted,
        attempts: row.attempts,
      });
    }
  }

  // Heartbeat last: a dead cron and an empty queue are otherwise
  // indistinguishable — both look like "nothing happened" — while a user's
  // article silently never goes live and the UI still says Scheduled.
  //
  // try/catch, NOT .catch(): rpc() returns a PostgREST builder, which is a
  // thenable but not a real Promise, so calling .catch() on it throws a
  // TypeError that took the whole run down and produced a 500 with no
  // heartbeat — the exact blind spot this heartbeat exists to remove.
  try {
    await admin.rpc("record_cron_heartbeat", {
      job: "scheduled-publish-run",
      summary: summary as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error("[publish-cron] heartbeat failed", e instanceof Error ? e.message : "error");
  }

  return summary;
}

/** Age of the last successful runner tick, in seconds. null when it never ran. */
export async function scheduledPublishRunnerAgeSeconds(): Promise<number | null> {
  const admin = await adminClient();
  const { data, error } = await admin.rpc("cron_heartbeat_age_seconds", {
    job: "scheduled-publish-run",
  });
  if (error) return null;
  return typeof data === "number" ? data : null;
}
