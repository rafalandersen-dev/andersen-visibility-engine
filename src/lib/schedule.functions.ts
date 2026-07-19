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

/** Refuse slots in the past (or within the next minute — the runner ticks every 5). */
const MIN_LEAD_MS = 60_000;

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

/** Cancel any live schedule for an asset (needed before re-scheduling). */
async function cancelActiveRows(userId: string, assetId: string): Promise<void> {
  const db = await admin();
  const { error } = await db
    .from("scheduled_publishes")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .in("status", ["pending", "publishing"]);
  if (error) throw new Error("Could not update the existing schedule. Please try again.");
}

export const scheduleContentPublishFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assetId: z.string().min(1), publishAt: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ScheduledPublish> => {
    const userId = context.userId as string;

    const when = new Date(data.publishAt);
    if (Number.isNaN(when.getTime())) throw new Error("That publish time is not a valid date.");
    if (when.getTime() - Date.now() < MIN_LEAD_MS) {
      throw new Error("Pick a time at least a minute from now, or publish immediately instead.");
    }

    // Ownership: the project comes from the caller's workspace, never the client.
    const { projectId } = await resolveOwnedAsset(userId, data.assetId);

    await cancelActiveRows(userId, data.assetId);

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
    console.info("[schedule.functions] scheduled", { projectId, publishAt: when.toISOString() });
    return toScheduledPublish(inserted as Row);
  });

export const cancelScheduledPublishFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assetId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const userId = context.userId as string;
    await resolveOwnedAsset(userId, data.assetId);
    await cancelActiveRows(userId, data.assetId);
    return { cancelled: true };
  });

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
