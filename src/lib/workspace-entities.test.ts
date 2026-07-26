/**
 * Per-entity storage lib — the migration's data-integrity contract:
 * split→assemble is a lossless roundtrip (order included), diff emits the
 * minimal batch, and jsonb key reordering never causes phantom upserts.
 */
import { describe, it, expect } from "vitest";
import {
  assembleWorkspaceDoc,
  diffWorkspaceDocs,
  splitWorkspaceDoc,
  stableStringify,
  type WorkspaceBundle,
} from "./workspace-entities";

const doc = {
  projects: [
    { id: "p1", name: "One" },
    { id: "p2", name: "Two" },
  ],
  content: [{ id: "c1", projectId: "p1", title: "T", markdown: "Body" }],
  opportunities: [],
  activeProjectId: "p2",
  subscription: { planId: "starter" },
  someFutureField: { keep: true },
};

function bundleOf(d: Record<string, unknown>): WorkspaceBundle {
  const { entities, meta } = splitWorkspaceDoc(d);
  return {
    meta: {
      active_project_id: meta.activeProjectId,
      subscription: meta.subscription,
      billing_profile: meta.billingProfile,
      extras: meta.extras,
      rev: 1,
    },
    entities,
  };
}

describe("stableStringify", () => {
  it("is key-order independent (jsonb roundtrip safety)", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, null] } })).toBe(
      stableStringify({ a: { c: [3, null], d: 2 }, b: 1 }),
    );
    expect(stableStringify({ a: 1, u: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe("split → assemble roundtrip", () => {
  it("reproduces collections (ordered), meta and unknown fields", () => {
    const out = assembleWorkspaceDoc(bundleOf(doc));
    expect(out.projects).toEqual(doc.projects);
    expect(out.content).toEqual(doc.content);
    expect(out.opportunities).toEqual([]);
    expect(out.activeProjectId).toBe("p2");
    expect(out.subscription).toEqual({ planId: "starter" });
    expect(out.someFutureField).toEqual({ keep: true });
    // Absent collections come back as empty arrays (stateFromRow contract).
    expect(out.calendar).toEqual([]);
  });

  it("drops id-less entries, keeps LAST duplicate, restores ord order", () => {
    const { entities } = splitWorkspaceDoc({
      projects: [{ name: "no-id" }, { id: "a", v: 1 }, { id: "b" }, { id: "a", v: 2 }],
    });
    const ids = entities.map((e) => e.entity_id).sort();
    expect(ids).toEqual(["a", "b"]);
    expect(entities.find((e) => e.entity_id === "a")?.data).toEqual({ id: "a", v: 2 });
    // Shuffled rows re-assemble by ord.
    const shuffled = bundleOf({ projects: [{ id: "x" }, { id: "y" }, { id: "z" }] });
    shuffled.entities.reverse();
    const out = assembleWorkspaceDoc(shuffled);
    expect((out.projects as { id: string }[]).map((p) => p.id)).toEqual(["x", "y", "z"]);
  });

  it("ignores unknown collections from a newer server (never crashes)", () => {
    const b = bundleOf(doc);
    b.entities.push({ collection: "fromTheFuture", entity_id: "f1", ord: 0, data: { id: "f1" } });
    expect(() => assembleWorkspaceDoc(b)).not.toThrow();
  });
});

describe("diffWorkspaceDocs", () => {
  it("empty diff on identical docs — even after a simulated jsonb key reorder", () => {
    const reordered = JSON.parse(stableStringify(assembleWorkspaceDoc(bundleOf(doc)))) as Record<
      string,
      unknown
    >;
    const d = diffWorkspaceDocs(assembleWorkspaceDoc(bundleOf(doc)), reordered);
    expect(d.isEmpty).toBe(true);
  });

  it("emits only the touched entity (the ~2 kB save)", () => {
    const next = {
      ...doc,
      content: [{ id: "c1", projectId: "p1", title: "T EDITED", markdown: "Body" }],
    };
    const d = diffWorkspaceDocs(doc, next);
    expect(d.upserts.map((u) => `${u.collection}:${u.entity_id}`)).toEqual(["content:c1"]);
    expect(d.deletes).toEqual([]);
    expect(d.meta).toEqual({});
  });

  it("creates, deletes and reorders are all captured", () => {
    const next = {
      ...doc,
      projects: [
        { id: "p2", name: "Two" }, // moved to front → ord change
        { id: "p3", name: "Three" }, // created
      ], // p1 deleted
    };
    const d = diffWorkspaceDocs(doc, next);
    const ups = d.upserts.map((u) => `${u.collection}:${u.entity_id}`).sort();
    expect(ups).toEqual(["projects:p2", "projects:p3"]);
    expect(d.deletes).toEqual([{ collection: "projects", entity_id: "p1" }]);
  });

  it("meta patch carries ONLY changed keys", () => {
    const next = { ...doc, activeProjectId: "p1" };
    const d = diffWorkspaceDocs(doc, next);
    expect(d.meta).toEqual({ activeProjectId: "p1" });
    const d2 = diffWorkspaceDocs(doc, { ...doc, subscription: { planId: "pro" } });
    expect(d2.meta).toEqual({ subscription: { planId: "pro" } });
    expect(d2.upserts).toEqual([]);
  });

  it("extras diffs are MERGE PATCHES: changed keys only, removals as null sentinels", () => {
    const d = diffWorkspaceDocs(doc, { ...doc, someFutureField: { keep: false } });
    expect(d.meta.extras).toEqual({ someFutureField: { keep: false } });
    // Removing a key locally → explicit null (the RPC strips it after merge).
    const removed = { ...doc } as Record<string, unknown>;
    delete removed.someFutureField;
    expect(diffWorkspaceDocs(doc, removed).meta.extras).toEqual({ someFutureField: null });
    // Review MEDIUM-3: a STALE-BUNDLE snapshot that never knew a key emits NO
    // patch for it — baseline and snapshot both lack agencyBranding, so the
    // server-held value survives the save untouched.
    const staleBase = { projects: doc.projects };
    const staleNext = { projects: doc.projects };
    expect(diffWorkspaceDocs(staleBase, staleNext).isEmpty).toBe(true);
  });
});
