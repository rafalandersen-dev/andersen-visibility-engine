import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import { formatReportDate, formatReportMonth } from "./proof-report-presentation";
import type { OnboardingLanguage } from "./types";

const state = vi.hoisted(() => ({
  language: "en" as OnboardingLanguage,
  selects: [] as { value: string; onValueChange?: (value: string) => void }[],
  email: vi.fn().mockResolvedValue({ sent: true }),
  emailClick: undefined as undefined | (() => Promise<void>),
  workspace: {
    activeProjectId: "p1",
    projects: [{ id: "p1", name: "Client project", appLanguage: "sv" }],
    content: [
      {
        id: "a1",
        projectId: "p1",
        title: "Recorded publication",
        createdAt: "2026-09-01",
        liveUrl: "https://example.com/article",
        livePublishStatus: "published",
        livePublishedAt: "2026-09-01T00:30:00+14:00",
      },
    ],
    calendar: [
      {
        id: "c1",
        projectId: "p1",
        topicTitle: "Planned article",
        status: "Planned",
        plannedDate: "2026-10-01",
        contentType: "Blog Article",
      },
    ],
    subscription: undefined,
    agencyBranding: undefined,
  },
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    translate(state.language, key, vars),
  useAppLanguage: () => state.language,
}));
vi.mock("@/lib/store", () => ({
  useStore: (select: (s: typeof state.workspace) => unknown) => select(state.workspace),
  setAgencyBranding: vi.fn(),
  saveWorkspaceNow: vi.fn(),
}));
vi.mock("@/lib/billing", () => ({ isAgencyPlan: () => false }));
vi.mock("@/lib/proof-report.functions", () => ({
  getProofLinksLiveFn: vi.fn(),
  emailProofReportFn: state.email,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/components/PublicationEvidencePanel", () => ({ PublicationEvidencePanel: () => null }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => Promise<void> }) => {
    if (
      renderToStaticMarkup(createElement("span", null, children)).includes(
        translate(state.language, "report.emailMe"),
      )
    )
      state.emailClick = onClick;
    return createElement("button", null, children);
  },
}));
vi.mock("@/components/ui/select", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children: ReactNode;
      value: string;
      onValueChange: (value: string) => void;
    }) => {
      state.selects.push({ value, onValueChange });
      return createElement("div", null, children);
    },
    SelectContent: wrapper,
    SelectTrigger: wrapper,
    SelectValue: () => null,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
      createElement("div", { "data-value": value }, children),
  };
});
import { Route } from "@/routes/_authenticated/app.report";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T09:00:00Z"));
  state.selects = [];
  state.emailClick = undefined;
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});
it.each(UI_LANGUAGE_CODES)(
  "%s formats the screen and print header while keeping the selected/email period canonical",
  async (language) => {
    state.language = language;
    const html = renderToStaticMarkup(createElement(Route.options.component as ComponentType));
    expect(html).toContain(formatReportMonth("2026-09", language));
    expect(html).toContain(formatReportDate("2026-09-01", language));
    expect(html).toContain(formatReportDate("2026-10-01", language));
    expect(html).toContain('data-value="2026-09"');
    expect(state.selects[0].value).toBe("2026-09");
    expect(state.emailClick).toBeTypeOf("function");
    await state.emailClick!();
    expect(state.email).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: "p1", monthKey: "2026-09" },
    });
    expect(state.workspace.projects[0].appLanguage).toBe("sv");
  },
);
