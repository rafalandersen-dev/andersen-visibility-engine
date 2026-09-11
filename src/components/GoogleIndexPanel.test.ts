import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { googleIndexCopy } from "@/i18n/google-index";
import { normalizeGoogleIndex } from "@/lib/google-index";
import type { Project } from "@/lib/types";
const state = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state.data,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => googleIndexCopy.en[key] ?? key }));
vi.mock("@/lib/store", () => ({ saveWorkspaceNow: vi.fn() }));
vi.mock("@/lib/google-index.functions", () => ({
  listGoogleIndexFn: vi.fn(),
  requestGoogleIndexFn: vi.fn(),
}));
import { GoogleIndexPanel } from "./GoogleIndexPanel";
const project = {
  id: "p",
  websiteUrl: "https://example.test/",
  gscOAuth: { selectedSite: { siteUrl: "sc-domain:example.test" } },
} as Project;
describe("Google inspection customer view", () => {
  it("escapes provider text, labels unknown crawl time and renders only official navigation", () => {
    const context = {
      url: "https://example.test/page?q=1",
      property: "sc-domain:example.test",
      observedAt: "2026-09-11T10:00:00Z",
    };
    const evidence = normalizeGoogleIndex(
      {
        inspectionResult: {
          indexStatusResult: { coverageState: "<script>unsafe</script>", verdict: "PASS" },
          inspectionResultLink: "https://evil.test/",
        },
      },
      context,
    );
    state.data = [
      {
        ...context,
        requestId: "r",
        status: "succeeded",
        error: null,
        createdAt: context.observedAt,
        observationJson: JSON.stringify(evidence),
      },
    ];
    const html = renderToStaticMarkup(createElement(GoogleIndexPanel, { project }));
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe");
    expect(html).not.toContain('href="https://evil.test/"');
    expect(html).toContain(googleIndexCopy.en["gindex.unknownValue"]);
    expect(html).toContain(googleIndexCopy.en["gindex.help"]);
  });
  it("keeps saved history available when no property is currently selected", () => {
    state.data = [];
    const html = renderToStaticMarkup(
      createElement(GoogleIndexPanel, { project: { ...project, gscOAuth: undefined } }),
    );
    expect(html).toContain(googleIndexCopy.en["gindex.connect"]);
    expect(html).toContain(googleIndexCopy.en["gindex.historyHelp"]);
  });
});
