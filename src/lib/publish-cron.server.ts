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
  PublishNotPossibleError,
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

type AdminClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
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
      const permanent = e instanceof PublishNotPossibleError;
      // attempts was already incremented by the claim.
      const exhausted = row.attempts >= MAX_PUBLISH_ATTEMPTS;

      if (permanent || exhausted) {
        await setRow(admin, row.id, { status: "failed", last_error: message });
        summary.failed += 1;
        // Surface it on the asset so the editor can explain what happened.
        await recordScheduledPublishFailure(row.user_id, row.asset_id, message).catch((err) =>
          console.error("[publish-cron] could not record failure on asset", {
            rowId: row.id,
            message: err instanceof Error ? err.message : "error",
          }),
        );
      } else {
        // Known failure: the connector reported an error, so nothing was
        // created on the site and another attempt is safe.
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

  return summary;
}
