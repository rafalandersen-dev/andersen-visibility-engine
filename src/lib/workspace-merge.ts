/**
 * Workspace conflict merge (P0 data-integrity fix, 2026-07-25).
 *
 * The old conflict recovery was "server wins, wipe local": on any rev
 * conflict the whole local state was replaced by the server row, silently
 * DISCARDING every unsaved local edit — and server-side writers (scheduled
 * publishes, the auto-scheduler, MCP tools) bump the rev constantly, so a
 * tab could enter a loop where every create was thrown away with a success
 * click and no error (the "45 lost opportunities" incident, 2026-07-23).
 *
 * New contract: a conflict MERGES per entity and retries —
 *  - id-keyed arrays: the server list is the base; a local entity with the
 *    same id REPLACES the server one (the user's unsaved edit wins); local
 *    entities the server doesn't know yet are APPENDED (creates survive).
 *  - `subscription` / `billingProfile`: server wins — they are written by
 *    billing webhooks, never locally.
 *  - `activeProjectId`: the LOCAL tab's choice wins when that project still
 *    exists — another device must never flip this tab's active project.
 *
 * Known tradeoff (documented, deliberate): a LOCAL deletion of an entity the
 * server still has is resurrected by the merge. Losing a delete-click is
 * recoverable and visible; losing created content silently is neither.
 *
 * Pure — no I/O, no store access.
 */

interface HasId {
  id: string;
}

function ts(e: unknown): number {
  const v = (e as { updatedAt?: string }).updatedAt;
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Server list as base; per id the NEWER copy wins (by updatedAt — review H2:
 * server-side writers update existing entities, and a stale tab must not
 * clobber a cron's publish outcome), local wins on tie or missing stamps;
 * local-only entities are appended (creates survive).
 */
export function mergeById<T extends HasId>(local: T[], server: T[]): T[] {
  const localById = new Map(local.map((e) => [e.id, e]));
  const serverIds = new Set(server.map((e) => e.id));
  const merged = server.map((e) => {
    const l = localById.get(e.id);
    if (!l) return e;
    return ts(e) > ts(l) ? e : l;
  });
  for (const e of local) {
    if (!serverIds.has(e.id)) merged.push(e);
  }
  return merged;
}

/** Single-instance-per-project collections (review M2): after the id merge,
 * keep only the NEWEST row per projectId so a conflict can never resurrect a
 * superseded analysis that would shadow the fresh one for every
 * find-by-projectId reader. */
export function newestPerProject<T extends HasId & { projectId?: string; createdAt?: string }>(
  rows: T[],
): T[] {
  const best = new Map<string, T>();
  const keyless: T[] = [];
  const stamp = (e: T) => {
    const v = e.createdAt ?? (e as { updatedAt?: string }).updatedAt;
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  for (const e of rows) {
    if (!e.projectId) {
      keyless.push(e);
      continue;
    }
    const cur = best.get(e.projectId);
    if (!cur || stamp(e) >= stamp(cur)) best.set(e.projectId, e);
  }
  return [...best.values(), ...keyless];
}

/** The id-keyed array fields of the persisted workspace snapshot. */
export const MERGEABLE_ARRAY_FIELDS = [
  "projects",
  "services",
  "opportunities",
  "discoverySuggestions",
  "calendar",
  "content",
  "audits",
  "competitorAnalyses",
  "authorityAnalyses",
  "aiVisibilityAnalyses",
  "backlinkAnalyses",
  "linkMarketplaceOrders",
  "outreachDrafts",
  "authorityOpportunities",
  "aiEvaluationRuns",
  "tasks",
  "pendingActions",
] as const;

export type WorkspaceSnapshot = Record<string, unknown>;

/**
 * Merge a local snapshot over a fresh server snapshot per the contract above.
 * Unknown server fields are preserved (spread base = server) so this can
 * never strip data written by newer server code.
 */
export function mergeWorkspaceSnapshots(
  local: WorkspaceSnapshot,
  server: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const merged: WorkspaceSnapshot = { ...server };
  const SINGLE_PER_PROJECT = new Set([
    "audits",
    "competitorAnalyses",
    "authorityAnalyses",
    "aiVisibilityAnalyses",
    "backlinkAnalyses",
  ]);
  for (const field of MERGEABLE_ARRAY_FIELDS) {
    const l = Array.isArray(local[field]) ? (local[field] as HasId[]) : [];
    const s = Array.isArray(server[field]) ? (server[field] as HasId[]) : [];
    const m = mergeById(l, s);
    merged[field] = SINGLE_PER_PROJECT.has(field) ? newestPerProject(m) : m;
  }
  // Server-authoritative scalars: billing is webhook-written, never local.
  merged.subscription = server.subscription;
  merged.billingProfile = server.billingProfile;
  // This tab's active project survives the merge when it still exists.
  const localActive = typeof local.activeProjectId === "string" ? local.activeProjectId : "";
  const projects = merged.projects as HasId[];
  merged.activeProjectId =
    localActive && projects.some((p) => p.id === localActive)
      ? localActive
      : (server.activeProjectId ?? projects[0]?.id ?? "");
  return merged;
}
