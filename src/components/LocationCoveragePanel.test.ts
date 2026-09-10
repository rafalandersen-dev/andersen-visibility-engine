import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { locationCoverage } from "@/i18n/location-coverage";
import { emptyCoverage } from "@/lib/location-coverage";
import type { Project } from "@/lib/types";
const h = vi.hoisted(() => ({
  locale: "en" as "en" | "pl" | "sv" | "da",
  error: false,
  records: [] as unknown[],
  owner: "00000000-0000-4000-8000-000000000001",
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: h.owner } }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: string; to: string }) =>
    createElement("a", { href: to }, children),
}));
vi.mock("@/lib/project-knowledge.functions", () => ({}));
vi.mock("@/lib/publication-evidence.functions", () => ({}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isPending: false,
    isError: h.error,
    isFetching: false,
    refetch: vi.fn(),
    data:
      queryKey[0] === "location-coverage"
        ? {
            sources: [
              {
                ownerId: h.owner,
                projectId: "p",
                id: "00000000-0000-4000-8000-000000000002",
                revision: 1,
                kind: "owner",
                label: "Owner",
                fingerprint: "a".repeat(64),
                observedAt: "2020-01-01T00:00:00Z",
                status: "active",
              },
            ],
            records: h.records,
          }
        : { total: 0, items: [] },
  }),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => locationCoverage[h.locale][key] ?? key }));
import { LocationCoveragePanel } from "./LocationCoveragePanel";
const project = {
  id: "p",
  mainLocation: "Stockholm",
  targetLocations: ["Uppsala"],
  market: "SE",
  primaryContentLanguage: "sv",
} as Project;
const render = () => renderToStaticMarkup(createElement(LocationCoveragePanel, { project }));
beforeEach(() => {
  h.records = [];
  h.error = false;
  h.locale = "en";
});
describe("actual coverage panel", () => {
  it.each(["en", "pl", "sv", "da"] as const)(
    "renders honest integrated empty states and actions in %s",
    (locale) => {
      h.locale = locale;
      expect(Object.keys(locationCoverage[locale]).sort()).toEqual(
        Object.keys(locationCoverage.en).sort(),
      );
      const html = render();
      expect(html).toContain(locationCoverage[locale]["coverage.empty"]);
      expect(html).toContain(locationCoverage[locale]["coverage.noRecord"]);
      expect(html).not.toContain("coverage.");
      expect(html).toContain('href="/app/plan"');
      expect(html).toContain('href="/app/report"');
      expect(html).toContain('href="/app/specialists"');
    },
  );
  it("renders missing NAP and unverified destination evidence with source version", () => {
    h.records = [
      {
        ownerId: h.owner,
        projectId: "p",
        id: "00000000-0000-4000-8000-000000000003",
        sourceId: "00000000-0000-4000-8000-000000000002",
        sourceRevision: 1,
        revision: 1,
        key: "coverage.local.one",
        category: "fact",
        appliesTo: "text",
        value: JSON.stringify({ ...emptyCoverage, target: "Stockholm" }),
        locator: "Owner observation",
        status: "accepted",
        updatedAt: "2020-01-01T00:00:00Z",
        reviewedAt: "2020-01-01T00:00:00Z",
      },
    ];
    const html = render();
    expect(html).toContain(locationCoverage.en["coverage.reviewed"]);
    expect(html).toContain(locationCoverage.en["coverage.unverified"]);
    expect(html).toContain(locationCoverage.en["coverage.missing"]);
    expect(html).toContain("Owner observation");
    h.records = h.records.map((record) => ({
      ...(record as object),
      validUntil: "2020-01-01T00:00:00Z",
    }));
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>knowledge.ui.review<\/button>/);
  });
  it("hides cached evidence on read failure", () => {
    h.error = true;
    const html = render();
    expect(html).toContain(locationCoverage.en["coverage.failed"]);
    expect(html).not.toContain(locationCoverage.en["coverage.empty"]);
    expect(html).not.toContain("<form");
  });
});
