import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project } from "./types";
vi.mock("./auth", () => ({ useAuth: () => ({ isOwner: false }) }));
vi.mock("./store", () => ({
  useStore: (selector: (s: unknown) => unknown) =>
    selector({
      content: [
        {
          id: "a",
          projectId: "p",
          title: "Our page",
          livePublishStatus: "published",
          liveUrl: "https://example.com/a",
        },
      ],
    }),
  updateProject: vi.fn(),
  saveWorkspaceNow: vi.fn(),
  getState: vi.fn(),
}));
vi.mock("./gsc.functions", () => ({
  getGscOAuthStatusFn: vi.fn(),
  startGscOAuthFn: vi.fn(),
  listGscSitesFn: vi.fn(),
  selectGscSiteFn: vi.fn(),
  syncGscSearchAnalyticsFn: vi.fn(),
  disconnectGscFn: vi.fn(),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { GscLiteSection } from "@/components/GscLiteSection";
const project = (legacy = false): Project =>
  ({
    id: "p",
    gscLite: {
      imports: [
        {
          id: "i",
          importedAt: "2026-09-01T00:00:00Z",
          source: "manual_csv",
          integrityVersion: legacy ? undefined : 2,
          importType: "pages",
          selectedSiteUrl: "sc-domain:example.com",
          dateRange: { start: "2026-08-01", end: "2026-08-28" },
          rows: [
            {
              type: "page",
              page: "https://example.com/a",
              path: "/a",
              clicks: null,
              impressions: 20,
              ctr: null,
              position: null,
            },
          ],
          summary: {
            totalClicks: 99999,
            totalImpressions: 99999,
            averageCtr: 99,
            averagePosition: 99,
            rowCount: 1,
          },
        },
      ],
    },
  }) as Project;
describe("GSC visible measurement labels", () => {
  it("renders preview controls and explicit boundaries without cached fabricated metrics", () => {
    const html = renderToStaticMarkup(
      createElement(GscLiteSection, {
        project: project(),
        onsite: [
          {
            path: "/a",
            viewsSincePublish: 77777,
            ctaClicksSincePublish: 9,
            bookingClicksSincePublish: 9,
            conversionRateSincePublish: 1,
          },
        ],
      }),
    );
    for (const text of [
      "gsc.integrity.preview",
      "gsc.integrity.property",
      "gsc.integrity.start",
      "gsc.integrity.end",
      "gsc.integrity.disclaimer",
      "gsc.integrity.rows",
      "gsc.integrity.separate",
      "sc-domain:example.com",
      "2026-08-01",
      "—",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("99999");
    expect(html).not.toContain("77777");
    expect(html).not.toContain("null%");
  });
  it("labels legacy data and never renders the old numeric basis as current proof", () => {
    const html = renderToStaticMarkup(createElement(GscLiteSection, { project: project(true) }));
    expect(html).toContain("gsc.integrity.legacy");
    expect(html).not.toContain("99999");
  });
});
