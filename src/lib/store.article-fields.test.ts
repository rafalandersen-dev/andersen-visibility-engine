/**
 * Persistence of the Article Studio 2.0 ContentAsset fields (Phase 4).
 *
 * author / sources / images / tldr / keyTakeaways / breadcrumbs / readiness must
 * survive a hydrate → save round-trip (each content entity is upserted whole —
 * no field enumeration drops them). Persistence is per-entity RPCs: the
 * Supabase client is mocked at the module boundary with the fake entity
 * backend (workspace-entities.testkit), mirroring store.link-safety.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
  },
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { hydrateForUser, saveWorkspaceNow, resetStore, getState, setState } from "./store";

const richAsset = {
  id: "a1",
  projectId: "p1",
  title: "T",
  slug: "t",
  markdown: "Body.",
  status: "Draft",
  tldr: "Quick summary",
  keyTakeaways: ["one", "two"],
  author: { name: "Dr Lena", credentials: "PT, MSc", url: "https://x/lena" },
  sources: [{ url: "https://nih.gov/s", claim: "backs X", status: "verified", checkNote: "ok" }],
  images: [
    {
      id: "i1",
      concept: "hero",
      url: "https://s.supabase.co/a.jpg",
      alt: "A",
      caption: "Hero caption",
      placement: "featured",
      source: "uploaded",
      status: "accepted",
      required: true,
      // Storage object identity MUST survive the round-trip — losing it is how an
      // approved image would lose its promote/remove handle (hotfix regression guard).
      storagePath: "uid/p1/a1/i1.jpg",
    },
  ],
  breadcrumbs: [{ name: "Home", url: "https://site.com" }],
};

const seedServer = () => {
  h.backend.state.doc = {
    projects: [{ id: "p1", name: "P", websiteUrl: "https://site.com" }],
    content: [richAsset],
    activeProjectId: "p1",
  };
};

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.backend = makeEntityBackend();
  resetStore();
});

afterEach(() => vi.unstubAllGlobals());

describe("Article Studio 2.0 ContentAsset fields persist", () => {
  it("hydrate preserves author/sources/images/tldr/keyTakeaways/breadcrumbs", async () => {
    seedServer();
    await hydrateForUser("user1");
    const a = getState().content[0];
    expect(a.author?.name).toBe("Dr Lena");
    expect(a.sources?.[0]).toMatchObject({ status: "verified", checkNote: "ok" });
    expect(a.images?.[0]).toMatchObject({
      status: "accepted",
      storagePath: "uid/p1/a1/i1.jpg",
      alt: "A",
      caption: "Hero caption",
      required: true,
      source: "uploaded",
    });
    expect(a.tldr).toBe("Quick summary");
    expect(a.keyTakeaways).toEqual(["one", "two"]);
    expect(a.breadcrumbs?.[0]?.name).toBe("Home");
  });

  it("save keeps them in the upserted entity row (the 1A gotcha, at asset level)", async () => {
    seedServer();
    await hydrateForUser("user1");
    // Edit ONE mundane field; the whole asset row must be re-upserted with all
    // Studio 2.0 fields intact (a field enumeration gap would strip them here).
    setState((s) => ({
      ...s,
      content: s.content.map((c) => (c.id === "a1" ? { ...c, markdown: "Body updated." } : c)),
    }));
    await saveWorkspaceNow();
    expect(h.backend.state.batches).toHaveLength(1);
    const batch = h.backend.state.batches[0];
    expect(batch.deletes).toEqual([]);
    expect(batch.upserts.map((u) => `${u.collection}:${u.entity_id}`)).toEqual(["content:a1"]);
    const saved = batch.upserts[0].data as Record<string, unknown>;
    expect(saved.markdown).toBe("Body updated.");
    expect((saved.author as Record<string, unknown>).name).toBe("Dr Lena");
    expect(saved.sources).toEqual(richAsset.sources);
    // The uploaded image's Storage identity + approval survive Save (hotfix core).
    expect((saved.images as Record<string, unknown>[])[0]).toMatchObject({
      storagePath: "uid/p1/a1/i1.jpg",
      status: "accepted",
      required: true,
      caption: "Hero caption",
    });
    expect(saved.tldr).toBe("Quick summary");
    expect(saved.keyTakeaways).toEqual(["one", "two"]);
    expect(saved.breadcrumbs).toEqual(richAsset.breadcrumbs);
  });
});
