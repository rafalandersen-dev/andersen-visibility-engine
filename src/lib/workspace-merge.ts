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

/** Server list as base; local wins per id; local-only entities appended. */
export function mergeById<T extends HasId>(local: T[], server: T[]): T[] {
  const localById = new Map(local.map((e) => [e.id, e]));
  const serverIds = new Set(server.map((e) => e.id));
  const merged = server.map((e) => localById.get(e.id) ?? e);
  for (const e of local) {
    if (!serverIds.has(e.id)) merged.push(e);
  }
  return merged;
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
  for (const field of MERGEABLE_ARRAY_FIELDS) {
    const l = Array.isArray(local[field]) ? (local[field] as HasId[]) : [];
    const s = Array.isArray(server[field]) ? (server[field] as HasId[]) : [];
    merged[field] = mergeById(l, s);
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
