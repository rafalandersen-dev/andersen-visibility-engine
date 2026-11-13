import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAsset } from "./types";

const h = vi.hoisted(() => ({
  store: { rev: 1, data: {} as Record<string, unknown> },
  wp: vi.fn(),
  approved: vi.fn(),
  sources: vi.fn(),
  version: vi.fn(),
  blockers: vi.fn(),
  chain: new Map<string, Promise<unknown>>(),
}));
vi.mock("./workspace.server", () => ({
  readWorkspaceRow: async () => ({ rev: h.store.rev, data: structuredClone(h.store.data) }),
  mutateWorkspace: async (
    _user: string,
    mutate: (d: Record<string, unknown>) => { data: Record<string, unknown>; result: unknown },
  ) => {
    const out = mutate(structuredClone(h.store.data));
    h.store.data = out.data;
    h.store.rev += 1;
    return out.result;
  },
}));
// Keeps the per-owner write serialization: calls for one owner run one at a time.
vi.mock("./publication-write.server", () => ({
  serializePublicationWrite: <T>(user: string, run: () => Promise<T>) => {
    const next = (h.chain.get(user) ?? Promise.resolve()).then(run, run);
    h.chain.set(
      user,
      next.catch(() => undefined),
    );
    return next;
  },
}));
vi.mock("./publish.functions", () => ({
  draftPayloadFor: vi.fn(),
  publishDraftDirect: vi.fn(),
  publishLiveDirect: vi.fn(),
}));
vi.mock("./wordpress.functions", () => ({ publishWordPressLiveDirect: h.wp }));
vi.mock("./shopify.functions", () => ({ upsertArticle: vi.fn() }));
vi.mock("./publish-targets", () => ({
  buildActiveInternalPaths: () => [],
  isShopify: () => false,
  isWordPress: () => true,
  shopifyArticleArgs: vi.fn(),
  wpPublishArgs: (asset: ContentAsset) => ({ postId: asset.wordpressPostId }),
}));
vi.mock("./checklist", () => ({ publishBlockers: h.blockers }));
vi.mock("./publication-approval.server", () => ({ assertPublicationApproved: h.approved }));
vi.mock("./source-publication.server", () => ({ assertAssetSourcesCurrent: h.sources }));
vi.mock("./publication-version", () => ({ publicationVersion: h.version }));
vi.mock("./publication-evidence.server", () => ({
  withPublicationEvidence: ({ publish }: { publish: () => unknown }) => publish(),
}));
vi.mock("./publish-secret.server", () => ({ resolveWordPressAppPassword: async () => "secret" }));

import { publishAssetServerSide } from "./publish.server";
import {
  firingUpdateIntent,
  isLivePublished,
  scheduledUpdateIntent,
} from "./scheduled-published-updates";

const owner = "00000000-0000-4000-8000-000000000001";
const QUEUE = "00000000-0000-4000-8000-0000000000aa";
const HASH = "a".repeat(64);
const live: ContentAsset = {
  id: "a",
  projectId: "p",
  title: "Friskvård",
  slug: "friskvard",
  markdown: "Befintlig text",
  status: "Approved",
  livePublishStatus: "published",
  liveUrl: "https://example.se/friskvard",
  publishPlatform: "wordpress",
  publishExternalId: "77",
  wordpressPostId: 77,
  livePublishedAt: "2026-10-01T08:00:00.000Z",
  opportunityId: "o",
  scheduledPublishAt: "2026-11-17T08:00:00.000Z",
  scheduledPublishStatus: "pending",
} as unknown as ContentAsset;
const armed = (asset = live): ContentAsset => ({
  ...asset,
  scheduledPublishedUpdate: scheduledUpdateIntent(asset, QUEUE, HASH),
});
const seed = (asset: ContentAsset) => {
  h.store = {
    rev: 1,
    data: {
      projects: [{ id: "p", connectorType: "wordpress", websiteUrl: "https://example.se" }],
      content: [asset],
      opportunities: [{ id: "o", status: "published", publishedAt: "2026-10-01T08:00:00.000Z" }],
    },
  };
};
const stored = () => (h.store.data.content as ContentAsset[])[0];
const fire = (queueId: string | undefined = QUEUE) =>
  publishAssetServerSide(owner, "a", { queueId });

beforeEach(() => {
  vi.resetAllMocks();
  h.chain.clear();
  h.approved.mockResolvedValue(undefined);
  h.sources.mockResolvedValue(undefined);
  h.blockers.mockReturnValue([]);
  h.version.mockResolvedValue({ algorithm: "milo-publication-v1", hash: HASH });
  h.wp.mockResolvedValue({
    success: true,
    liveUrl: "https://example.se/friskvard",
    postId: 77,
    postType: "post",
  });
});

describe("scheduled update intent", () => {
  it("exists only for an already-live article and binds queue row, version and identity", () => {
    expect(isLivePublished(live)).toBe(true);
    expect(scheduledUpdateIntent({ ...live, livePublishStatus: undefined }, QUEUE, HASH)).toBe(
      undefined,
    );
    expect(armed().scheduledPublishedUpdate).toMatchObject({ queueId: QUEUE, versionHash: HASH });
  });
  it("is only honoured for the firing queue row", () => {
    expect(firingUpdateIntent(armed(), QUEUE)).toBeDefined();
    expect(firingUpdateIntent(armed(), "another-row")).toBeUndefined();
    expect(firingUpdateIntent(armed(), undefined)).toBeUndefined();
    expect(firingUpdateIntent(live, QUEUE)).toBeUndefined();
  });
});

describe("scheduled published update at fire time", () => {
  it("sends nothing while armed and updates the same existing article only when it fires", async () => {
    seed(armed());
    expect(h.wp).not.toHaveBeenCalled();
    await fire();
    expect(h.wp).toHaveBeenCalledOnce();
    expect(h.wp.mock.calls[0][0]).toMatchObject({ postId: 77 });
    expect(stored()).toMatchObject({
      livePublishStatus: "published",
      wordpressPostId: 77,
      liveUrl: "https://example.se/friskvard",
      scheduledPublishAt: undefined,
      scheduledPublishStatus: undefined,
      scheduledPublishedUpdate: undefined,
    });
    // An update is not a new publication: measurement and first-publish date stay.
    expect(h.store.data.opportunities).toEqual([
      { id: "o", status: "published", publishedAt: "2026-10-01T08:00:00.000Z" },
    ]);
  });

  it("does not send again for a replay of the spent queue row", async () => {
    seed(armed());
    await fire();
    await fire();
    expect(h.wp).toHaveBeenCalledOnce();
  });

  it("leaves a first-publication row for an article published manually before the slot a no-op", async () => {
    seed(live); // no update intent: the row was armed before the manual publish
    await expect(fire()).resolves.toMatchObject({ liveUrl: live.liveUrl });
    expect(h.wp).not.toHaveBeenCalled();
    expect(h.approved).not.toHaveBeenCalled();
  });

  it("ignores an intent that belongs to a different queue row", async () => {
    seed(armed());
    await fire("00000000-0000-4000-8000-0000000000bb");
    expect(h.wp).not.toHaveBeenCalled();
  });

  it.each([
    [
      "withdrawn consent",
      () => seed(armed({ ...live, status: "In Review" })),
      "no longer approved",
    ],
    [
      "edited version",
      () => {
        seed(armed());
        h.version.mockResolvedValue({ algorithm: "milo-publication-v1", hash: "b".repeat(64) });
      },
      "changed after",
    ],
    [
      "moved destination",
      () => seed({ ...armed(), wordpressPostId: 99, publishExternalId: "99" } as ContentAsset),
      "destination changed",
    ],
  ])("refuses permanently on %s without any send", async (_name, setup, message) => {
    setup();
    await expect(fire()).rejects.toMatchObject({
      permanent: true,
      message: expect.stringContaining(message),
    });
    expect(h.wp).not.toHaveBeenCalled();
  });

  it("refuses when the exact approval or the sources are no longer current", async () => {
    seed(armed());
    h.approved.mockRejectedValueOnce(new Error("publication_approval_required"));
    await expect(fire()).rejects.toThrow("publication_approval_required");
    h.sources.mockRejectedValueOnce(new Error("sources_stale"));
    await expect(fire()).rejects.toThrow("sources_stale");
    expect(h.wp).not.toHaveBeenCalled();
  });

  it("keeps the live page and clears the intent when the update is parked", async () => {
    const { recordScheduledPublishFailure } = await import("./publish.server");
    seed(armed());
    await recordScheduledPublishFailure(owner, "a", "refused", true);
    expect(stored()).toMatchObject({
      livePublishStatus: "published",
      liveUrl: live.liveUrl,
      scheduledPublishStatus: "failed",
      scheduledPublishedUpdate: undefined,
    });
  });
});
