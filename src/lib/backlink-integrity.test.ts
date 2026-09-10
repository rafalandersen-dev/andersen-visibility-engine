import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { backlinkEvidencePrompt } from "./backlinks";
import { backlinkIntegrity } from "@/i18n/backlink-integrity";
import type { BacklinkAnalysisResult, BacklinkTargetSummary } from "./types";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useNavigate: vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => createElement("a", null, children),
}));
vi.mock("@/components/AppShell", () => ({ AppShell: vi.fn() }));
vi.mock("./store", () => ({ useStore: vi.fn() }));
vi.mock("./mock-ai", () => ({}));
vi.mock("./link-network.functions", () => ({}));
vi.mock("@/i18n", () => ({ useT: vi.fn() }));
import { AnalysisView } from "@/routes/_authenticated/app.backlinks";
const own: BacklinkTargetSummary = {
  target: "example.com",
  fetchStatus: "partial",
  backlinks: 0,
  rank: null,
  referringDomains: null,
  referringMainDomains: null,
  brokenBacklinks: null,
  spamScore: null,
};
const analysis: BacklinkAnalysisResult = {
  id: "a",
  projectId: "p",
  ownDomain: own.target,
  own,
  competitors: [],
  topReferringDomains: [],
  gapDomains: [],
  overallLinkScore: null,
  linkProfileScore: null,
  linkGapScore: null,
  linkQualityScore: null,
  summary: "Advice",
  topLinkActions: [],
  recommendations: [],
  convertedRecommendationIds: [],
  createdAt: "2026-09-10T00:00:00Z",
  evidenceVersion: 1,
  referringStatus: "failed",
  gapStatus: "not_requested",
};
describe("backlink evidence consumers", () => {
  it("keeps failed samples distinct from empty successful samples in actual model text", () => {
    const failed = backlinkEvidencePrompt(
      own,
      [{ ...own, target: "competitor.com", fetchStatus: "failed" }],
      null,
      null,
    );
    expect(failed.ownBlock).toContain("backlinks 0");
    expect(failed.ownBlock).toContain("domain rank unavailable");
    expect(failed.referringBlock).toContain("request failed; unavailable");
    expect(failed.gapBlock).toContain("request failed; unavailable");
    expect(failed.competitorBlock).not.toContain("backlinks 0");
    const empty = backlinkEvidencePrompt(own, [], [], []);
    expect(empty.referringBlock).toContain("not proof of no backlinks");
    expect(empty.gapStatus).toBe("not_requested");
  });
  it.each(["en", "pl", "sv", "da"] as const)(
    "renders unknown/zero and failed collection labels in %s",
    (locale) => {
      const t = (key: string) => backlinkIntegrity[locale][key] ?? key;
      const html = renderToStaticMarkup(
        createElement(AnalysisView, {
          analysis,
          projectId: "p",
          competitors: [],
          convertTop: vi.fn(),
          convertingTop: false,
          t,
        }),
      );
      expect(html).toContain(backlinkIntegrity[locale]["backlinks.integrity.source"]);
      expect(html).toContain(backlinkIntegrity[locale]["backlinks.integrity.failed"]);
      expect(html).toContain(backlinkIntegrity[locale]["backlinks.integrity.not_requested"]);
      expect(html).toContain(">0</td>");
      expect(html).toContain(">—</td>");
      expect(html).not.toContain("backlinks.referringEmpty");
    },
  );
  it("retains historical advice but hides the legacy numeric basis", () => {
    const html = renderToStaticMarkup(
      createElement(AnalysisView, {
        analysis: {
          ...analysis,
          evidenceVersion: undefined,
          own: { ...own, backlinks: 987654 },
          overallLinkScore: 77,
        },
        projectId: "p",
        competitors: [],
        convertTop: vi.fn(),
        convertingTop: false,
        t: (key) => key,
      }),
    );
    expect(html).toContain("backlinks.integrity.legacy");
    expect(html).toContain("Advice");
    expect(html).not.toContain("987");
    expect(html).not.toContain(">77");
  });
});
