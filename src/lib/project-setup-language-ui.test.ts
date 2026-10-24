import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage, Project } from "./types";

const state = vi.hoisted(() => ({
  project: null as Project | null,
  form: null as Project | null,
  locale: "en" as OnboardingLanguage,
  selects: [] as { value: string; change: (value: string) => void }[],
  buttons: [] as { label: ReactNode; click?: () => void }[],
  update: vi.fn(),
  add: vi.fn(),
  navigate: vi.fn(),
}));

// Keep the main form state between server renders so its actual change and
// save handlers can be exercised without a browser or any connected services.
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (initial === state.project) {
        return [
          state.form,
          (next: Project | ((previous: Project) => Project)) => {
            state.form = typeof next === "function" ? next(state.form!) : next;
          },
        ];
      }
      return actual.useState(initial);
    },
  };
});
vi.mock("@/lib/store", () => ({
  useStore: (select: (store: unknown) => unknown) =>
    select({ projects: [state.project], activeProjectId: state.project!.id }),
  updateProject: state.update,
  addProject: state.add,
  ProjectLimitError: class extends Error {},
  updateProjectPublishingSettings: vi.fn(),
  updateProjectConnector: vi.fn(),
  saveWorkspaceNow: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isOwner: false }) }));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, values?: Record<string, string | number>) =>
    translate(state.locale, key, values),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => state.navigate,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children, actions }: { children: ReactNode; actions: ReactNode }) =>
    createElement("main", null, actions, children),
}));
vi.mock("@/components/WeeklyPreparationPanel", () => ({ WeeklyPreparationPanel: () => null }));
vi.mock("@/components/BrandIntelligenceCard", () => ({ BrandIntelligenceCard: () => null }));
vi.mock("@/components/ClaudeConnectorCard", () => ({ ClaudeConnectorCard: () => null }));
vi.mock("@/lib/wordpress.functions", () => ({
  saveWordPressAppPasswordFn: vi.fn(),
  testWordPressConnectionFn: vi.fn(),
}));
vi.mock("@/lib/publish.functions", () => ({ savePublishSecretFn: vi.fn() }));
vi.mock("@/lib/shopify.functions", () => ({
  listShopifyBlogsFn: vi.fn(),
  saveShopifyAdminTokenFn: vi.fn(),
  testShopifyConnectionFn: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => {
    state.buttons.push({ label: children, click: onClick });
    return createElement("button", null, children);
  },
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => {
    state.selects.push({ value, change: onValueChange });
    return createElement("div", { "data-selection": value }, children);
  },
  SelectTrigger: ({ children, id }: { children: ReactNode; id: string }) =>
    createElement("div", { id }, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-option": value }, children),
}));

import { Route } from "@/routes/_authenticated/app.setup";

const render = () => {
  state.selects = [];
  state.buttons = [];
  return renderToStaticMarkup(createElement(Route.options.component as ComponentType));
};
const save = () => {
  const button = state.buttons.find(
    (button) => button.label === translate(state.locale, "setup.saveChanges"),
  );
  expect(button?.click).toBeTypeOf("function");
  button!.click!();
};

beforeEach(() => {
  vi.clearAllMocks();
  state.locale = "en";
  state.project = {
    id: "project",
    name: "Project",
    businessName: "Business",
    websiteUrl: "https://example.com",
    businessType: "Local services",
    description: "A real business description",
    primaryLanguage: "English",
    primaryContentLanguage: "sv",
    additionalLanguages: ["Danish"],
    appLanguage: "pl",
    market: "SE",
    currency: "SEK",
    mainLocation: "Stockholm",
    targetLocations: [],
    targetAudience: "Local customers",
    toneOfVoice: "Clear",
    uniqueSellingPoints: "Personal service",
    brandNotes: "Keep our promises specific",
    publishEndpoint: "https://example.com/publish",
  };
  state.form = state.project;
});

it.each(["en", "pl", "sv", "da"] as const)(
  "%s shows one effective content-language control without changing saved data",
  (locale) => {
    state.locale = locale;
    const before = structuredClone(state.project);
    const html = render();
    const label = translate(locale, "onboarding.contentLanguage");
    expect(html.split(`>${label}</label>`)).toHaveLength(2);
    expect(state.selects.filter((select) => select.value === "Swedish")).toHaveLength(1);
    expect(html).toContain("Svenska · Swedish");
    expect(html).toContain(translate(locale, "setup.markets.appLanguage"));
    expect(state.selects.some((select) => select.value === "pl")).toBe(true);
    // The primary language is excluded from the additional-language choices.
    expect(html).not.toMatch(/<button[^>]*aria-pressed="[^"]*"[^>]*>Swedish<\/button>/);
    expect(state.project).toEqual(before);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
  },
);

it("an explicit save reconciles legacy fields through the owned-field patch and survives reload", () => {
  render();
  save();
  expect(state.update).toHaveBeenCalledTimes(1);
  const [id, patch] = state.update.mock.calls[0] as [string, Partial<Project>];
  expect(id).toBe("project");
  expect(patch).toMatchObject({
    primaryLanguage: "Swedish",
    primaryContentLanguage: "sv",
    appLanguage: "pl",
    market: "SE",
    currency: "SEK",
    additionalLanguages: ["Danish"],
  });
  expect(patch).not.toHaveProperty("publishEndpoint");
  expect(patch).not.toHaveProperty("articles");
  expect(state.project!.primaryLanguage).toBe("English");
  state.project = { ...state.project!, ...patch };
  state.form = state.project;
  render();
  expect(state.selects.some((select) => select.value === "Swedish")).toBe(true);
});

it("changing only the app language preserves the effective content language", () => {
  render();
  state.selects.find((select) => select.value === "pl")!.change("da");
  render();
  save();
  expect(state.update).toHaveBeenCalledWith(
    "project",
    expect.objectContaining({
      appLanguage: "da",
      primaryLanguage: "Swedish",
      primaryContentLanguage: "sv",
    }),
  );
});

it("an explicit content-language change updates both defaults without changing the interface", () => {
  render();
  state.selects.find((select) => select.value === "Swedish")!.change("German");
  expect(state.update).not.toHaveBeenCalled();
  render();
  save();
  expect(state.update).toHaveBeenCalledWith(
    "project",
    expect.objectContaining({
      appLanguage: "pl",
      primaryLanguage: "German",
      primaryContentLanguage: "de",
      additionalLanguages: ["Danish"],
    }),
  );
});

it("falls back to a legacy content language when the newer field is missing", () => {
  state.project = {
    ...state.project!,
    primaryLanguage: "Danish",
    primaryContentLanguage: undefined,
  };
  state.form = state.project;
  render();
  expect(state.selects.some((select) => select.value === "Danish")).toBe(true);
  expect(state.update).not.toHaveBeenCalled();
  save();
  expect(state.update).toHaveBeenCalledWith(
    "project",
    expect.objectContaining({ primaryLanguage: "Danish", primaryContentLanguage: "da" }),
  );
});
