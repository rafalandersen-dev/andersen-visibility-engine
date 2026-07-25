/**
 * Test-only fake of the per-entity workspace backend (the three RPCs the
 * client store calls). Emulates the DB contract faithfully enough for store
 * tests: bundle reads assemble from an in-memory doc, batches mutate it,
 * backfill adopts a doc once. Imported ONLY from *.test.ts files.
 */
import { assembleWorkspaceDoc, splitWorkspaceDoc, type EntityRow } from "./workspace-entities";

export interface EntityBackendState {
  /** null = user not migrated (no meta row). */
  doc: Record<string, unknown> | null;
  rev: number;
  batches: {
    upserts: EntityRow[];
    deletes: { collection: string; entity_id: string }[];
    meta: Record<string, unknown>;
  }[];
  backfills: Record<string, unknown>[];
  /** Set to inject failures per fn name. */
  errors: Partial<Record<"read" | "apply" | "backfill", { code?: string; message: string }>>;
}

export function makeEntityBackend(): {
  state: EntityBackendState;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
} {
  const state: EntityBackendState = { doc: null, rev: 0, batches: [], backfills: [], errors: {} };

  const bundle = () => {
    if (state.doc === null) return null;
    const { entities, meta } = splitWorkspaceDoc(state.doc);
    return {
      meta: {
        active_project_id: meta.activeProjectId,
        subscription: meta.subscription,
        billing_profile: meta.billingProfile,
        extras: meta.extras,
        rev: state.rev,
      },
      entities,
    };
  };

  const applyBatch = (args: Record<string, unknown>) => {
    const upserts = (args.p_upserts ?? []) as EntityRow[];
    const deletes = (args.p_deletes ?? []) as { collection: string; entity_id: string }[];
    const metaPatch = (args.p_meta ?? {}) as Record<string, unknown>;
    state.batches.push({ upserts, deletes, meta: metaPatch });
    const cur = state.doc === null ? null : splitWorkspaceDoc(state.doc);
    if (cur === null) throw Object.assign(new Error("workspace_not_migrated"), { code: "P0002" });
    const byKey = new Map(cur.entities.map((e) => [`${e.collection} ${e.entity_id}`, e]));
    for (const u of upserts) byKey.set(`${u.collection} ${u.entity_id}`, u);
    for (const d of deletes) byKey.delete(`${d.collection} ${d.entity_id}`);
    const meta = { ...cur.meta, ...metaPatch } as typeof cur.meta;
    state.rev += 1;
    state.doc = assembleWorkspaceDoc({
      meta: {
        active_project_id: meta.activeProjectId,
        subscription: meta.subscription,
        billing_profile: meta.billingProfile,
        extras: meta.extras as Record<string, unknown>,
        rev: state.rev,
      },
      entities: [...byKey.values()],
    });
    return state.rev;
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "read_workspace_bundle") {
      if (state.errors.read) return { data: null, error: state.errors.read };
      return { data: bundle(), error: null };
    }
    if (fn === "apply_workspace_entity_batch") {
      if (state.errors.apply) return { data: null, error: state.errors.apply };
      try {
        return { data: applyBatch(args), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: "P0002" } };
      }
    }
    if (fn === "backfill_workspace_entities") {
      state.backfills.push(args);
      if (state.errors.backfill) return { data: null, error: state.errors.backfill };
      if (state.doc === null) {
        const meta = (args.p_meta ?? {}) as {
          activeProjectId?: string;
          subscription?: unknown;
          billingProfile?: unknown;
          extras?: Record<string, unknown>;
        };
        state.doc = assembleWorkspaceDoc({
          meta: {
            active_project_id: meta.activeProjectId ?? "",
            subscription: meta.subscription ?? null,
            billing_profile: meta.billingProfile ?? null,
            extras: meta.extras ?? {},
            rev: 0,
          },
          entities: (args.p_entities ?? []) as EntityRow[],
        });
        state.rev = 0;
        return { data: true, error: null };
      }
      return { data: false, error: null }; // already migrated → no-op
    }
    throw new Error(`unexpected rpc ${fn}`);
  };

  return { state, rpc };
}
