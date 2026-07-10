/**
 * Workspace optimistic-concurrency write layer (Phase 1 commit 1) — SERVER
 * ONLY. The workspace is one JSONB blob per user (workspaces.data) that the
 * CLIENT saves whole after every change, so a server-side write that isn't
 * rev-guarded would be silently clobbered by the next client save. This module
 * is the single safe path for future server-side mutations (MCP write tools):
 *
 *   read {data, rev} → apply a PURE mutation to a clone → UPDATE … SET
 *   data, rev = <echoed read rev> WHERE user_id AND rev = <read rev>
 *
 * The workspaces_rev_guard trigger verifies the echo and performs the bump;
 * the WHERE clause makes a stale write match zero rows. Lost race → re-read
 * and retry (≤3 attempts) → WorkspaceConflictError.
 *
 * Contract for mutation callbacks: PURE and RE-RUNNABLE (they execute once
 * per attempt, up to 3×). No AI generation, no I/O, no side effects inside —
 * generate first, then mutate. The callback receives a structuredClone of the
 * stored blob and must return the FULL blob (unknown/extra keys it does not
 * understand must be preserved — spread, don't rebuild).
 *
 * Never import from client code. This module has NO callers yet — it ships
 * inert ahead of the Phase 1A write tools.
 */

export class WorkspaceConflictError extends Error {
  constructor() {
    super("workspace_conflict");
    this.name = "WorkspaceConflictError";
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super("workspace_not_found");
    this.name = "WorkspaceNotFoundError";
  }
}

export const WORKSPACE_WRITE_MAX_ATTEMPTS = 3;

/** The stored blob, deliberately loose: unknown keys must survive round-trips. */
export type WorkspaceData = Record<string, unknown>;

export interface WorkspaceMutationOutcome<T> {
  /** The FULL blob to store (with the mutation applied, extra keys preserved). */
  data: WorkspaceData;
  /** Caller-defined result surfaced to the tool (ids, counts, …). */
  result: T;
}

export type WorkspaceMutation<T> = (data: WorkspaceData) => WorkspaceMutationOutcome<T>;

export interface WorkspaceWriteDeps {
  /** Load {data, rev} for a user; null when the user has no workspace row. */
  read: (userId: string) => Promise<{ data: WorkspaceData; rev: number } | null>;
  /**
   * Conditional write: UPDATE … SET data, rev = readRev (echo; trigger bumps)
   * WHERE user_id AND rev = readRev. Returns the NEW rev, or null when zero
   * rows matched (stale rev / lost race). Throws on real DB failures.
   */
  update: (userId: string, data: WorkspaceData, readRev: number) => Promise<number | null>;
}

/**
 * Injectable core: read → mutate(clone) → conditional write, retried up to
 * WORKSPACE_WRITE_MAX_ATTEMPTS on rev conflicts. Non-conflict update errors
 * propagate immediately (no retry — the write may or may not have landed).
 */
export async function runWorkspaceMutation<T>(
  userId: string,
  mutate: WorkspaceMutation<T>,
  deps: WorkspaceWriteDeps,
): Promise<{ result: T; rev: number }> {
  if (!userId) throw new WorkspaceNotFoundError();
  for (let attempt = 1; attempt <= WORKSPACE_WRITE_MAX_ATTEMPTS; attempt++) {
    const row = await deps.read(userId);
    if (!row) throw new WorkspaceNotFoundError();
    const next = mutate(structuredClone(row.data));
    const newRev = await deps.update(userId, next.data, row.rev);
    if (newRev !== null) return { result: next.result, rev: newRev };
    // null = stale rev (another writer won) → loop re-reads and re-applies.
  }
  throw new WorkspaceConflictError();
}

// ---- service-role DB wiring (lazy import keeps client bundle clean) ----

type Row = Record<string, unknown>;
type Chain = {
  eq: (k: string, v: string | number) => Chain;
  select: (c: string) => Chain;
  maybeSingle: () => Promise<{ data: Row | null; error: { code?: string; message?: string } | null }>;
};
type Table = {
  select: (c: string) => Chain;
  update: (r: Row) => Chain;
};

async function admin(): Promise<{ from: (t: string) => Table }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => Table };
}

/** True for the trigger's workspace_conflict (echo mismatch — treated as a lost race). */
function isRevConflict(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "40001" || /workspace_conflict/i.test(error.message ?? ""));
}

export async function readWorkspaceRow(userId: string): Promise<{ data: WorkspaceData; rev: number } | null> {
  if (!userId) return null;
  const db = await admin();
  const { data } = await db.from("workspaces").select("data,rev").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return {
    data: (data.data as WorkspaceData | null) ?? {},
    rev: Number(data.rev ?? 0),
  };
}

export async function updateWorkspaceRow(userId: string, dataBlob: WorkspaceData, readRev: number): Promise<number | null> {
  const db = await admin();
  const { data, error } = await db
    .from("workspaces")
    .update({ data: dataBlob, rev: readRev })
    .eq("user_id", userId)
    .eq("rev", readRev)
    .select("rev")
    .maybeSingle();
  if (error) {
    // The WHERE rev filter normally prevents the trigger from ever firing a
    // conflict here, but treat one as a lost race (retryable) just in case.
    if (isRevConflict(error)) return null;
    throw new Error("workspace_update_failed");
  }
  if (!data) return null; // zero rows: stale rev or foreign/missing user
  return Number(data.rev);
}

/** The production entry point future MCP write tools call. */
export async function mutateWorkspace<T>(userId: string, mutate: WorkspaceMutation<T>): Promise<{ result: T; rev: number }> {
  return runWorkspaceMutation(userId, mutate, { read: readWorkspaceRow, update: updateWorkspaceRow });
}
