/*
 * Synthetic adapters for the real billing route.
 *
 * Every export here replaces exactly one boundary of the product: the store,
 * auth, the router, toasts, the shell, the owner sandbox panel and the accepted
 * caller API. Their SHAPES are the accepted contract; their DATA is fabricated
 * and lives in page memory only.
 *
 * Nothing in this file is a product replica. In particular the "server" below
 * enforces no ownership, no idempotency and no state machine — it only answers
 * in the documented shapes so the UI's own behaviour (one dispatch, retained
 * identity, discovery on reentry, pending projection, honest unknowns) can be
 * observed in a browser.
 */
import React, { useRef, useSyncExternalStore } from "react";

/* -------------------------------------------------------------------------- */
/* Diagnostics and the network denial                                         */
/* -------------------------------------------------------------------------- */

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const notify = () => {
  fixture.revision++;
  listeners.forEach((fn) => fn());
};

export const fixture = (window.miloBillingFixture = {
  scenario: "verifiedPaid",
  prepareMode: "ok",
  confirmMode: "applied",
  cancelMode: "ok",
  readMode: "ok",
  projectionApplies: false,
  slowMs: 1200,
  locale: "en",
  owner: false,
  userId: "fixture-user-a",
  revision: 0,
  mountRevision: 0,
  requests: [],
  errors: [],
  blockedRequests: [],
  state: null,
  /** The durable operation this synthetic server believes exists. */
  openOperation: null,
  /** The target an APPLIED operation would settle to once the synthetic
   * projection catches up. Only an applied answer records one. */
  pendingSettlement: null,
  /** The plan the synthetic projection currently reports. */
  projectedPlanId: "growth",
  /** …and the extra seats it reports, projected the same way. */
  projectedSeats: 2,
});

export function record(name, payload) {
  fixture.requests.push({ at: new Date().toISOString(), name, payload });
  if (fixture.requests.length > 200) fixture.requests.shift();
  notify();
}

export function refuse(name, args) {
  record("refused-server-function", { name, args: args?.length ?? 0 });
  throw Error("This fixture refuses the unsupported server function " + name);
}

const deny = (kind, target) => {
  const row = { kind, target: String(target) };
  fixture.blockedRequests.push(row);
  record("blocked-network", row);
  throw Error("Fixture denies " + kind + ": " + String(target));
};
globalThis.fetch = window.fetch = async (input) =>
  deny("fetch", typeof input === "string" ? input : input?.url);
window.XMLHttpRequest = class {
  open(method, url) {
    deny("XMLHttpRequest", url);
  }
};
window.WebSocket = class {
  constructor(url) {
    deny("WebSocket", url);
  }
};
window.EventSource = class {
  constructor(url) {
    deny("EventSource", url);
  }
};
try {
  Object.defineProperty(navigator, "sendBeacon", { value: (url) => deny("sendBeacon", url) });
} catch {}
window.open = (url) => deny("window.open", url);
window.addEventListener("error", (event) => {
  fixture.errors.push(String(event.error?.stack || event.message));
  notify();
});
window.addEventListener("unhandledrejection", (event) => {
  fixture.errors.push(String(event.reason?.stack || event.reason));
  notify();
});
document.addEventListener("click", (event) => {
  const anchor = event.target.closest?.("a");
  if (anchor && !event.defaultPrevented) {
    const href = anchor.getAttribute("href") || "";
    if (!href.startsWith("blob:") && !href.startsWith("#")) {
      event.preventDefault();
      record("blocked-navigation", { href });
    }
  }
});
try {
  // The real i18n module reads this device override first; clearing it makes
  // the fixture's language selector the single source.
  localStorage.removeItem("milo.uiLocale");
} catch {}

const later = (value, ms) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const rejectLater = (message, ms) =>
  new Promise((_, rejectIt) => setTimeout(() => rejectIt(Error(message)), ms));

/* -------------------------------------------------------------------------- */
/* Store, auth, router, toasts and the shell                                  */
/* -------------------------------------------------------------------------- */

const initialState = () => ({
  projects: [{ id: "fixture-project", appLanguage: fixture.locale }],
  activeProjectId: "fixture-project",
  billingProfile: {
    customerType: "business",
    billingCountry: "DE",
    billingMarket: "European Union",
    billingEmail: "billing@example.invalid",
  },
  // The legacy store copy deliberately still carries a reconstructed price and
  // a paddle-labelled customer id. Neither may reach the billing decisions.
  subscription: {
    planId: "growth",
    status: "active",
    billingMarket: "European Union",
    currency: "EUR",
    priceMonthly: 149,
    paddleCustomerId: "ctm_fixture_not_a_provider_signal",
  },
  userId: fixture.userId,
});
fixture.state = initialState();

export const getState = () => fixture.state;
const setState = (fn) => {
  fixture.state = fn(fixture.state);
  notify();
};
const shallowEqual = (a, b) =>
  Object.is(a, b) ||
  (a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.is(a[k], b[k])));

export const useStore = (selector) => {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const selected = selector(state);
  const ref = useRef(selected);
  if (!shallowEqual(ref.current, selected)) ref.current = selected;
  return ref.current;
};

export const setBillingProfile = (profile) => {
  record("store.setBillingProfile", { billingCountry: profile.billingCountry });
  setState((s) => ({ ...s, billingProfile: profile }));
};
export const saveWorkspaceNow = async () => {
  record("store.saveWorkspaceNow", {});
};
/** The LEGACY entitlement mirror. It exists so the harness can show that the
 * screen does not depend on it; it never changes the commercial summary. */
export const refreshEntitlement = async () => {
  record("store.refreshEntitlement", {});
};

export const useAuth = () => {
  useSyncExternalStore(
    subscribe,
    () => fixture.revision,
    () => fixture.revision,
  );
  return {
    user: { id: fixture.userId, email: fixture.userId + "@example.invalid" },
    isOwner: fixture.owner,
    loading: false,
    session: { user: { id: fixture.userId } },
  };
};

export const createFileRoute = () => (options) => ({ options, useSearch: () => ({}) });
export const navigate = async (intent) => record("navigate", intent);
export const useNavigate = () => navigate;
export const useRouter = () => ({
  navigate,
  invalidate: async () => {},
  state: { location: { pathname: "/app/billing" } },
});
export const useLocation = () => ({ pathname: "/app/billing", search: {} });
// Plain `createElement` rather than JSX: this file is `.js`, and the project's
// lint configuration only parses JSX in `.jsx`/`.tsx`.
const h = React.createElement;

export const Link = React.forwardRef(function Link({ to, children, onClick, ...props }, ref) {
  return h(
    "a",
    {
      ...props,
      ref,
      href: to,
      onClick: (event) => {
        event.preventDefault();
        onClick?.(event);
        void navigate({ to });
      },
    },
    children,
  );
});

export const toast = {
  success: (message) => record("toast.success", { message }),
  error: (message) => record("toast.error", { message }),
  message: (message) => record("toast.message", { message }),
  info: (message) => record("toast.info", { message }),
  warning: (message) => record("toast.warning", { message }),
};
export function Toaster() {
  useSyncExternalStore(
    subscribe,
    () => fixture.revision,
    () => fixture.revision,
  );
  const last = [...fixture.requests].reverse().find((e) => e.name.startsWith("toast."));
  return last
    ? h(
        "div",
        {
          role: "status",
          style: {
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 70,
            maxWidth: 360,
            background: "#111",
            color: "#fff",
            padding: "8px 10px",
            font: "12px/1.4 system-ui",
            borderRadius: 6,
          },
        },
        String(last.payload.message),
      )
    : null;
}

export function AppShell({ title, description, children }) {
  return h(
    "main",
    { className: "fixture-shell" },
    h(
      "header",
      { className: "mb-7" },
      h("h1", { className: "text-3xl font-semibold" }, title),
      description ? h("p", { className: "mt-2 text-sm text-muted-foreground" }, description) : null,
    ),
    children,
  );
}

export function StripeSandboxPanel() {
  return h(
    "aside",
    {
      "data-fixture-stub": "StripeSandboxPanel",
      className:
        "mb-6 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground",
    },
    "Fixture: the owner sandbox panel is out of scope for this harness.",
  );
}

/* -------------------------------------------------------------------------- */
/* The synthetic caller API                                                   */
/* -------------------------------------------------------------------------- */

const NO_ACTIONS = {
  paddlePortal: false,
  prepareChange: false,
  cancel: false,
  reverseCancellation: false,
  recoverOperation: false,
  manualOverride: false,
};

const QUOTE_TERMS = {
  planId: "pro",
  seatQuantity: 2,
  amountMinor: 12_345,
  recurringEstimateMinor: 26_910,
  currency: "eur",
  direction: "increase",
  effectiveAt: null,
  expiresAt: "2099-10-29T12:00:00.000Z",
};

/** Synthetic but VALID identities: the accepted caller validators require
 * UUIDs, and a fixture that accepts anything else proves nothing. */
const ELIGIBLE_CANCELLATION = "9f1d4c3b-6a2e-4f58-9c71-0d5b8e2a7c40";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELLABLE = ["starter", "growth", "pro", "agency"];

/**
 * The accepted request shapes, enforced here on purpose.
 *
 * The real endpoints validate strictly before their handlers run, so a
 * fixture that accepts a malformed request would let the browser show a
 * success the product could never get. This is shape validation only — it is
 * not ownership, idempotency or any part of the real state machine.
 */
const uuidValue = (v) => typeof v === "string" && UUID_SHAPE.test(v);
const countValue = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1000;

/** The exact field set each accepted validator allows, and how to check it.
 * The real schemas are `.strict()`, so an extra key is a rejection — not an
 * ignored decoration. Checking only the known fields would let the harness
 * succeed on a request the real endpoint refuses before its handler runs. */
const REQUEST_SHAPES = {
  prepare: {
    quoteId: uuidValue,
    planId: (v) => SELLABLE.includes(v),
    seatQuantity: countValue,
  },
  confirm: {
    operationId: uuidValue,
    quoteId: uuidValue,
    planId: (v) => SELLABLE.includes(v),
    seatQuantity: countValue,
    amountMinor: (v) => Number.isSafeInteger(v) && v >= 0,
    currency: (v) => typeof v === "string" && /^[a-z]{3}$/.test(v),
  },
  cancel: { operationId: uuidValue },
  reverse: { operationId: uuidValue, cancelOperationId: uuidValue },
};

function invalidRequest(kind, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "request_invalid";
  const shape = REQUEST_SHAPES[kind];
  if (!shape) return "request_invalid";
  const allowed = Object.keys(shape);
  // Strict: exactly these keys, no more and no fewer.
  for (const key of Object.keys(data)) if (!allowed.includes(key)) return "request_invalid";
  for (const key of allowed) if (!shape[key](data[key])) return "request_invalid";
  return null;
}

const baseSummary = (over = {}) => ({
  provider: "stripe",
  mode: "test",
  planId: fixture.projectedPlanId,
  access: "paid",
  status: "active",
  // The PROJECTED seat count, not a constant. A confirmed Pro / 0-seat target
  // could otherwise never appear as a fully projected state, which made the
  // harness unable to supply a faithful successful read for its own scenario.
  purchasedSeats: fixture.projectedSeats,
  periodEnd: "2026-11-27T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  currentAmountMinor: null,
  currentCurrency: null,
  currentAmountEvidence: "unknown",
  operation: null,
  operationEvidence: "none",
  eligibleCancellationId: null,
  actions: { ...NO_ACTIONS, prepareChange: true, cancel: true },
  heldReason: null,
  ...over,
});

export const SCENARIOS = {
  verifiedPaid: () => baseSummary(),
  // The ONLY place a current amount is ever stated, and it says so on screen.
  fixtureMoney: () =>
    baseSummary({
      currentAmountMinor: 14_900,
      currentCurrency: "eur",
      currentAmountEvidence: "fixture",
    }),
  verifiedFree: () =>
    baseSummary({
      provider: "none",
      mode: null,
      planId: "freePreview",
      access: "free",
      status: "freePreview",
      purchasedSeats: null,
      periodEnd: null,
      actions: { ...NO_ACTIONS },
    }),
  paddle: () =>
    baseSummary({
      provider: "paddle",
      mode: null,
      actions: { ...NO_ACTIONS, paddlePortal: true },
    }),
  manualClear: () =>
    baseSummary({
      provider: "manual",
      mode: null,
      status: "manualBeta",
      purchasedSeats: null,
      actions: { ...NO_ACTIONS, manualOverride: true },
    }),
  manualHeld: () =>
    baseSummary({
      provider: "manual",
      mode: null,
      status: "manualBeta",
      purchasedSeats: null,
      actions: { ...NO_ACTIONS },
    }),
  held: () => baseSummary({ actions: { ...NO_ACTIONS }, heldReason: "held" }),
  unestablished: () =>
    baseSummary({
      provider: "unknown",
      mode: null,
      planId: null,
      access: "unknown",
      status: null,
      purchasedSeats: null,
      periodEnd: null,
      actions: { ...NO_ACTIONS },
      heldReason: "operation_unavailable",
    }),
  cancelEligible: () =>
    baseSummary({
      cancelAtPeriodEnd: true,
      // A real UUID: the caller validator requires one, so a placeholder
      // string would let the harness show a "successful" reversal for a
      // request the actual endpoint rejects before its handler runs.
      eligibleCancellationId: ELIGIBLE_CANCELLATION,
      actions: { ...NO_ACTIONS, reverseCancellation: true },
    }),
  ambiguous: () =>
    baseSummary({
      operationEvidence: "ambiguous",
      actions: { ...NO_ACTIONS },
      heldReason: "operation_conflict",
    }),
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS);
export const READ_MODES = ["ok", "slow", "failure"];
export const PREPARE_MODES = ["ok", "slow", "zero", "capacity", "prorationConflict", "held"];
export const CONFIRM_MODES = [
  "applied",
  "awaiting_payment",
  "scheduled",
  "timeout",
  "uncertain",
  "declined",
  "fenced",
  "refused",
];
export const CANCEL_MODES = ["ok", "timeout", "uncertain", "notApplied"];

/**
 * The summary READ. It also performs DISCOVERY: once a mutation has been
 * dispatched, every later read reports that same operation, which is what a
 * refresh, a remount or a reentry must resume rather than replace.
 */
export const getStripeCommercialSummaryFn = async () => {
  const requestedBy = fixture.userId;
  record("getStripeCommercialSummaryFn", { user: requestedBy, scenario: fixture.scenario });
  if (fixture.readMode === "failure")
    return later({ ok: false, reason: "billing_read_unavailable" }, 120);
  const build = SCENARIOS[fixture.scenario] ?? SCENARIOS.verifiedPaid;
  const summary = build();
  const open = fixture.openOperation;
  if (open) {
    summary.operation = {
      operationId: open.operationId,
      kind: open.kind,
      state: open.state,
      quoteId: open.quoteId,
      cancelOperationId: open.cancelOperationId,
      terms: open.terms,
    };
    summary.operationEvidence = "open";
    summary.actions = { ...NO_ACTIONS, recoverOperation: true };
  }
  return later({ ok: true, summary }, fixture.readMode === "slow" ? fixture.slowMs : 80);
};

export const getStripeCommercialStatusFn = async () => {
  record("getStripeCommercialStatusFn", {});
  return {
    liveChangesHeld: true,
    sandboxAvailable: false,
    refundSelfServiceAvailable: false,
    message: "Held.",
  };
};

export const prepareStripeSubscriptionChangeFn = async ({ data }) => {
  record("prepareStripeSubscriptionChangeFn", data);
  const delay = fixture.prepareMode === "slow" ? fixture.slowMs : 150;
  const invalid = invalidRequest("prepare", data);
  if (invalid) return later({ ok: false, reason: invalid }, delay);
  if (fixture.prepareMode === "capacity")
    return later({ ok: false, reason: "capacity_conflict_working" }, delay);
  if (fixture.prepareMode === "prorationConflict")
    return later({ ok: false, reason: "preview_preview_line_proration_conflict" }, delay);
  if (fixture.prepareMode === "held") return later({ ok: false, reason: "held" }, delay);
  const zero = fixture.prepareMode === "zero";
  return later(
    {
      ok: true,
      quoteId: data.quoteId,
      direction: zero ? "decrease" : "increase",
      amountMinor: zero ? 0 : 12_345,
      recurringEstimateMinor: zero ? 0 : 26_910,
      recurringEstimateIncludesAdjustments: !zero,
      recurringEstimateNote: "Server note (not rendered; the UI uses localized copy).",
      currency: "eur",
      effectiveAt: zero ? "2026-11-27T00:00:00.000Z" : null,
      immediate: !zero,
      // Short enough that a reviewer can watch a quote expire on screen.
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      planId: data.planId,
      seatQuantity: data.seatQuantity,
      workingSeatAllowance: 5,
      viewerSeatAllowance: 10,
      projectAllowance: 5,
      effectiveNote: "Server note (not rendered; the UI uses localized copy).",
    },
    delay,
  );
};

function rememberDispatch(kind, data) {
  fixture.openOperation = {
    operationId: data.operationId,
    kind: kind === "cancel" ? "cancel" : kind === "reverse" ? "reverse_cancel" : "plan_change",
    state: "awaiting_apply",
    quoteId: data.quoteId ?? null,
    cancelOperationId: data.cancelOperationId ?? null,
    terms:
      kind === "change"
        ? {
            ...QUOTE_TERMS,
            planId: data.planId,
            seatQuantity: data.seatQuantity,
            amountMinor: data.amountMinor,
            currency: data.currency,
          }
        : null,
  };
}

export const confirmStripeSubscriptionChangeFn = async ({ data }) => {
  record("confirmStripeSubscriptionChangeFn", data);
  const invalid = invalidRequest("confirm", data);
  if (invalid) return later({ ok: false, reason: invalid }, 200);
  rememberDispatch("change", data);
  const mode = fixture.confirmMode;
  if (mode === "timeout") return rejectLater("synthetic timeout", fixture.slowMs);
  if (mode === "uncertain") return later({ ok: false, reason: "quote_consumption_uncertain" }, 400);
  if (mode === "declined") return later({ ok: false, reason: "change_invoice_unpaid" }, 400);
  if (mode === "fenced") return later({ ok: false, reason: "operation_fenced" }, 400);
  if (mode === "refused") return later({ ok: false, reason: "operation_refused" }, 400);
  if (mode === "applied") {
    // The full target this operation WOULD settle to — plan AND seats —
    // recorded so the projection control can settle it later without sending
    // a second request. A declined, uncertain or fenced operation records
    // nothing.
    fixture.pendingSettlement = { planId: data.planId, seatQuantity: data.seatQuantity };
    if (fixture.projectionApplies) settleProjection();
  }
  return later(
    {
      ok: true,
      state: mode,
      direction: "increase",
      effectiveAt: mode === "scheduled" ? "2026-11-27T00:00:00.000Z" : null,
      currency: data.currency,
      amountMinor: data.amountMinor,
      note: "Server note (not rendered).",
    },
    400,
  );
};

const cancelLike =
  (kind) =>
  async ({ data }) => {
    record(kind === "cancel" ? "cancelStripeSubscriptionFn" : "reverseStripeCancellationFn", data);
    const invalid = invalidRequest(kind === "cancel" ? "cancel" : "reverse", data);
    if (invalid) return later({ ok: false, reason: invalid }, 200);
    rememberDispatch(kind, data);
    if (fixture.cancelMode === "timeout") return rejectLater("synthetic timeout", fixture.slowMs);
    if (fixture.cancelMode === "uncertain")
      return later({ ok: false, reason: "cancellation_uncertain" }, 400);
    if (fixture.cancelMode === "notApplied")
      return later(
        {
          ok: false,
          reason: kind === "cancel" ? "cancellation_not_applied" : "reversal_not_applied",
        },
        400,
      );
    // A cancellation or reversal changes neither plan nor seats.
    fixture.pendingSettlement = {
      planId: fixture.projectedPlanId,
      seatQuantity: fixture.projectedSeats,
    };
    if (fixture.projectionApplies) settleProjection();
    return later(
      {
        ok: true,
        cancelAtPeriodEnd: kind === "cancel",
        effectiveAt: "2026-11-27T00:00:00.000Z",
        note: "Server note (not rendered).",
      },
      400,
    );
  };
export const cancelStripeSubscriptionFn = cancelLike("cancel");
export const reverseStripeCancellationFn = cancelLike("reverse");

export const getMyEntitlementFn = async () => {
  record("getMyEntitlementFn", {});
  return {
    entitlement: {
      planId: "growth",
      status: "active",
      cancelAtPeriodEnd: false,
      provider: "manual",
    },
    effectivePlanId: "growth",
  };
};
export const setManualEntitlementFn = async ({ data }) => {
  record("setManualEntitlementFn", data);
  const summary = (SCENARIOS[fixture.scenario] ?? SCENARIOS.verifiedPaid)();
  // The synthetic server applies the SAME guard the real one does.
  if (!summary.actions.manualOverride) throw Error("manual_override_held:billing_state_unknown");
  return { entitlement: { planId: data.planId, status: data.status, provider: "manual" } };
};

export const createPaddlePortalSessionFn = async () => {
  record("createPaddlePortalSessionFn", {});
  return { overviewUrl: null, cancelUrl: null, error: null, message: null };
};
export const createPaddleCheckoutFn = async () => refuse("createPaddleCheckoutFn", []);

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Settle the pending SYNTHETIC projection — the fixture's own server state.
 *
 * This is the "the provider applied it and our projection has now caught up"
 * step, and it deliberately sends no commercial request: the point of the
 * scenario is that ONE confirm plus a later READ is enough for the screen to
 * show the new plan. Only an operation that actually answered `applied` has a
 * pending settlement, so a declined, uncertain or fenced one is never turned
 * into a success by this control.
 */
export function settleProjection() {
  const pending = fixture.pendingSettlement;
  if (!pending) return false;
  fixture.projectedPlanId = pending.planId;
  fixture.projectedSeats = pending.seatQuantity;
  fixture.pendingSettlement = null;
  fixture.openOperation = null;
  record("fixture.settleProjection", {
    projectedPlanId: fixture.projectedPlanId,
    projectedSeats: fixture.projectedSeats,
  });
  return true;
}

export function reset(next = {}) {
  Object.assign(fixture, next);
  fixture.openOperation = null;
  fixture.pendingSettlement = null;
  fixture.projectedPlanId = "growth";
  fixture.projectedSeats = 2;
  fixture.state = initialState();
  fixture.mountRevision++;
  notify();
}

export function clearLog() {
  fixture.requests = [];
  fixture.errors = [];
  fixture.blockedRequests = [];
  notify();
}

/** How many times each endpoint was called — the number a reviewer checks
 * after a double click, a timeout and a reentry. */
export function requestCounts() {
  const counts = {};
  for (const entry of fixture.requests) counts[entry.name] = (counts[entry.name] ?? 0) + 1;
  return counts;
}

/** Every distinct operation id this page has ever dispatched. More than one
 * after a timeout and a retry would be the defect. */
export function dispatchedOperationIds() {
  return [
    ...new Set(
      fixture.requests
        .filter((entry) => entry.payload && entry.payload.operationId)
        .map((entry) => entry.payload.operationId),
    ),
  ];
}

fixture.reset = reset;
fixture.settleProjection = settleProjection;
fixture.clearLog = clearLog;
fixture.requestCounts = requestCounts;
fixture.dispatchedOperationIds = dispatchedOperationIds;
fixture.refuse = refuse;
fixture.snapshot = () => ({
  scenario: fixture.scenario,
  modes: {
    read: fixture.readMode,
    prepare: fixture.prepareMode,
    confirm: fixture.confirmMode,
    cancel: fixture.cancelMode,
    projectionApplies: fixture.projectionApplies,
  },
  user: fixture.userId,
  openOperation: fixture.openOperation,
  pendingSettlement: fixture.pendingSettlement,
  projectedPlanId: fixture.projectedPlanId,
  projectedSeats: fixture.projectedSeats,
  requestCounts: requestCounts(),
  dispatchedOperationIds: dispatchedOperationIds(),
  errors: fixture.errors,
  blockedRequests: fixture.blockedRequests,
});
