/**
 * Synthetic Stripe fixtures for the commercial operations tests.
 *
 * SYNTHETIC ONLY. Every shape here was written from documentation, not captured
 * from a live account: no Stripe object, credential, sandbox or webhook endpoint
 * exists in the authorized scope, and nothing in this file reaches a network.
 * A schema detail could therefore still be wrong in a way local tests cannot
 * detect — which is exactly why the real isolated-sandbox matrix stays open.
 *
 * It lives outside the test files so the mocked-server suite and any later
 * suite describe the SAME provider, and so a fixture can be adjusted in one
 * place when the real sandbox finally contradicts it.
 */

/** Minor-unit amounts that match the owner-approved catalogue for the EUR
 * market: Growth EUR 149, Pro EUR 299, extra working seat EUR 15 / 12. */
export const APPROVED_MINOR = {
  growthBase: 14_900,
  proBase: 29_900,
  growthSeat: 1_500,
  proSeat: 1_200,
} as const;

export const COMMERCIAL_ACCOUNT_TEST = "acct_commercialTEST";
export const COMMERCIAL_ACCOUNT_LIVE = "acct_commercialLIVE";
export const COMMERCIAL_OWNER = "00000000-0000-4000-8000-00000000c001";
export const COMMERCIAL_CUSTOMER = "cus_commercial1";
export const COMMERCIAL_SUBSCRIPTION = "sub_test_commercial1";

export const PRICE_IDS = {
  growthBase: "price_tgrowth",
  growthSeat: "price_tgrowthseat",
  proBase: "price_tpro",
  proSeat: "price_tproseat",
} as const;
export const PRODUCT_IDS = { growth: "prod_tgrowth", pro: "prod_tpro" } as const;

/** A fully configured TEST mode plus a configured live mode, so the live holds
 * are proven to fire on configuration that would otherwise work. */
export const COMMERCIAL_ENV: Record<string, string> = {
  STRIPE_ACCOUNT_ID_LIVE: COMMERCIAL_ACCOUNT_LIVE,
  STRIPE_ACCOUNT_ID_TEST: COMMERCIAL_ACCOUNT_TEST,
  STRIPE_RESTRICTED_KEY_LIVE: "rk_live_commercialfixture",
  STRIPE_RESTRICTED_KEY_TEST: "rk_test_commercialfixture",
  STRIPE_WEBHOOK_SECRET_LIVE: "whsec_live_commercialfixture",
  STRIPE_WEBHOOK_SECRET_TEST: "whsec_test_commercialfixture",
  STRIPE_PRICE_GROWTH_BASE_LIVE: "price_lgrowth:prod_lgrowth:eur:month",
  STRIPE_PRICE_GROWTH_SEAT_LIVE: "price_lgrowthseat:prod_lgrowth:eur:month",
  STRIPE_PRICE_PRO_BASE_LIVE: "price_lpro:prod_lpro:eur:month",
  STRIPE_PRICE_PRO_SEAT_LIVE: "price_lproseat:prod_lpro:eur:month",
  STRIPE_PRICE_GROWTH_BASE_TEST: `${PRICE_IDS.growthBase}:${PRODUCT_IDS.growth}:eur:month`,
  STRIPE_PRICE_GROWTH_SEAT_TEST: `${PRICE_IDS.growthSeat}:${PRODUCT_IDS.growth}:eur:month`,
  STRIPE_PRICE_PRO_BASE_TEST: `${PRICE_IDS.proBase}:${PRODUCT_IDS.pro}:eur:month`,
  STRIPE_PRICE_PRO_SEAT_TEST: `${PRICE_IDS.proSeat}:${PRODUCT_IDS.pro}:eur:month`,
  STRIPE_INTEGRATION_IDENTIFIER_SUFFIX: "abcdefgh",
  MILO_STRIPE_LIFECYCLE_RETURN_BASE: "https://milogrowth.com/app/billing",
  MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS: COMMERCIAL_OWNER,
};

type Over = Record<string, unknown>;

export interface ItemSpec {
  id: string;
  priceId: string;
  productId: string;
  quantity: number;
}

export const subscriptionItem = (spec: ItemSpec, nowSeconds: number, over: Over = {}) => ({
  id: spec.id,
  object: "subscription_item",
  quantity: spec.quantity,
  price: {
    id: spec.priceId,
    object: "price",
    product: spec.productId,
    currency: "eur",
    recurring: { interval: "month", interval_count: 1 },
  },
  current_period_start: nowSeconds - 10 * 86_400,
  current_period_end: nowSeconds + 20 * 86_400,
  ...over,
});

/** The paid invoice shape the foundation's single payment rule accepts. The
 * default `billing_reason` is a RENEWAL, because that is what a subscription's
 * ordinary historical invoice is — and an update must never be proved by one. */
export const paidInvoice = (
  nowSeconds: number,
  over: Over = {},
  subscriptionId = COMMERCIAL_SUBSCRIPTION,
) => ({
  id: "in_base",
  object: "invoice",
  status: "paid",
  livemode: false,
  currency: "eur",
  customer: COMMERCIAL_CUSTOMER,
  billing_reason: "subscription_cycle",
  amount_remaining: 0,
  amount_paid: APPROVED_MINOR.growthBase,
  status_transitions: { paid_at: nowSeconds - 10 * 86_400 },
  parent: { type: "subscription_details", subscription_details: { subscription: subscriptionId } },
  ...over,
});

/** The invoice an immediate plan/seat INCREASE raises: `subscription_update`,
 * paid for exactly the quoted prorated amount, nothing remaining. */
export const updateInvoice = (
  nowSeconds: number,
  amountMinor: number,
  over: Over = {},
  subscriptionId = COMMERCIAL_SUBSCRIPTION,
) =>
  paidInvoice(
    nowSeconds,
    {
      id: "in_update",
      billing_reason: "subscription_update",
      amount_paid: amountMinor,
      amount_remaining: 0,
      status_transitions: { paid_at: nowSeconds },
      ...over,
    },
    subscriptionId,
  );

/** A current GROWTH subscription with no seat item: the default starting state. */
export const growthSubscription = (nowSeconds: number, over: Over = {}) => ({
  id: COMMERCIAL_SUBSCRIPTION,
  object: "subscription",
  status: "active",
  livemode: false,
  currency: "eur",
  collection_method: "charge_automatically",
  customer: COMMERCIAL_CUSTOMER,
  cancel_at_period_end: false,
  cancel_at: null,
  pending_update: null,
  schedule: null,
  items: {
    object: "list",
    has_more: false,
    data: [
      subscriptionItem(
        {
          id: "si_base",
          priceId: PRICE_IDS.growthBase,
          productId: PRODUCT_IDS.growth,
          quantity: 1,
        },
        nowSeconds,
      ),
    ],
  },
  latest_invoice: paidInvoice(nowSeconds),
  ...over,
});

/** A current PRO subscription carrying three extra working seats. */
export const proWithSeatsSubscription = (nowSeconds: number, seats = 3, over: Over = {}) =>
  growthSubscription(nowSeconds, {
    items: {
      object: "list",
      has_more: false,
      data: [
        subscriptionItem(
          { id: "si_base", priceId: PRICE_IDS.proBase, productId: PRODUCT_IDS.pro, quantity: 1 },
          nowSeconds,
        ),
        subscriptionItem(
          {
            id: "si_seat",
            priceId: PRICE_IDS.proSeat,
            productId: PRODUCT_IDS.pro,
            quantity: seats,
          },
          nowSeconds,
        ),
      ],
    },
    ...over,
  });

/* -------------------------------------------------------------------------- */
/* SYNTHETIC LIVE MODE                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The same shapes in synthetic LIVE mode, for the one proof that needs it: the
 * exported lifecycle reconciler writing through the guarded projection.
 *
 * `livemode: true` and the LIVE price/product identifiers configured in
 * `COMMERCIAL_ENV` above. Still entirely synthetic: no live credential, object
 * or endpoint exists in the authorized scope and nothing here reaches a network.
 * The commercial operations themselves remain held in live mode; this fixture
 * exercises the lifecycle gate, which is a write to our OWN tables.
 */
export const LIVE_PRICE_IDS = {
  growthBase: "price_lgrowth",
  growthSeat: "price_lgrowthseat",
  proBase: "price_lpro",
  proSeat: "price_lproseat",
} as const;
export const LIVE_PRODUCT_IDS = { growth: "prod_lgrowth", pro: "prod_lpro" } as const;
export const COMMERCIAL_CUSTOMER_LIVE = "cus_commercialLive1";
export const COMMERCIAL_SUBSCRIPTION_LIVE = "sub_live_commercial1";

/** A paid LIVE invoice for the live subscription. */
export const livePaidInvoice = (nowSeconds: number, over: Over = {}) =>
  paidInvoice(
    nowSeconds,
    { id: "in_live_base", livemode: true, customer: COMMERCIAL_CUSTOMER_LIVE, ...over },
    COMMERCIAL_SUBSCRIPTION_LIVE,
  );

/** The trusted LIVE starting state: Growth, no extra seats, paid, future period. */
export const liveGrowthSubscription = (nowSeconds: number, over: Over = {}) => ({
  ...growthSubscription(nowSeconds, {
    id: COMMERCIAL_SUBSCRIPTION_LIVE,
    livemode: true,
    customer: COMMERCIAL_CUSTOMER_LIVE,
    items: {
      object: "list",
      has_more: false,
      data: [
        subscriptionItem(
          {
            id: "si_live_base",
            priceId: LIVE_PRICE_IDS.growthBase,
            productId: LIVE_PRODUCT_IDS.growth,
            quantity: 1,
          },
          nowSeconds,
        ),
      ],
    },
    latest_invoice: livePaidInvoice(nowSeconds),
  }),
  ...over,
});

/** The WIDER live state a pending operation must not let through: Pro with
 * extra working seats. */
export const liveProWithSeats = (nowSeconds: number, seats = 4, over: Over = {}) =>
  liveGrowthSubscription(nowSeconds, {
    items: {
      object: "list",
      has_more: false,
      data: [
        subscriptionItem(
          {
            id: "si_live_base",
            priceId: LIVE_PRICE_IDS.proBase,
            productId: LIVE_PRODUCT_IDS.pro,
            quantity: 1,
          },
          nowSeconds,
        ),
        subscriptionItem(
          {
            id: "si_live_seat",
            priceId: LIVE_PRICE_IDS.proSeat,
            productId: LIVE_PRODUCT_IDS.pro,
            quantity: seats,
          },
          nowSeconds,
        ),
      ],
    },
    ...over,
  });

/** The provider price object, used to validate configured terms against the
 * approved catalogue before a quote may be issued or confirmed. */
export const priceObject = (
  id: string,
  productId: string,
  unitAmount: number,
  over: Over = {},
) => ({
  id,
  object: "price",
  active: true,
  livemode: false,
  currency: "eur",
  product: productId,
  unit_amount: unitAmount,
  recurring: { interval: "month", interval_count: 1 },
  ...over,
});

export const DEFAULT_PRICE_OBJECTS: Record<string, ReturnType<typeof priceObject>> = {
  [PRICE_IDS.growthBase]: priceObject(
    PRICE_IDS.growthBase,
    PRODUCT_IDS.growth,
    APPROVED_MINOR.growthBase,
  ),
  [PRICE_IDS.growthSeat]: priceObject(
    PRICE_IDS.growthSeat,
    PRODUCT_IDS.growth,
    APPROVED_MINOR.growthSeat,
  ),
  [PRICE_IDS.proBase]: priceObject(PRICE_IDS.proBase, PRODUCT_IDS.pro, APPROVED_MINOR.proBase),
  [PRICE_IDS.proSeat]: priceObject(PRICE_IDS.proSeat, PRODUCT_IDS.pro, APPROVED_MINOR.proSeat),
};

/**
 * The IMMEDIATE proration preview for an increase.
 *
 * Realistic on purpose: every line is a PRORATION of this change (one credit
 * for the unused remainder of the old item, one charge for the new one), the
 * lines sit on the stable proration date the quote is bound to, and
 * `amount_due`, `subtotal` and `total` are DIFFERENT figures. The old fixture
 * set `subtotal` to whatever the test wanted the "recurring" amount to be,
 * which made the subtotal-as-recurring defect invisible.
 */
export const prorationPreview = (
  input: {
    prorationDate: number;
    amountDue: number;
    creditMinor: number;
    chargeMinor: number;
    /** Invoice-level discount or exclusive tax, so `total` differs from the
     * line sum exactly as the Invoice object documents. */
    taxMinor?: number;
  },
  over: Over = {},
) => {
  const subtotal = input.creditMinor + input.chargeMinor;
  return {
    object: "invoice",
    livemode: false,
    currency: "eur",
    customer: COMMERCIAL_CUSTOMER,
    amount_due: input.amountDue,
    subtotal,
    total: subtotal + (input.taxMinor ?? 0),
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: COMMERCIAL_SUBSCRIPTION },
    },
    lines: {
      object: "list",
      has_more: false,
      data: [
        {
          id: "il_credit",
          amount: input.creditMinor,
          proration: true,
          period: { start: input.prorationDate, end: input.prorationDate + 20 * 86_400 },
        },
        {
          id: "il_charge",
          amount: input.chargeMinor,
          period: { start: input.prorationDate, end: input.prorationDate + 20 * 86_400 },
          parent: {
            type: "subscription_item_details",
            subscription_item_details: { proration: true },
          },
        },
      ],
    },
    ...over,
  };
};

/**
 * The LONG-TERM recurring estimate from `preview_mode=recurring`.
 *
 * `total` is the billed figure and `subtotal` is deliberately different, so a
 * reader that confuses the two is caught. No line is a proration: prorations
 * are not supported in that preview mode.
 */
export const recurringPreview = (
  input: { subtotalMinor: number; totalMinor: number },
  over: Over = {},
) => ({
  object: "invoice",
  livemode: false,
  currency: "eur",
  customer: COMMERCIAL_CUSTOMER,
  amount_due: input.totalMinor,
  subtotal: input.subtotalMinor,
  total: input.totalMinor,
  parent: {
    type: "subscription_details",
    subscription_details: { subscription: COMMERCIAL_SUBSCRIPTION },
  },
  lines: {
    object: "list",
    has_more: false,
    data: [
      {
        id: "il_recurring_base",
        amount: input.subtotalMinor,
        proration: false,
        period: { start: 0, end: 0 },
      },
    ],
  },
  ...over,
});

/**
 * The ORDINARY documented `default_settings` of a schedule for an automatically
 * charged, untaxed, undiscounted subscription — all ten fields, with the
 * `automatic` anchor and the `self` issuer the real response carries. Recording
 * nulls there instead would fabricate settings the response never had, so this
 * profile is the one the server must ACCEPT, not hold.
 */
export const scheduleDefaultSettings = (over: Over = {}) => ({
  application_fee_percent: null,
  automatic_tax: { enabled: false, liability: null },
  billing_cycle_anchor: "automatic",
  collection_method: "charge_automatically",
  default_payment_method: null,
  default_source: null,
  description: null,
  invoice_settings: { issuer: { type: "self" } },
  on_behalf_of: null,
  transfer_data: null,
  ...over,
});

/** The ordinary phase settings, excluding the four fields that become the
 * request body. `collection_method: null` INHERITS the verified default. */
export const schedulePhaseSettings = (over: Over = {}) => ({
  add_invoice_items: [],
  application_fee_percent: null,
  billing_cycle_anchor: null,
  collection_method: null,
  currency: "eur",
  default_payment_method: null,
  default_tax_rates: [],
  description: null,
  invoice_settings: null,
  metadata: {},
  on_behalf_of: null,
  transfer_data: null,
  trial_end: null,
  ...over,
});

/** A phase item as the response carries it, including the legacy `plan` mirror
 * of `price` that the canonical payload normalises away only after confirming
 * the two agree. */
export const schedulePhaseItem = (
  item: { priceId: string; quantity: number },
  over: Over = {},
) => ({
  price: item.priceId,
  plan: item.priceId,
  quantity: item.quantity,
  metadata: {},
  tax_rates: [],
  ...over,
});

/** The two-phase schedule a period-end reduction must produce. */
export const reductionSchedule = (
  input: {
    nowSeconds: number;
    currentItems: { priceId: string; quantity: number }[];
    nextItems: { priceId: string; quantity: number }[];
    periodEnd: number;
    periodStart: number;
    phaseOver?: Over;
  },
  over: Over = {},
) => ({
  id: "sub_sched_1",
  object: "subscription_schedule",
  livemode: false,
  status: "active",
  end_behavior: "release",
  customer: COMMERCIAL_CUSTOMER,
  subscription: COMMERCIAL_SUBSCRIPTION,
  default_settings: scheduleDefaultSettings(),
  phases: [
    {
      ...schedulePhaseSettings(input.phaseOver),
      start_date: input.periodStart,
      end_date: input.periodEnd,
      proration_behavior: "none",
      items: input.currentItems.map((item) => schedulePhaseItem(item)),
    },
    {
      ...schedulePhaseSettings(input.phaseOver),
      start_date: input.periodEnd,
      end_date: null,
      proration_behavior: "none",
      items: input.nextItems.map((item) => schedulePhaseItem(item)),
    },
  ],
  ...over,
});

/** The adopted-but-not-yet-updated schedule `from_subscription` returns: one
 * phase mirroring the subscription, with its full ordinary settings. */
export const adoptedSchedule = (
  input: {
    periodStart: number;
    periodEnd: number;
    items: { priceId: string; quantity: number }[];
    phaseOver?: Over;
    defaultsOver?: Over;
  },
  over: Over = {},
) => ({
  id: "sub_sched_1",
  object: "subscription_schedule",
  livemode: false,
  status: "active",
  end_behavior: "release",
  customer: COMMERCIAL_CUSTOMER,
  subscription: COMMERCIAL_SUBSCRIPTION,
  default_settings: scheduleDefaultSettings(input.defaultsOver),
  phases: [
    {
      ...schedulePhaseSettings(input.phaseOver),
      start_date: input.periodStart,
      end_date: input.periodEnd,
      // The adopted phase mirrors the subscription, which DOES prorate; the
      // canonical request overrides that to `none` at both levels on purpose.
      proration_behavior: "create_prorations",
      items: input.items.map((item) => schedulePhaseItem(item)),
    },
  ],
  ...over,
});

/* ----------------------------- refund fixtures ---------------------------- */

export const REFUND_INVOICE = "in_first";
export const REFUND_PAYMENT_INTENT = "pi_first";

export const refundableInvoice = (nowSeconds: number, over: Over = {}) =>
  paidInvoice(nowSeconds, {
    id: REFUND_INVOICE,
    amount_paid: APPROVED_MINOR.growthBase,
    status_transitions: { paid_at: nowSeconds - 3 * 86_400 },
    ...over,
  });

/**
 * An InvoicePayment. `amount_paid` is the ALLOCATION to this invoice and may be
 * smaller than the linked PaymentIntent's received total, which is precisely the
 * ambiguity the refund path must hold rather than guess.
 */
export const invoicePayment = (over: Over = {}) => ({
  id: "inpay_1",
  object: "invoice_payment",
  invoice: REFUND_INVOICE,
  status: "paid",
  currency: "eur",
  amount_paid: APPROVED_MINOR.growthBase,
  payment: { type: "payment_intent", payment_intent: REFUND_PAYMENT_INTENT },
  ...over,
});

export const paymentIntent = (over: Over = {}) => ({
  id: REFUND_PAYMENT_INTENT,
  object: "payment_intent",
  livemode: false,
  status: "succeeded",
  currency: "eur",
  customer: COMMERCIAL_CUSTOMER,
  amount: APPROVED_MINOR.growthBase,
  amount_received: APPROVED_MINOR.growthBase,
  ...over,
});

/**
 * A Refund. Note there is deliberately NO `livemode` field: the current Refund
 * object does not expose one, and mode is established by the verified account
 * plus the exact linked payment.
 *
 * The metadata names the case the dispatch sent, because that is what the
 * provider echoes back. An empty default would have made the positive test
 * untruthful to the request the server actually makes, and it is the one piece
 * of evidence that proves a refund belongs to THIS approved case.
 */
export const refundObject = (over: Over = {}) => ({
  id: "re_1",
  object: "refund",
  status: "succeeded",
  currency: "eur",
  amount: APPROVED_MINOR.growthBase,
  payment_intent: REFUND_PAYMENT_INTENT,
  charge: "ch_1",
  metadata: { milo_refund_case: "CASE-1" },
  ...over,
});

export const list = (data: unknown[], hasMore = false) => ({
  object: "list",
  data,
  has_more: hasMore,
});
