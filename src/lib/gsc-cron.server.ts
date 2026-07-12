/**
 * GSC background sync (Sprint 17b) — SERVER ONLY.
 *
 * A daily pg_cron job POSTs to /api/google/search-console/cron-sync with a
 * Bearer secret that lives ONLY in Supabase Vault ('gsc_cron_secret'); the
 * route verifies it via the service-role RPC public.gsc_cron_secret(). No
 * human ever handles that secret.
 *
 * For every non-revoked Google connection, every project in that user's
 * workspace with a selected Search Console property is synced (28d) through
 * the SAME code path as manual sync (syncSearchAnalytics), then stored into
 * the workspace blob through the rev-guarded mutateWorkspace layer — identical
 * shape to a manual sync, so the UI needs no changes.
 *
 * Safety:
 * - A project is skipped when its last sync (manual or auto) is younger than
 *   AUTO_SYNC_MIN_INTERVAL_HOURS — repeated cron invocations are idempotent
 *   and Search Console quotas are respected.
 * - Failures are isolated per connection/project; one customer's broken
 *   connection never blocks the rest.
 * - invalid_grant / revoked consent ("expired") writes a reconnect-needed
 *   state into the project metadata and is NOT retried within the run.
 * - Nothing sensitive is logged or returned: counts and short codes only.
 */
import { mutateWorkspace as realMutateWorkspace, readWorkspaceRow, type WorkspaceData } from "./workspace.server";
import { MAX_IMPORTS } from "./gsc";
import type { GscImport } from "./types";

export const AUTO_SYNC_MIN_INTERVAL_HOURS = 20;
const PROVIDER = "google_search_console";

interface ProjectLike {
  id?: unknown;
  gscOAuth?: {
    selectedSite?: { siteUrl?: unknown };
    status?: unknown;
    sync?: Record<string, unknown> & { lastSyncedAt?: unknown };
    [k: string]: unknown;
  };
  gscLite?: { imports?: GscImport[]; latestImportId?: string };
  [k: string]: unknown;
}

export interface GscCronDeps {
  /** user_ids of all non-revoked connections with a stored refresh token. */
  listConnections: () => Promise<string[]>;
  readWorkspace: (userId: string) => Promise<{ data: WorkspaceData } | null>;
  sync: (args: { userId: string; siteUrl: string; range: "28d" | "90d" }) => Promise<GscImport>;
  mutate: typeof realMutateWorkspace;
  now: () => Date;
}

export interface GscCronResult {
  connections: number;
  synced: number;
  skippedFresh: number;
  failed: number;
  reconnectNeeded: number;
}

function projectsOf(data: WorkspaceData): ProjectLike[] {
  const p = (data as { projects?: unknown }).projects;
  return Array.isArray(p) ? (p as ProjectLike[]) : [];
}

function hoursSince(iso: unknown, now: Date): number {
  if (typeof iso !== "string") return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / 3_600_000;
}

/** Pure helper: apply a finished import to the workspace blob (same shape as manual sync). */
export function applyImportToWorkspace(data: WorkspaceData, projectId: string, imp: GscImport): WorkspaceData {
  const projects = projectsOf(data);
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return data;
  const project = projects[idx];
  const existing = project.gscLite?.imports ?? [];
  const imports = [imp, ...existing].slice(0, MAX_IMPORTS);
  projects[idx] = {
    ...project,
    gscLite: { ...(project.gscLite ?? {}), imports, latestImportId: imp.id },
    gscOAuth: {
      ...(project.gscOAuth ?? {}),
      status: "connected",
      sync: {
        ...(project.gscOAuth?.sync ?? {}),
        lastSyncedAt: imp.importedAt,
        lastSyncRange: "28d",
        lastSyncStartDate: imp.dateRange?.start,
        lastSyncEndDate: imp.dateRange?.end,
        lastRowCount: imp.summary.rowCount,
        lastError: undefined,
        lastAutoSyncedAt: imp.importedAt,
      },
    },
  };
  return { ...data, projects };
}

/** Pure helper: record a failed auto-sync (short code only, no sensitive detail). */
export function applyFailureToWorkspace(data: WorkspaceData, projectId: string, code: string, nowIso: string): WorkspaceData {
  const projects = projectsOf(data);
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return data;
  const project = projects[idx];
  const expired = code === "expired";
  projects[idx] = {
    ...project,
    gscOAuth: {
      ...(project.gscOAuth ?? {}),
      ...(expired ? { status: "expired" } : {}),
      sync: {
        ...(project.gscOAuth?.sync ?? {}),
        lastError: expired
          ? "Your Google connection expired. Reconnect to continue."
          : "Automatic Search Console sync failed. It will retry on the next run.",
        lastAutoSyncAttemptAt: nowIso,
        lastAutoSyncErrorCode: code,
      },
    },
  };
  return { ...data, projects };
}

export async function runGscBackgroundSync(deps: GscCronDeps): Promise<GscCronResult> {
  const result: GscCronResult = { connections: 0, synced: 0, skippedFresh: 0, failed: 0, reconnectNeeded: 0 };
  const userIds = await deps.listConnections();
  result.connections = userIds.length;

  for (const userId of userIds) {
    // Per-connection isolation: any throw inside affects this user only.
    try {
      const ws = await deps.readWorkspace(userId);
      if (!ws) continue;
      const now = deps.now();
      const targets = projectsOf(ws.data)
        .filter((p) => typeof p.id === "string" && typeof p.gscOAuth?.selectedSite?.siteUrl === "string")
        .map((p) => ({
          projectId: p.id as string,
          siteUrl: p.gscOAuth!.selectedSite!.siteUrl as string,
          lastSyncedAt: p.gscOAuth?.sync?.lastSyncedAt,
        }));

      // If the connection is expired, the first sync attempt fails fast and we
      // record reconnect state ONCE (skip remaining projects for this user).
      let userExpired = false;
      for (const t of targets) {
        if (userExpired) break;
        if (hoursSince(t.lastSyncedAt, now) < AUTO_SYNC_MIN_INTERVAL_HOURS) {
          result.skippedFresh++;
          continue;
        }
        try {
          const imp = await deps.sync({ userId, siteUrl: t.siteUrl, range: "28d" });
          await deps.mutate(userId, (data) => ({ data: applyImportToWorkspace(data, t.projectId, imp), result: null }));
          result.synced++;
        } catch (e) {
          const code = e instanceof Error ? e.message : "api_error";
          result.failed++;
          if (code === "expired" || code === "not_connected") {
            result.reconnectNeeded++;
            userExpired = true;
          }
          await deps
            .mutate(userId, (data) => ({ data: applyFailureToWorkspace(data, t.projectId, code, deps.now().toISOString()), result: null }))
            .catch(() => {});
        }
      }
    } catch (e) {
      result.failed++;
      console.warn("[gsc-cron] connection failed", e instanceof Error ? e.message : "error");
    }
  }
  return result;
}

// ---- production wiring ----

async function listConnectionsProd(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          is: (k: string, v: null) => { not: (k: string, op: string, v: null) => Promise<{ data: { user_id: string }[] | null; error: { message: string } | null }> };
        };
      };
    };
  };
  const { data, error } = await db
    .from("google_connections")
    .select("user_id")
    .eq("provider", PROVIDER)
    .is("revoked_at", null)
    .not("encrypted_refresh_token", "is", null);
  if (error) {
    console.warn("[gsc-cron] listConnections error", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.user_id);
}

export async function runGscBackgroundSyncProd(): Promise<GscCronResult> {
  const { syncSearchAnalytics } = await import("./gsc-oauth.server");
  return runGscBackgroundSync({
    listConnections: listConnectionsProd,
    readWorkspace: readWorkspaceRow,
    sync: syncSearchAnalytics,
    mutate: realMutateWorkspace,
    now: () => new Date(),
  });
}
