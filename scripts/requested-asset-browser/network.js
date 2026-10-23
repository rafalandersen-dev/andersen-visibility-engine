// CX fixture network: replaces "@/integrations/supabase/client" (and the store's lazy
// entitlement import) for the requested-asset browser harness. In-memory synthetic
// workspaces only; no request leaves the page. Reads and saves can be held and
// released explicitly so late completion, deadlines and dirty races are observable.
import { assembleWorkspaceDoc, splitWorkspaceDoc } from "@/lib/workspace-entities";

const fixture = (window.cxFixture = {
  docs: {}, // userId -> { doc, rev }
  reads: [], // { userId, at, outcome }
  saves: [],
  holdNextRead: false,
  heldReads: [],
  holdSaves: false,
  heldSaves: [],
});

const bundleFor = (userId) => {
  const stored = fixture.docs[userId];
  if (!stored) return null;
  const { entities, meta } = splitWorkspaceDoc(stored.doc);
  return {
    meta: {
      active_project_id: meta.activeProjectId,
      subscription: meta.subscription,
      billing_profile: meta.billingProfile,
      extras: meta.extras,
      rev: stored.rev,
    },
    entities,
  };
};

const applyBatch = ({ p_user_id, p_upserts = [], p_deletes = [], p_meta = {} }) => {
  const stored = fixture.docs[p_user_id];
  const current = splitWorkspaceDoc(stored.doc);
  const byKey = new Map(current.entities.map((e) => [`${e.collection} ${e.entity_id}`, e]));
  for (const u of p_upserts) {
    const { expected_data: _expected, ...row } = u;
    byKey.set(`${u.collection} ${u.entity_id}`, row);
  }
  for (const d of p_deletes) byKey.delete(`${d.collection} ${d.entity_id}`);
  const meta = { ...current.meta, ...p_meta };
  stored.rev += 1;
  stored.doc = assembleWorkspaceDoc({
    meta: {
      active_project_id: meta.activeProjectId,
      subscription: meta.subscription,
      billing_profile: meta.billingProfile,
      extras: meta.extras,
      rev: stored.rev,
    },
    entities: [...byKey.values()],
  });
  return stored.rev;
};

export const supabase = {
  rpc(name, input) {
    if (name === "read_workspace_bundle") {
      const entry = { userId: input.p_user_id, at: Date.now(), outcome: "pending" };
      fixture.reads.push(entry);
      // The answer is the server state at the moment the read completes.
      const answer = () => {
        entry.outcome = "answered";
        return { data: bundleFor(input.p_user_id), error: null };
      };
      if (!fixture.holdNextRead) return Promise.resolve(answer());
      fixture.holdNextRead = false;
      entry.outcome = "held";
      return new Promise((resolve) => fixture.heldReads.push(() => resolve(answer())));
    }
    if (name === "apply_workspace_entity_batch") {
      const entry = { userId: input.p_user_id, at: Date.now(), outcome: "pending" };
      fixture.saves.push(entry);
      const run = () => {
        entry.outcome = "applied";
        return { data: applyBatch(input), error: null };
      };
      if (!fixture.holdSaves) return Promise.resolve(run());
      entry.outcome = "held";
      return new Promise((resolve) => fixture.heldSaves.push(() => resolve(run())));
    }
    return Promise.resolve({ data: null, error: { message: `Unexpected fixture RPC ${name}` } });
  },
};

export const getMyEntitlementFn = async () => ({ entitlement: { planId: "freePreview" } });

export const releaseHeldReads = () => fixture.heldReads.splice(0).forEach((release) => release());
export const releaseHeldSaves = () => fixture.heldSaves.splice(0).forEach((release) => release());
