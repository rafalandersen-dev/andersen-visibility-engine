/**
 * AY — REAL public producers (`src/lib/mock-ai.ts`) + REAL store + fake entity backend + deferred fake
 * server functions. Expected CORRECT outcomes for the AW counterexamples (signed-out settlement,
 * another user, same user/new epoch, quality), same-session concurrent edit/deletion, nested
 * sitemap retirement, retained content import fence, duplicate/pending isolation and the closing
 * mark. Fixture limits: fake server functions, single in-memory backend document swapped per
 * user, no RLS, no timing — production persistence is NOT exercised here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "@/lib/workspace-entities.testkit";

const h = vi.hoisted(() => {
  const deferred = new Map<string, Array<(v: unknown) => void>>();
  const rejectors = new Map<string, Array<(e: unknown) => void>>();
  const calls = new Map<string, number>();
  return {
    rejectors,
    reject: (name: string, e: unknown) => {
      rejectors.get(name)?.shift()?.(e);
      deferred.get(name)?.shift();
    },
    backend: null as unknown as ReturnType<
      typeof import("@/lib/workspace-entities.testkit").makeEntityBackend
    >,
    deferred,
    calls,
    settle: (name: string, value: unknown) => {
      deferred.get(name)?.shift()?.(value); // FIFO: the oldest pending request settles first
    },
    fn: (name: string) =>
      vi.fn(async () => {
        calls.set(name, (calls.get(name) ?? 0) + 1);
        return new Promise((resolve, reject) => {
          deferred.set(name, [...(deferred.get(name) ?? []), resolve]);
          rejectors.set(name, [...(rejectors.get(name) ?? []), reject]);
        });
      }),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
    message: vi.fn(),
  }),
}));
vi.mock("@/lib/sources.functions", () => ({ validateSourceUrlsFn: h.fn("validateSourceUrlsFn") }));
vi.mock("@/lib/sitemap.functions", () => ({
  fetchSitemapInventoryFn: h.fn("fetchSitemapInventoryFn"),
}));
vi.mock("@/lib/ai.functions", () => ({
  generateOpportunitiesFn: h.fn("generateOpportunitiesFn"),
  generateCalendarFn: h.fn("generateCalendarFn"),
  generateContentAssetFn: h.fn("generateContentAssetFn"),
  generateContentFn: h.fn("generateContentFn"),
  generateAuditFn: h.fn("generateAuditFn"),
  generateCompetitorGapFn: h.fn("generateCompetitorGapFn"),
  generateAuthorityFn: h.fn("generateAuthorityFn"),
  generateAuthorityOpportunitiesFn: h.fn("generateAuthorityOpportunitiesFn"),
  generateAiVisibilityFn: h.fn("generateAiVisibilityFn"),
  generateBacklinksFn: h.fn("generateBacklinksFn"),
  getBacklinksStatusFn: h.fn("getBacklinksStatusFn"),
  regenerateMetadataFn: h.fn("regenerateMetadataFn"),
  regenerateFaqFn: h.fn("regenerateFaqFn"),
  regenerateCtaFn: h.fn("regenerateCtaFn"),
  evaluateContentQualityFn: h.fn("evaluateContentQualityFn"),
  improveContentDraftFn: h.fn("improveContentDraftFn"),
  generateOutreachDraftFn: h.fn("generateOutreachDraftFn"),
}));
vi.mock("@/lib/publish.functions", () => ({
  publishContentFn: h.fn("publishContentFn"),
  publishLiveFn: h.fn("publishLiveFn"),
}));
vi.mock("@/lib/wordpress.functions", () => ({
  testWordPressConnectionFn: h.fn("testWordPressConnectionFn"),
  sendContentToWordPressDraftFn: h.fn("sendContentToWordPressDraftFn"),
  publishWordPressContentFn: h.fn("publishWordPressContentFn"),
}));
vi.mock("@/lib/shopify.functions", () => ({
  testShopifyConnectionFn: h.fn("testShopifyConnectionFn"),
  listShopifyBlogsFn: h.fn("listShopifyBlogsFn"),
  sendContentToShopifyDraftFn: h.fn("sendContentToShopifyDraftFn"),
  publishShopifyContentFn: h.fn("publishShopifyContentFn"),
}));

import {
  hydrateForUser,
  resetStore,
  getState,
  setState,
  getWorkspaceSaveStatus,
} from "@/lib/store";
import {
  generateMetadata,
  evaluateContentQuality,
  improveContentDraft,
  generateContentForOpportunity,
  generateArticleDraft,
  refreshSitemapInventory,
  validateAssetSources,
  sendContentToWebsite,
  publishContentLive,
} from "@/lib/mock-ai";
import { assembleContentAsset } from "@/lib/content-assembler";
import { publishBlockers } from "@/lib/checklist";
import { parseGenerationResult } from "@/lib/generation-result";
import { recoverGeneratedResultMutation } from "@/lib/generation-recovery.server";
import type { WorkspaceData } from "@/lib/workspace.server";
import {
  acquireClosingLease,
  getPendingProducerWork,
  ProducerSessionError,
  resetProducerSessionsForTests,
} from "@/lib/producer-session";

const body = "# Draft\n\n" + "word ".repeat(400);
const asset = (id: string, projectId: string, title: string) => ({
  id,
  projectId,
  title,
  markdown: body,
  language: "English",
  assetType: "article",
  metaTitle: "old meta",
  metaDescription: "old description",
  updatedAt: "2026-09-28T10:00:00.000Z",
});
const project = (id: string, websiteUrl = "") => ({
  id,
  name: `Project ${id}`,
  primaryLanguage: "English",
  businessName: "Fixture Co",
  primaryContentLanguage: "en",
  appLanguage: "en",
  setupComplete: true,
  websiteUrl,
});
const DOC1 = {
  projects: [project("p1")],
  services: [],
  content: [asset("c1", "p1", "User1 draft")],
  opportunities: [
    {
      id: "o1",
      projectId: "p1",
      title: "Opp",
      status: "captured",
      language: "English",
      contentType: "Blog Article",
      searchIntent: "Informational",
      targetAudience: "x",
      businessValue: "y",
      recommendedCta: "z",
      priority: "Medium",
    },
  ],
  activeProjectId: "p1",
};
const DOC2 = {
  projects: [project("p2")],
  services: [],
  content: [asset("c2", "p2", "User2 draft")],
  opportunities: [],
  activeProjectId: "p2",
};
const serverContent = () =>
  (
    h.backend.state.doc as {
      content: { id: string; title: string; metaTitle?: string; qualityScore?: unknown }[];
    }
  ).content;
const flush = () => new Promise((r) => setTimeout(r, 0));
const meta = { metaTitle: "LATE meta title", metaDescription: "late description" };
const score = {
  overall: 77,
  categories: {},
  explanation: "late",
  evaluatedAt: "2026-09-28T10:05:00.000Z",
  topIssues: [],
  quickWins: [],
};
const stale = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "stale_session" });

beforeEach(async () => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  h.backend = makeEntityBackend();
  h.backend.state.doc = structuredClone(DOC1);
  h.backend.state.rev = 1;
  h.deferred.clear();
  h.calls.clear();
  resetStore();
  resetProducerSessionsForTests();
  await hydrateForUser("user1");
});
afterEach(() => vi.unstubAllGlobals());

describe("AW cases with the correct outcome", () => {
  it("(a) settles after the ordinary sign-out cleanup: typed stale outcome, nothing written, nothing saved", async () => {
    const pending = generateMetadata("c1");
    await flush();
    expect(getPendingProducerWork().unretained).toBe(1);
    resetStore();
    h.settle("regenerateMetadataFn", meta);
    await stale(pending);
    expect(getState().userId).toBeNull();
    expect(getState().content.find((c) => c.id === "c1")).toBeUndefined(); // the signed-out shell state stays untouched
    expect(h.backend.state.batches).toHaveLength(0);
    expect(serverContent()[0].metaTitle).toBe("old meta");
    await hydrateForUser("user1");
    expect(getPendingProducerWork().unretained).toBe(0);
  });

  it("(b1) another user hydrated: no import into user2's state, no save under user2", async () => {
    const pending = generateMetadata("c1");
    await flush();
    resetStore();
    h.backend.state.doc = structuredClone(DOC2);
    h.backend.state.rev = 1;
    await hydrateForUser("user2");
    h.settle("regenerateMetadataFn", meta);
    await stale(pending);
    expect(getState().content.map((c) => c.id)).toEqual(["c2"]);
    expect(h.backend.state.batches).toHaveLength(0);
    expect(serverContent().map((c) => c.id)).toEqual(["c2"]);
    expect(getWorkspaceSaveStatus().kind).toBe("saved");
  });

  it("(b2) same user, new epoch: the new-session edit is kept, the stale result is refused", async () => {
    const pending = generateMetadata("c1");
    await flush();
    resetStore();
    await hydrateForUser("user1");
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, title: "Edited in the NEW session" } : c,
      ),
    }));
    h.settle("regenerateMetadataFn", meta);
    await stale(pending);
    const c1 = getState().content.find((c) => c.id === "c1")!;
    expect(c1.title).toBe("Edited in the NEW session");
    expect(c1.metaTitle).toBe("old meta");
    expect(h.backend.state.batches).toHaveLength(0);
  });

  it("(b3) quality score after a replacement session: refused, not imported", async () => {
    const pending = evaluateContentQuality("c1");
    await flush();
    resetStore();
    h.backend.state.doc = structuredClone(DOC2);
    h.backend.state.rev = 1;
    await hydrateForUser("user2");
    h.settle("evaluateContentQualityFn", score);
    await stale(pending);
    expect(getState().content.map((c) => c.id)).toEqual(["c2"]);
    expect(serverContent().find((c) => c.id === "c1")).toBeUndefined();
  });
});

describe("same-session ownership of fields", () => {
  it("metadata applies only its owned fields to the CURRENT asset; a concurrent title edit is kept", async () => {
    const pending = generateMetadata("c1");
    await flush();
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, title: "Edited while regenerating" } : c,
      ),
    }));
    h.settle("regenerateMetadataFn", meta);
    await expect(pending).resolves.toBeUndefined();
    const c1 = getState().content.find((c) => c.id === "c1")!;
    expect(c1.title).toBe("Edited while regenerating");
    expect(c1.metaTitle).toBe("LATE meta title");
    expect(serverContent()[0].title).toBe("Edited while regenerating");
  });

  it("metadata for an asset deleted meanwhile is refused (never resurrected)", async () => {
    const pending = generateMetadata("c1");
    await flush();
    setState((s) => ({ ...s, content: s.content.filter((c) => c.id !== "c1") }));
    h.settle("regenerateMetadataFn", meta);
    await expect(pending).rejects.toMatchObject({ code: "source_changed" });
    expect(getState().content.find((c) => c.id === "c1")).toBeUndefined();
  });

  it("a quality score for a body edited meanwhile is refused; the old score state is untouched", async () => {
    const pending = evaluateContentQuality("c1");
    await flush();
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, markdown: body + "\n\nNew paragraph." } : c,
      ),
    }));
    h.settle("evaluateContentQualityFn", score);
    await expect(pending).rejects.toMatchObject({ code: "source_changed" });
    expect(getState().content.find((c) => c.id === "c1")?.qualityScore).toBeUndefined();
  });

  it("an improved draft for a body edited meanwhile is refused (user edits are not replaced)", async () => {
    const pending = improveContentDraft("c1");
    await flush();
    setState((s) => ({
      ...s,
      content: s.content.map((c) =>
        c.id === "c1" ? { ...c, markdown: body + "\n\nUser paragraph." } : c,
      ),
    }));
    h.settle("improveContentDraftFn", { markdown: "# Improved\n\nbody" });
    await expect(pending).rejects.toMatchObject({ code: "source_changed" });
    expect(getState().content.find((c) => c.id === "c1")?.markdown).toContain("User paragraph.");
  });
});

describe("nested helpers, retained content, duplicates and closing", () => {
  it("a session retirement inside the nested sitemap step is not swallowed: no paid call follows", async () => {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => ({ ...p, websiteUrl: "https://example.invalid" })),
    }));
    const pending = improveContentDraft("c1");
    await flush();
    expect(h.calls.get("fetchSitemapInventoryFn")).toBe(1);
    resetStore();
    await hydrateForUser("user1");
    h.settle("fetchSitemapInventoryFn", { fetchedAt: new Date().toISOString(), paths: ["/"] });
    await stale(pending);
    expect(h.calls.get("improveContentDraftFn")).toBeUndefined();
  });

  it("retained content generation: the late client import is refused for a replacement session; no second provider call", async () => {
    const pending = generateContentForOpportunity("o1", "article");
    await flush();
    expect(getPendingProducerWork().retained).toBe(1);
    resetStore();
    h.backend.state.doc = structuredClone(DOC2);
    h.backend.state.rev = 1;
    await hydrateForUser("user2");
    h.settle("generateContentFn", {
      resultId: "retained-1",
      markdown: body,
      metaTitle: "m",
      metaDescription: "d",
      h1: "h",
      outline: [],
      faq: [],
      cta: "c",
      internalLinks: [],
      schemaSuggestions: [],
      editorNotes: "",
    });
    await stale(pending);
    expect(getState().content.map((c) => c.id)).toEqual(["c2"]);
    expect(h.calls.get("generateContentFn")).toBe(1);
    // The server-retained result (id retained-1) stays recoverable for user1 through Recent generations.
  });

  it("duplicate in the same session is refused; the same operation in a new session is admitted while the old one is pending", async () => {
    const first = generateMetadata("c1");
    await flush();
    await expect(generateMetadata("c1")).rejects.toThrow(/Already generating/);
    resetStore();
    await hydrateForUser("user1");
    const second = generateMetadata("c1");
    await flush();
    expect(getPendingProducerWork().unretained).toBe(1);
    h.settle("regenerateMetadataFn", meta); // settles the OLD request (first registered resolver was consumed by 'first')
    await stale(first);
    expect(getPendingProducerWork().unretained).toBe(1); // the old finally did not clear the new entry
    h.settle("regenerateMetadataFn", meta);
    await expect(second).resolves.toBeUndefined();
    expect(getState().content.find((c) => c.id === "c1")?.metaTitle).toBe("LATE meta title");
  });

  it("no new unretained work is admitted while the session is signing out", async () => {
    const lease = acquireClosingLease();
    await expect(generateMetadata("c1")).rejects.toMatchObject({ code: "signing_out" });
    expect(h.calls.get("regenerateMetadataFn")).toBeUndefined();
    lease.release();
    const p = refreshSitemapInventory("p1").catch((e: unknown) => e);
    await flush();
    expect(await p).toBeInstanceOf(Error); // no website URL: ordinary error path still works
  });
});

describe("AZ — five reviewed corrections", () => {
  const publishable = () =>
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => ({
        ...p,
        publishEndpoint: "https://example.invalid/draft",
        livePublishEndpoint: "https://example.invalid/live",
        publishSecretSet: true,
      })),
      content: s.content.map((a) => ({
        ...a,
        slug: "draft",
        publishSlug: "draft",
        publishDestinationType: "blogPost" as const,
        publishStatus: "sent" as const,
      })),
    }));

  for (const live of [false, true]) {
    it(`1. a late ${live ? "live" : "draft"} publication refusal after a same-user re-login is NOT projected or saved`, async () => {
      publishable();
      expect(
        publishBlockers(getState().content[0], getState().projects[0], getState().content),
      ).toEqual([]);
      const pending = live
        ? publishContentLive("c1")
        : sendContentToWebsite("c1", "blogPost", "draft");
      const handled = pending.catch((e: unknown) => e);
      await flush();
      const fn = live ? "publishLiveFn" : "publishContentFn";
      expect(h.calls.get(fn)).toBe(1);
      resetStore();
      h.backend.state.doc = structuredClone(DOC1);
      h.backend.state.rev = 1;
      await hydrateForUser("user1");
      h.reject(fn, new Error("fake provider refusal from the old session"));
      expect(await handled).toMatchObject({ code: "stale_session" });
      expect(h.backend.state.batches).toHaveLength(0);
      const a = getState().content[0];
      expect(live ? a.livePublishStatus : a.publishStatus).not.toBe("failed");
    });
  }

  it("1b. a refusal in the SAME session is still projected as before (failure state + save)", async () => {
    publishable();
    const pending = sendContentToWebsite("c1", "blogPost", "draft").catch((e: unknown) => e);
    await flush();
    h.reject("publishContentFn", new Error("fake provider refusal"));
    expect(await pending).toBeInstanceOf(Error);
    expect(getState().content[0].publishStatus).toBe("failed");
    expect(h.backend.state.batches.length).toBeGreaterThan(0);
  });

  it("3. a score is rejected when the CANONICAL evaluated body changed (approved hook edited) although raw markdown is equal", async () => {
    setState((s) => ({
      ...s,
      content: s.content.map((a) => ({
        ...a,
        visualModelVersion: 3,
        hook: { text: "Old lead", status: "approved", type: "question" } as never,
      })),
    }));
    const before = assembleContentAsset(getState().content[0], getState().projects[0]).markdown;
    const pending = evaluateContentQuality("c1");
    await flush();
    setState((s) => ({
      ...s,
      content: s.content.map((a) => ({
        ...a,
        hook: { ...(a.hook as object), text: "New approved lead" } as never,
        qualityScoreStale: true,
      })),
    }));
    const after = assembleContentAsset(getState().content[0], getState().projects[0]).markdown;
    expect(after).not.toBe(before);
    expect(getState().content[0].markdown).toBe(body); // raw markdown unchanged
    h.settle("evaluateContentQualityFn", score);
    await expect(pending).rejects.toMatchObject({ code: "source_changed" });
    const c1 = getState().content[0];
    expect(c1.qualityScore).toBeUndefined();
    expect(c1.qualityScoreStale).toBe(true); // the newer edit's stale mark is preserved
  });

  it("3b. unchanged evaluator inputs → the score is applied (positive control)", async () => {
    const pending = evaluateContentQuality("c1");
    await flush();
    h.settle("evaluateContentQualityFn", score);
    await expect(pending).resolves.toBeDefined();
    expect(getState().content[0].qualityScore).toMatchObject({ overall: 77 });
    expect(getState().content[0].qualityScoreStale).toBe(false);
  });

  it("4. a human 'unsupported' verdict given meanwhile is preserved over late reachability", async () => {
    setState((s) => ({
      ...s,
      content: s.content.map((a) => ({
        ...a,
        sources: [
          {
            id: "s1",
            url: "https://example.invalid/reference",
            status: "unchecked",
            claim: "A claim",
          },
        ] as never,
      })),
    }));
    const pending = validateAssetSources("c1", true);
    await flush();
    setState((s) => ({
      ...s,
      content: s.content.map((a) => ({
        ...a,
        sources: (a.sources ?? []).map((v) => ({ ...v, status: "unsupported" as const })),
      })),
    }));
    h.settle("validateSourceUrlsFn", [
      { url: "https://example.invalid/reference", status: "verified", note: "ok" },
    ]);
    await pending;
    expect(getState().content[0].sources?.[0].status).toBe("unsupported");
  });

  it("4b. an unchanged source receives the reachability result; an added source is kept", async () => {
    setState((s) => ({
      ...s,
      content: s.content.map((a) => ({
        ...a,
        sources: [
          { id: "s1", url: "https://example.invalid/reference", status: "unchecked" },
        ] as never,
      })),
    }));
    const pending = validateAssetSources("c1", true);
    await flush();
    setState((s) => ({
      ...s,
      content: s.content.map((a) => ({
        ...a,
        sources: [
          ...(a.sources ?? []),
          { id: "s2", url: "https://example.invalid/added", status: "unchecked" },
        ] as never,
      })),
    }));
    h.settle("validateSourceUrlsFn", [
      { url: "https://example.invalid/reference", status: "verified", note: "ok" },
    ]);
    await pending;
    const sources = getState().content[0].sources!;
    expect(sources.map((v) => v.status)).toEqual(["verified", "unchecked"]);
  });

  it("5. an article draft is classified as RETAINED work (its server function retains the result)", async () => {
    const pending = generateArticleDraft("o1");
    const handled = pending.catch((e: unknown) => e);
    await flush();
    expect(h.calls.get("generateContentAssetFn")).toBe(1);
    expect(getPendingProducerWork()).toMatchObject({ unretained: 0, retained: 1 });
    resetStore();
    h.settle("generateContentAssetFn", {});
    expect(await handled).toMatchObject({ code: "stale_session" });
  });

  it("5b. the original user's existing recovery path restores the retained result once, with its identity; another workspace cannot import it", () => {
    const output = {
      metaTitle: "m",
      metaDescription: "d",
      h1: "h",
      outline: [],
      faq: [],
      cta: "c",
      markdown: body,
      internalLinks: [],
      schemaSuggestions: [],
      editorNotes: "",
    };
    const retained = parseGenerationResult(
      {
        version: 1,
        kind: "content",
        projectId: "p1",
        opportunityId: "o1",
        assetId: "retained-1",
        title: "Opp",
        language: "English",
        assetType: "article",
        output,
      },
      "user1",
    );
    const user1Doc: WorkspaceData = {
      projects: [{ id: "p1" }],
      opportunities: [{ id: "o1", projectId: "p1", status: "planned" }],
      content: [],
    };
    const first = recoverGeneratedResultMutation(user1Doc, retained, "2026-09-28T10:10:00.000Z");
    expect(first.result).toMatchObject({
      assetId: "retained-1",
      projectId: "p1",
      outcome: "recovered",
    });
    const again = recoverGeneratedResultMutation(first.data, retained, "2026-09-28T10:11:00.000Z");
    expect(again.result.outcome).toBe("existing"); // no duplicate, same identity
    expect((again.data.content as { id: string }[]).map((c) => c.id)).toEqual(["retained-1"]);
    // A workspace without the originating opportunity (another user's) cannot take the result.
    const user2Doc: WorkspaceData = { projects: [{ id: "p2" }], opportunities: [], content: [] };
    expect(() =>
      recoverGeneratedResultMutation(user2Doc, retained, "2026-09-28T10:12:00.000Z"),
    ).toThrow(/recovery_target_unavailable/);
    expect(h.calls.get("generateContentFn")).toBeUndefined(); // no provider call anywhere in recovery
  });
});
