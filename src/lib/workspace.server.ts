/**
 * Workspace mutation layer — SERVER ONLY.
 *
 * Per-entity backend (scale migration 2026-07-26): the workspace doc lives as
 * rows in workspace_entities + workspace_meta; reads assemble the doc, writes
 * DIFF the mutated doc against what was read and apply only the changed
 * entities in one atomic RPC (apply_workspace_entity_batch), guarded by the
 * meta rev read beforehand:
 *
 *   read (assemble) → apply a PURE mutation to a clone → diff → batch RPC
 *   with p_expected_rev = <read rev>
 *
 * Rev mismatch → lost race → re-read and retry (≤3 attempts) →
 * WorkspaceConflictError. Users without a meta row (pre-migration) are read
 * from the legacy workspaces blob and lazily backfilled on that read.
 *
 * Contract for mutation callbacks (UNCHANGED by the migration): PURE and
 * RE-RUNNABLE (they execute once per attempt, up to 3×). No AI generation, no
 * I/O, no side effects inside — generate first, then mutate. The callback
 * receives a structuredClone of the stored doc and must return the FULL doc
 * (unknown/extra keys it does not understand must be preserved — spread,
 * don't rebuild).
 *
 * Never import from client code.
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
   * Conditional write of the mutated doc, guarded by the rev the caller read.
   * Per-entity backend: diffs `prev` vs `data` and applies the batch with
   * `p_expected_rev = readRev`. Returns the NEW rev, or null when the
   * precondition failed (lost race). Throws on real DB failures.
   */
  update: (
    userId: string,
    data: WorkspaceData,
    readRev: number,
    prev: WorkspaceData,
  ) => Promise<number | null>;
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
    const newRev = await deps.update(userId, next.data, row.rev, row.data);
    if (newRev !== null) return { result: next.result, rev: newRev };
    // null = stale rev (another writer won) → loop re-reads and re-applies.
  }
  throw new WorkspaceConflictError();
}

// ---- service-role DB wiring (lazy import keeps client bundle clean) ----

import {
  assembleWorkspaceDoc,
  diffWorkspaceDocs,
  splitWorkspaceDoc,
  type WorkspaceBundle,
} from "./workspace-entities";

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
type Admin = {
  from: (t: string) => Table;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** True for the batch RPC's workspace_conflict (rev precondition lost a race). */
function isRevConflict(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "40001" || /workspace_conflict/i.test(error.message ?? ""));
}

/**
 * Per-entity read: assemble the doc from workspace_entities + workspace_meta.
 * Users without a meta row fall back to the legacy blob and are LAZILY
 * BACKFILLED (idempotent — entities first, meta marker last, all
 * ON CONFLICT DO NOTHING), so the first read after deploy migrates them.
 */
export async function readWorkspaceRow(userId: string): Promise<{ data: WorkspaceData; rev: number } | null> {
  if (!userId) return null;
  const db = await admin();
  const { data: bundleRaw, error } = await db.rpc("read_workspace_bundle", { p_user_id: userId });
  if (error) throw new Error("workspace_read_failed");
  if (bundleRaw) {
    const bundle = bundleRaw as unknown as WorkspaceBundle;
    return { data: assembleWorkspaceDoc(bundle) as WorkspaceData, rev: Number(bundle.meta.rev ?? 0) };
  }
  // Legacy path: blob read + lazy backfill.
  const { data: row } = await db.from("workspaces").select("data,rev").eq("user_id", userId).maybeSingle();
  if (!row) return null;
  const doc = ((row.data as WorkspaceData | null) ?? {}) as WorkspaceData;
  const { entities, meta } = splitWorkspaceDoc(doc);
  const { error: backfillError } = await db.rpc("backfill_workspace_entities", {
    p_user_id: userId,
    p_entities: entities,
    p_meta: meta,
  });
  if (backfillError) {
    // Loud but non-fatal: the blob still serves this read; next read retries.
    console.warn("[workspace] lazy backfill failed", backfillError.message);
  }
  return { data: doc, rev: 0 }; // fresh meta rows start at rev 0
}

/**
 * Diff-based conditional write (the ~2 kB save): applies only the entities
 * that changed between `prev` (what the caller read) and `dataBlob` (the
 * mutated doc), atomically, guarded by `p_expected_rev = readRev`.
 */
export async function updateWorkspaceRow(
  userId: string,
  dataBlob: WorkspaceData,
  readRev: number,
  prev: WorkspaceData = {},
): Promise<number | null> {
  const db = await admin();
  const diff = diffWorkspaceDocs(prev, dataBlob);
  if (diff.isEmpty) return readRev; // nothing changed — treat as applied
  const { data, error } = await db.rpc("apply_workspace_entity_batch", {
    p_user_id: userId,
    p_upserts: diff.upserts,
    p_deletes: diff.deletes,
    p_meta: diff.meta,
    p_expected_rev: readRev,
  });
  if (error) {
    if (isRevConflict(error)) return null;
    if (/workspace_not_migrated/i.test(error.message ?? "")) {
      // Read always backfills before any write can happen; hitting this means
      // the backfill failed loudly moments ago — surface, don't loop.
      throw new WorkspaceNotFoundError();
    }
    throw new Error("workspace_update_failed");
  }
  return Number(data ?? 0);
}

/**
 * Every user with a workspace: migrated users (workspace_meta) UNION users
 * still on the legacy blob. Used by whole-fleet scans (auto-scheduler).
 */
export async function listWorkspaceUserIds(): Promise<string[]> {
  const db = await admin();
  const ids = new Set<string>();
  const { data: metaRows } = await (db.from("workspace_meta") as unknown as {
    select: (c: string) => Promise<{ data: { user_id?: string }[] | null }>;
  }).select("user_id");
  for (const r of Array.isArray(metaRows) ? metaRows : []) {
    if (r.user_id) ids.add(String(r.user_id));
  }
  const { data: blobRows } = await (db.from("workspaces") as unknown as {
    select: (c: string) => Promise<{ data: { user_id?: string }[] | null }>;
  }).select("user_id");
  for (const r of Array.isArray(blobRows) ? blobRows : []) {
    if (r.user_id) ids.add(String(r.user_id));
  }
  return [...ids];
}

/** The production entry point future MCP write tools call. */
export async function mutateWorkspace<T>(userId: string, mutate: WorkspaceMutation<T>): Promise<{ result: T; rev: number }> {
  return runWorkspaceMutation(userId, mutate, { read: readWorkspaceRow, update: updateWorkspaceRow });
}
