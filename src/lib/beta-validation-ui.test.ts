import type { ComponentType, ReactNode } from "react";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "@/lib/types";

const state = vi.hoisted(() => ({
  owner: true,
  locale: "en" as OnboardingLanguage,
  buttons: [] as { label: string; click?: () => unknown }[],
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isOwner: state.owner }) }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => translate(state.locale, key) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) =>
    createElement("a", { href: to }, children),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({
    title,
    description,
    children,
    actions,
  }: {
    title: string;
    description: string;
    children: ReactNode;
    actions?: ReactNode;
  }) =>
    createElement(
      "main",
      null,
      createElement("h1", null, title),
      createElement("p", null, description),
      actions,
      children,
    ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => unknown }) => {
    state.buttons.push({
      label: renderToStaticMarkup(createElement(Fragment, null, children)),
      click: onClick,
    });
    return createElement("button", null, children);
  },
}));
import { Route } from "@/routes/_authenticated/app.beta-validation";
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
const click = (key: string) => {
  const button = state.buttons.find((b) => b.label.includes(translate(state.locale, key)));
  expect(button?.click).toBeTypeOf("function");
  return button!.click!();
};
beforeEach(() => {
  state.owner = true;
  state.locale = "en";
  state.buttons = [];
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(UI_LANGUAGE_CODES)(
  "%s denies non-owners without rendering templates or export controls",
  (locale) => {
    state.owner = false;
    state.locale = locale;
    const html = render();
    expect(html).toContain(translate(locale, "betaScreen.title"));
    expect(html).toContain('href="/app"');
    expect(html).not.toContain('id="outreach"');
    expect(html).not.toContain("Hi {name}");
    expect(state.buttons).toHaveLength(1);
    expect(state.buttons[0].click).toBeUndefined();
  },
);
it.each(UI_LANGUAGE_CODES)(
  "%s keeps the default outreach language independent of interface labels",
  (locale) => {
    state.locale = locale;
    const html = render();
    expect(html).toContain(translate(locale, "betaScreen.download"));
    expect(html).toContain(translate(locale, "betaScreen.field.business"));
    expect(html).toContain(translate(locale, "betaScreen.status.identified"));
    expect(html).toContain("Hi {name}");
    expect(html).not.toContain("Cześć {name}");
    expect(html).not.toContain("Hej {name}");
    expect(html).not.toContain("betaScreen.");
    expect(html).not.toContain("betaGuide.");
    expect(state.buttons.filter((b) => ["EN", "PL", "SV"].includes(b.label))).toHaveLength(3);
  },
);
it("exports canonical CSV names and values with a Polish interface", async () => {
  state.locale = "pl";
  render();
  let exported: Blob | undefined;
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    exported = blob as Blob;
    return "blob:test";
  });
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const anchor = { href: "", download: "", click: vi.fn() };
  const remove = vi.fn();
  vi.stubGlobal("document", {
    createElement: () => anchor,
    body: { appendChild: vi.fn(), removeChild: remove },
  });
  await click("betaScreen.download");
  expect(create).toHaveBeenCalledOnce();
  expect(await exported!.text()).toBe(
    "Business name,Website,Country/market,Segment,Contact person,Contact method,Source,Status,Audit score,Main issue,Proposed offer,Price quoted,Demo date,Follow-up date,Decision,Notes,Next action\n" +
      "Synergy Massage,https://example.com,Sweden,B,Owner,Email,Referral,Identified,,Weak service copy,Founding beta,2500 SEK,,,,,Run free audit\n",
  );
  expect(anchor.download).toBe("milo-prospect-tracker-template.csv");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith(anchor);
  expect(revoke).toHaveBeenCalledWith("blob:test");
});
it.each([false, true])(
  "copies the selected template and reports clipboard failure=%s in the interface language",
  async (fails) => {
    state.locale = "da";
    render();
    const writeText = fails
      ? vi.fn().mockRejectedValue(new Error("unavailable"))
      : vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await click("common.copy");
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toMatch(/^Hi \{name\}/);
    expect(writeText.mock.calls[0][0]).not.toContain("Kopiér");
    if (fails) {
      expect(state.error).toHaveBeenCalledWith(translate("da", "betaScreen.copyFailed"));
      expect(state.success).not.toHaveBeenCalled();
    } else {
      expect(state.success).toHaveBeenCalledWith(translate("da", "claude.copied"));
      expect(state.error).not.toHaveBeenCalled();
    }
  },
);
