/**
 * Scheduling server functions — the authenticated half of scheduled publishing.
 *
 * Clients never touch `scheduled_publishes` directly (RLS denies them); they go
 * through these. The row's user_id always comes from the verified session, and
 * the asset's project is resolved SERVER-SIDE from that user's own workspace,
 * so a caller cannot queue a publish against someone else's content by passing
 * a different projectId.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScheduledPublish, ScheduledPublishStatus } from "./types";

/**
 * Refuse slots the runner cannot honour. The cron ticks every 5 minutes, so a
 * one-minute lead would routinely render a go-live label that lies by up to
 * five minutes and would accept "schedule for two minutes from now", which is
 * simply broken. Anything sooner belongs on the Publish-now path.
 */
export const SCHEDULE_TICK_MS = 5 * 60_000;
const MIN_LEAD_MS = SCHEDULE_TICK_MS;

type Row = Record<string, unknown>;

/**
 * Minimal shape of the PostgREST builder we use. It is chainable and only
 * awaited at the end, so every method returns the same self-type.
 */
interface QueryBuilder extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select: (columns: string) => QueryBuilder;
  insert: (row: Row) => QueryBuilder;
  update: (row: Row) => QueryBuilder;
  eq: (column: string, value: string) => QueryBuilder;
  in: (column: string, values: string[]) => QueryBuilder;
  order: (column: string, opts: { ascending: boolean }) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
  single: () => QueryBuilder;
}

async function admin(): Promise<{ from: (table: string) => QueryBuilder }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Proxy — always call methods, never detach them.
  return supabaseAdmin as unknown as { from: (table: string) => QueryBuilder };
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asNumber = (v: unknown): number => (typeof v === "number" ? v : 0);

function toScheduledPublish(row: Row): ScheduledPublish {
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    assetId: asString(row.asset_id),
    publishAt: asString(row.publish_at),
    status: (asString(row.status) || "pending") as ScheduledPublishStatus,
    attempts: asNumber(row.attempts),
    lastError: asString(row.last_error) || undefined,
    publishedAt: asString(row.published_at) || undefined,
    createdAt: asString(row.created_at),
  };
}

/**
 * Resolve an asset's project from the caller's OWN workspace.
 * Throws when the asset does not belong to them.
 */
async function resolveOwnedAsset(
  userId: string,
  assetId: string,
): Promise<{ projectId: string; title: string }> {
  const { readWorkspaceRow } = await import("./workspace.server");
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("Workspace not found.");
  const content = Array.isArray(row.data.content) ? (row.data.content as Row[]) : [];
  const asset = content.find((c) => asString(c?.id) === assetId);
  if (!asset) throw new Error("Content asset not found in your workspace.");
  return { projectId: asString(asset.projectId), title: asString(asset.title) };
}

/**
 * Cancel a queued publish for an asset.
 *
 * Scoped to 'pending' ONLY. A row in 'publishing' has already been claimed by
 * the runner and the connector call may be in flight, so "cancelling" it would
 * report success while the article publishes anyway — and would release the
 * partial unique index, letting a second row be armed for the same asset
 * mid-run. In-flight rows are reported honestly instead.
 */
async function cancelPendingRows(
  userId: string,
  assetId: string,
): Promise<{ cancelled: boolean; reason?: "in_flight" }> {
  const db = await admin();
  const { data: rows, error } = await db
    .from("scheduled_publishes")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error("Could not update the existing schedule. Please try again.");

  if (Array.isArray(rows) && rows.length > 0) return { cancelled: true };

  // Nothing pending — is something already going out?
  const { data: inFlight } = await db
    .from("scheduled_publishes")
    .select("id")
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .eq("status", "publishing")
    .limit(1);
  if (Array.isArray(inFlight) && inFlight.length > 0) {
    return { cancelled: false, reason: "in_flight" };
  }
  return { cancelled: true };
}

/**
 * An instant, unambiguously. A zoneless string like "2026-07-21T09:00" is
 * parsed as server-local (UTC on our host) while the browser renders the same
 * string as local time — so a Polish, Swedish or Danish user would see 09:00
 * and the article would go live at 11:00. We refuse to guess: the caller must
 * send a UTC "Z" or an explicit ±HH:MM offset.
 */
export function hasExplicitZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim());
}

export const scheduleContentPublishFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assetId: z.string().min(1),
        publishAt: z.string().min(1),
        /** IANA zone the user picked in, e.g. "Europe/Warsaw". Used for display. */
        timeZone: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ScheduledPublish> => {
    const userId = context.userId as string;

    if (!hasExplicitZone(data.publishAt)) {
      throw new Error(
        "The publish time must include a time zone. This is a bug in the app, not something you did — please report it.",
      );
    }
    const when = new Date(data.publishAt);
    if (Number.isNaN(when.getTime())) throw new Error("That publish time is not a valid date.");
    if (when.getTime() - Date.now() < MIN_LEAD_MS) {
      throw new Error("Use Publish now for anything in the next five minutes.");
    }

    // Ownership: the project comes from the caller's workspace, never the client.
    const { projectId } = await resolveOwnedAsset(userId, data.assetId);

    // Re-arming replaces any pending row. If one is already going out we must
    // not queue a second: the article is being published right now.
    const cancelled = await cancelPendingRows(userId, data.assetId);
    if (!cancelled.cancelled) {
      throw new Error(
        "This article is being published right now, so it cannot be rescheduled. Wait for it to finish, then publish or schedule again.",
      );
    }

    const db = await admin();
    const { data: inserted, error } = await db
      .from("scheduled_publishes")
      .insert({
        user_id: userId,
        project_id: projectId,
        asset_id: data.assetId,
        publish_at: when.toISOString(),
        status: "pending",
      })
      .select("*")
      .single();

    if (error || !inserted) {
      console.error("[schedule.functions] insert failed", error?.message ?? "no row");
      throw new Error("Could not schedule the publish. Please try again.");
    }
    // Mirror onto the asset so the editor can render "Goes live ..." without a
    // round-trip. Declared on ContentAsset but, until now, written by nobody —
    // every scheduling UI would have rendered blank.
    const { writeScheduleMirror } = await import("./publish.server");
    await writeScheduleMirror(userId, data.assetId, when.toISOString());

    console.info("[schedule.functions] scheduled", { projectId, publishAt: when.toISOString() });
    return toScheduledPublish(inserted as Row);
  });

export const cancelScheduledPublishFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assetId: z.string().min(1) }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ cancelled: boolean; reason?: "in_flight" }> => {
      const userId = context.userId as string;
      await resolveOwnedAsset(userId, data.assetId);
      const outcome = await cancelPendingRows(userId, data.assetId);
      if (!outcome.cancelled) return outcome;

      // Only clear the mirror once the queue row is really gone, so the UI never
      // shows "not scheduled" for something that is still going out.
      const { clearScheduleMirror } = await import("./publish.server");
      await clearScheduleMirror(userId, data.assetId);
      return { cancelled: true };
    },
  );

/** The caller's schedules for one project (UI listing). */
export const listScheduledPublishesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<ScheduledPublish[]> => {
    const userId = context.userId as string;
    const db = await admin();
    const { data: rows, error } = await db
      .from("scheduled_publishes")
      .select("*")
      .eq("user_id", userId)
      .eq("project_id", data.projectId)
      .order("publish_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[schedule.functions] list failed", error.message);
      return [];
    }
    return (Array.isArray(rows) ? (rows as Row[]) : []).map(toScheduledPublish);
  });
