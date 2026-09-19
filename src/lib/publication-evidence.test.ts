import { describe, expect, it, vi } from "vitest";
import {
  capturePublicationSnapshot,
  evidencePublicUrl,
  observationFromImport,
  observationSchema,
  comparePublicationObservations,
  type PublicationEvidence,
} from "./publication-evidence";
import {
  withPublicationEvidence,
  withManualPublicationEvidence,
} from "./publication-evidence.server";
import {
  PublishRecordingFailedError,
  PublishTransportError,
  retainedManualPublicationPatch,
} from "./publish-outcome";
import type { ContentAsset, Project, GscImport } from "./types";
import { wpPublishArgs, shopifyArticleArgs } from "./publish-targets";
const ownerId = "00000000-0000-4000-8000-000000000001";
const project = {
  id: "p",
  name: "Project",
  websiteUrl: "https://example.com",
  wordpress: {
    siteUrl: "https://example.com",
    username: "fixture-user",
    applicationPassword: "synthetic-private-value",
  },
  shopify: { shopDomain: "fixture.myshopify.com", adminAccessTokenSet: true },
} as Project;
const asset = {
  id: "a",
  projectId: "p",
  title: "Saved title",
  slug: "article",
  markdown: "Actual approved body",
  status: "Approved",
} as ContentAsset;
const outcome = (r: { success: boolean; liveUrl?: string }) => r;
const pub = {
  outcome: "published",
  outcomeData: {
    liveUrl: "https://example.com/article",
    externalId: "1",
    publishedAt: "2026-08-15T12:00:00Z",
    verification: "connector_response_only",
  },
} as PublicationEvidence;
const imp = (start = "2026-08-16", end = "2026-08-22"): GscImport => ({
  id: "gsc",
  integrityVersion: 2,
  source: "api",
  selectedSiteUrl: "sc-domain:example.com",
  importedAt: "2026-09-01T00:00:00Z",
  importType: "pages",
  dateRange: { start, end },
  rows: [
    {
      type: "page",
      page: "https://example.com/article",
      clicks: 2,
      impressions: 50,
      ctr: 4,
      position: 7,
    },
  ],
  summary: { totalClicks: 2, totalImpressions: 50, averageCtr: 4, averagePosition: 7, rowCount: 1 },
});
const now = new Date("2026-09-10T00:00:00Z");
describe("immutable publication snapshot", () => {
  it("captures assembled output and excludes project credentials", async () => {
    const saved = await capturePublicationSnapshot(asset, project, []);
    expect(saved.markdown).toContain("Actual approved body");
    expect(JSON.stringify(saved)).not.toContain("synthetic-private-value");
    asset.title = "Later title";
    expect(saved.title).toBe("Saved title");
    asset.title = "Saved title";
  });
  it("refuses mismatched project scope", async () => {
    await expect(
      capturePublicationSnapshot(asset, { ...project, id: "other" }, []),
    ).rejects.toThrow("publication_version_scope");
  });
  it("does not expose credential/query or active URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "https://user:password@example.com/a",
      "https://example.com/a?token=private",
    ])
      expect(evidencePublicUrl(value)).toBe("");
    expect(evidencePublicUrl("https://example.com/a#part")).toBe("https://example.com/a");
  });
});
describe("publication evidence transport boundary", () => {
  it("never calls the connector when evidence admission fails", async () => {
    const publish = vi.fn();
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(
      withPublicationEvidence({ ownerId, asset, project, paths: [], publish, outcome, rpc }),
    ).rejects.toThrow("No publication was started");
    expect(publish).not.toHaveBeenCalled();
  });
  it("records the exact pre-transport snapshot and successful outcome once", async () => {
    const events: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      events.push(name);
      return { data: true, error: null };
    });
    const publish = vi.fn(async () => {
      events.push("transport");
      return { success: true, liveUrl: "https://example.com/article" };
    });
    await withPublicationEvidence({ ownerId, asset, project, paths: [], publish, outcome, rpc });
    expect(events).toEqual([
      "begin_publication_evidence",
      "transport",
      "finish_publication_evidence",
    ]);
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("makes recording failure after successful publication permanent", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockRejectedValueOnce(Error("db down"));
    const publish = vi.fn(async () => ({ success: true, liveUrl: "https://example.com/article" }));
    await expect(
      withPublicationEvidence({ ownerId, asset, project, paths: [], publish, outcome, rpc }),
    ).rejects.toBeInstanceOf(PublishRecordingFailedError);
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("does not turn malformed successful responses into retriable exceptions", async () => {
    const rpc = vi.fn(async (_name: string) => ({ data: true, error: null }));
    await expect(
      withPublicationEvidence({
        ownerId,
        asset,
        project,
        paths: [],
        publish: async () => ({ success: true }),
        outcome: () => ({ success: true, publishedAt: "invalid" }),
        rpc,
      }),
    ).rejects.toBeInstanceOf(PublishRecordingFailedError);
  });
  it("retains retry classification only for proven rejection", async () => {
    const rpc = vi.fn(async (_name: string) => ({ data: true, error: null }));
    const error = new PublishTransportError("rejected", true, 429);
    await expect(
      withPublicationEvidence({
        ownerId,
        asset,
        project,
        paths: [],
        publish: async () => {
          throw error;
        },
        outcome,
        rpc,
      }),
    ).rejects.toBe(error);
    expect(rpc.mock.calls[1][0]).toBe("finish_publication_evidence");
  });
});
describe("later measurements", () => {
  it.each([
    ["2026-08-07T23:30:00-02:00", false], // UTC Aug 8: inside the first day
    ["2026-08-23T00:30:00+02:00", false], // UTC Aug 22: inside the last day
    ["2026-08-08T00:30:00+02:00", true], // UTC Aug 7: before the window
    ["2026-08-22T23:30:00-02:00", true], // UTC Aug 23: after the window
    ["unreadable", false],
  ])("compares competing receipt %s on the observation UTC-day basis", (at, comparable) => {
    const before = observationFromImport(imp("2026-08-08", "2026-08-14"), pub, now);
    const after = observationFromImport(imp(), pub, now);
    expect(comparePublicationObservations(before, after, [at]).comparable).toBe(comparable);
    if (Number.isFinite(Date.parse(at))) {
      expect(comparePublicationObservations(before, after, [at])).toEqual(
        comparePublicationObservations(before, after, [new Date(at).toISOString()]),
      );
    }
  });
  it("rejects over-limit imports before selecting a matching page", () => {
    const over = imp();
    over.rows.push(
      ...Array.from({ length: 1000 }, (_, i) => ({
        ...over.rows[0],
        page: `https://example.com/other-${i}`,
      })),
    );
    expect(() => observationFromImport(over, pub, now)).toThrow("import_limit");
    over.rows.pop();
    expect(observationFromImport(over, pub, now).page).toBe("https://example.com/article");
  });
  it("revalidates browser-edited v2 metrics before freezing new evidence", () => {
    for (const patch of [
      { clicks: 3, impressions: 2 },
      { clicks: 1.5 },
      { impressions: 50.5 },
      { clicks: -1 },
      { ctr: 101 },
      { ctr: -1 },
      { position: 0 },
      { position: Infinity },
      { clicks: NaN },
      { clicks: "2" },
    ]) {
      const edited = imp();
      Object.assign(edited.rows[0], patch);
      expect(() => observationFromImport(edited, pub, now)).toThrow("metrics_invalid");
    }
    // Do not tighten the reader schema and make old immutable evidence unreadable.
    const historical = observationFromImport(imp(), pub, now);
    expect(
      observationSchema.parse({ ...historical, metrics: { ...historical.metrics, position: 0 } })
        .metrics.position,
    ).toBe(0);
  });
  it("refuses new observations from legacy or incomplete metrics without changing old evidence", () => {
    expect(() =>
      observationFromImport({ ...imp(), integrityVersion: undefined }, pub, now),
    ).toThrow("legacy");
    for (const selectedSiteUrl of [undefined, "", "sc-domain:bad", "https://other.example/"]) {
      expect(() => observationFromImport({ ...imp(), selectedSiteUrl }, pub, now)).toThrow(
        "property_mismatch",
      );
    }
    const missing = imp();
    missing.rows[0].clicks = null;
    expect(() => observationFromImport(missing, pub, now)).toThrow();
    expect(() =>
      observationFromImport({ ...imp(), selectedSiteUrl: "sc-domain:other.example" }, pub, now),
    ).toThrow("property_mismatch");
  });
  it("freezes the exact page/window and marks workspace provenance unverified", () => {
    const o = observationFromImport(imp(), pub, now);
    expect(o).toMatchObject({
      relation: "later",
      windowDays: 7,
      independentlyVerified: false,
      metrics: { clicks: 2 },
    });
  });
  it("never treats an absent page or duplicate rows as zero", () => {
    const missing = imp();
    missing.rows = [];
    expect(() => observationFromImport(missing, pub, now)).toThrow("page_missing");
    const repeated = imp();
    repeated.rows.push(repeated.rows[0]);
    expect(() => observationFromImport(repeated, pub, now)).toThrow("ambiguous");
  });
  it("rejects missing, impossible, overlapping and incomplete windows", () => {
    for (const range of [
      ["2026-08-15", "2026-08-20"],
      ["2026-02-30", "2026-03-02"],
      ["2026-08-22", "2026-08-16"],
      ["2026-09-05", "2026-09-10"],
    ])
      expect(() => observationFromImport(imp(...(range as [string, string])), pub, now)).toThrow();
  });
  it("requires matching windows and distinguishes low volume from zero or causal proof", () => {
    const before = observationFromImport(imp("2026-08-08", "2026-08-14"), pub, now),
      after = observationFromImport(imp(), pub, now);
    expect(comparePublicationObservations(before, after, [])).toMatchObject({
      comparable: true,
      causal: false,
      tentative: true,
      lowVolume: true,
      clickChange: 0,
    });
    expect(comparePublicationObservations(before, after, ["2026-08-10T10:00:00Z"]).comparable).toBe(
      false,
    );
    expect(
      comparePublicationObservations(
        before,
        { ...after, selectedSiteUrl: "https://example.com/" },
        [],
      ).comparable,
    ).toBe(false);
    expect(
      comparePublicationObservations(
        { ...before, declaredImportSource: "manual_csv" },
        { ...after, declaredImportSource: "manual_csv" },
        [],
      ).comparable,
    ).toBe(false);
    expect(comparePublicationObservations(before, { ...after, windowDays: 6 }, []).comparable).toBe(
      false,
    );
    expect(comparePublicationObservations(before, after, ["2026-08-20T10:00:00Z"]).comparable).toBe(
      false,
    );
    expect(
      comparePublicationObservations(before, { ...after, truncated: true }, []).comparable,
    ).toBe(false);
  });
});

it("retains manual connector identity and permanent uncertainty after evidence recording fails", async () => {
  for (const platform of ["wordpress", "shopify"] as const) {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockRejectedValueOnce(Error("recording unavailable"));
    const publish = vi.fn(async () => ({
      success: true,
      liveUrl: "https://example.com/article",
      postId: 42,
      postType: "post" as const,
      articleId: "43",
      articleGid: "gid://shopify/Article/43",
      blogId: "9",
      blogGid: "gid://shopify/Blog/9",
      handle: "article",
    }));
    const result = await withManualPublicationEvidence({
      ownerId,
      asset,
      project,
      paths: [],
      rpc,
      publish,
      outcome,
    });
    expect(result).toMatchObject({
      success: false,
      recordingFailed: true,
      retryable: false,
      postId: 42,
      articleGid: "gid://shopify/Article/43",
      liveUrl: "https://example.com/article",
    });
    expect(publish).toHaveBeenCalledTimes(1);
    const retained = { ...asset, ...retainedManualPublicationPatch(result, platform) };
    if (platform === "wordpress") expect(wpPublishArgs(retained, project).postId).toBe(42);
    else expect(shopifyArticleArgs(retained, project).articleGid).toBe("gid://shopify/Article/43");
    expect(retained.livePublishStatus).not.toBe("published");
  }
});
