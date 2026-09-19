import type { ComponentType, ReactNode } from "react";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "./types";
const state = vi.hoisted(() => ({
  owner: false,
  locale: "en" as OnboardingLanguage,
  buttons: [] as { label: string; disabled?: boolean; click?: () => unknown }[],
  portal: vi.fn(),
  checkout: vi.fn(),
  manual: vi.fn(),
  refresh: vi.fn(),
  message: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ isOwner: state.owner, user: { email: "test@example.invalid" } }),
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, values?: Record<string, string | number>) =>
    translate(state.locale, key, values),
  useAppLanguage: () => state.locale,
}));
vi.mock("@/lib/store", () => ({
  useStore: (select: (s: unknown) => unknown) =>
    select({
      projects: [],
      billingProfile: { billingCountry: "PL" },
      subscription: { planId: "growth", status: "active", paddleCustomerId: "ctm_fixture" },
    }),
  setBillingProfile: vi.fn(),
  refreshEntitlement: state.refresh,
  saveWorkspaceNow: vi.fn(),
}));
vi.mock("@/lib/billing.functions", () => ({
  createPaddleCheckoutFn: state.checkout,
  createPaddlePortalSessionFn: state.portal,
}));
vi.mock("@/lib/entitlements.functions", () => ({ setManualEntitlementFn: state.manual }));
vi.mock("@/components/StripeSandboxPanel", () => ({
  StripeSandboxPanel: () => createElement("div", { "data-owner-sandbox": true }),
}));
vi.mock("sonner", () => ({ toast: { message: state.message, error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) =>
    createElement("a", { href: to }, children),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => unknown;
    disabled?: boolean;
    className?: string;
  }) => {
    state.buttons.push({
      label: renderToStaticMarkup(createElement(Fragment, null, children)),
      click: onClick,
      disabled,
    });
    return createElement("button", { ...props, disabled }, children);
  },
}));
import { Route } from "@/routes/_authenticated/app.billing";
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = false;
  state.locale = "en";
  state.buttons = [];
  state.portal.mockResolvedValue({ configured: false });
});
it.each(UI_LANGUAGE_CODES)(
  "%s renders held paid choices and keeps cancellation available",
  async (locale) => {
    state.locale = locale;
    const html = render();
    expect(html).toContain('id="paid-plan-hold"');
    expect(html).toContain(translate(locale, "publicPricing.hold"));
    expect(html).not.toContain("data-owner-sandbox");
    const held = state.buttons.filter(
      (b) => b.label === translate(locale, "launch.item.paddlePending"),
    );
    expect(held).toHaveLength(3); // the existing Growth plan has its own current-plan label
    for (const button of held) {
      expect(button.disabled).toBe(true);
      await button.click!(); // even a forced handler call cannot dispatch checkout
    }
    expect(state.checkout).not.toHaveBeenCalled();
    expect(state.manual).not.toHaveBeenCalled();
    const cancel = state.buttons.find((b) => b.label === translate(locale, "billingScreen.cancel"));
    expect(cancel?.disabled).toBe(false);
    await cancel!.click!();
    expect(state.portal).toHaveBeenCalledExactlyOnceWith();
  },
);
it("retains owner sandbox visibility and explicit manual free reset without paid checkout", async () => {
  state.owner = true;
  const html = render();
  expect(html).toContain("data-owner-sandbox");
  const held = state.buttons.filter(
    (b) => b.label === translate("en", "launch.item.paddlePending"),
  );
  expect(held).toHaveLength(4);
  expect(held.every((b) => b.disabled)).toBe(true);
  const free = state.buttons.find((b) => b.label === translate("en", "billing.choose"));
  await free!.click!();
  expect(state.manual).toHaveBeenCalledExactlyOnceWith({
    data: { planId: "freePreview", status: "freePreview" },
  });
  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.checkout).not.toHaveBeenCalled();
});
