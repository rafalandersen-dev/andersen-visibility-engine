import { describe, expect, it, vi } from "vitest";
import {
  capturePublicationSnapshot,
  evidencePublicUrl,
  observationFromImport,
  comparePublicationObservations,
  type PublicationEvidence,
} from "./publication-evidence";
import { withPublicationEvidence } from "./publication-evidence.server";
import { PublishRecordingFailedError, PublishTransportError } from "./publish-outcome";
import type { ContentAsset, Project, GscImport } from "./types";
const ownerId = "00000000-0000-4000-8000-000000000001";
const project = {
  id: "p",
  name: "Project",
  websiteUrl: "https://example.com",
  wordpress: { applicationPassword: "synthetic-private-value" },
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
  source: "manual_csv",
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
