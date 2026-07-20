/**
 * Persistence of the Article Studio 2.0 ContentAsset fields (Phase 4).
 *
 * author / sources / images / tldr / keyTakeaways / breadcrumbs / readiness must
 * survive a hydrate → save round-trip (content is persisted whole — no field
 * enumeration drops them). Mock harness mirrors store.link-safety.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface SupabaseResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const h = vi.hoisted(() => ({
  maybeSingleResult: { data: null, error: null } as SupabaseResult,
  upsertResult: { data: { rev: 1 }, error: null } as SupabaseResult,
  insertResult: { data: { rev: 0 }, error: null } as SupabaseResult,
  upsertCalls: [] as { payload: Record<string, unknown>; opts: Record<string, unknown> }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "workspaces") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => h.maybeSingleResult }) }),
        upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
          h.upsertCalls.push({ payload, opts });
          return { select: () => ({ single: async () => h.upsertResult }) };
        },
        insert: () => ({ select: () => ({ single: async () => h.insertResult }) }),
      };
    },
  },
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { hydrateForUser, saveWorkspaceNow, resetStore, getState } from "./store";

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

const serverRow = (rev: number) => ({
  data: {
    data: {
      projects: [{ id: "p1", name: "P", websiteUrl: "https://site.com" }],
      content: [richAsset],
      activeProjectId: "p1",
    },
    rev,
  },
  error: null,
});

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  vi.clearAllMocks();
  h.upsertCalls = [];
  h.maybeSingleResult = { data: null, error: null };
  h.upsertResult = { data: { rev: 1 }, error: null };
  h.insertResult = { data: { rev: 0 }, error: null };
  resetStore();
});

afterEach(() => vi.unstubAllGlobals());

describe("Article Studio 2.0 ContentAsset fields persist", () => {
  it("hydrate preserves author/sources/images/tldr/keyTakeaways/breadcrumbs", async () => {
    h.maybeSingleResult = serverRow(3);
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

  it("save keeps them in the persisted snapshot (the 1A gotcha, at asset level)", async () => {
    h.maybeSingleResult = serverRow(3);
    await hydrateForUser("user1");
    h.upsertResult = { data: { rev: 4 }, error: null };
    await saveWorkspaceNow();
    expect(h.upsertCalls).toHaveLength(1);
    const data = h.upsertCalls[0].payload.data as { content?: Record<string, unknown>[] };
    const saved = data.content?.[0] as Record<string, unknown>;
    expect((saved.author as Record<string, unknown>).name).toBe("Dr Lena");
    expect(saved.sources).toBeTruthy();
    expect(saved.images).toBeTruthy();
    // The uploaded image's Storage identity + approval survive Save (hotfix core).
    expect((saved.images as Record<string, unknown>[])[0]).toMatchObject({
      storagePath: "uid/p1/a1/i1.jpg",
      status: "accepted",
      required: true,
      caption: "Hero caption",
    });
    expect(saved.breadcrumbs).toBeTruthy();
  });
});
