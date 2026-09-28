/**
 * Static render of the REAL DiscoverView (exported from the plan route) with fictional suggestions:
 * the default selection (first three suggested rows) is exposed as aria-pressed="true", the rest as
 * "false", accepted rows are disabled and not pressed, dismissed rows are not rendered, every row
 * selector is a non-submitting button, and the Add-selected control names the selected count.
 * Real English and Polish copy. Click/keyboard transitions are covered by the local harness.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/i18n/translate";
import type { DiscoverySuggestion, Project } from "@/lib/types";

const lang = vi.hoisted(() => ({ current: "en" as "en" | "pl" }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => () => undefined,
  Link: ({ children, to, ...props }: { children: unknown; to: string }) =>
    createElement("a", { ...props, href: to }, children as never),
}));
vi.mock("@/components/AppShell", () => ({ AppShell: () => null }));
vi.mock("@/components/TechnicalEvidencePanel", () => ({ TechnicalEvidencePanel: () => null }));
vi.mock("@/components/SampleBadge", () => ({ SampleBadge: () => null }));
vi.mock("@/lib/store", () => ({
  useStore: () => undefined,
  getState: () => ({ opportunities: [], content: [], projects: [], services: [] }),
  acceptDiscoverySuggestions: vi.fn(() => []),
  addOpportunity: vi.fn(),
  clearSampleData: vi.fn(),
  hasSampleData: () => false,
  archiveOpportunity: vi.fn(),
  reloadWorkspaceForUser: vi.fn(),
  restoreOpportunity: vi.fn(),
  saveWorkspaceNow: vi.fn(async () => undefined),
  getWorkspaceSaveContext: () => ({ epoch: 0, userId: "u1", hydrated: true }),
  hasUnsavedWorkspaceChanges: () => false,
  transitionOpportunity: vi.fn(),
  undoAcceptedDiscoverySuggestions: vi.fn(),
  updateOpportunity: vi.fn(),
}));
vi.mock("@/lib/mock-ai", () => ({
  generateSeoOpportunities: vi.fn(),
  generateContentForOpportunity: vi.fn(),
  createBlankDraftForOpportunity: vi.fn(),
}));
vi.mock("@/lib/schedule.functions", () => ({ scheduleContentPublishFn: vi.fn() }));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    translate(lang.current, key, vars),
  useAppLanguage: () => lang.current,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }),
}));
import { DiscoverView } from "@/routes/_authenticated/app.plan";

const project = { id: "p1", name: "Fixture", primaryLanguage: "English" } as unknown as Project;
const suggestion = (i: number, status: DiscoverySuggestion["status"]): DiscoverySuggestion =>
  ({
    id: `s${i}`,
    projectId: "p1",
    title: `Fixture suggestion ${i}`,
    language: "English",
    contentType: "Blog Article",
    searchIntent: "Informational",
    targetAudience: "Fixture audience",
    businessValue: `Fixture value ${i}`,
    recommendedCta: "Contact us",
    priority: "Medium",
    status,
    creationMode: "milo_discovery",
    primarySource: "services_products",
    reasonDiscovered: `Fixture reason ${i}`,
    deduplicationKey: `k${i}`,
    generatedAt: "2026-09-28T12:00:00.000Z",
  }) as unknown as DiscoverySuggestion;
const suggestions = [
  suggestion(1, "suggested"),
  suggestion(2, "suggested"),
  suggestion(3, "suggested"),
  suggestion(4, "suggested"),
  suggestion(5, "accepted"),
  suggestion(6, "dismissed"),
];
const render = () =>
  renderToStaticMarkup(
    createElement(DiscoverView, { project, suggestions, onOpenPlan: () => undefined }),
  );
const selectors = (html: string) =>
  [
    ...html.matchAll(
      /<button type="button" aria-label="([^"]+)" aria-pressed="(true|false)"( disabled="")?/g,
    ),
  ].map((m) => ({ label: m[1], pressed: m[2] === "true", disabled: Boolean(m[3]) }));

describe("DiscoverView exposes the discovery selection state accessibly (AM)", () => {
  it("en: first three suggested rows pressed, fourth not, accepted row disabled+unpressed, dismissed row absent", () => {
    lang.current = "en";
    const html = render();
    expect(selectors(html)).toEqual([
      { label: "Select Fixture suggestion 1", pressed: true, disabled: false },
      { label: "Select Fixture suggestion 2", pressed: true, disabled: false },
      { label: "Select Fixture suggestion 3", pressed: true, disabled: false },
      { label: "Select Fixture suggestion 4", pressed: false, disabled: false },
      { label: "Select Fixture suggestion 5", pressed: false, disabled: true },
    ]);
    expect(html).not.toContain("Fixture suggestion 6");
    expect(html).toContain(translate("en", "planScreen.discovery.addSelected", { count: 3 }));
    expect(html).not.toMatch(/type="submit"/);
    expect(html).not.toContain("<form");
    // AP: idle save status renders nothing; the Add control is a non-submit button.
    expect(html).not.toContain("data-discovery-save");
    const add =
      html.match(/<button[^>]*>(?:(?!<\/button>).)*Add selected to Plan \(3\)<\/button>/)?.[0] ??
      "";
    expect(add).toContain('type="button"');
    expect(add).not.toMatch(/\sdisabled=""/);
  });
  it("pl: the same states with Polish labels", () => {
    lang.current = "pl";
    const rows = selectors(render());
    expect(rows.map((r) => r.label)).toEqual(
      [1, 2, 3, 4, 5].map((i) => `Wybierz Fixture suggestion ${i}`),
    );
    expect(rows.map((r) => r.pressed)).toEqual([true, true, true, false, false]);
    expect(rows.map((r) => r.disabled)).toEqual([false, false, false, false, true]);
    lang.current = "en";
  });
});
