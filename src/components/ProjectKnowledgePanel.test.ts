import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ stateIndex: 0, loading: false, failed: false, affected: false }));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = h.stateIndex++;
      const overrides: Record<number, unknown> = {
        0: {
          checked: 1,
          affected: h.affected
            ? [{ assetId: "draft", title: "Saved draft", issues: [], knowledgeIssueCount: 1 }]
            : [],
          reviewHistory: [{ assetId: "history", title: "Previous review" }],
          remaining: 0,
        },
        4: h.loading,
        5: h.failed,
      };
      return actual.useState(index in overrides ? overrides[index] : initial);
    },
  };
});
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key, useAppLanguage: () => "en" }));
vi.mock("@/lib/store", () => ({ useStore: () => undefined, saveWorkspaceNow: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createClientOnlyFn: (fn: unknown) => fn }));
vi.mock("@/lib/project-knowledge.functions", () => ({}));
vi.mock("@/lib/source-refresh.functions", () => ({
  readSourceRefreshFn: vi.fn(),
  readSourceImpactFn: vi.fn(),
  configureShopifyCatalogFn: vi.fn(),
}));
vi.mock("./SourceRefreshPanel", () => ({ SourceRefreshPanel: () => null }));
vi.mock("./KnowledgeOutputInspection", () => ({
  KnowledgeOutputInspection: () => createElement("span", null, "review-controls"),
}));
import { ProjectKnowledgePanel } from "./ProjectKnowledgePanel";
beforeEach(() => {
  h.stateIndex = 0;
});
it.each([
  { loading: false, failed: false, visible: true },
  { loading: true, failed: false, visible: false },
  { loading: false, failed: true, visible: false },
])("requires a successful current load for source impact: %j", ({ loading, failed, visible }) => {
  for (const affected of [false, true]) {
    Object.assign(h, { stateIndex: 0, loading, failed, affected });
    const html = renderToStaticMarkup(
      createElement(ProjectKnowledgePanel, {
        projectId: "p",
        ownerId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(html.includes("refresh.affected")).toBe(visible);
    expect(html.includes("review-controls")).toBe(visible);
    expect(html.includes("refresh.noImpact")).toBe(visible && !affected);
    if (loading) expect(html).toContain("knowledge.ui.loading");
    if (failed) expect(html).toContain("knowledge.ui.failed");
  }
});
