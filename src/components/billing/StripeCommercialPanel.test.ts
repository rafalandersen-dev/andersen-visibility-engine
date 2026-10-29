/**
 * The real commercial panel and the real confirmation body, rendered in Node
 * with the actual active copy for en/pl/sv/da.
 *
 * What this suite is for: proving the screen never states something it has not
 * verified. Unknown money stays unknown, a failed read never becomes Free or
 * zero, a dispatched operation never claims access, a confirmation is only
 * offered for a quote that is still exactly what was shown, and the
 * provider-specific copy matches the controls actually offered.
 *
 * What it is NOT: React effects, portals and keyboard behaviour do not run in
 * `renderToStaticMarkup`. Radix renders dialog content through a portal, which
 * is why the confirmation body is a separate exported component here, why the
 * focus-restoration helper is exported and unit-tested on its own, and why
 * focus, Escape and return-focus are checked in the browser harness.
 */
import type { ReactNode } from "react";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import {
  commercialUiReducer,
  focusIfConnected,
  initialCommercialUiState,
  termsFromQuote,
  type CommercialQuote,
  type CommercialUiAction,
  type CommercialUiState,
} from "@/lib/stripe-commercial-ui";
import type { OnboardingLanguage } from "@/lib/types";

const captured = vi.hoisted(() => ({
  buttons: [] as {
    label: string;
    disabled: boolean;
    type?: string;
    click?: (...args: unknown[]) => unknown;
  }[],
  inputs: [] as { id?: string; type?: string; value?: string }[],
  labels: [] as { htmlFor?: string; text: string }[],
}));

vi.mock("@/i18n", () => ({
  useT: () => (key: string) => translate("en", key),
  useAppLanguage: () => "en",
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    className: _className,
    variant: _variant,
    size: _size,
    ...rest
  }: {
    children: ReactNode;
    onClick?: (...args: unknown[]) => unknown;
    disabled?: boolean;
    type?: string;
    className?: string;
    variant?: string;
    size?: string;
  }) => {
    captured.buttons.push({
      label: renderToStaticMarkup(createElement(Fragment, null, children)),
      disabled: disabled === true,
      type,
      click: onClick,
    });
    return createElement("button", { ...rest, type, disabled }, children);
  },
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ id, type, value }: { id?: string; type?: string; value?: string }) => {
    captured.inputs.push({ id, type, value });
    return createElement("input", { id, type, defaultValue: value });
  },
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) => {
    captured.labels.push({
      htmlFor,
      text: renderToStaticMarkup(createElement(Fragment, null, children)),
    });
    return createElement("label", { htmlFor }, children);
  },
}));

import { CommercialConfirmation, StripeCommercialPanel } from "./StripeCommercialPanel";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION = "11111111-1111-4111-8111-111111111111";
const QUOTE = "33333333-3333-4333-8333-333333333333";
const CANCEL_OPERATION = "55555555-5555-4555-8555-555555555555";
const EXPIRES = "2026-10-29T12:00:00.000Z";
const NOW = Date.parse("2026-10-29T11:45:00.000Z");

const summaryBody = (over: Record<string, unknown> = {}) => ({
  provider: "stripe",
  mode: "test",
  planId: "growth",
  access: "paid",
  status: "active",
  purchasedSeats: 0,
  periodEnd: "2026-11-27T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  currentAmountMinor: null,
  currentCurrency: null,
  currentAmountEvidence: "unknown",
  operation: null,
  operationEvidence: "none",
  eligibleCancellationId: null,
  actions: {
    paddlePortal: false,
    prepareChange: true,
    cancel: true,
    reverseCancellation: false,
    recoverOperation: false,
    manualOverride: false,
  },
  heldReason: null,
  ...over,
});
const summaryResponse = (over: Record<string, unknown> = {}) => ({
  ok: true,
  summary: summaryBody(over),
});

const quoteBody = (over: Record<string, unknown> = {}) => ({
  ok: true,
  quoteId: QUOTE,
  direction: "increase",
  amountMinor: 12_345,
  recurringEstimateMinor: 26_910,
  recurringEstimateIncludesAdjustments: true,
  recurringEstimateNote: "English server note that must not be shown",
  currency: "eur",
  effectiveAt: null,
  immediate: true,
  expiresAt: EXPIRES,
  planId: "pro",
  seatQuantity: 2,
  workingSeatAllowance: 5,
  viewerSeatAllowance: 10,
  projectAllowance: 5,
  effectiveNote: "English server note that must not be shown",
  ...over,
});

const PREPARE_REQUEST = { quoteId: QUOTE, planId: "pro" as const, seatQuantity: 2 };

const run = (actions: CommercialUiAction[], from = initialCommercialUiState) =>
  actions.reduce(commercialUiReducer, from);

const verified = (over: Record<string, unknown> = {}): CommercialUiState =>
  run([
    { type: "identity", userId: USER, epoch: 1 },
    { type: "summary/request", epoch: 1, token: 1 },
    { type: "summary/resolved", epoch: 1, token: 1, response: summaryResponse(over) },
  ]);

const prepared = (over: Record<string, unknown> = {}, summaryOver: Record<string, unknown> = {}) =>
  run(
    [
      {
        type: "selection/changed",
        planId: (over.planId as "pro") ?? "pro",
        seatQuantity: (over.seatQuantity as number) ?? 2,
      },
      {
        type: "quote/request",
        epoch: 1,
        token: 1,
        request: {
          ...PREPARE_REQUEST,
          planId: (over.planId as "pro") ?? "pro",
          seatQuantity: (over.seatQuantity as number) ?? 2,
        },
      },
      { type: "quote/resolved", epoch: 1, token: 1, response: quoteBody(over) },
      { type: "dialog/open", kind: "change" },
    ],
    verified(summaryOver),
  );

const termsOf = (state: CommercialUiState) => {
  const quote = state.quote as CommercialQuote;
  return termsFromQuote(quote);
};

const noop = () => undefined;

function renderPanel(
  state: CommercialUiState,
  locale: OnboardingLanguage = "en",
  overrides: Record<string, unknown> = {},
) {
  captured.buttons = [];
  captured.inputs = [];
  captured.labels = [];
  return renderToStaticMarkup(
    createElement(StripeCommercialPanel, {
      state,
      nowMs: NOW,
      locale,
      t: (key: string, values?: Record<string, string | number>) => translate(locale, key, values),
      onRefresh: noop,
      onSelectionChange: noop,
      onPrepareQuote: noop,
      onConfirmChange: noop,
      onConfirmCancellation: noop,
      onConfirmReversal: noop,
      onOpenDialog: noop,
      onCloseDialog: noop,
      onResumeOperation: noop,
      onDismissOperation: noop,
      onOpenPortal: noop,
      ...overrides,
    }),
  );
}

function renderConfirmation(
  kind: "change" | "cancel" | "reverse",
  state: CommercialUiState,
  locale: OnboardingLanguage = "en",
  handlers: { onConfirm?: () => void; onClose?: () => void; nowMs?: number } = {},
) {
  captured.buttons = [];
  return renderToStaticMarkup(
    createElement(CommercialConfirmation, {
      kind,
      state,
      nowMs: handlers.nowMs ?? NOW,
      locale,
      t: (key: string, values?: Record<string, string | number>) => translate(locale, key, values),
      onConfirm: handlers.onConfirm ?? noop,
      onClose: handlers.onClose ?? noop,
    }),
  );
}

const text = (key: string, locale: OnboardingLanguage = "en") => translate(locale, key);
const button = (label: string) => captured.buttons.find((b) => b.label === label);
// renderToStaticMarkup escapes text-node apostrophes as a numeric entity;
// normalize so copy comparisons are not tied to that encoding.
const plain = (html: string) => html.replace(/&#x27;/g, "'");
const shows = (html: string, value: string) => plain(html).includes(value);

beforeEach(() => {
  captured.buttons = [];
  captured.inputs = [];
  captured.labels = [];
});

describe("the panel distinguishes loading, unavailable, verified free and verified paid", () => {
  it("shows a bounded loading status and never a plan, price or success", () => {
    const html = renderPanel(
      run([
        { type: "identity", userId: USER, epoch: 1 },
        { type: "summary/request", epoch: 1, token: 1 },
      ]),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(text("billingScreen.commercial.loading"));
    expect(html).not.toContain(text("billingScreen.commercial.access.free"));
    expect(html).not.toContain("€0");
    expect(html).not.toContain("0.00");
  });

  it("shows a rejected read as unavailable, without claiming nothing changed", () => {
    const html = renderPanel(
      run([
        { type: "identity", userId: USER, epoch: 1 },
        { type: "summary/request", epoch: 1, token: 1 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 1,
          response: { ok: false, reason: "billing_read_failed" },
        },
      ]),
    );
    expect(html).toContain('role="alert"');
    expect(shows(html, text("billingScreen.commercial.unavailable"))).toBe(true);
    expect(html).not.toContain(text("billingScreen.commercial.access.free"));
    expect(html).not.toContain(text("billingScreen.commercial.access.paid"));
    expect(html).not.toContain("€");
    expect(plain(html)).not.toContain("Nothing has been changed");
  });

  it("states a verified free account as free, and a verified paid account as paid", () => {
    const free = renderPanel(
      verified({
        provider: "none",
        mode: null,
        planId: "freePreview",
        access: "free",
        status: "freePreview",
        periodEnd: null,
        purchasedSeats: null,
        actions: { ...summaryBody().actions, prepareChange: false, cancel: false },
      }),
    );
    expect(free).toContain(text("billingScreen.commercial.access.free"));
    expect(free).toContain(text("billingScreen.commercial.provider.none"));
    const paid = renderPanel(verified());
    expect(paid).toContain(text("billingScreen.commercial.access.paid"));
    expect(paid).toContain(text("billingScreen.commercial.provider.stripe"));
  });

  it("keeps the last verified facts and says so when a refresh fails", () => {
    const html = renderPanel(
      run(
        [
          { type: "summary/request", epoch: 1, token: 2 },
          {
            type: "summary/resolved",
            epoch: 1,
            token: 2,
            response: { ok: false, reason: "billing_read_unavailable" },
          },
        ],
        verified(),
      ),
    );
    expect(html).toContain(text("billingScreen.commercial.refreshFailed"));
    expect(html).toContain(text("billingScreen.commercial.access.paid"));
    expect(shows(html, text("billingScreen.commercial.unavailable"))).toBe(false);
    // …and every control is disabled, because a stale read is not permission.
    expect(button(text("billingScreen.cancel"))?.disabled).toBe(true);
    expect(button(text("billingScreen.commercial.prepare"))?.disabled).toBe(true);
  });
});

describe("money is only stated when it is proven", () => {
  it("reports the current billed amount as unavailable, never as zero", () => {
    const html = renderPanel(verified());
    expect(html).toContain(text("billingScreen.commercial.amountUnknown"));
    expect(html).not.toContain("€0");
    expect(html).toContain(text("billingScreen.commercial.catalogNote"));
  });

  it("keeps a confirmed EUR 149 current and labels it as fixture evidence", () => {
    const html = renderPanel(
      verified({
        currentAmountMinor: 14_900,
        currentCurrency: "eur",
        currentAmountEvidence: "fixture",
      }),
    );
    expect(html).toContain("€149.00");
    expect(html).toContain(text("billingScreen.commercial.amountFixture"));
    expect(html).not.toContain("PLN");
  });

  it("renders an unknown seat count and period as unknown rather than zero", () => {
    const html = renderPanel(verified({ purchasedSeats: null, periodEnd: null }));
    expect(html).toContain(text("billingScreen.unknownValue"));
    const withZero = renderPanel(verified({ purchasedSeats: 0 }));
    expect(withZero).toContain(">0<");
  });
});

describe("the quote confirmation states both amounts and refuses a stale one", () => {
  it("converts 12345 minor units to 123.45 and keeps the recurring estimate separate", () => {
    const html = renderConfirmation("change", prepared());
    expect(html).toContain("€123.45");
    expect(html).toContain("€269.10");
    expect(html).toContain(text("billingScreen.commercial.quote.dueNow"));
    expect(html).toContain(text("billingScreen.commercial.quote.recurring"));
    expect(shows(html, text("billingScreen.commercial.quote.recurringNote"))).toBe(true);
    expect(html).toContain(text("billingScreen.commercial.quote.recurringAdjusted"));
    expect(html).toContain(
      translate("en", "billingScreen.commercial.quote.limits", {
        working: 5,
        viewer: 10,
        projects: 5,
      }),
    );
    expect(html).toContain(text("billingScreen.commercial.quote.effectiveImmediate"));
    expect(html).not.toContain("English server note");
    expect(button(text("billingScreen.commercial.confirm"))?.disabled).toBe(false);
  });

  it("shows the exact expiry instant with a timezone, not just the day", () => {
    const html = renderConfirmation("change", prepared());
    // A 120-second deadline rendered as a bare day is not a deadline.
    expect(html).toContain("Oct 29, 2026");
    expect(html).toMatch(/12:00\s?(PM|p\.m\.)/i);
    expect(html).toContain("UTC");
  });

  it("distinguishes two quotes that expire on the same day", () => {
    const morning = renderConfirmation(
      "change",
      prepared({ expiresAt: "2026-10-29T09:05:00.000Z" }),
      "en",
      { nowMs: Date.parse("2026-10-29T09:00:00.000Z") },
    );
    const evening = renderConfirmation(
      "change",
      prepared({ expiresAt: "2026-10-29T21:40:00.000Z" }),
      "en",
      { nowMs: Date.parse("2026-10-29T09:00:00.000Z") },
    );
    expect(morning).not.toBe(evening);
    expect(morning).toMatch(/9:05/);
    expect(evening).toMatch(/9:40/);
  });

  it("treats a real zero amount as a value, not as missing", () => {
    const html = renderConfirmation(
      "change",
      prepared({
        amountMinor: 0,
        recurringEstimateMinor: 0,
        direction: "decrease",
        immediate: false,
        effectiveAt: "2026-11-27T00:00:00.000Z",
      }),
    );
    expect(html).toContain("€0");
    expect(html).not.toContain(text("billingScreen.unknownValue"));
    expect(button(text("billingScreen.commercial.confirm"))?.disabled).toBe(false);
  });

  it("refuses to confirm an expired quote", () => {
    const html = renderConfirmation("change", prepared(), "en", {
      nowMs: Date.parse(EXPIRES) + 1,
    });
    expect(html).toContain(text("billingScreen.commercial.quote.expired"));
  });

  it("refuses to confirm a quote the selection no longer matches", () => {
    const changed = commercialUiReducer(prepared(), {
      type: "selection/changed",
      planId: "agency",
      seatQuantity: 2,
    });
    renderConfirmation("change", changed);
    expect(button(text("billingScreen.commercial.confirm"))?.disabled).toBe(true);
  });

  it("renders a preview failure as a finite localized reason, never as zero due", () => {
    const failed = run(
      [
        { type: "selection/changed", planId: "pro", seatQuantity: 2 },
        { type: "quote/request", epoch: 1, token: 1, request: PREPARE_REQUEST },
        {
          type: "quote/resolved",
          epoch: 1,
          token: 1,
          response: { ok: false, reason: "preview_preview_line_proration_conflict" },
        },
        { type: "dialog/open", kind: "change" },
      ],
      verified(),
    );
    const html = renderConfirmation("change", failed);
    expect(html).toContain('role="alert"');
    expect(shows(html, text("billingScreen.reason.previewUnreadable"))).toBe(true);
    expect(html).not.toContain("€0");
    expect(html).not.toContain("proration");
    expect(button(text("billingScreen.commercial.confirm"))?.disabled).toBe(true);
  });

  it("confirms once on an explicit click and never on a close", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderConfirmation("change", prepared(), "en", { onConfirm, onClose });
    expect(onConfirm).not.toHaveBeenCalled();
    button(text("sharedUi.close"))!.click!();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    button(text("billingScreen.commercial.confirm"))!.click!();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables the confirmation while a dispatch is in flight", () => {
    const base = prepared();
    const inFlight = commercialUiReducer(base, {
      type: "intent/begin",
      epoch: 1,
      kind: "change",
      operationId: OPERATION,
      quoteId: QUOTE,
      cancelOperationId: null,
      terms: termsOf(base),
    });
    const html = renderConfirmation("change", inFlight);
    expect(html).toContain('aria-busy="true"');
    expect(button(text("billingScreen.commercial.working"))?.disabled).toBe(true);
  });
});

describe("cancellation and reversal confirmations", () => {
  it("states the verified paid-period end and the preserved access", () => {
    const html = renderConfirmation(
      "cancel",
      commercialUiReducer(verified(), { type: "dialog/open", kind: "cancel" }),
    );
    expect(html).toContain(text("billingScreen.commercial.cancel.body"));
    expect(html).toContain("Nov 27, 2026");
    expect(button(text("billingScreen.commercial.cancel.confirm"))?.disabled).toBe(false);
  });

  it("says the end date is unknown rather than inventing one", () => {
    const html = renderConfirmation(
      "cancel",
      commercialUiReducer(verified({ periodEnd: null }), { type: "dialog/open", kind: "cancel" }),
    );
    expect(html).toContain(text("billingScreen.commercial.cancel.untilUnknown"));
  });

  it("offers a reversal only with the exact eligible cancellation identity", () => {
    renderConfirmation(
      "reverse",
      verified({
        actions: { ...summaryBody().actions, reverseCancellation: true },
        eligibleCancellationId: null,
      }),
    );
    expect(button(text("billingScreen.commercial.reverse.confirm"))?.disabled).toBe(true);
    renderConfirmation(
      "reverse",
      verified({
        actions: { ...summaryBody().actions, reverseCancellation: true },
        eligibleCancellationId: CANCEL_OPERATION,
      }),
    );
    expect(button(text("billingScreen.commercial.reverse.confirm"))?.disabled).toBe(false);
  });
});

describe("a durable operation is reported honestly and never grants access", () => {
  const dispatched = (response: unknown) => {
    const base = prepared();
    return run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OPERATION,
          quoteId: QUOTE,
          cancelOperationId: null,
          terms: termsOf(base),
        },
        { type: "intent/confirmed", epoch: 1, operationId: OPERATION, response },
      ],
      base,
    );
  };

  it("reports a provider-applied change as awaiting verification", () => {
    const html = renderPanel(
      dispatched({
        ok: true,
        state: "applied",
        direction: "increase",
        effectiveAt: null,
        currency: "eur",
        amountMinor: 12_345,
        note: "note",
      }),
    );
    expect(html).toContain(text("billingScreen.commercial.operation.applied"));
    expect(html).toContain(text("billingScreen.commercial.pendingProjection"));
    expect(html).toContain("Growth");
    expect(html).toContain(`>${text("billingScreen.commercial.access.pendingProjection")}<`);
    expect(html).not.toContain(`>${text("billingScreen.commercial.access.paid")}<`);
  });

  it("never shows cancellation-withdrawn text for an unrecognised outcome", () => {
    // A malformed success is uncertain; the old nested ternary fell through
    // to "the cancellation was withdrawn", which would be a lie.
    const html = renderPanel(dispatched({ ok: true }));
    expect(html).toContain(text("billingScreen.commercial.operation.uncertain"));
    expect(html).not.toContain(text("billingScreen.commercial.operation.reversed"));
    expect(html).not.toContain(text("billingScreen.commercial.operation.cancelled"));
    expect(html).not.toContain(text("billingScreen.commercial.operation.applied"));
  });

  it("reports an uncertain outcome without a decline or a second request", () => {
    const html = renderPanel(dispatched({ ok: false, reason: "quote_consumption_uncertain" }));
    expect(html).toContain(text("billingScreen.commercial.operation.uncertain"));
    expect(html).toContain(text("billingScreen.reason.outcomeUncertain"));
    expect(html).not.toContain(text("billingScreen.reason.paymentDeclined"));
    expect(button(text("billingScreen.commercial.prepare"))?.disabled).toBe(true);
    expect(button(text("billingScreen.cancel"))?.disabled).toBe(true);
  });

  it("says an undiscovered operation is unverified, not resolved", () => {
    const missing = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({ operationEvidence: "none" }),
        },
      ],
      dispatched({ ok: false, reason: "quote_consumption_uncertain" }),
    );
    const html = renderPanel(missing);
    expect(shows(html, text("billingScreen.commercial.operation.notDiscovered"))).toBe(true);
    expect(button(text("billingScreen.commercial.resume"))?.disabled).toBe(true);
    expect(button(text("billingScreen.commercial.prepare"))?.disabled).toBe(true);
  });

  it("offers recovery of the same operation only when the server allows it", () => {
    const base = prepared();
    const uncertain = dispatched({ ok: false, reason: "operation_uncertain" });
    renderPanel(uncertain);
    expect(button(text("billingScreen.commercial.resume"))?.disabled).toBe(true);
    const recoverable = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({
            operationEvidence: "open",
            operation: {
              operationId: OPERATION,
              kind: "plan_change",
              state: "awaiting_payment",
              quoteId: QUOTE,
              cancelOperationId: null,
              terms: termsOf(base),
            },
            actions: { ...summaryBody().actions, recoverOperation: true },
          }),
        },
      ],
      uncertain,
    );
    const onResumeOperation = vi.fn();
    renderPanel(recoverable, "en", { onResumeOperation });
    const resume = button(text("billingScreen.commercial.resume"));
    expect(resume?.disabled).toBe(false);
    resume!.click!();
    expect(onResumeOperation).toHaveBeenCalledOnce();
  });

  it("stops saying 'waiting for verification' once a read has confirmed the change", () => {
    const base = prepared();
    const settled = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OPERATION,
          quoteId: QUOTE,
          cancelOperationId: null,
          terms: termsOf(base),
        },
        {
          type: "intent/confirmed",
          epoch: 1,
          operationId: OPERATION,
          response: {
            ok: true,
            state: "applied",
            direction: "increase",
            effectiveAt: null,
            currency: "eur",
            amountMinor: 12_345,
            note: "note",
          },
        },
      ],
      base,
    );
    // Still waiting before any read.
    const waiting = renderPanel(settled);
    expect(waiting).toContain(text("billingScreen.commercial.pendingProjection"));
    expect(waiting).toContain(`>${text("billingScreen.commercial.access.pendingProjection")}<`);

    const confirmedRead = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({
            planId: "pro",
            purchasedSeats: 2,
            operationEvidence: "none",
            operation: null,
          }),
        },
      ],
      settled,
    );
    const html = renderPanel(confirmedRead);
    expect(html).toContain(text("billingScreen.commercial.operation.verifiedApplied"));
    expect(html).not.toContain(text("billingScreen.commercial.pendingProjection"));
    expect(html).not.toContain(text("billingScreen.commercial.operation.notDiscovered"));
    // The authoritative access is shown instead of an endless waiting label.
    expect(html).toContain(`>${text("billingScreen.commercial.access.paid")}<`);
    expect(html).not.toContain(`>${text("billingScreen.commercial.access.pendingProjection")}<`);
    expect(button(text("billingScreen.commercial.operation.dismiss"))?.disabled).toBe(false);
  });

  it("keeps waiting in the rendered panel when the confirming read is incoherent", () => {
    const base = prepared();
    const settled = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OPERATION,
          quoteId: QUOTE,
          cancelOperationId: null,
          terms: termsOf(base),
        },
        {
          type: "intent/confirmed",
          epoch: 1,
          operationId: OPERATION,
          response: {
            ok: true,
            state: "applied",
            direction: "increase",
            effectiveAt: null,
            currency: "eur",
            amountMinor: 12_345,
            note: "note",
          },
        },
      ],
      base,
    );
    // A manual provider asserting a matching Stripe seat count is
    // contradictory: the panel must not call that a verified application.
    const hostile = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({
            provider: "manual",
            mode: null,
            planId: "pro",
            purchasedSeats: 2,
            operationEvidence: "none",
            operation: null,
          }),
        },
      ],
      settled,
    );
    const html = renderPanel(hostile);
    expect(html).not.toContain(text("billingScreen.commercial.operation.verifiedApplied"));
    expect(html).toContain(text("billingScreen.commercial.pendingProjection"));
    expect(html).toContain(`>${text("billingScreen.commercial.access.pendingProjection")}<`);
  });

  it("keeps waiting in the panel for a terminal or period-less cancellation read", () => {
    const settled = (kind: "cancel" | "reverse") =>
      run(
        [
          {
            type: "intent/begin",
            epoch: 1,
            kind,
            operationId: OPERATION,
            quoteId: null,
            cancelOperationId: kind === "reverse" ? CANCEL_OPERATION : null,
            terms: null,
          },
          {
            type: "intent/cancelled",
            epoch: 1,
            operationId: OPERATION,
            response: {
              ok: true,
              cancelAtPeriodEnd: kind === "cancel",
              effectiveAt: "2026-11-27T00:00:00.000Z",
              note: "note",
            },
          },
        ],
        verified({ cancelAtPeriodEnd: kind === "reverse" }),
      );
    const afterRead = (state: CommercialUiState, over: Record<string, unknown>) =>
      run(
        [
          { type: "summary/request", epoch: 1, token: 2 },
          { type: "summary/resolved", epoch: 1, token: 2, response: summaryResponse(over) },
        ],
        state,
      );

    // The read carries the branch's own cancellation flag and still
    // contradicts itself. The panel must select the waiting copy, not the
    // verified sentence, for exactly the same reasons as a change.
    for (const [kind, key, over] of [
      ["cancel", "verifiedCancelled", { cancelAtPeriodEnd: true, status: "cancelled" }],
      ["cancel", "verifiedCancelled", { cancelAtPeriodEnd: true, periodEnd: null }],
      ["reverse", "verifiedReversed", { cancelAtPeriodEnd: false, status: "cancelled" }],
      ["reverse", "verifiedReversed", { cancelAtPeriodEnd: false, periodEnd: null }],
    ] as ["cancel" | "reverse", string, Record<string, unknown>][]) {
      const label = `${kind} ${JSON.stringify(over)}`;
      const html = renderPanel(afterRead(settled(kind), over));
      expect(html, label).not.toContain(text(`billingScreen.commercial.operation.${key}`));
      expect(html, label).toContain(text("billingScreen.commercial.pendingProjection"));
      expect(html, label).toContain(
        `>${text("billingScreen.commercial.access.pendingProjection")}<`,
      );
    }

    // The coherent answers still present their verified copy and the real access.
    for (const [kind, key] of [
      ["cancel", "verifiedCancelled"],
      ["reverse", "verifiedReversed"],
    ] as ["cancel" | "reverse", string][]) {
      const html = renderPanel(afterRead(settled(kind), { cancelAtPeriodEnd: kind === "cancel" }));
      expect(html, kind).toContain(text(`billingScreen.commercial.operation.${key}`));
      expect(html, kind).not.toContain(text("billingScreen.commercial.pendingProjection"));
      expect(html, kind).toContain(`>${text("billingScreen.commercial.access.paid")}<`);
    }
  });

  it("shows an ambiguous discovery as held", () => {
    const html = renderPanel(
      verified({ operationEvidence: "ambiguous", heldReason: "operation_conflict" }),
    );
    expect(html).toContain(text("billingScreen.commercial.operation.ambiguous"));
    expect(html).toContain(text("billingScreen.reason.outcomeUncertain"));
  });
});

describe("provider routing and provider-specific copy", () => {
  it("does not claim management is unavailable next to enabled Stripe controls", () => {
    const html = renderPanel(verified());
    expect(button(text("billingScreen.manage"))).toBeUndefined();
    expect(html).toContain(text("billingScreen.commercial.manageHelpStripe"));
    expect(html).not.toContain(text("billingScreen.commercial.manageUnavailable"));
    expect(button(text("billingScreen.cancel"))?.disabled).toBe(false);
  });

  it("says so honestly when a Stripe account genuinely has no action", () => {
    const html = renderPanel(
      verified({
        heldReason: "held",
        actions: { ...summaryBody().actions, prepareChange: false, cancel: false },
      }),
    );
    expect(html).toContain(text("billingScreen.commercial.manageHelpStripeHeld"));
    expect(html).toContain(text("billingScreen.reason.held"));
    expect(button(text("billingScreen.cancel"))?.disabled).toBe(true);
    expect(button(text("billingScreen.commercial.reverse"))?.disabled).toBe(true);
  });

  it("offers the Paddle portal, with Paddle copy, only for a verified Paddle agreement", () => {
    const paddle = verified({
      provider: "paddle",
      mode: null,
      actions: {
        ...summaryBody().actions,
        paddlePortal: true,
        prepareChange: false,
        cancel: false,
      },
    });
    const onOpenPortal = vi.fn();
    const html = renderPanel(paddle, "en", { onOpenPortal });
    expect(html).toContain(text("billingScreen.commercial.manageHelpPaddle"));
    const manage = button(text("billingScreen.manage"));
    expect(manage?.disabled).toBe(false);
    manage!.click!();
    expect(onOpenPortal).toHaveBeenCalledOnce();
    expect(button(text("billingScreen.commercial.prepare"))?.disabled).toBe(true);
    expect(button(text("billingScreen.cancel"))?.disabled).toBe(true);
  });

  it("does not say 'no change available' beside an enabled withdrawal", () => {
    // Reversal-only is a real supported state: prepare and cancel are both
    // off because the subscription is already ending.
    const reversalOnly = verified({
      cancelAtPeriodEnd: true,
      eligibleCancellationId: CANCEL_OPERATION,
      actions: {
        ...summaryBody().actions,
        prepareChange: false,
        cancel: false,
        reverseCancellation: true,
      },
    });
    const html = renderPanel(reversalOnly);
    expect(html).toContain(text("billingScreen.commercial.manageHelpStripeReversal"));
    expect(html).not.toContain(text("billingScreen.commercial.manageHelpStripeHeld"));
    expect(button(text("billingScreen.commercial.reverse"))?.disabled).toBe(false);
    expect(button(text("billingScreen.cancel"))?.disabled).toBe(true);
  });

  it("gates the Paddle Manage control on current evidence", () => {
    const paddle = verified({
      provider: "paddle",
      mode: null,
      actions: {
        ...summaryBody().actions,
        paddlePortal: true,
        prepareChange: false,
        cancel: false,
      },
    });
    renderPanel(paddle);
    expect(button(text("billingScreen.manage"))?.disabled).toBe(false);
    const stale = run(
      [
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: { ok: false, reason: "billing_read_unavailable" },
        },
      ],
      paddle,
    );
    const onOpenPortal = vi.fn();
    renderPanel(stale, "en", { onOpenPortal });
    // The control is still SHOWN — the account really is on Paddle — but it
    // cannot be used while the evidence behind it is stale.
    expect(button(text("billingScreen.manage"))?.disabled).toBe(true);
    expect(onOpenPortal).not.toHaveBeenCalled();
  });

  it("uses manual and no-subscription copy for those providers", () => {
    const manual = renderPanel(
      verified({
        provider: "manual",
        mode: null,
        status: "manualBeta",
        actions: { ...summaryBody().actions, prepareChange: false, cancel: false },
      }),
    );
    expect(manual).toContain(text("billingScreen.commercial.manageHelpManual"));
    const none = renderPanel(
      verified({
        provider: "none",
        mode: null,
        planId: "freePreview",
        access: "free",
        actions: { ...summaryBody().actions, prepareChange: false, cancel: false },
      }),
    );
    expect(none).toContain(text("billingScreen.commercial.manageHelpNone"));
  });

  it("passes the opening control to the dialog so focus can return to it", () => {
    const onOpenDialog = vi.fn();
    renderPanel(verified(), "en", { onOpenDialog });
    const cancel = button(text("billingScreen.cancel"));
    const element = { isConnected: true, focus: vi.fn() };
    cancel!.click!({ currentTarget: element });
    expect(onOpenDialog).toHaveBeenCalledWith("cancel", element);
  });
});

describe("focus restoration", () => {
  it("focuses a control that is still in the document", () => {
    const focus = vi.fn();
    expect(focusIfConnected({ isConnected: true, focus })).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("never focuses a stale, removed or missing control", () => {
    const focus = vi.fn();
    expect(focusIfConnected(null)).toBe(false);
    expect(focusIfConnected({ isConnected: false, focus })).toBe(false);
    expect(focusIfConnected({ focus })).toBe(false);
    expect(focusIfConnected({ isConnected: true })).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("accessible structure", () => {
  it("labels every control, keeps buttons non-submitting and exposes busy state", () => {
    renderPanel(verified());
    expect(captured.buttons.length).toBeGreaterThan(0);
    for (const b of captured.buttons) expect(b.type).toBe("button");
    const seatInput = captured.inputs.find((i) => i.type === "number");
    expect(seatInput?.id).toBeTruthy();
    expect(captured.labels.some((l) => l.htmlFor === seatInput?.id)).toBe(true);
    const html = renderPanel(
      run([
        { type: "identity", userId: USER, epoch: 1 },
        { type: "summary/request", epoch: 1, token: 1 },
      ]),
    );
    expect(html).toContain('aria-busy="true"');
  });

  it("never prints an internal code, identifier or raw provider text", () => {
    const base = prepared();
    const html = renderPanel(
      run(
        [
          {
            type: "intent/begin",
            epoch: 1,
            kind: "change",
            operationId: OPERATION,
            quoteId: QUOTE,
            cancelOperationId: null,
            terms: termsOf(base),
          },
          {
            type: "intent/confirmed",
            epoch: 1,
            operationId: OPERATION,
            response: { ok: false, reason: "schedule_phase_default_tax_rates" },
          },
        ],
        base,
      ),
    );
    for (const secret of [
      OPERATION,
      QUOTE,
      "schedule_phase_default_tax_rates",
      "tax_rates",
      "acct_",
      "cus_",
      "sub_",
      "price_",
    ])
      expect(html, secret).not.toContain(secret);
    expect(shows(html, text("billingScreen.reason.scheduleHeld"))).toBe(true);
  });
});

describe("all four active locales", () => {
  it.each(UI_LANGUAGE_CODES)("%s renders the verified panel in its own copy", (locale) => {
    const html = renderPanel(
      verified({
        currentAmountMinor: 14_900,
        currentCurrency: "eur",
        currentAmountEvidence: "fixture",
      }),
      locale,
    );
    expect(html).toContain(text("billingScreen.commercial.title", locale));
    expect(html).toContain(text("billingScreen.commercial.catalogNote", locale));
    expect(html).toContain(text("billingScreen.commercial.amountFixture", locale));
    expect(shows(html, text("billingScreen.commercial.manageHelpStripe", locale))).toBe(true);
    expect(html).not.toContain("billingScreen.");
  });

  it.each(UI_LANGUAGE_CODES)("%s keeps the quote's interpolated limits intact", (locale) => {
    const html = renderConfirmation("change", prepared(), locale);
    expect(html).toContain(
      translate(locale, "billingScreen.commercial.quote.limits", {
        working: 5,
        viewer: 10,
        projects: 5,
      }),
    );
    expect(html).not.toContain("{working}");
    expect(html).not.toContain("{viewer}");
    expect(html).not.toContain("{projects}");
    expect(shows(html, text("billingScreen.commercial.quote.recurringNote", locale))).toBe(true);
    // The expiry carries a time and a zone in every locale.
    expect(html).toContain("UTC");
  });

  it.each(UI_LANGUAGE_CODES)("%s states an undiscovered operation honestly", (locale) => {
    const base = prepared();
    const missing = run(
      [
        {
          type: "intent/begin",
          epoch: 1,
          kind: "change",
          operationId: OPERATION,
          quoteId: QUOTE,
          cancelOperationId: null,
          terms: termsOf(base),
        },
        { type: "intent/transportFailed", epoch: 1, operationId: OPERATION },
        { type: "summary/request", epoch: 1, token: 2 },
        {
          type: "summary/resolved",
          epoch: 1,
          token: 2,
          response: summaryResponse({ operationEvidence: "none" }),
        },
      ],
      base,
    );
    const html = renderPanel(missing, locale);
    expect(shows(html, text("billingScreen.commercial.operation.notDiscovered", locale))).toBe(
      true,
    );
  });
});
