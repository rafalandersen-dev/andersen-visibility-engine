/**
 * The REAL billing route, rendered in Node with the real active copy.
 *
 * Two things are proved here that no amount of unit testing of helpers can:
 * what the route actually renders before anything is verified, and what its
 * actual handlers do when they are CALLED DIRECTLY rather than clicked. The
 * second matters because a disabled control protects nobody who reaches the
 * handler another way — which is exactly how an owner reset or a manual grant
 * on top of a live Stripe subscription would happen.
 *
 * `renderToStaticMarkup` does not run effects, so the route always renders its
 * pre-read state here: the authoritative summary is UNKNOWN. That is the
 * strictest case for the safety assertions below, and the verified states are
 * covered by `StripeCommercialPanel.test.ts`, `stripe-commercial-ui.test.ts`
 * and the browser harness.
 */
import type { ComponentType, ReactNode } from "react";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import {
  cancellationAvailable,
  freeSelectionAvailable,
  initialCommercialUiState,
  routeCancellation,
  routeFreeSelection,
} from "./stripe-commercial-ui";
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
  error: vi.fn(),
  success: vi.fn(),
  summary: vi.fn(),
  prepare: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  reverse: vi.fn(),
  /** The real props the route hands the commercial panel, so its own async
   * callbacks can be executed directly. */
  panelProps: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isOwner: state.owner,
    user: { id: "00000000-0000-4000-8000-0000000000u1", email: "test@example.invalid" },
  }),
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
      // The legacy store copy still carries a paid Growth subscription and a
      // paddle-labelled customer id. Neither may drive this screen.
      subscription: {
        planId: "growth",
        status: "active",
        priceMonthly: 149,
        currency: "EUR",
        paddleCustomerId: "ctm_fixture",
      },
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
vi.mock("@/lib/stripe-commercial.functions", () => ({
  getStripeCommercialSummaryFn: state.summary,
  prepareStripeSubscriptionChangeFn: state.prepare,
  confirmStripeSubscriptionChangeFn: state.confirm,
  cancelStripeSubscriptionFn: state.cancel,
  reverseStripeCancellationFn: state.reverse,
}));
vi.mock("@/components/StripeSandboxPanel", () => ({
  StripeSandboxPanel: () => createElement("div", { "data-owner-sandbox": true }),
}));
vi.mock("sonner", () => ({
  toast: { message: state.message, error: state.error, success: state.success },
}));
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
    onClick?: (event: { currentTarget: unknown }) => unknown;
    disabled?: boolean;
    className?: string;
  }) => {
    // A click carries its own element, exactly as a real one does: the route
    // reads `currentTarget` so a dialog can return focus to its opener.
    const element = { isConnected: true, focus: () => undefined };
    state.buttons.push({
      label: renderToStaticMarkup(createElement(Fragment, null, children)),
      click: onClick ? () => onClick({ currentTarget: element }) : undefined,
      disabled,
    });
    return createElement("button", { ...props, disabled }, children);
  },
}));
// The REAL panel still renders; this only records the props the route gives
// it, so the route's own asynchronous callbacks can be executed directly.
vi.mock("@/components/billing/StripeCommercialPanel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/billing/StripeCommercialPanel")>();
  return {
    ...actual,
    StripeCommercialPanel: (props: Record<string, unknown>) => {
      state.panelProps = props;
      return createElement(actual.StripeCommercialPanel, props as never);
    },
  };
});
import { Route } from "@/routes/_authenticated/app.billing";
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
const label = (key: string) => translate(state.locale, key);
// renderToStaticMarkup escapes text-node apostrophes as a numeric entity.
const shows = (html: string, value: string) => html.replace(/&#x27;/g, "'").includes(value);
const button = (key: string) => state.buttons.find((b) => b.label === label(key));
/** Every call that could reach the provider or write an entitlement. */
const mutations = () => [
  state.manual,
  state.portal,
  state.checkout,
  state.prepare,
  state.confirm,
  state.cancel,
  state.reverse,
];

beforeEach(() => {
  vi.clearAllMocks();
  state.owner = false;
  state.locale = "en";
  state.buttons = [];
  state.panelProps = null;
  state.portal.mockResolvedValue({ configured: false });
  state.summary.mockResolvedValue({ ok: false, reason: "billing_read_unavailable" });
});

describe("the public paid hold is intact in all four active languages", () => {
  it.each(UI_LANGUAGE_CODES)("%s holds every paid plan choice", async (locale) => {
    state.locale = locale;
    const html = render();
    expect(html).toContain('id="paid-plan-hold"');
    expect(html).toContain(translate(locale, "publicPricing.hold"));
    expect(html).not.toContain("data-owner-sandbox");
    const held = state.buttons.filter(
      (b) => b.label === translate(locale, "launch.item.paddlePending"),
    );
    // Starter, Growth, Pro and Agency: nothing is "current" until a read
    // verifies it, so the catalogue marks no card as the active plan.
    expect(held).toHaveLength(4);
    for (const held_ of held) {
      expect(held_.disabled).toBe(true);
      await held_.click!(); // even a forced handler call dispatches nothing
    }
    for (const mock of mutations()) expect(mock).not.toHaveBeenCalled();
  });

  it.each(UI_LANGUAGE_CODES)("%s renders the commercial panel's own copy", (locale) => {
    state.locale = locale;
    const html = render();
    expect(html).toContain(translate(locale, "billingScreen.commercial.title"));
    expect(html).toContain(translate(locale, "billingScreen.commercial.loading"));
    expect(html).toContain(translate(locale, "billingScreen.commercial.catalogNote"));
    expect(html).not.toContain("billingScreen.");
  });
});

describe("the catalogue and the verified current subscription are separate", () => {
  it("prices the catalogue in the selected country without claiming a current charge", () => {
    const html = render();
    // The catalogue follows the stored PL billing country.
    expect(html).toContain("249 PLN");
    expect(html).toContain("599 PLN");
    // The current plan states only what a read has verified — which is
    // nothing yet. The store's reconstructed 149 EUR never appears.
    expect(html).toContain(label("billingScreen.commercial.loading"));
    expect(html).not.toContain("€149");
    expect(html).not.toContain("149 EUR");
    expect(html).toContain(label("billingScreen.commercial.catalogNote"));
  });

  it("does not present the store's plan, status or price as the current subscription", () => {
    const html = render();
    // "Growth" is still offered by the catalogue, but no card is marked as the
    // active plan and no provider or access is claimed.
    expect(button("billing.currentLabel")).toBeUndefined();
    expect(html).not.toContain(label("billingScreen.commercial.access.paid"));
    expect(html).not.toContain(label("billingScreen.commercial.provider.paddle"));
    expect(html).toContain(label("billingScreen.unknownValue"));
  });

  it("mounts without dispatching any commercial mutation", () => {
    render();
    for (const mock of mutations()) expect(mock).not.toHaveBeenCalled();
  });
});

describe("Free, the owner reset and manual activation cannot substitute for a cancellation", () => {
  it("refuses a forced Free selection while the provider is unknown", async () => {
    render();
    const free = button("billing.choose");
    expect(free).toBeDefined();
    await free!.click!();
    expect(state.manual).not.toHaveBeenCalled();
    expect(state.portal).not.toHaveBeenCalled();
    expect(state.cancel).not.toHaveBeenCalled();
    expect(state.message).toHaveBeenCalledWith(label("billingScreen.commercial.unavailable"));
  });

  it("refuses a forced owner Free reset and both manual grants while unknown", async () => {
    state.owner = true;
    const html = render();
    expect(html).toContain("data-owner-sandbox");
    expect(shows(html, label("billingScreen.commercial.manualHeld"))).toBe(true);
    for (const key of ["billing.manual.reset", "billing.choose"]) {
      const control = button(key);
      expect(control).toBeDefined();
      await control!.click!();
    }
    // Both manual grant buttons carry the same guard.
    for (const grant of state.buttons.filter(
      (b) =>
        b.label.includes(label("billing.manual.beta")) ||
        b.label.includes(label("billing.manual.comped")),
    )) {
      expect(grant.disabled).toBe(true);
      await grant.click!();
    }
    expect(state.manual).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.message).toHaveBeenCalledWith(label("billingScreen.commercial.manualHeldToast"));
  });

  it("disables the owner's manual controls until a read clears them", () => {
    state.owner = true;
    render();
    expect(button("billing.manual.reset")?.disabled).toBe(true);
  });

  it("never sends an unverified account to the legacy Paddle portal", async () => {
    const html = render();
    // The store still has `paddleCustomerId`, which used to be the routing
    // signal. With no verified provider, no management control exists at all
    // and the prominent cancellation section is not rendered either.
    expect(button("billingScreen.manage")).toBeUndefined();
    expect(button("billingScreen.cancel")).toBeUndefined();
    expect(html).not.toContain(label("billingScreen.cancelHelp"));
    // The only reachable "end my plan" affordance is the Free card, and it
    // routes nowhere while the provider is unknown.
    await button("billing.choose")!.click!();
    expect(state.portal).not.toHaveBeenCalled();
    expect(state.cancel).not.toHaveBeenCalled();
    expect(state.manual).not.toHaveBeenCalled();
  });
});

describe("the routing decisions the route actually calls", () => {
  // The route delegates both "end my subscription" entry points to these two
  // exported functions; their full matrix lives in stripe-commercial-ui.test.ts.
  it("exposes the same conservative answer for an unread summary", () => {
    expect(routeFreeSelection(initialCommercialUiState, { isOwner: true })).toBe("unavailable");
    expect(routeCancellation(initialCommercialUiState)).toBe("unavailable");
  });
});

/**
 * The route's own ASYNCHRONOUS callbacks, executed.
 *
 * `renderToStaticMarkup` runs no effects, so the route is always in its
 * pre-read state here and every mutation callback must decline. That is the
 * point: these are the real `confirmChange`, `confirmCancellation`,
 * `confirmReversal`, `prepareQuote`, `resumeOperation` and `loadSummary`
 * closures, invoked directly with no UI in the way. The positive paths need
 * verified state across renders and are covered by the reducer/selector suite
 * and the browser harness.
 */
describe("the route's asynchronous callbacks with no verified evidence", () => {
  type PanelProps = {
    onRefresh: () => void;
    onPrepareQuote: (opener?: unknown) => void;
    onConfirmChange: () => void;
    onConfirmCancellation: () => void;
    onConfirmReversal: () => void;
    onResumeOperation: () => void;
    onOpenPortal: () => void;
    onRestoreFocus?: () => boolean;
  };

  const panelProps = (): PanelProps => {
    render();
    const props = state.panelProps as PanelProps | null;
    if (!props) throw new Error("the route did not render the commercial panel");
    return props;
  };

  it("never reaches a commercial mutation from any callback", async () => {
    const props = panelProps();
    await props.onPrepareQuote();
    await props.onConfirmChange();
    await props.onConfirmCancellation();
    await props.onConfirmReversal();
    await props.onResumeOperation();
    for (const mock of mutations()) expect(mock).not.toHaveBeenCalled();
  });

  it("performs the authoritative READ when asked, and only that", async () => {
    const props = panelProps();
    await props.onRefresh();
    await Promise.resolve();
    expect(state.summary).toHaveBeenCalledTimes(1);
    for (const mock of mutations()) expect(mock).not.toHaveBeenCalled();
  });

  it("does not open the legacy portal for an unverified provider", async () => {
    const props = panelProps();
    await props.onOpenPortal();
    expect(state.portal).not.toHaveBeenCalled();
    expect(state.message).toHaveBeenCalledWith(label("billingScreen.commercial.manageUnavailable"));
  });

  it("has nothing to restore focus to until a dialog records its opener", () => {
    const props = panelProps();
    expect(props.onRestoreFocus?.()).toBe(false);
  });
});

describe("alternate entry points look the way their handlers behave", () => {
  it("disables the catalogue Free choice while no evidence authorises it", async () => {
    const html = render();
    const free = button("billing.choose");
    expect(free).toBeDefined();
    expect(free?.disabled).toBe(true);
    // The handler still holds if it is reached anyway.
    await free!.click!();
    for (const mock of mutations()) expect(mock).not.toHaveBeenCalled();
    // …and the screen explains the state rather than leaving a dead control
    // unexplained. Before any read has resolved, that explanation is the
    // panel's own reading status.
    expect(html).toContain(label("billingScreen.commercial.loading"));
  });

  it("does not render the prominent cancellation entry without a verified paid plan", () => {
    const html = render();
    expect(button("billingScreen.cancel")).toBeUndefined();
    expect(html).not.toContain(label("billingScreen.cancelHelp"));
  });

  it("uses the same predicates the handlers route through", () => {
    // The visible state is computed from these two exported functions, whose
    // fresh/stale/held matrix is exercised in stripe-commercial-ui.test.ts.
    expect(freeSelectionAvailable(initialCommercialUiState, { isOwner: true })).toBe(false);
    expect(cancellationAvailable(initialCommercialUiState)).toBe(false);
  });
});
