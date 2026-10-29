/**
 * The EXPORTED commercial server paths, driven against the ACTUAL frozen SQL.
 *
 * This suite exists because the other commercial tests cannot establish the
 * decisive durability claims on their own: a transition mock that returns
 * `true` proves nothing about the real compare-and-set, the real transition
 * table, append-only evidence ids or the append-once reduction payload. Here
 * the production functions (`prepareSubscriptionChange`,
 * `confirmSubscriptionChange`, `requestSubscriptionCancellation`,
 * `reverseSubscriptionCancellation`, `executeApprovedRefund`) run unchanged,
 * and every database call they make is routed through the production
 * `supabaseAdmin.rpc` / `supabaseAdmin.from` adapter into a disposable
 * in-process PGlite loaded from the frozen foundation
 * (`20261028183000`) and the frozen commercial migration (`20261028223000`),
 * verbatim.
 *
 * Nothing connects to a database server, to Supabase or to Stripe: the provider
 * is a deterministic local fake injected through `deps.fetch`, and the only
 * writes are the ones the production code itself performs through the RPCs.
 *
 * WHAT THIS IS NOT. PGlite is single-connection, so the races below are
 * deterministic interleavings of awaited steps — real multi-connection
 * PostgreSQL concurrency and the ACL/privacy surface were accepted separately
 * and are not re-proved here. No provider behaviour is established by any of
 * it.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOpenOperationState,
  itemStateFingerprintInput,
  parseSelectionDetail,
  readCommercialSubscriptionState,
  selectionFingerprintInput,
} from "./stripe-commercial";
import { STRIPE_LIFECYCLE_API_VERSION, buildPriceRegistry } from "./stripe-lifecycle";
import {
  APPROVED_MINOR,
  COMMERCIAL_ACCOUNT_LIVE,
  COMMERCIAL_ACCOUNT_TEST,
  COMMERCIAL_CUSTOMER,
  COMMERCIAL_CUSTOMER_LIVE,
  COMMERCIAL_ENV,
  COMMERCIAL_OWNER,
  COMMERCIAL_SUBSCRIPTION,
  COMMERCIAL_SUBSCRIPTION_LIVE,
  DEFAULT_PRICE_OBJECTS,
  LIVE_PRICE_IDS,
  PRICE_IDS,
  PRODUCT_IDS,
  REFUND_INVOICE,
  REFUND_PAYMENT_INTENT,
  adoptedSchedule,
  growthSubscription,
  liveGrowthSubscription,
  liveProWithSeats,
  livePaidInvoice,
  invoicePayment,
  list,
  paidInvoice,
  paymentIntent,
  proWithSeatsSubscription,
  prorationPreview,
  recurringPreview,
  reductionSchedule,
  refundObject,
  refundableInvoice,
  subscriptionItem,
  updateInvoice,
} from "./stripe-commercial-fixtures";

/* -------------------------------------------------------------------------- */
/* The production database adapter, pointed at real SQL                       */
/* -------------------------------------------------------------------------- */

let db: PGlite;
/** Every RPC the production code issued, in order, with its exact arguments. */
let rpcTrace: { name: string; args: Record<string, unknown> }[];
/** The SQL errors the production code SWALLOWED into a hold reason. Recorded so
 * a "held" assertion can be shown to be the hold under test rather than an
 * accidental adapter fault. */
let sqlErrors: { name: string; message: string }[];
/** Hooks that make one named RPC fail BEFORE its write, or commit and then lose
 * its acknowledgment. Keyed by RPC name. */
type RpcHook = (args: Record<string, unknown>, invoke: () => Promise<unknown>) => Promise<unknown>;
let rpcHooks: Map<string, RpcHook>;
/** Every scoped table SELECT the production code issued, with the exact column
 * list and equality filters IT supplied. */
let scopedReads: {
  table: string;
  columns: string;
  filters: { column: string; value: unknown }[];
  found: boolean;
}[];

/** `p_reduction_payload` is the only jsonb argument in the frozen contract. */
const JSONB_ARGS = new Set(["p_reduction_payload"]);

const scalarName = (name: string) => name;

/**
 * Make a PGlite value look like what the real client hands the production code.
 *
 * `supabaseAdmin` speaks JSON over HTTP, so a `timestamptz` arrives as an ISO
 * STRING and an `int8` as a number — not as a `Date` or a `bigint`. Reproducing
 * that is part of exercising the production adapter honestly: the server reads
 * `created_at` with `Date.parse` and `amount_due` with `Number`.
 */
function jsonLike(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(jsonLike);
  if (value && typeof value === "object" && value.constructor === Object)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonLike(item)]),
    );
  return value;
}

async function callSql(name: string, args: Record<string, unknown>): Promise<unknown> {
  const keys = Object.keys(args);
  const placeholders = keys
    .map((key, index) => `${key} => $${index + 1}${JSONB_ARGS.has(key) ? "::jsonb" : ""}`)
    .join(", ");
  const values = keys.map((key) => {
    const value = args[key];
    if (value === undefined) return null;
    if (JSONB_ARGS.has(key)) return value === null ? null : JSON.stringify(value);
    return value;
  });
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM public.${name}(${placeholders})`,
    values,
  );
  // A scalar-returning function yields exactly one column named after itself;
  // `supabaseAdmin.rpc` returns that value directly, and a TABLE-returning one
  // returns the row array. The adapter reproduces both shapes.
  const fields = result.fields ?? [];
  if (fields.length === 1 && fields[0].name === scalarName(name))
    return jsonLike(result.rows[0]?.[name] ?? null);
  return result.rows.map((row) => jsonLike(row));
}

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

import {
  confirmSubscriptionChange,
  executeApprovedRefund,
  prepareSubscriptionChange,
  requestSubscriptionCancellation,
  reverseSubscriptionCancellation,
} from "./stripe-commercial.server";
// The EXPORTED lifecycle entry point, so the guarded projection is reached the
// way a real delivery reaches it, not by a handwritten RPC call.
import { STRIPE_PROJECTION_RPC, receiveStripeWebhook } from "./stripe-lifecycle.server";

/* -------------------------------------------------------------------------- */
/* Install the frozen SQL, verbatim                                           */
/* -------------------------------------------------------------------------- */

const releasedSql = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");

/**
 * The local synthetic prerequisites the released migrations need: the Supabase
 * roles, the auth schema, a faithful copy of the live entitlements table and
 * the pre-existing role/workspace objects the released workspace-entity
 * migration depends on. Nothing here stands in for code under test.
 */
const BOOTSTRAP_SQL = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
  INSERT INTO auth.users VALUES('${COMMERCIAL_OWNER}','owner@example.test');
  CREATE TABLE public.entitlements(
    user_id uuid PRIMARY KEY,
    plan_id text NOT NULL DEFAULT 'freePreview',
    status text NOT NULL DEFAULT 'freePreview',
    current_period_end timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    provider text NOT NULL DEFAULT 'paddle',
    provider_customer_id text,
    provider_subscription_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now());
  GRANT SELECT ON public.entitlements TO authenticated;
  GRANT ALL ON public.entitlements TO service_role;
  ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
  CREATE TYPE public.app_role AS ENUM ('owner','member');
  CREATE TABLE public.user_roles(user_id uuid NOT NULL, role public.app_role NOT NULL,
    UNIQUE (user_id, role));
  CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
  CREATE TABLE public.workspaces(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now());`;

const RELEASED_DEPENDENCIES = [
  "20260726120000_workspace_entities.sql",
  "20260911020000_project_team_reads.sql",
  "20260911030000_project_team_membership.sql",
] as const;

/** The RELEASED seat counter, sliced verbatim out of its own migration exactly
 * as the accepted SQL suite does, so the capacity read under test aggregates
 * the shipped arithmetic. */
const SEAT_COUNTER_SQL = (() => {
  const source = releasedSql("20260914150000_project_team_seats.sql");
  const start = source.indexOf("CREATE FUNCTION public.count_project_team_seats(");
  const end = source.indexOf("\n$$;", start);
  if (start < 0 || end < 0) throw new Error("released count_project_team_seats not found");
  return source.slice(start, end + "\n$$;".length);
})();

const FOUNDATION_SQL = releasedSql("20261028183000_stripe_subscription_lifecycle.sql");
const COMMERCIAL_SQL = releasedSql("20261028223000_stripe_commercial_operations.sql");

/* -------------------------------------------------------------------------- */
/* Deterministic fake provider                                                */
/* -------------------------------------------------------------------------- */

/**
 * "Now" is anchored to the REAL clock, because the durable `created_at` the
 * retention guard measures against is written by the database's own
 * `clock_timestamp()`. A fixed fake epoch would put every operation three years
 * in the future relative to its own row and the strict `<24h` guard would never
 * trip — so the deadline assertions below would prove nothing.
 */
const NOW_MS = Date.now();
const NOW_S = Math.floor(NOW_MS / 1000);
const PERIOD_END = NOW_S + 20 * 86_400;
const PERIOD_START = NOW_S - 10 * 86_400;
const QUOTED_INCREASE = 12_300;
const UPDATED_INVOICE = "in_update";
const OPERATION = "00000000-0000-4000-8000-0000000000a1";
const OPERATION_B = "00000000-0000-4000-8000-0000000000a2";
const QUOTE = "00000000-0000-4000-8000-0000000000b1";
const QUOTE_B = "00000000-0000-4000-8000-0000000000b2";
/** A real second auth user, so an out-of-scope operation row can exist. */
const OTHER_OWNER = "00000000-0000-4000-8000-0000000000c1";

type Handler = (url: URL, init: RequestInit) => unknown;
let routes: Record<string, Handler>;
let calls: {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}[];
let subscriptionQueue: unknown[];
let scheduleQueue: unknown[];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const PAID_ITEMS = [
  { priceId: PRICE_IDS.proBase, quantity: 1 },
  { priceId: PRICE_IDS.proSeat, quantity: 3 },
];
const TARGET_ITEMS = [{ priceId: PRICE_IDS.growthBase, quantity: 1 }];

const adoptedScheduleFixture = (over: Record<string, unknown> = {}) =>
  adoptedSchedule({ periodStart: PERIOD_START, periodEnd: PERIOD_END, items: PAID_ITEMS }, over);
const reducedScheduleFixture = (over: Record<string, unknown> = {}) =>
  reductionSchedule(
    {
      nowSeconds: NOW_S,
      currentItems: PAID_ITEMS,
      nextItems: TARGET_ITEMS,
      periodEnd: PERIOD_END,
      periodStart: PERIOD_START,
    },
    over,
  );

const proAfterUpdate = (over: Record<string, unknown> = {}) =>
  growthSubscription(NOW_S, {
    items: {
      object: "list",
      has_more: false,
      data: [
        subscriptionItem(
          { id: "si_base", priceId: PRICE_IDS.proBase, productId: PRODUCT_IDS.pro, quantity: 1 },
          NOW_S,
        ),
      ],
    },
    latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE),
    ...over,
  });

const postsTo = (path: string) =>
  calls.filter((call) => call.method === "POST" && call.path === path);
const providerPosts = () => calls.filter((call) => call.method === "POST");
const rpcArgs = (name: string) =>
  rpcTrace.filter((entry) => entry.name === name).map((entry) => entry.args);
const rpcNames = () => rpcTrace.map((entry) => entry.name);

/* -------------------------------------------------------------------------- */
/* Local synthetic owner state                                                */
/* -------------------------------------------------------------------------- */

const exec = (sql: string, params: unknown[] = []) => db.query(sql, params);
const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

/** The owner's mapped customer and a trusted, grant-eligible projection, so the
 * frozen `verified_baseline` can PROVE the allowance the gate measures. */
const seedOwner = async (
  over: { planId?: string; seats?: number; status?: string; paid?: boolean } = {},
) => {
  await exec("SELECT public.stripe_upsert_customer($1,$2,$3,$4)", [
    COMMERCIAL_OWNER,
    COMMERCIAL_ACCOUNT_TEST,
    "test",
    COMMERCIAL_CUSTOMER,
  ]);
  await exec(
    `INSERT INTO public.stripe_subscriptions(user_id,account_id,mode,subscription_id,plan_id,
       status,seat_quantity,current_period_end,cancel_at_period_end,latest_invoice_paid,
       observed_at,last_event_created)
     VALUES($1,$2,'test',$3,$4,$5,$6,$7,false,$8,$9,1)
     ON CONFLICT (user_id,account_id,mode) DO UPDATE SET
       plan_id=excluded.plan_id, status=excluded.status, seat_quantity=excluded.seat_quantity,
       current_period_end=excluded.current_period_end,
       latest_invoice_paid=excluded.latest_invoice_paid`,
    [
      COMMERCIAL_OWNER,
      COMMERCIAL_ACCOUNT_TEST,
      COMMERCIAL_SUBSCRIPTION,
      over.planId ?? "growth",
      over.status ?? "active",
      over.seats ?? 0,
      new Date(PERIOD_END * 1000).toISOString(),
      over.paid ?? true,
      // OLDER than the observations a later reconciliation reports, so the
      // foundation's own staleness rule does not ignore them.
      new Date(NOW_MS - 86_400_000).toISOString(),
    ],
  );
  // A MIGRATED workspace with a persisted billing country, which is what makes
  // the market resolvable and the project count trustworthy.
  await exec(
    `INSERT INTO public.workspace_meta(user_id,billing_profile)
     VALUES($1,'{"billingCountry":"DE"}'::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET billing_profile=excluded.billing_profile`,
    [COMMERCIAL_OWNER],
  );
};

/** Projects in the owner's MIGRATED per-entity store — the rows the frozen
 * project count and the released team FKs both read. */
const seedProjects = async (ids: string[]) => {
  for (const id of ids)
    await exec(
      `INSERT INTO public.workspace_entities(user_id,collection,entity_id,data)
       VALUES($1,'projects',$2,'{}'::jsonb) ON CONFLICT DO NOTHING`,
      [COMMERCIAL_OWNER, id],
    );
};
/** One distinct PERSON holding a role on several projects: the released counter
 * must charge exactly one seat for them. */
const seedTeamPerson = async (id: string, email: string, projects: string[], role = "editor") => {
  await exec("INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, email]);
  for (const project of projects)
    await exec(
      `INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role)
       VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [COMMERCIAL_OWNER, project, id, role],
    );
};
/** A PENDING invitation, which the released counter charges a seat for. */
const seedInvitation = async (project: string, email: string, role = "editor") =>
  exec(
    `INSERT INTO public.project_team_invitations(
       owner_id,project_id,invite_id,recipient_email,role,expires_at)
     VALUES($1,$2,gen_random_uuid(),$3,$4,now()+interval '7 days')`,
    [COMMERCIAL_OWNER, project, email, role],
  );

/** The approved refund case, recorded through the frozen RPC. */
const seedRefundCase = async (over: { amount?: number; basis?: string } = {}) =>
  exec(
    "SELECT public.stripe_commercial_record_refund_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    [
      "CASE-1",
      COMMERCIAL_OWNER,
      COMMERCIAL_ACCOUNT_TEST,
      "test",
      REFUND_INVOICE,
      COMMERCIAL_SUBSCRIPTION,
      "growth",
      over.amount ?? APPROVED_MINOR.growthBase,
      "eur",
      over.basis ?? "firstPayment14Day",
      "cancelAtPeriodEndSeparately",
      "retainUntilPeriodEnd",
      "operator:rafal",
      new Date(NOW_MS - 2 * 86_400_000).toISOString(),
    ],
  );

/**
 * Create the operation row through the REAL `begin_operation`, with exactly the
 * arguments the production server computes, so a later production attempt
 * RESUMES it instead of being refused as a mismatch.
 */
const beginDirect = async (input: {
  operation?: string;
  kind: "plan_change" | "seat_change";
  quote: string;
  plan: string;
  seats: number;
  direction: "increase" | "decrease";
  prorationDate: number;
  selection: string;
  baselineInvoice?: string | null;
}) =>
  exec(
    "SELECT * FROM public.stripe_commercial_begin_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10,$11)",
    [
      input.operation ?? OPERATION,
      COMMERCIAL_OWNER,
      COMMERCIAL_ACCOUNT_TEST,
      "test",
      input.kind,
      COMMERCIAL_SUBSCRIPTION,
      digest({
        mode: "test",
        quoteId: input.quote,
        subscription: COMMERCIAL_SUBSCRIPTION,
        plan: input.plan,
        seats: input.seats,
        direction: input.direction,
        prorationDate: input.prorationDate,
      }),
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${input.operation ?? OPERATION}`,
      input.quote,
      input.baselineInvoice ?? "in_base",
      input.selection,
    ],
  );

const INCREASE_SELECTION = selectionFingerprintInput({
  targetPlanId: "pro",
  targetSeatQuantity: 0,
  baseItemId: "si_base",
  basePriceId: PRICE_IDS.proBase,
  seatItemId: null,
  seatPriceId: null,
});
const DECREASE_SELECTION = selectionFingerprintInput({
  targetPlanId: "growth",
  targetSeatQuantity: 0,
  baseItemId: "si_base",
  basePriceId: PRICE_IDS.growthBase,
  seatItemId: "si_seat",
  seatPriceId: null,
});

interface OperationSnapshot {
  state: string;
  attempts: number;
  invoice_id: string | null;
  refund_id: string | null;
  schedule_id: string | null;
  selection_detail: string | null;
  baseline_invoice_id: string | null;
  baseline_known: boolean;
  baseline_plan_id: string | null;
  baseline_seat_quantity: number | null;
  refusal_code: string | null;
  reduction_dispatch_payload: unknown;
  idempotency_key: string;
}
const operationRow = (operation = OPERATION) =>
  one<OperationSnapshot>(
    `SELECT state,attempts,invoice_id,refund_id,schedule_id,selection_detail,baseline_invoice_id,
            baseline_known,baseline_plan_id,baseline_seat_quantity,refusal_code,
            reduction_dispatch_payload,idempotency_key
       FROM public.stripe_commercial_operations WHERE operation_id=$1`,
    [operation],
  );
const reservationRow = (caseId = "CASE-1") =>
  one<{ state: string; refund_id: string | null; amount: string }>(
    "SELECT state,refund_id,amount FROM public.stripe_refund_reservations WHERE case_id=$1",
    [caseId],
  );

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP_SQL);
  for (const file of RELEASED_DEPENDENCIES) await db.exec(releasedSql(file));
  await db.exec(SEAT_COUNTER_SQL);
  await db.exec(FOUNDATION_SQL);
  await db.exec(COMMERCIAL_SQL);
});
afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  await db.exec(`TRUNCATE public.stripe_refund_reservations, public.stripe_refund_policy_uses,
      public.stripe_refund_invoice_ledger, public.stripe_refund_cases,
      public.stripe_commercial_operations, public.stripe_commercial_quotes;
    TRUNCATE public.stripe_checkout_requests, public.stripe_webhook_receipts,
      public.stripe_subscriptions, public.stripe_account_leases, public.stripe_customers;
    DELETE FROM public.entitlements;
    TRUNCATE public.project_team_members, public.project_team_invitations,
      public.project_team_audit;
    DELETE FROM public.workspace_entities;
    DELETE FROM public.workspace_meta;`);

  rpcTrace = [];
  sqlErrors = [];
  rpcHooks = new Map();
  scopedReads = [];
  calls = [];
  subscriptionQueue = [];
  scheduleQueue = [];

  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    rpcTrace.push({ name, args: { ...args } });
    const invoke = () => callSql(name, args);
    const hook = rpcHooks.get(name);
    try {
      const data = hook ? await hook(args, invoke) : await invoke();
      return { data, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "sql";
      sqlErrors.push({ name, message });
      return { data: null, error: { message } };
    }
  });

  // The production minimal scoped SELECT, translated to real SQL. It reads a
  // FIXED column list and writes nothing. Every read is RECORDED exactly as the
  // production code issued it — table, column list, equality filters and
  // whether a row came back — because only the arguments the production code
  // actually supplied can prove the scope. A handwritten SQL query with the
  // wrong owner proves nothing about this call site.
  mocks.from.mockImplementation((table: string) => ({
    select: (columns: string) => {
      const filters: { column: string; value: unknown }[] = [];
      const builder = {
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return builder;
        },
        async maybeSingle() {
          const where = filters
            .map((filter, index) => `${filter.column}=$${index + 1}`)
            .join(" AND ");
          try {
            const rows = await db.query<Record<string, unknown>>(
              `SELECT ${columns} FROM public.${table}${where ? ` WHERE ${where}` : ""}`,
              filters.map((filter) => filter.value),
            );
            const data = rows.rows[0] ? jsonLike(rows.rows[0]) : null;
            scopedReads.push({ table, columns, filters: [...filters], found: data !== null });
            return { data, error: null };
          } catch (error) {
            scopedReads.push({ table, columns, filters: [...filters], found: false });
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : "sql" },
            };
          }
        },
      };
      return builder;
    },
  }));

  routes = {
    // Answered PER KEY, because the account verification is per mode: a live
    // request must be answered by the live account or the whole read fails.
    "GET /v1/account": (_url, init) =>
      json({
        id: String((init.headers as Record<string, string>)?.Authorization ?? "").includes(
          "rk_live",
        )
          ? COMMERCIAL_ACCOUNT_LIVE
          : COMMERCIAL_ACCOUNT_TEST,
        object: "account",
      }),
    [`GET /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`]: () =>
      json(subscriptionQueue.length > 0 ? subscriptionQueue.shift() : growthSubscription(NOW_S)),
    [`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`]: () => json(proAfterUpdate()),
    "POST /v1/invoices/create_preview": (_url, init) => {
      const body = new URLSearchParams(String(init.body ?? ""));
      if (body.get("preview_mode") === "recurring")
        return json(
          recurringPreview({ subtotalMinor: APPROVED_MINOR.proBase, totalMinor: 26_910 }),
        );
      return json(
        prorationPreview({
          prorationDate: NOW_S,
          amountDue: QUOTED_INCREASE,
          creditMinor: -5_000,
          chargeMinor: 18_000,
        }),
      );
    },
    [`GET /v1/invoices/${UPDATED_INVOICE}`]: () => json(updateInvoice(NOW_S, QUOTED_INCREASE)),
    [`GET /v1/invoices/${REFUND_INVOICE}`]: () => json(refundableInvoice(NOW_S)),
    "GET /v1/invoices": () => json(list([refundableInvoice(NOW_S)])),
    "GET /v1/invoice_payments": () => json(list([invoicePayment()])),
    [`GET /v1/payment_intents/${REFUND_PAYMENT_INTENT}`]: () => json(paymentIntent()),
    "GET /v1/refunds": () => json(list([])),
    "POST /v1/refunds": () => json(refundObject()),
    "POST /v1/subscription_schedules": () => json(adoptedScheduleFixture()),
    "POST /v1/subscription_schedules/sub_sched_1": () => json(reducedScheduleFixture()),
    "GET /v1/subscription_schedules/sub_sched_1": () =>
      json(scheduleQueue.length > 0 ? scheduleQueue.shift() : reducedScheduleFixture()),
  };
  for (const id of Object.keys(DEFAULT_PRICE_OBJECTS))
    routes[`GET /v1/prices/${id}`] = () => json(DEFAULT_PRICE_OBJECTS[id]);

  mocks.fetch.mockImplementation(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({
      url: url.href,
      path: url.pathname,
      method,
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: init.body ? String(init.body) : "",
    });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return json({ error: { message: "unrouted" } }, 404);
    const result = await handler(url, init);
    return result instanceof Response ? result : json(result);
  });
});

const deps = (over: { now?: number | (() => number); env?: Record<string, string> } = {}) => ({
  env: over.env ?? COMMERCIAL_ENV,
  now: over.now ?? NOW_MS,
  fetch: mocks.fetch as unknown as typeof fetch,
});

type Plan = "starter" | "growth" | "pro" | "agency";
const prepare = (
  over: {
    planId?: Plan;
    seats?: number;
    quoteId?: string;
    now?: number | (() => number);
    /** The REAL supported override: `deps` reads `over.env`, so a rotated
     * catalogue passed here genuinely reaches `buildPriceRegistry`. */
    env?: Record<string, string>;
  } = {},
) =>
  prepareSubscriptionChange(
    {
      userId: COMMERCIAL_OWNER,
      quoteId: over.quoteId ?? QUOTE,
      mode: "test",
      targetPlanId: over.planId ?? "pro",
      targetSeatQuantity: over.seats ?? 0,
    },
    deps(over),
  );
const confirm = (
  over: {
    planId?: Plan;
    seats?: number;
    amount?: number;
    quoteId?: string;
    operationId?: string;
    userId?: string;
    now?: number | (() => number);
    env?: Record<string, string>;
  } = {},
) =>
  confirmSubscriptionChange(
    {
      userId: over.userId ?? COMMERCIAL_OWNER,
      operationId: over.operationId ?? OPERATION,
      quoteId: over.quoteId ?? QUOTE,
      mode: "test",
      targetPlanId: over.planId ?? "pro",
      targetSeatQuantity: over.seats ?? 0,
      expectedAmountMinor: over.amount ?? QUOTED_INCREASE,
      expectedCurrency: "eur",
    },
    deps(over),
  );

/** Prepare an increase so the durable quote exists, exactly as a caller would. */
const prepareIncrease = async () => {
  await seedOwner();
  const prepared = await prepare();
  // Any SQL error that reached a hold is surfaced here, so a "held" assertion
  // below can never pass because of an accidental adapter fault.
  if (!prepared.ok) throw new Error(`prepare: ${prepared.reason} ${JSON.stringify(sqlErrors)}`);
  return prepared;
};
/** Prepare the pro(3 seats) → growth(0) reduction. */
const prepareReduction = async () => {
  await seedOwner({ planId: "pro", seats: 3 });
  subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
  const prepared = await prepare({ planId: "growth", seats: 0 });
  if (!prepared.ok) throw new Error(`prepare: ${prepared.reason}`);
  return prepared;
};
const confirmReduction = (over: Parameters<typeof confirm>[0] = {}) =>
  confirm({ planId: "growth", seats: 0, amount: 0, ...over });

/** A deferred promise, used to park one awaited step while another runs. */
const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const registry = () => {
  const built = buildPriceRegistry("test", COMMERCIAL_ENV);
  if (!built.ok) throw new Error(`fixture registry: ${built.reason}`);
  return built.registry;
};
const stateOf = (raw: unknown) => {
  const read = readCommercialSubscriptionState({
    raw,
    mode: "test",
    customerId: COMMERCIAL_CUSTOMER,
    registry: registry(),
    nowSeconds: NOW_S,
  });
  if (!read.ok) throw new Error(`fixture state: ${read.reason}`);
  return read.value;
};

/* ========================================================================== */
/* The adapter itself                                                         */
/* ========================================================================== */

describe("the production database adapter reaches the frozen SQL", () => {
  it("installs both frozen migrations and routes named RPC arguments correctly", async () => {
    await seedOwner();
    const current = await one<{ customer_id: string; plan_id: string }>(
      "SELECT * FROM public.stripe_commercial_current_subscription($1,$2,$3)",
      [COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test"],
    );
    expect(current).toMatchObject({ customer_id: COMMERCIAL_CUSTOMER, plan_id: "growth" });
    // The production adapter returns a TABLE result as rows and a scalar result
    // as the bare value, which is what `supabaseAdmin.rpc` does.
    const rows = await mocks.rpc("stripe_commercial_current_subscription", {
      p_user: COMMERCIAL_OWNER,
      p_account: COMMERCIAL_ACCOUNT_TEST,
      p_mode: "test",
    });
    expect(Array.isArray((rows as { data: unknown }).data)).toBe(true);
    const scalar = await mocks.rpc("stripe_commercial_plan_rank", { p_plan: "pro" });
    expect((scalar as { data: unknown }).data).toBe(3);
  });
});

/* ========================================================================== */
/* Track A — monotone state, adapter and concurrent recovery                  */
/* ========================================================================== */

describe("A1/A3 — an increase through real SQL: capture, then both proofs", () => {
  it("prepares, dispatches and applies with every advance passing its expected state", async () => {
    await prepareIncrease();
    const quote = await one<{ selection_fingerprint: string; consumed_by: string | null }>(
      "SELECT selection_fingerprint, consumed_by FROM public.stripe_commercial_quotes WHERE quote_id=$1",
      [QUOTE],
    );
    expect(quote.consumed_by).toBeNull();

    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    const result = await confirm();
    expect(result).toMatchObject({ ok: true, state: "applied", amountDueMinor: QUOTED_INCREASE });

    // The DURABLE row, written only by the frozen RPCs.
    const row = await operationRow();
    expect(row).toMatchObject({
      state: "applied",
      invoice_id: UPDATED_INVOICE,
      baseline_invoice_id: "in_base",
      selection_detail: selectionFingerprintInput({
        targetPlanId: "pro",
        targetSeatQuantity: 0,
        baseItemId: "si_base",
        basePriceId: PRICE_IDS.proBase,
        seatItemId: null,
        seatPriceId: null,
      }),
      baseline_known: true,
      baseline_plan_id: "growth",
      baseline_seat_quantity: 0,
    });
    // The selection the quote was priced for is the one that was persisted.
    expect(digest(row.selection_detail)).toBe(quote.selection_fingerprint);
    // The quote was consumed by THIS operation.
    expect(
      (
        await one<{ consumed_by: string }>(
          "SELECT consumed_by FROM public.stripe_commercial_quotes WHERE quote_id=$1",
          [QUOTE],
        )
      ).consumed_by,
    ).toBe(OPERATION);

    // Every emitted transition carried an expected state and was ACCEPTED by
    // the real compare-and-set.
    const advances = rpcArgs("stripe_commercial_advance_operation");
    expect(advances.map((args) => [args.p_expected_state, args.p_state])).toEqual([
      ["prepared", "dispatching"],
      ["dispatching", "awaiting_payment"],
    ]);
    expect(advances.every((args) => "p_reduction_payload" in args)).toBe(true);
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "applied",
      p_expected_state: "awaiting_payment",
    });
  });

  it("settles SCA through awaiting_payment → awaiting_apply → applied, with no same-state write", async () => {
    await prepareIncrease();
    // The payment is proved but the items are not yet applied.
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm()).toEqual({ ok: false, reason: "change_not_applied_base_price" });
    expect((await operationRow()).state).toBe("awaiting_apply");

    // A pending resume issues NO transition at all.
    rpcTrace = [];
    calls = [];
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () =>
      json(
        updateInvoice(NOW_S, QUOTED_INCREASE, {
          status: "open",
          amount_paid: 0,
          amount_remaining: QUOTED_INCREASE,
        }),
      );
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm()).toEqual({ ok: false, reason: "change_invoice_unpaid" });
    expect(rpcArgs("stripe_commercial_advance_operation")).toEqual([]);
    expect((await operationRow()).state).toBe("awaiting_apply");

    // Both proofs then hold and the operation finishes from awaiting_apply.
    rpcTrace = [];
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () =>
      json(updateInvoice(NOW_S, QUOTED_INCREASE));
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_expected_state: "awaiting_apply",
    });
    expect((await operationRow()).state).toBe("applied");
    // Zero further provider mutations in the settling attempts.
    expect(providerPosts()).toHaveLength(0);
  });

  it("keeps the captured invoice APPEND-ONLY against a newer latest_invoice", async () => {
    await prepareIncrease();
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    expect((await operationRow()).invoice_id).toBe(UPDATED_INVOICE);
    // A later attempt sees a different newest invoice; the capture cannot move.
    const newer = paidInvoice(NOW_S, { id: "in_NEWER", billing_reason: "subscription_update" });
    subscriptionQueue = [
      growthSubscription(NOW_S, { latest_invoice: newer }),
      proAfterUpdate({ latest_invoice: newer }),
    ];
    calls = [];
    await confirm();
    expect((await operationRow()).invoice_id).toBe(UPDATED_INVOICE);
    expect(calls.map((call) => call.path)).not.toContain("/v1/invoices/in_NEWER");
  });

  it("A1 — a foreign owner, operation or quote produces no provider mutation", async () => {
    await prepareIncrease();
    // Foreign owner: the scoped read finds nothing and `begin_operation`
    // refuses, because the owner comes from the authenticated session.
    calls = [];
    expect(await confirm({ userId: "00000000-0000-4000-8000-0000000000ff" })).toMatchObject({
      ok: false,
    });
    expect(providerPosts()).toHaveLength(0);
    expect(await operationRow()).toBeUndefined();

    // A different quote id for the same operation is a mismatch, not a resume.
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true });
    calls = [];
    expect(await confirm({ quoteId: QUOTE_B })).toEqual({ ok: false, reason: "quote_unknown" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("B2 — the first POST and its retained replay equal an INDEPENDENT literal body", async () => {
    await prepareIncrease();
    // The capture fails before its write, so the operation stays `dispatching`
    // with no invoice — the only state in which a replay is admissible.
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_state === "awaiting_payment") throw new Error("transport failed");
      return invoke();
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    await confirm();
    const first = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(first).toHaveLength(1);

    // The retry happens after the CURRENT item configuration moved: the
    // subscription's base item now has a different id, so anything re-derived
    // from the current state would name `si_moved`.
    rpcHooks.clear();
    calls = [];
    const moved = (over: Record<string, unknown> = {}) =>
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              {
                id: "si_moved",
                priceId: PRICE_IDS.growthBase,
                productId: PRODUCT_IDS.growth,
                quantity: 1,
              },
              NOW_S,
            ),
          ],
        },
        ...over,
      });
    subscriptionQueue = [moved(), moved({ latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE) })];
    // The replay is still sent, and the outcome is HELD because the
    // subscription does not carry the confirmed selection.
    expect(await confirm()).toEqual({ ok: false, reason: "change_not_applied_base_item" });
    const retry = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(retry).toHaveLength(1);

    // INDEPENDENT LITERALS, not the production encoder compared with itself.
    // The omissions matter as much as the values: no second base item, no seat
    // item, no `deleted`, no `cancel_at_period_end`, no payment method.
    const expected = [
      ["expand[]", "latest_invoice"],
      ["items[0][id]", "si_base"],
      ["items[0][price]", PRICE_IDS.proBase],
      ["items[0][quantity]", "1"],
      ["payment_behavior", "pending_if_incomplete"],
      ["proration_behavior", "always_invoice"],
      ["proration_date", String(NOW_S)],
    ];
    for (const post of [first[0], retry[0]]) {
      expect([...new URLSearchParams(post.body)].sort()).toEqual(expected);
      expect(post.path).toBe(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
      expect(post.headers["Idempotency-Key"]).toBe(
        `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
      );
    }
  });

  /**
   * The SEAT branches of the one canonical item encoder, each as a FIRST call
   * and its RETAINED replay, compared with independent literals.
   *
   * The pair matters because the retry must be the same request: an encoder that
   * re-derived an id, a price or a quantity from a current read would produce a
   * second, differently parameterised financial intent under the same key.
   */
  const seatBranchPair = async (input: {
    current: unknown;
    after: unknown;
    plan: Plan;
    seats: number;
    expected: [string, string][];
  }) => {
    // The capture fails before its write, so the operation stays `dispatching`
    // with no invoice — the only state in which a replay is admissible.
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_state === "awaiting_payment") throw new Error("transport failed");
      return invoke();
    });
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(input.after);
    subscriptionQueue = [input.current, input.after];
    await confirm({ planId: input.plan, seats: input.seats });
    const first = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(first).toHaveLength(1);

    rpcHooks.clear();
    calls = [];
    subscriptionQueue = [input.current, input.after];
    await confirm({ planId: input.plan, seats: input.seats });
    const retry = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(retry).toHaveLength(1);

    for (const post of [first[0], retry[0]]) {
      expect([...new URLSearchParams(post.body)].sort()).toEqual([...input.expected].sort());
      expect(post.headers["Idempotency-Key"]).toBe(
        `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
      );
    }
    expect(retry[0].body).toBe(first[0].body);
  };

  it("B2 — the EXISTING seat item branch: exact id, price and quantity in both bodies", async () => {
    await seedOwner({ planId: "pro", seats: 3 });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await prepare({ planId: "pro", seats: 5 })).toMatchObject({ ok: true });
    await seatBranchPair({
      current: proWithSeatsSubscription(NOW_S, 3),
      after: proWithSeatsSubscription(NOW_S, 5, {
        latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE),
      }),
      plan: "pro",
      seats: 5,
      expected: [
        ["expand[]", "latest_invoice"],
        ["items[0][id]", "si_base"],
        ["items[0][price]", PRICE_IDS.proBase],
        ["items[0][quantity]", "1"],
        ["items[1][id]", "si_seat"],
        ["items[1][price]", PRICE_IDS.proSeat],
        ["items[1][quantity]", "5"],
        ["payment_behavior", "pending_if_incomplete"],
        ["proration_behavior", "always_invoice"],
        ["proration_date", String(NOW_S)],
      ],
    });
  });

  it("B2 — the NEWLY ADDED seat item branch: no id is invented, in either body", async () => {
    await seedOwner();
    subscriptionQueue = [growthSubscription(NOW_S)];
    expect(await prepare({ planId: "pro", seats: 2 })).toMatchObject({ ok: true });
    const added = growthSubscription(NOW_S, {
      items: {
        object: "list",
        has_more: false,
        data: [
          subscriptionItem(
            { id: "si_base", priceId: PRICE_IDS.proBase, productId: PRODUCT_IDS.pro, quantity: 1 },
            NOW_S,
          ),
          subscriptionItem(
            {
              id: "si_providerassigned",
              priceId: PRICE_IDS.proSeat,
              productId: PRODUCT_IDS.pro,
              quantity: 2,
            },
            NOW_S,
          ),
        ],
      },
      latest_invoice: updateInvoice(NOW_S, QUOTED_INCREASE),
    });
    await seatBranchPair({
      current: growthSubscription(NOW_S),
      after: added,
      plan: "pro",
      seats: 2,
      // EXACTLY these keys: the added item carries price and quantity and NO
      // `id` — the provider assigns that — and no `deleted`.
      expected: [
        ["expand[]", "latest_invoice"],
        ["items[0][id]", "si_base"],
        ["items[0][price]", PRICE_IDS.proBase],
        ["items[0][quantity]", "1"],
        ["items[1][price]", PRICE_IDS.proSeat],
        ["items[1][quantity]", "2"],
        ["payment_behavior", "pending_if_incomplete"],
        ["proration_behavior", "always_invoice"],
        ["proration_date", String(NOW_S)],
      ],
    });
  });

  it("B2 — the DELETED seat item branch: both COMPLETE bodies of two real preparations", async () => {
    // A seat removal is a period-end reduction, so the deletion branch is
    // exercised where it is actually reachable: the recurring estimate for the
    // target items. The branch is proved by two real preparations and their
    // COMPLETE bodies — a filtered view of one request could not show an
    // unexpected parameter elsewhere in it.
    await seedOwner({ planId: "pro", seats: 3 });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await prepare({ planId: "growth", seats: 0 })).toMatchObject({ ok: true });
    const first = postsTo("/v1/invoices/create_preview");
    expect(first).toHaveLength(1);

    // A SECOND real preparation of the same intent, under its own quote id.
    await db.exec("DELETE FROM public.stripe_commercial_quotes;");
    calls = [];
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await prepare({ planId: "growth", seats: 0, quoteId: QUOTE_B })).toMatchObject({
      ok: true,
    });
    const second = postsTo("/v1/invoices/create_preview");
    expect(second).toHaveLength(1);

    // THE INDEPENDENT EXPECTATION, complete: the deletion tuple names the EXACT
    // existing seat item and carries no price and no quantity; the base item
    // keeps its id, target price and explicit quantity 1; the mode is the
    // documented `recurring` one with no proration parameter and no proration
    // date; and there is no third item.
    const expected = [
      ["customer", COMMERCIAL_CUSTOMER],
      ["preview_mode", "recurring"],
      ["subscription", COMMERCIAL_SUBSCRIPTION],
      ["subscription_details[items][0][id]", "si_base"],
      ["subscription_details[items][0][price]", PRICE_IDS.growthBase],
      ["subscription_details[items][0][quantity]", "1"],
      ["subscription_details[items][1][deleted]", "true"],
      ["subscription_details[items][1][id]", "si_seat"],
    ];
    for (const post of [first[0], second[0]]) {
      expect([...new URLSearchParams(post.body)].sort()).toEqual(expected);
      expect(post.path).toBe("/v1/invoices/create_preview");
      // A PREVIEW IS NOT A DUPLICABLE FINANCIAL INTENT: it carries no
      // idempotency key at all, which is the correct key behaviour here.
      expect(post.headers["Idempotency-Key"]).toBeUndefined();
      const keys = [...new URLSearchParams(post.body).keys()];
      expect(keys.some((key) => key.includes("[items][1][price]"))).toBe(false);
      expect(keys.some((key) => key.includes("[items][1][quantity]"))).toBe(false);
      expect(keys.some((key) => key.includes("[items][2]"))).toBe(false);
      expect(keys).not.toContain("subscription_details[proration_date]");
      expect(keys).not.toContain("subscription_details[proration_behavior]");
    }
    // Two independent preparations encode the identical body for the identical
    // intent.
    expect(second[0].body).toBe(first[0].body);
    // And the removal itself is what the stored reduction then schedules: the
    // reduced phase carries only the base item.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(
      await confirm({ planId: "growth", seats: 0, amount: 0, quoteId: QUOTE_B }),
    ).toMatchObject({ ok: true, state: "scheduled" });
    const phases = new URLSearchParams(postsTo("/v1/subscription_schedules/sub_sched_1")[0].body);
    expect(phases.get("phases[1][items][0][price]")).toBe(PRICE_IDS.growthBase);
    expect(phases.get("phases[1][items][1][price]")).toBeNull();
  });

  it("A1 — the scoped SELECT supplies ALL FOUR filters and a fixed column list", async () => {
    await prepareIncrease();
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    // Exactly one table read in a whole confirmation, and it is this one. On a
    // FIRST attempt there is legitimately no row yet — `begin_operation`
    // creates it afterwards — so absence here is the normal case.
    expect(scopedReads).toHaveLength(1);
    const [read] = scopedReads;
    expect(read.table).toBe("stripe_commercial_operations");
    expect(read.found).toBe(false);
    // The ACTUAL filters the production call site supplied — the operation, the
    // AUTHENTICATED owner, the VERIFIED account and the mode. Not a count, and
    // not a handwritten query of the test's own.
    expect([...read.filters].sort((a, b) => a.column.localeCompare(b.column))).toEqual([
      { column: "account_id", value: COMMERCIAL_ACCOUNT_TEST },
      { column: "mode", value: "test" },
      { column: "operation_id", value: OPERATION },
      { column: "user_id", value: COMMERCIAL_OWNER },
    ]);
    // A fixed column list: the immutable terms `read_operation` omits, nothing
    // wildcarded and no caller-visible field.
    expect(read.columns.split(",").map((column) => column.trim())).toEqual([
      "state",
      "kind",
      "subscription_id",
      "quote_id",
      "selection_detail",
      "idempotency_key",
      "baseline_invoice_id",
    ]);
    // No INSERT/UPDATE/DELETE reached the table outside the RPCs: the operation
    // row's writer is always a `stripe_commercial_*` function.
    expect(rpcNames().filter((name) => !name.startsWith("stripe_"))).toEqual([]);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["stripe_commercial_operations"]);

    // The RESUMED attempt reads the same four filters and now FINDS the row,
    // which is what proves the filters match the persisted operation.
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    expect(scopedReads).toHaveLength(2);
    expect(scopedReads[1].found).toBe(true);
    expect(scopedReads[1].filters).toEqual(read.filters);
    expect(scopedReads[1].columns).toBe(read.columns);
  });

  /**
   * A VALID, resumable persisted operation that this confirmation may not have.
   *
   * The production call is identical in every case; only the persisted row is
   * moved out of the authenticated scope, or given different immutable terms.
   * Each case must be refused with the row byte-identical afterwards and no
   * provider mutation.
   */
  it.each([
    ["ANOTHER owner", "user_id=$1", () => [OTHER_OWNER]],
    ["ANOTHER account", "account_id=$1", () => ["acct_other"]],
    ["ANOTHER mode", "mode=$1", () => ["live"]],
    ["ANOTHER kind", "kind=$1", () => ["seat_change"]],
    ["ANOTHER subscription", "subscription_id=$1", () => ["sub_test_other"]],
    ["ANOTHER quote", "quote_id=$1", () => [QUOTE_B]],
  ])(
    "A1 — refuses a valid persisted operation bound to %s, with zero mutation",
    async (_label, assignment, values) => {
      await seedOwner();
      await exec("INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT DO NOTHING", [
        OTHER_OWNER,
        "other@example.test",
      ]);
      // Two real quotes, issued before any operation exists, so the "another
      // quote" case can point at a genuinely valid one.
      subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
      if (!(await prepare()).ok) throw new Error("prepare");
      if (!(await prepare({ quoteId: QUOTE_B })).ok) throw new Error("prepare B");
      await beginDirect({
        kind: "plan_change",
        quote: QUOTE,
        plan: "pro",
        seats: 0,
        direction: "increase",
        prorationDate: NOW_S,
        selection: INCREASE_SELECTION,
      });
      await exec(
        `UPDATE public.stripe_commercial_operations SET ${assignment} WHERE operation_id=$2`,
        [...values(), OPERATION],
      );
      const before = await operationRow();
      calls = [];
      scopedReads = [];

      subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
      const result = await confirm();
      expect(result.ok).toBe(false);
      // The authenticated scope is what was asked for, and it is what decided.
      for (const read of scopedReads) {
        expect(read.filters).toContainEqual({ column: "user_id", value: COMMERCIAL_OWNER });
        expect(read.filters).toContainEqual({
          column: "account_id",
          value: COMMERCIAL_ACCOUNT_TEST,
        });
        expect(read.filters).toContainEqual({ column: "mode", value: "test" });
        expect(read.filters).toContainEqual({ column: "operation_id", value: OPERATION });
      }
      // ZERO MUTATION: no state change, no attempt increment, no evidence.
      expect(await operationRow()).toEqual(before);
      expect(providerPosts()).toHaveLength(0);
    },
  );
});

describe("A-F2 — a committed quote consumption with a lost ACK is not a refusal", () => {
  const quoteRow = () =>
    one<{ consumed_by: string | null; expires_at: string }>(
      "SELECT consumed_by, expires_at::text AS expires_at FROM public.stripe_commercial_quotes WHERE quote_id=$1",
      [QUOTE],
    );

  it("COMMITS then loses its ACK: the attempt continues and nothing becomes terminal", async () => {
    await prepareIncrease();
    // The consumption really runs against SQL; only its response is lost.
    rpcHooks.set("stripe_commercial_consume_quote", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    const result = await confirm();
    // Before the correction this returned `quote_refused`, left the operation
    // `refused` and dispatched nothing — while the quote was provably consumed
    // by this exact operation.
    expect(result).toMatchObject({ ok: true, state: "applied" });
    expect((await quoteRow()).consumed_by).toBe(OPERATION);
    expect((await operationRow()).state).toBe("applied");
    // Exactly one consumption and exactly one update POST.
    expect(rpcArgs("stripe_commercial_consume_quote")).toHaveLength(1);
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);
    // And the recovery read the scoped quote to decide.
    expect(rpcArgs("stripe_commercial_read_quote").length).toBeGreaterThan(1);
  });

  it("FAILS BEFORE THE WRITE on a healthy quote: uncertainty, not a terminal refusal", async () => {
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_consume_quote", async () => {
      throw new Error("transport failed");
    });
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm()).toEqual({ ok: false, reason: "quote_consumption_uncertain" });
    // The quote is untouched, the operation is still open and recoverable, and
    // nothing was dispatched.
    expect((await quoteRow()).consumed_by).toBeNull();
    const row = await operationRow();
    expect(row.state).toBe("prepared");
    expect(row.refusal_code).toBeNull();
    expect(providerPosts()).toHaveLength(0);

    // THE RETRY SUCCEEDS, which is the whole point: the earlier ambiguity cost
    // nothing.
    rpcHooks.clear();
    calls = [];
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect((await quoteRow()).consumed_by).toBe(OPERATION);
  });

  it("is UNCERTAIN when the recovery read also fails", async () => {
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_consume_quote", async () => {
      throw new Error("transport failed");
    });
    let reads = 0;
    rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
      reads += 1;
      if (reads > 1) throw new Error("read failed");
      return invoke();
    });
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm()).toEqual({ ok: false, reason: "quote_consumption_uncertain" });
    expect((await operationRow()).state).toBe("prepared");
    expect(providerPosts()).toHaveLength(0);
  });

  it("still REFUSES a genuinely expired quote, under the prepared compare-and-set", async () => {
    await prepareIncrease();
    // Expire the quote in SQL so the consumption's rejection is real.
    await exec(
      "UPDATE public.stripe_commercial_quotes SET expires_at=now() - interval '1 minute' WHERE quote_id=$1",
      [QUOTE],
    );
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm()).toEqual({ ok: false, reason: "quote_refused" });
    const row = await operationRow();
    expect(row).toMatchObject({ state: "refused", refusal_code: "quote_refused" });
    expect(providerPosts()).toHaveLength(0);
    // The SLOT is released — the barrier no longer reports an unresolved
    // operation (it still reports the live subscription, which is unrelated).
    expect(
      await one<{ reason: string }>("SELECT * FROM public.stripe_commercial_deletion_barrier($1)", [
        COMMERCIAL_OWNER,
      ]),
    ).toMatchObject({ reason: "subscription_live" });
    expect(isOpenOperationState((await operationRow()).state)).toBe(false);
  });

  it("still REFUSES a quote another operation consumed", async () => {
    await prepareIncrease();
    await exec(
      "UPDATE public.stripe_commercial_quotes SET consumed_at=now(), consumed_by=$2 WHERE quote_id=$1",
      [QUOTE, OPERATION_B],
    );
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm()).toEqual({ ok: false, reason: "quote_refused" });
    expect((await operationRow()).state).toBe("refused");
    expect(providerPosts()).toHaveLength(0);
  });

  /**
   * The readback evidence itself is degraded, in each of the three ways that
   * are NOT proof of a rejection. Each case runs the real `consume_quote`
   * against real SQL and perturbs only what the recovery READ returns.
   */
  /** Drop a property entirely, rather than setting it to null — which is a
   * different, PRESENT fact. */
  const without = (row: Record<string, unknown>, key: string) => {
    const copy = { ...row };
    delete copy[key];
    return copy;
  };

  const degraded: [string, (rows: Record<string, unknown>[]) => unknown][] = [
    ["an ABSENT row", () => []],
    ["an UNREADABLE row", (rows) => rows.map((row) => ({ ...row, expires_at: "not-a-timestamp" }))],
    [
      "a row with an unreadable amount",
      (rows) => rows.map((row) => ({ ...row, amount_due: "twelve thousand" })),
    ],
    [
      "a row whose bound subscription DISAGREES",
      (rows) => rows.map((row) => ({ ...row, subscription_id: "sub_test_other" })),
    ],
    [
      "a row whose bound state fingerprint DISAGREES",
      (rows) => rows.map((row) => ({ ...row, state_fingerprint: "deadbeef" })),
    ],
    // A MALFORMED consumption identity identifies nobody, so it is neither this
    // operation's consumption nor another's.
    [
      "a row whose consumer is not a UUID",
      (rows) => rows.map((row) => ({ ...row, consumed_by: "not-a-uuid" })),
    ],
    [
      "a row whose consumed_by property is OMITTED",
      (rows) => rows.map((row) => without(row, "consumed_by")),
    ],
    [
      "a row whose consumed_by property is OMITTED and whose TTL has passed",
      (rows) =>
        rows.map((row) => ({
          ...without(row, "consumed_by"),
          expires_at: new Date(NOW_MS - 60_000).toISOString(),
        })),
    ],
    // AN EMPTY UUID STRING IS NOT SQL `NULL`. Only an explicit null states that
    // nothing consumed the quote, so a blank consumer paired with a passed TTL
    // must not become the deterministic expiry refusal — it is unreadable
    // evidence, and the operation stays recoverable.
    [
      "a row whose consumer is an EMPTY string and whose TTL has passed",
      (rows) =>
        rows.map((row) => ({
          ...row,
          consumed_by: "",
          expires_at: new Date(NOW_MS - 60_000).toISOString(),
        })),
    ],
    [
      "a row whose consumer is WHITESPACE and whose TTL has passed",
      (rows) =>
        rows.map((row) => ({
          ...row,
          consumed_by: "   ",
          expires_at: new Date(NOW_MS - 60_000).toISOString(),
        })),
    ],
    // A valid OTHER consumer is only a refusal on an otherwise exact row. These
    // two are not exact, so they prove nothing about this call.
    [
      "ANOTHER consumer on a row whose bound subscription disagrees",
      (rows) =>
        rows.map((row) => ({
          ...row,
          consumed_by: OPERATION_B,
          subscription_id: "sub_test_other",
        })),
    ],
    [
      "ANOTHER consumer on a row with no state fingerprint",
      (rows) => rows.map((row) => ({ ...row, consumed_by: OPERATION_B, state_fingerprint: null })),
    ],
  ];

  it.each(degraded)(
    "treats %s as recoverable uncertainty after a no-write failure",
    async (_label, perturb) => {
      await prepareIncrease();
      // The write genuinely does not happen...
      rpcHooks.set("stripe_commercial_consume_quote", async () => {
        throw new Error("transport failed");
      });
      // ...and the recovery evidence is degraded rather than absent-and-proved.
      let reads = 0;
      rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
        reads += 1;
        const rows = (await invoke()) as Record<string, unknown>[];
        return reads > 1 ? perturb(rows) : rows;
      });
      subscriptionQueue = [growthSubscription(NOW_S)];
      calls = [];
      // Before the correction an absent row and every binding mismatch were
      // read as proof of refusal: the operation was closed `refused` and the
      // approval was burned on evidence that proves nothing about this write.
      expect(await confirm()).toEqual({ ok: false, reason: "quote_consumption_uncertain" });
      const row = await operationRow();
      expect(row.state).toBe("prepared");
      expect(row.refusal_code).toBeNull();
      expect((await quoteRow()).consumed_by).toBeNull();
      expect(providerPosts()).toHaveLength(0);

      // And it really is recoverable: the clean retry dispatches exactly once.
      rpcHooks.clear();
      calls = [];
      subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
      expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
      expect((await quoteRow()).consumed_by).toBe(OPERATION);
      expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);
    },
  );

  it.each(degraded)(
    "treats %s as recoverable uncertainty after a COMMITTED write too",
    async (_label, perturb) => {
      await prepareIncrease();
      // The consumption COMMITS and its acknowledgment is lost, so the quote is
      // really consumed by this operation — but the readback cannot show it.
      rpcHooks.set("stripe_commercial_consume_quote", async (_args, invoke) => {
        await invoke();
        throw new Error("lost acknowledgment");
      });
      let reads = 0;
      rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
        reads += 1;
        const rows = (await invoke()) as Record<string, unknown>[];
        return reads > 1 ? perturb(rows) : rows;
      });
      subscriptionQueue = [growthSubscription(NOW_S)];
      calls = [];
      expect(await confirm()).toEqual({ ok: false, reason: "quote_consumption_uncertain" });
      // Nothing terminal, nothing dispatched — and SQL's own record is intact,
      // so the next attempt resumes on the quote THIS operation already holds.
      const row = await operationRow();
      expect(row.state).toBe("prepared");
      expect(row.refusal_code).toBeNull();
      expect((await quoteRow()).consumed_by).toBe(OPERATION);
      expect(providerPosts()).toHaveLength(0);
      expect(rpcArgs("stripe_commercial_consume_quote")).toHaveLength(1);

      rpcHooks.clear();
      calls = [];
      rpcTrace = [];
      subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
      expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
      // Consumed ONCE in total: the resumed attempt recognises its own use.
      expect(rpcArgs("stripe_commercial_consume_quote")).toHaveLength(0);
      expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);
    },
  );

  /**
   * The amounts that are NOT a legitimate zero.
   *
   * `Number(null)`, `Number(false)` and `Number("")` are all 0, so on a
   * genuinely ZERO-DUE confirmation a degraded readback carrying this
   * operation's own `consumed_by` and one of these unreadable amounts looked
   * like exact bound evidence and allowed the dispatch to continue. A zero-due
   * change is a real case, which is exactly why an unreadable amount must not
   * impersonate one.
   */
  it.each<[string, unknown]>([
    ["null", null],
    ["false", false],
    ["an empty string", ""],
    ["whitespace", "   "],
  ])(
    "does not read %s as a legitimate zero amount on a ZERO-DUE confirmation",
    async (_label, amount) => {
      await prepareReduction();
      // The consumption COMMITS for this operation; only its response is lost.
      rpcHooks.set("stripe_commercial_consume_quote", async (_args, invoke) => {
        await invoke();
        throw new Error("lost acknowledgment");
      });
      let reads = 0;
      rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
        reads += 1;
        const rows = (await invoke()) as Record<string, unknown>[];
        return reads > 1 ? rows.map((row) => ({ ...row, amount_due: amount })) : rows;
      });
      subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
      calls = [];
      expect(await confirmReduction()).toEqual({
        ok: false,
        reason: "quote_consumption_uncertain",
      });
      const row = await operationRow();
      expect(row.state).toBe("prepared");
      expect(row.refusal_code).toBeNull();
      expect(row.schedule_id).toBeNull();
      expect(row.reduction_dispatch_payload).toBeNull();
      // Nothing was adopted and no phase was sent.
      expect(providerPosts()).toHaveLength(0);
      expect((await quoteRow()).consumed_by).toBe(OPERATION);

      // The legitimate zero is still read as zero: the clean retry schedules.
      rpcHooks.clear();
      calls = [];
      rpcTrace = [];
      subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
      expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });
      expect(rpcArgs("stripe_commercial_consume_quote")).toHaveLength(0);
      expect(postsTo("/v1/subscription_schedules")).toHaveLength(1);
    },
  );

  it("still READS a genuine zero and the decimal-string form of an integer", async () => {
    // The positive control for the stricter amount reader: a real zero-due
    // quote whose readback carries the same value as a JSON number, and the
    // decimal string form a bigint arrives as over HTTP, both continue.
    for (const amount of [0, "0"] as const) {
      await db.exec(`DELETE FROM public.stripe_commercial_operations;
        DELETE FROM public.stripe_commercial_quotes;`);
      await prepareReduction();
      rpcHooks.set("stripe_commercial_consume_quote", async (_args, invoke) => {
        await invoke();
        throw new Error("lost acknowledgment");
      });
      let reads = 0;
      rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
        reads += 1;
        const rows = (await invoke()) as Record<string, unknown>[];
        return reads > 1 ? rows.map((row) => ({ ...row, amount_due: amount })) : rows;
      });
      subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
      calls = [];
      expect(await confirmReduction(), String(amount)).toMatchObject({
        ok: true,
        state: "scheduled",
      });
      expect(rpcArgs("stripe_commercial_consume_quote")).toHaveLength(1);
      rpcHooks.clear();
      rpcTrace = [];
    }
  });

  it("still REFUSES an exact other consumer and an exact expired unconsumed row", async () => {
    // Both deterministic refusals survive the stricter validation: they are
    // derived from a complete, exactly bound, readable row.
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_consume_quote", async () => {
      throw new Error("transport failed");
    });
    let reads = 0;
    rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
      reads += 1;
      const rows = (await invoke()) as Record<string, unknown>[];
      // A valid other operation consumed this exact quote.
      return reads > 1 ? rows.map((row) => ({ ...row, consumed_by: OPERATION_B })) : rows;
    });
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm()).toEqual({ ok: false, reason: "quote_refused" });
    expect(await operationRow()).toMatchObject({
      state: "refused",
      refusal_code: "quote_refused",
    });
    expect(providerPosts()).toHaveLength(0);

    // And an EXPLICITLY unconsumed row whose TTL has provably passed.
    await db.exec(`DELETE FROM public.stripe_commercial_operations;
      DELETE FROM public.stripe_commercial_quotes;`);
    rpcHooks.clear();
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_consume_quote", async () => {
      throw new Error("transport failed");
    });
    reads = 0;
    rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
      reads += 1;
      const rows = (await invoke()) as Record<string, unknown>[];
      return reads > 1
        ? rows.map((row) => ({
            ...row,
            consumed_by: null,
            expires_at: new Date(NOW_MS - 60_000).toISOString(),
          }))
        : rows;
    });
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm()).toEqual({ ok: false, reason: "quote_refused" });
    expect((await operationRow()).state).toBe("refused");
    expect(providerPosts()).toHaveLength(0);
  });
});

describe("B-F1 — a contradictory or unreadable proration marker holds the PREPARE boundary", () => {
  const line = (markers: Record<string, unknown>) => ({
    id: "il_marker",
    amount: 18_000,
    period: { start: NOW_S, end: NOW_S + 20 * 86_400 },
    ...markers,
  });
  const lineList = (markers: Record<string, unknown>) => ({
    object: "list",
    has_more: false,
    data: [line(markers)],
  });

  /** The markers that must not produce a quote, in both readers. */
  const markers: [string, Record<string, unknown>, string][] = [
    [
      "legacy true against nested false",
      { proration: true, parent: { subscription_item_details: { proration: false } } },
      "conflict",
    ],
    [
      "legacy false against nested true",
      { proration: false, parent: { subscription_item_details: { proration: true } } },
      "conflict",
    ],
    [
      "legacy true against a nested STRING",
      { proration: true, parent: { subscription_item_details: { proration: "false" } } },
      "unreadable",
    ],
    [
      "a legacy STRING against nested false",
      { proration: "true", parent: { subscription_item_details: { proration: false } } },
      "unreadable",
    ],
    // A PRESENT null, in each position: stated, and not the required boolean.
    [
      "legacy true against a nested NULL",
      { proration: true, parent: { subscription_item_details: { proration: null } } },
      "unreadable",
    ],
    [
      "a legacy NULL against nested false",
      { proration: null, parent: { subscription_item_details: { proration: false } } },
      "unreadable",
    ],
  ];

  /** Nothing durable may exist after a held preview. */
  const nothingPersisted = async () => {
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
    expect(
      Number(
        (
          await one<{ count: string }>(
            "SELECT count(*)::text AS count FROM public.stripe_commercial_quotes",
          )
        ).count,
      ),
    ).toBe(0);
    expect(
      Number(
        (
          await one<{ count: string }>(
            "SELECT count(*)::text AS count FROM public.stripe_commercial_operations",
          )
        ).count,
      ),
    ).toBe(0);
    // No subscription, schedule or refund mutation was attempted either: the
    // only POSTs are the previews themselves.
    expect(providerPosts().every((post) => post.path === "/v1/invoices/create_preview")).toBe(true);
  };

  it.each(markers)(
    "holds the IMMEDIATE preview on %s, with no issued quote",
    async (_label, perturb, kind) => {
      await seedOwner();
      subscriptionQueue = [growthSubscription(NOW_S)];
      routes["POST /v1/invoices/create_preview"] = (_url, init) => {
        const body = new URLSearchParams(String(init.body ?? ""));
        if (body.get("preview_mode") === "recurring")
          return json(
            recurringPreview({ subtotalMinor: APPROVED_MINOR.proBase, totalMinor: 26_910 }),
          );
        return json(
          prorationPreview(
            {
              prorationDate: NOW_S,
              amountDue: QUOTED_INCREASE,
              creditMinor: -5_000,
              chargeMinor: 18_000,
            },
            { lines: lineList(perturb) },
          ),
        );
      };
      expect(await prepare()).toEqual({
        ok: false,
        reason: `preview_preview_line_proration_${kind}`,
      });
      await nothingPersisted();
    },
  );

  it.each(markers)(
    "holds the RECURRING preview on %s, with no issued quote",
    async (_label, perturb, kind) => {
      await seedOwner();
      subscriptionQueue = [growthSubscription(NOW_S)];
      routes["POST /v1/invoices/create_preview"] = (_url, init) => {
        const body = new URLSearchParams(String(init.body ?? ""));
        if (body.get("preview_mode") === "recurring")
          return json(
            recurringPreview(
              { subtotalMinor: APPROVED_MINOR.proBase, totalMinor: 26_910 },
              { lines: lineList(perturb) },
            ),
          );
        return json(
          prorationPreview({
            prorationDate: NOW_S,
            amountDue: QUOTED_INCREASE,
            creditMinor: -5_000,
            chargeMinor: 18_000,
          }),
        );
      };
      expect(await prepare()).toEqual({
        ok: false,
        reason: `preview_preview_line_proration_${kind}`,
      });
      await nothingPersisted();
    },
  );
});

describe("A2 — a stale prepared worker cannot close a dispatched operation", () => {
  it("rejects A's refusal after B dispatched, and leaves B's operation open", async () => {
    await prepareReduction();
    await seedProjects(["proj-a"]);
    // The operation already exists in `prepared`, which is the only state in
    // which a stale pre-dispatch refusal is even possible.
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "growth",
      seats: 0,
      direction: "decrease",
      prorationDate: PERIOD_END,
      selection: DECREASE_SELECTION,
    });
    // Worker A is PARKED at its capacity re-check — the named await this race
    // is placed at — and only then does worker B advance the SAME operation to
    // `dispatching` through the real compare-and-set.
    const arrived = deferred();
    const release = deferred();
    let parked = false;
    rpcHooks.set("stripe_commercial_membership_usage", async (_args, invoke) => {
      if (!parked) {
        parked = true;
        arrived.resolve();
        await release.promise;
        // Make A's re-check genuinely fail, exactly as a team that grew would:
        // growth bundles three working seats and the owner holds one.
        for (const email of ["a@example.test", "b@example.test", "c@example.test"])
          await seedInvitation("proj-a", email);
      }
      return invoke();
    });

    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    calls = [];
    const attemptA = confirmReduction();
    await arrived.promise;
    // A has already read `prepared`; B now wins the race to `dispatching`.
    expect(
      await one<{ stripe_commercial_advance_operation: boolean }>(
        "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,$5,NULL,NULL,NULL,$6,NULL)",
        [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test", "dispatching", "prepared"],
      ),
    ).toMatchObject({ stripe_commercial_advance_operation: true });
    release.resolve();
    const result = await attemptA;

    // A's refusal asserted `prepared`, so the real SQL returned FALSE and A
    // reports a conflict rather than closing B's dispatched operation.
    expect(result).toEqual({ ok: false, reason: "operation_conflict" });
    const refusal = rpcArgs("stripe_commercial_finish_operation")[0];
    expect(refusal).toMatchObject({ p_state: "refused", p_expected_state: "prepared" });
    const row = await operationRow();
    expect(row.state).toBe("dispatching");
    expect(row.refusal_code).toBeNull();
    // And A sent no provider mutation.
    expect(providerPosts()).toHaveLength(0);
  });

  it("lets two workers resume the same dispatched state without either inventing success", async () => {
    await prepareIncrease();
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    expect((await operationRow()).state).toBe("awaiting_apply");

    // Both resumed readers observe `awaiting_apply`; the payment is still
    // pending, so neither transitions and neither claims success. PGlite is
    // single-connection, so the two readers run as a deterministic
    // interleaving rather than as real simultaneous connections.
    routes[`GET /v1/invoices/${UPDATED_INVOICE}`] = () =>
      json(
        updateInvoice(NOW_S, QUOTED_INCREASE, {
          status: "open",
          amount_paid: 0,
          amount_remaining: QUOTED_INCREASE,
        }),
      );
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    const first = await confirm();
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    const second = await confirm();
    expect(first).toEqual({ ok: false, reason: "change_invoice_unpaid" });
    expect(second).toEqual({ ok: false, reason: "change_invoice_unpaid" });
    expect((await operationRow()).state).toBe("awaiting_apply");
    // Neither reader emitted a transition at all.
    expect(
      rpcArgs("stripe_commercial_advance_operation").filter(
        (args) => args.p_expected_state === "awaiting_apply",
      ),
    ).toEqual([]);
  });
});

describe("A4 — committed-then-lost ACK versus a failure before the write", () => {
  it("resolves a LOST capture acknowledgment by exact scoped readback", async () => {
    await prepareIncrease();
    // The compare-and-set COMMITS in real SQL and its acknowledgment is lost.
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      const data = await invoke();
      if (args.p_state === "awaiting_payment") throw new Error("lost acknowledgment");
      return data;
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    const result = await confirm();
    expect(result).toMatchObject({ ok: true, state: "applied" });
    // The readback found the SAME invoice in the state actually reached, and no
    // prohibited same-state write was attempted.
    const captures = rpcArgs("stripe_commercial_advance_operation").filter(
      (args) => args.p_state === "awaiting_payment",
    );
    expect(captures).toHaveLength(1);
    expect(rpcNames()).toContain("stripe_commercial_read_operation");
    expect((await operationRow()).invoice_id).toBe(UPDATED_INVOICE);
  });

  it("treats a FAILURE BEFORE THE WRITE as uncertainty, writing nothing", async () => {
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_state === "awaiting_payment") throw new Error("transport failed");
      return invoke();
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "update_invoice_capture_uncertain" });
    const row = await operationRow();
    expect(row.state).toBe("dispatching");
    expect(row.invoice_id).toBeNull();
  });

  it("a TRUE compare-and-set false recovers only the durable winner", async () => {
    await prepareIncrease();
    // Another instance captures a DIFFERENT state first, so this instance's
    // `dispatching → awaiting_payment` is genuinely rejected by real SQL.
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_state === "awaiting_payment") {
        await exec(
          "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,$5,$6,NULL,NULL,$7,NULL)",
          [
            OPERATION,
            COMMERCIAL_OWNER,
            COMMERCIAL_ACCOUNT_TEST,
            "test",
            "awaiting_payment",
            UPDATED_INVOICE,
            "dispatching",
          ],
        );
      }
      return invoke();
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate(), proAfterUpdate()];
    const result = await confirm();
    expect(result).toMatchObject({ ok: true, state: "applied" });
    expect((await operationRow()).invoice_id).toBe(UPDATED_INVOICE);
    // Exactly one update POST: the loser never sent a second, newly
    // parameterised request.
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);
  });

  it("reports the durable result after a lost FINISH acknowledgment, and uncertainty without it", async () => {
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_finish_operation", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toMatchObject({ ok: true, state: "applied" });
    expect((await operationRow()).state).toBe("applied");

    // The same loss WITHOUT the commit is uncertainty, and the gate stays held.
    await db.exec(`DELETE FROM public.stripe_commercial_operations;
      DELETE FROM public.stripe_commercial_quotes;`);
    rpcTrace = [];
    calls = [];
    const prepared = await prepare({ quoteId: QUOTE_B });
    expect(prepared.ok).toBe(true);
    rpcHooks.set("stripe_commercial_finish_operation", async () => {
      throw new Error("transport failed");
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm({ quoteId: QUOTE_B })).toEqual({
      ok: false,
      reason: "change_settlement_uncertain",
    });
    expect((await operationRow()).state).toBe("awaiting_payment");
  });

  it("holds an inconsistent awaiting_payment row with no captured invoice", async () => {
    await prepareIncrease();
    // Reach `awaiting_payment` without ever recording an invoice, which the
    // RPCs permit only for a non-reduction kind.
    await exec(
      "SELECT public.stripe_commercial_begin_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10,$11)",
      [
        OPERATION,
        COMMERCIAL_OWNER,
        COMMERCIAL_ACCOUNT_TEST,
        "test",
        "plan_change",
        COMMERCIAL_SUBSCRIPTION,
        digest({
          mode: "test",
          quoteId: QUOTE,
          subscription: COMMERCIAL_SUBSCRIPTION,
          plan: "pro",
          seats: 0,
          direction: "increase",
          prorationDate: NOW_S,
        }),
        `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
        QUOTE,
        "in_base",
        selectionFingerprintInput({
          targetPlanId: "pro",
          targetSeatQuantity: 0,
          baseItemId: "si_base",
          basePriceId: PRICE_IDS.proBase,
          seatItemId: null,
          seatPriceId: null,
        }),
      ],
    );
    await exec(
      "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'dispatching',NULL,NULL,NULL,'prepared',NULL)",
      [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test"],
    );
    await exec(
      "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'awaiting_payment',NULL,NULL,NULL,'dispatching',NULL)",
      [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test"],
    );
    calls = [];
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm()).toEqual({ ok: false, reason: "update_invoice_provenance_missing" });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow()).state).toBe("awaiting_payment");
  });
});

/** The operation's OWN immutable creation time, which is the only thing the
 * strict retention guard may be measured against. */
const createdAtMs = async (operation = OPERATION) => {
  const row = await one<{ created_at: string }>(
    "SELECT created_at::text AS created_at FROM public.stripe_commercial_operations WHERE operation_id=$1",
    [operation],
  );
  return Date.parse(row.created_at);
};
const RETENTION_MS = 24 * 3600 * 1000;

describe("A5 — the strict deadline is re-taken after every awaited step", () => {
  it("fences at exactly the 24h limit crossed during awaited work, with ZERO POSTs", async () => {
    await prepareReduction();
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "growth",
      seats: 0,
      direction: "decrease",
      prorationDate: PERIOD_END,
      selection: DECREASE_SELECTION,
    });
    // EXACTLY the documented bound, measured from this operation's own durable
    // creation time. Retention is "at least 24 hours", so the boundary itself
    // is already outside the guarantee.
    const limit = (await createdAtMs()) + RETENTION_MS;
    const clock = (() => {
      let call = 0;
      return () => (call++ < 1 ? NOW_MS : limit);
    })();
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    calls = [];
    expect(await confirmReduction({ now: clock })).toEqual({
      ok: false,
      reason: "operation_expired",
    });
    expect(providerPosts()).toHaveLength(0);
    const row = await operationRow();
    expect(row.state).toBe("failed");
    expect(row.refusal_code).toBe("retention_elapsed_undispatched");
    // EXACTLY one millisecond inside the window is the positive control, taken
    // against the NEW operation's own creation time — not a wall-clock read,
    // which would prove only that "roughly now" still works.
    await db.exec(`DELETE FROM public.stripe_commercial_operations;
      DELETE FROM public.stripe_commercial_quotes;`);
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await prepare({ planId: "growth", seats: 0 })).toMatchObject({ ok: true });
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "growth",
      seats: 0,
      direction: "decrease",
      prorationDate: PERIOD_END,
      selection: DECREASE_SELECTION,
    });
    const inside = (await createdAtMs()) + RETENTION_MS - 1;
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction({ now: inside })).toMatchObject({
      ok: true,
      state: "scheduled",
    });
  });

  it("A5 — a PARKED original POST answered PAST retention: one intent, and the original response still settles it", async () => {
    await prepareIncrease();
    // ONE clock, shared by every execution in this interleaving and only ever
    // moved FORWARD. Two frozen times — one per worker — would be a different
    // world for each of them and could not establish anything about a late
    // response at all.
    let now = NOW_MS;
    const clock = () => now;

    // EXECUTION A's update POST is parked, exactly as an in-flight request that
    // has neither succeeded nor failed yet.
    const parked = deferred();
    const started = deferred();
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = async () => {
      started.resolve();
      await parked.promise;
      return json(proAfterUpdate());
    };
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    const attemptA = confirm({ now: clock });
    await started.promise;
    expect((await operationRow()).state).toBe("dispatching");
    // The full trace is kept for the whole test; B's window is addressed by
    // index, so the original request can never be reset away.
    const beforeB = calls.length;
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);

    // TIME PASSES while that request is unanswered, beyond this operation's own
    // 24h deadline.
    now = (await createdAtMs()) + RETENTION_MS + 1;

    // EXECUTION B resumes the SAME operation and the provider still shows the
    // UNCHANGED subscription — because A's request has not been answered yet. B
    // may not send a new request under a key whose retention has lapsed, and it
    // may not conclude anything from the unchanged state either.
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm({ now: clock })).toEqual({
      ok: false,
      reason: "update_ack_unrecoverable",
    });
    // Zero NEW provider POSTs in B's own window.
    expect(calls.slice(beforeB).filter((call) => call.method === "POST")).toEqual([]);
    expect((await operationRow()).state).toBe("fenced");
    // The slot and the projection gate stay HELD: fenced is non-terminal.
    expect(
      await one<{ blocked: boolean }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ blocked: true, reason: "operation_unresolved" });

    // A's ORIGINAL request is now answered, successfully, on the same advanced
    // clock. Its capture is legitimately stale — B fenced the row — and the
    // invoice identity in that response is the ONLY place this update's
    // provenance exists. Discarding it there left a fenced row with no invoice
    // that nobody could ever settle, because past retention there is no
    // admissible replay either.
    const afterB = calls.length;
    // The provider now really does carry the applied change, which is what A's
    // own settlement reads authoritatively.
    subscriptionQueue = [proAfterUpdate()];
    parked.resolve();
    const resultA = await attemptA;
    // A settles the SAME operation from its own original response: the exact
    // captured invoice plus the authoritative selection, with no new request.
    expect(resultA, JSON.stringify({ resultA, sqlErrors })).toMatchObject({
      ok: true,
      state: "applied",
    });
    expect(calls.slice(afterB).filter((call) => call.method === "POST")).toEqual([]);
    const row = await operationRow();
    expect(row.state).toBe("applied");
    expect(row.invoice_id).toBe(UPDATED_INVOICE);
    // DECISIVE: the origin was recorded from the original response against the
    // state actually observed — the fence B wrote — under that state's
    // compare-and-set, and only because the row recorded no invoice yet.
    const origin = rpcArgs("stripe_commercial_advance_operation").filter(
      (args) => args.p_state === "awaiting_payment" && args.p_invoice === UPDATED_INVOICE,
    );
    expect(origin.map((args) => args.p_expected_state)).toContain("fenced");
    // No same-state write was attempted anywhere in the interleaving.
    expect(
      rpcArgs("stripe_commercial_advance_operation").filter(
        (args) => args.p_state === args.p_expected_state,
      ),
    ).toEqual([]);
    // ONE financial intent in the whole interleaving, under one key, counted
    // over the COMPLETE trace.
    const posts = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["Idempotency-Key"]).toBe(
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
    );
    // The deadline it was measured against never moved: the operation's own
    // immutable creation time is unchanged, so nothing refreshed a key window.
    expect(await createdAtMs()).toBe(now - RETENTION_MS - 1);

    // A replay on the same advanced clock reports the durable result and sends
    // nothing.
    const afterA = calls.length;
    subscriptionQueue = [proAfterUpdate(), proAfterUpdate()];
    expect(await confirm({ now: clock })).toMatchObject({ ok: true, state: "applied" });
    expect(calls.slice(afterA).filter((call) => call.method === "POST")).toEqual([]);
  });

  it("A5 — crossing EXACTLY 24h during the consume readback fences with ZERO POSTs", async () => {
    await prepareIncrease();
    // The operation must already exist for its OWN creation time to be the
    // deadline, so it is created through the real `begin_operation` with exactly
    // the arguments production computes.
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "pro",
      seats: 0,
      direction: "increase",
      prorationDate: NOW_S,
      selection: INCREASE_SELECTION,
    });
    const limit = (await createdAtMs()) + RETENTION_MS;
    let now = NOW_MS;
    const clock = () => now;
    // The consumption COMMITS and its acknowledgment is lost...
    rpcHooks.set("stripe_commercial_consume_quote", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    // ...and the deadline is reached WHILE THE RECOVERY READ ITSELF IS AWAITED —
    // the actual last await before the duplicable POST. The clock moves inside
    // that call, not before it.
    let reads = 0;
    rpcHooks.set("stripe_commercial_read_quote", async (_args, invoke) => {
      reads += 1;
      const data = await invoke();
      if (reads > 1) now = limit;
      return data;
    });
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm({ now: clock })).toEqual({
      ok: false,
      reason: "operation_fenced",
    });
    // The crossing really happened during that read, and after it the quote was
    // provably this operation's own.
    expect(reads).toBeGreaterThan(1);
    expect(now).toBe(limit);
    // EXACTLY the documented bound is already outside the guarantee, so no new
    // request is sent under the retained key.
    expect(providerPosts()).toHaveLength(0);
    const row = await operationRow();
    expect(row.state).toBe("fenced");
    expect(row.refusal_code).toBeNull();
    // The quote really was consumed by this operation, and the slot stays held
    // for recovery rather than being released or refused.
    expect(
      (
        await one<{ consumed_by: string | null }>(
          "SELECT consumed_by FROM public.stripe_commercial_quotes WHERE quote_id=$1",
          [QUOTE],
        )
      ).consumed_by,
    ).toBe(OPERATION);
    expect(
      await one<{ blocked: boolean }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ blocked: true, reason: "operation_unresolved" });
  });

  it("A5 — crossing EXACTLY 24h during the final dispatch CAS sends no POST", async () => {
    await prepareIncrease();
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "pro",
      seats: 0,
      direction: "increase",
      prorationDate: NOW_S,
      selection: INCREASE_SELECTION,
    });
    const limit = (await createdAtMs()) + RETENTION_MS;
    let now = NOW_MS;
    const clock = () => now;
    // The LAST compare-and-set before the duplicable POST is the advance to
    // `dispatching`. The deadline is reached while that write is awaited, so the
    // guard that matters is the one re-taken immediately after it.
    let crossedDuring = false;
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      const data = await invoke();
      if (args.p_state === "dispatching") {
        now = limit;
        crossedDuring = true;
      }
      return data;
    });
    subscriptionQueue = [growthSubscription(NOW_S)];
    calls = [];
    expect(await confirm({ now: clock })).toEqual({ ok: false, reason: "operation_fenced" });
    expect(crossedDuring).toBe(true);
    // No new financial intent was created under a key whose retention lapsed.
    expect(providerPosts()).toHaveLength(0);
    const row = await operationRow();
    expect(row.state).toBe("fenced");
    expect(row.invoice_id).toBeNull();
    expect(row.refusal_code).toBeNull();
    // The slot and the gate stay held for recovery.
    expect(
      await one<{ blocked: boolean }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ blocked: true, reason: "operation_unresolved" });
  });

  it("A5 — crossing the ORIGINAL reduction boundary during the payload capture sends no phases POST", async () => {
    // A subscription whose paid period ends within the hour, so the ORIGINAL
    // effective boundary can be crossed while idempotency retention is still
    // comfortably intact. Otherwise the retention guard — which is checked first
    // and is already proved separately — would be the one that fires, and this
    // test would say nothing about the boundary.
    const soon = NOW_S + 3600;
    const nearEnd = (over: Record<string, unknown> = {}) =>
      growthSubscription(NOW_S, {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              {
                id: "si_base",
                priceId: PRICE_IDS.proBase,
                productId: PRODUCT_IDS.pro,
                quantity: 1,
              },
              NOW_S,
              { current_period_end: soon },
            ),
            subscriptionItem(
              {
                id: "si_seat",
                priceId: PRICE_IDS.proSeat,
                productId: PRODUCT_IDS.pro,
                quantity: 3,
              },
              NOW_S,
              { current_period_end: soon },
            ),
          ],
        },
        ...over,
      });
    await seedOwner({ planId: "pro", seats: 3 });
    routes["POST /v1/subscription_schedules"] = () =>
      json(adoptedSchedule({ periodStart: PERIOD_START, periodEnd: soon, items: PAID_ITEMS }));
    subscriptionQueue = [nearEnd()];
    expect(await prepare({ planId: "growth", seats: 0 })).toMatchObject({ ok: true });
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "growth",
      seats: 0,
      direction: "decrease",
      prorationDate: soon,
      selection: DECREASE_SELECTION,
    });

    // The clock passes that boundary while the payload capture is awaited — the
    // last write before the first `:phases` POST.
    let now = NOW_MS;
    const clock = () => now;
    let crossedDuring = false;
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      const data = await invoke();
      if (args.p_reduction_payload) {
        now = (soon + 1) * 1000;
        crossedDuring = true;
      }
      return data;
    });
    subscriptionQueue = [nearEnd()];
    calls = [];
    expect(await confirmReduction({ now: clock })).toEqual({
      ok: false,
      reason: "reduction_boundary_elapsed",
    });
    expect(crossedDuring).toBe(true);
    // Retention was never the reason: it is still intact at that instant.
    expect(now - (await createdAtMs())).toBeLessThan(RETENTION_MS);
    // The adoption happened (one POST), and NO phase update followed it.
    expect(postsTo("/v1/subscription_schedules")).toHaveLength(1);
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
    const row = await operationRow();
    // The ORIGINAL stored boundary is unchanged and was never moved forward.
    const payload = row.reduction_dispatch_payload as { effectiveBoundary: number } | null;
    expect(payload?.effectiveBoundary).toBe(soon);
    expect(row.schedule_id).toBe("sub_sched_1");
    expect(isOpenOperationState(row.state)).toBe(true);
    expect(row.refusal_code).toBeNull();
    expect(
      await one<{ blocked: boolean }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ blocked: true, reason: "operation_unresolved" });

    // A later attempt on that elapsed boundary still sends no phase update and
    // never moves the date.
    calls = [];
    subscriptionQueue = [nearEnd({ schedule: "sub_sched_1" })];
    const again = await confirmReduction({ now: clock });
    expect(again.ok).toBe(false);
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
    expect(
      (await operationRow()).reduction_dispatch_payload as { effectiveBoundary: number },
    ).toMatchObject({ effectiveBoundary: soon });
  });

  it("holds a dispatched increase past retention without any new mutation", async () => {
    await prepareIncrease();
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_state === "awaiting_payment") throw new Error("transport failed");
      return invoke();
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    await confirm();
    expect((await operationRow()).state).toBe("dispatching");

    rpcHooks.clear();
    rpcTrace = [];
    calls = [];
    const past = (await createdAtMs()) + RETENTION_MS + 1;
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await confirm({ now: past })).toEqual({
      ok: false,
      reason: "update_ack_unrecoverable",
    });
    expect(providerPosts()).toHaveLength(0);
    // The slot and the gate stay held: fenced is non-terminal.
    expect((await operationRow()).state).toBe("fenced");
    expect(
      await one<{ blocked: boolean }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ blocked: true, reason: "operation_unresolved" });
  });
});

describe("A6 — cancel and reverse against real SQL", () => {
  const cancel = (over: { operationId?: string; now?: number | (() => number) } = {}) =>
    requestSubscriptionCancellation(
      {
        userId: COMMERCIAL_OWNER,
        operationId: over.operationId ?? OPERATION,
        mode: "test",
      },
      deps(over),
    );
  const reverse = (over: { operationId?: string; cancelOperationId?: string } = {}) =>
    reverseSubscriptionCancellation(
      {
        userId: COMMERCIAL_OWNER,
        operationId: over.operationId ?? OPERATION_B,
        cancelOperationId: over.cancelOperationId ?? OPERATION,
        mode: "test",
      },
      deps(),
    );
  const cancelled = growthSubscription(NOW_S, {
    cancel_at_period_end: true,
    cancel_at: PERIOD_END,
  });

  it("settles a cancellation whose POST landed and whose ACK was lost, then reverses it", async () => {
    await seedOwner();
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(cancelled);
    // The provider POST lands; the finish acknowledgment is lost.
    rpcHooks.set("stripe_commercial_finish_operation", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    subscriptionQueue = [growthSubscription(NOW_S), cancelled];
    expect(await cancel()).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    expect((await operationRow()).state).toBe("applied");

    // A replay reports the same durable result and sends nothing.
    rpcHooks.clear();
    calls = [];
    subscriptionQueue = [cancelled];
    expect(await cancel()).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    expect(providerPosts()).toHaveLength(0);

    // The reversal binds in SQL to that APPLIED cancellation.
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(growthSubscription(NOW_S));
    subscriptionQueue = [cancelled, growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    expect((await operationRow(OPERATION_B)).state).toBe("applied");
  });

  it("resolves a cancellation whose POST ACK was lost, from the durable state", async () => {
    await seedOwner();
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => {
      throw new Error("socket timeout");
    };
    subscriptionQueue = [growthSubscription(NOW_S)];
    expect(await cancel()).toEqual({ ok: false, reason: "cancellation_uncertain" });
    expect((await operationRow()).state).toBe("dispatching");

    // The POST had in fact landed. A resumed attempt settles the SAME operation
    // without a second intent.
    calls = [];
    subscriptionQueue = [cancelled, cancelled];
    expect(await cancel()).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow()).state).toBe("applied");
  });

  it("refuses an unrelated preexisting cancellation instead of claiming it", async () => {
    await seedOwner();
    subscriptionQueue = [cancelled];
    expect(await cancel()).toEqual({ ok: false, reason: "cancellation_preexisting" });
    const row = await operationRow();
    expect(row).toMatchObject({ state: "refused", refusal_code: "cancellation_preexisting" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("never manufactures an applied cancellation from a caller-supplied id", async () => {
    await seedOwner();
    subscriptionQueue = [cancelled];
    // No applied cancel operation exists for this owner/subscription.
    expect(await reverse({ cancelOperationId: OPERATION })).toEqual({
      ok: false,
      reason: "reversal_unavailable",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(await operationRow(OPERATION_B)).toBeUndefined();
  });

  /** An APPLIED cancellation for this owner and subscription, through the real
   * path, so a reversal has something legitimate to bind to. */
  const applyCancellation = async () => {
    await seedOwner();
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(cancelled);
    subscriptionQueue = [growthSubscription(NOW_S), cancelled];
    expect(await cancel()).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    expect((await operationRow()).state).toBe("applied");
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(growthSubscription(NOW_S));
    calls = [];
    rpcTrace = [];
  };

  it("A6 — resolves a REVERSAL whose POST ACK was lost, from the durable state", async () => {
    await applyCancellation();
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => {
      throw new Error("socket timeout");
    };
    subscriptionQueue = [cancelled];
    expect(await reverse()).toEqual({ ok: false, reason: "reversal_uncertain" });
    const dispatched = await operationRow(OPERATION_B);
    expect(dispatched.state).toBe("dispatching");
    expect(dispatched.refusal_code).toBeNull();
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);

    // The POST had in fact landed. The SAME operation is settled from the
    // provider's state, with no second intent.
    calls = [];
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(growthSubscription(NOW_S));
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow(OPERATION_B)).state).toBe("applied");
  });

  it("A6 — a REVERSAL whose finish COMMITTED and lost its ACK replays the same result", async () => {
    await applyCancellation();
    rpcHooks.set("stripe_commercial_finish_operation", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    subscriptionQueue = [cancelled, growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    // The durable row really is applied, so the lost acknowledgment cost
    // nothing and the replay sends no second POST.
    expect((await operationRow(OPERATION_B)).state).toBe("applied");
    rpcHooks.clear();
    calls = [];
    subscriptionQueue = [growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    expect(providerPosts()).toHaveLength(0);
  });

  it("A6 — a REVERSAL whose finish fails before writing stays open and recoverable", async () => {
    await applyCancellation();
    rpcHooks.set("stripe_commercial_finish_operation", async () => {
      throw new Error("transport failed");
    });
    subscriptionQueue = [cancelled, growthSubscription(NOW_S)];
    expect(await reverse()).toEqual({ ok: false, reason: "reversal_settlement_uncertain" });
    const open = await operationRow(OPERATION_B);
    expect(isOpenOperationState(open.state)).toBe(true);
    expect(open.refusal_code).toBeNull();
    expect(postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`)).toHaveLength(1);
    // The gate stays held while this operation is unresolved.
    expect(
      await one<{ blocked: boolean }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ blocked: true });

    // Recovery resolves the SAME operation from the provider's state.
    rpcHooks.clear();
    calls = [];
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    expect(await reverse()).toMatchObject({ ok: true, cancelAtPeriodEnd: false });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow(OPERATION_B)).state).toBe("applied");
  });

  it("A6 — a REVERSAL whose durable read fails is uncertainty, never a verdict", async () => {
    await applyCancellation();
    // The reversal dispatches, its finish is unacknowledged, and the recovery
    // read of its own row then fails.
    rpcHooks.set("stripe_commercial_finish_operation", async () => {
      throw new Error("transport failed");
    });
    subscriptionQueue = [cancelled, growthSubscription(NOW_S)];
    await reverse();
    const beforeRead = await operationRow(OPERATION_B);
    rpcHooks.clear();
    rpcHooks.set("stripe_commercial_read_operation", async () => {
      throw new Error("read failed");
    });
    calls = [];
    const result = await reverse();
    expect(result.ok).toBe(false);
    // Nothing was decided and nothing was sent. (`attempts` is incremented by
    // the resumed `begin_operation` itself, which is not a decision.)
    const after = await operationRow(OPERATION_B);
    expect({ ...after, attempts: 0 }).toEqual({ ...beforeRead, attempts: 0 });
    expect(after.state).toBe(beforeRead.state);
    expect(after.refusal_code).toBeNull();
    expect(providerPosts()).toHaveLength(0);
  });

  it("refuses a reversal with genuinely nothing to reverse, resolving its own operation", async () => {
    await seedOwner();
    // An applied cancel exists, but the provider shows no pending cancellation.
    routes[`POST /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () => json(cancelled);
    subscriptionQueue = [growthSubscription(NOW_S), cancelled];
    await cancel();
    calls = [];
    subscriptionQueue = [growthSubscription(NOW_S)];
    expect(await reverse()).toEqual({ ok: false, reason: "cancellation_absent" });
    expect(providerPosts()).toHaveLength(0);
    expect(await operationRow(OPERATION_B)).toMatchObject({
      state: "refused",
      refusal_code: "cancellation_absent",
    });
  });
});

/* ========================================================================== */
/* Track B — canonical payload capture and read-only recovery                 */
/* ========================================================================== */

describe("B5 — the durable payload is captured atomically BEFORE any phases POST", () => {
  /**
   * A COMPLETE, VALID v1 reduction payload for this operation, whose only
   * variable is the paid phase's start date. Written out in full here because
   * two cases below need a document the parser accepts and the equality check
   * then REJECTS — an invalid document would be held one step earlier and prove
   * something else.
   */
  const validReductionPayload = (start: number) => ({
    v: 1,
    operationId: OPERATION,
    quoteId: QUOTE,
    scheduleId: "sub_sched_1",
    subscriptionId: COMMERCIAL_SUBSCRIPTION,
    selectionDetail: selectionFingerprintInput({
      targetPlanId: "growth",
      targetSeatQuantity: 0,
      baseItemId: "si_base",
      basePriceId: PRICE_IDS.growthBase,
      seatItemId: "si_seat",
      seatPriceId: null,
    }),
    targetPlanId: "growth",
    targetSeatQuantity: 0,
    effectiveBoundary: PERIOD_END,
    expectedSettings: {
      profile: "automaticChargeNoTaxNoDiscount",
      defaultSettings: {
        application_fee_percent: null,
        automatic_tax: false,
        billing_cycle_anchor: "automatic",
        collection_method: "charge_automatically",
        default_payment_method: null,
        default_source: null,
        description: null,
        invoice_settings: { issuer: { type: "self" } },
        on_behalf_of: null,
        transfer_data: null,
      },
      paidPhase: {
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
      },
      paidItems: [
        { price: PRICE_IDS.proBase, quantity: 1, metadata: {}, tax_rates: [] },
        { price: PRICE_IDS.proSeat, quantity: 3, metadata: {}, tax_rates: [] },
      ],
    },
    request: {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          start_date: start,
          end_date: PERIOD_END,
          proration_behavior: "none",
          items: [
            { price: PRICE_IDS.proBase, quantity: 1 },
            { price: PRICE_IDS.proSeat, quantity: 3 },
          ],
        },
        {
          start_date: PERIOD_END,
          proration_behavior: "none",
          items: [{ price: PRICE_IDS.growthBase, quantity: 1 }],
        },
      ],
    },
  });

  it("stores schedule+payload under dispatching→awaiting_apply, then dispatches that body", async () => {
    await prepareReduction();
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });

    const row = await operationRow();
    expect(row.state).toBe("applied");
    expect(row.schedule_id).toBe("sub_sched_1");
    const payload = row.reduction_dispatch_payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      v: 1,
      operationId: OPERATION,
      quoteId: QUOTE,
      scheduleId: "sub_sched_1",
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      targetPlanId: "growth",
      targetSeatQuantity: 0,
      effectiveBoundary: PERIOD_END,
    });
    // The real SQL accepted exactly ONE capture, as dispatching → awaiting_apply.
    const captures = rpcArgs("stripe_commercial_advance_operation").filter(
      (args) => args.p_reduction_payload,
    );
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      p_state: "awaiting_apply",
      p_expected_state: "dispatching",
      p_schedule: "sub_sched_1",
    });
    // And the capture preceded the first `:phases` POST.
    const capturedAt = rpcTrace.findIndex((entry) => entry.args.p_reduction_payload);
    expect(capturedAt).toBeGreaterThanOrEqual(0);
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(1);
  });

  it("B5 — the durable row ALREADY holds the schedule, the full payload and awaiting_apply INSIDE the first phases POST", async () => {
    await prepareReduction();
    // The assertion is made from INSIDE the provider handler, so it describes
    // the database as it was when the request was actually being sent — not the
    // row as it looks afterwards, and not an RPC-order inference.
    let atPost: {
      state: string;
      schedule_id: string | null;
      reduction_dispatch_payload: unknown;
    } | null = null;
    let postsSeen = 0;
    routes["POST /v1/subscription_schedules/sub_sched_1"] = async () => {
      postsSeen += 1;
      atPost =
        atPost ??
        (await one(
          `SELECT state,schedule_id,reduction_dispatch_payload
             FROM public.stripe_commercial_operations WHERE operation_id=$1`,
          [OPERATION],
        ));
      return json(reducedScheduleFixture());
    };
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });
    expect(postsSeen).toBe(1);
    const observed = atPost as unknown as {
      state: string;
      schedule_id: string | null;
      reduction_dispatch_payload: Record<string, unknown> | null;
    };
    expect(observed.state).toBe("awaiting_apply");
    expect(observed.schedule_id).toBe("sub_sched_1");
    // The COMPLETE document, not merely a non-null column: it is byte-identical
    // to the one the row holds at the end, and it is what the POST carried.
    const payload = observed.reduction_dispatch_payload as Record<string, unknown>;
    expect(payload).toEqual((await operationRow()).reduction_dispatch_payload);
    const request = payload.request as { phases: Record<string, unknown>[] };
    const body = new URLSearchParams(postsTo("/v1/subscription_schedules/sub_sched_1")[0].body);
    expect(body.get("phases[0][start_date]")).toBe(String(request.phases[0].start_date));
    expect(body.get("phases[1][items][0][price]")).toBe(PRICE_IDS.growthBase);
    expect(payload).toMatchObject({
      v: 1,
      operationId: OPERATION,
      quoteId: QUOTE,
      scheduleId: "sub_sched_1",
      effectiveBoundary: PERIOD_END,
    });
  });

  it("B5 — an unknown capture ACK whose durable payload is UNEQUAL is held, with no POST", async () => {
    await prepareReduction();
    // Another worker's document is persisted first and this worker's capture
    // response is then LOST — so the readback finds a payload that is not the
    // one this worker built. A compare-and-set loser is a different case and is
    // covered separately; here the outcome of our own write is unknown.
    const foreign = validReductionPayload(PERIOD_START - 7200);
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (!args.p_reduction_payload) return invoke();
      await exec(
        "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'awaiting_apply',NULL,NULL,$5,'dispatching',$6::jsonb)",
        [
          OPERATION,
          COMMERCIAL_OWNER,
          COMMERCIAL_ACCOUNT_TEST,
          "test",
          "sub_sched_1",
          JSON.stringify(foreign),
        ],
      );
      throw new Error("lost acknowledgment");
    });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    calls = [];
    expect(await confirmReduction()).toEqual({ ok: false, reason: "reduction_payload_conflict" });
    // Nothing was sent, and the stored document was neither rewritten nor
    // merged with this worker's candidate.
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
    const stored = (await operationRow()).reduction_dispatch_payload as {
      request: { phases: { start_date: number }[] };
    };
    expect(stored.request.phases[0].start_date).toBe(PERIOD_START - 7200);
  });

  it.each([
    [
      "the readback itself fails",
      () =>
        rpcHooks.set("stripe_commercial_read_operation", async () => {
          throw new Error("read failed");
        }),
      "operation_uncertain",
    ],
    [
      "the readback is unreadable",
      () => rpcHooks.set("stripe_commercial_read_operation", async () => []),
      "operation_uncertain",
    ],
    [
      "the durable payload cannot be parsed",
      () =>
        rpcHooks.set("stripe_commercial_read_operation", async (_args, invoke) => {
          const rows = (await invoke()) as Record<string, unknown>[];
          return rows.map((row) => ({ ...row, reduction_dispatch_payload: { v: 99 } }));
        }),
      "reduction_capture_uncertain",
    ],
    [
      "the durable schedule disagrees",
      () =>
        rpcHooks.set("stripe_commercial_read_operation", async (_args, invoke) => {
          const rows = (await invoke()) as Record<string, unknown>[];
          return rows.map((row) => ({ ...row, schedule_id: "sub_sched_other" }));
        }),
      "reduction_capture_uncertain",
    ],
  ])(
    "B5 — an unknown capture ACK where %s sends no phases POST",
    async (_label, degrade, reason) => {
      await prepareReduction();
      // The capture COMMITS and its acknowledgment is lost; the evidence that
      // would resolve it is then degraded.
      rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
        const data = await invoke();
        if (args.p_reduction_payload) throw new Error("lost acknowledgment");
        return data;
      });
      degrade();
      subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
      calls = [];
      expect(await confirmReduction()).toEqual({ ok: false, reason });
      expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);
      // The capture itself really did commit, so recovery has something exact
      // to resume from once the reads work again.
      expect((await operationRow()).reduction_dispatch_payload).toBeTruthy();
      rpcHooks.clear();
      calls = [];
      subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
      scheduleQueue = [adoptedScheduleFixture()];
      expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });
      expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(1);
    },
  );

  it("a losing worker sends only the durable WINNER's body, never its own", async () => {
    await prepareReduction();
    // While this worker is building its candidate, another captures a payload
    // whose paid phase starts one second earlier — a genuinely UNEQUAL document.
    const winnerPayload = (start: number) => ({
      v: 1,
      operationId: OPERATION,
      quoteId: QUOTE,
      scheduleId: "sub_sched_1",
      subscriptionId: COMMERCIAL_SUBSCRIPTION,
      selectionDetail: selectionFingerprintInput({
        targetPlanId: "growth",
        targetSeatQuantity: 0,
        baseItemId: "si_base",
        basePriceId: PRICE_IDS.growthBase,
        seatItemId: "si_seat",
        seatPriceId: null,
      }),
      targetPlanId: "growth",
      targetSeatQuantity: 0,
      effectiveBoundary: PERIOD_END,
      expectedSettings: {
        profile: "automaticChargeNoTaxNoDiscount",
        defaultSettings: {
          application_fee_percent: null,
          automatic_tax: false,
          billing_cycle_anchor: "automatic",
          collection_method: "charge_automatically",
          default_payment_method: null,
          default_source: null,
          description: null,
          invoice_settings: { issuer: { type: "self" } },
          on_behalf_of: null,
          transfer_data: null,
        },
        paidPhase: {
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
        },
        paidItems: [
          { price: PRICE_IDS.proBase, quantity: 1, metadata: {}, tax_rates: [] },
          { price: PRICE_IDS.proSeat, quantity: 3, metadata: {}, tax_rates: [] },
        ],
      },
      request: {
        end_behavior: "release",
        proration_behavior: "none",
        phases: [
          {
            start_date: start,
            end_date: PERIOD_END,
            proration_behavior: "none",
            items: [
              { price: PRICE_IDS.proBase, quantity: 1 },
              { price: PRICE_IDS.proSeat, quantity: 3 },
            ],
          },
          {
            start_date: PERIOD_END,
            proration_behavior: "none",
            items: [{ price: PRICE_IDS.growthBase, quantity: 1 }],
          },
        ],
      },
    });
    const winnerStart = PERIOD_START - 3600;
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_reduction_payload) {
        // The WINNER captures first, through the real RPC.
        await exec(
          "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'awaiting_apply',NULL,NULL,$5,'dispatching',$6::jsonb)",
          [
            OPERATION,
            COMMERCIAL_OWNER,
            COMMERCIAL_ACCOUNT_TEST,
            "test",
            "sub_sched_1",
            JSON.stringify(winnerPayload(winnerStart)),
          ],
        );
      }
      return invoke();
    });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    // The provider's schedule carries the WINNER's phase start after the
    // update, which is what the stored winner payload expects.
    const winnerSchedule = reductionSchedule({
      nowSeconds: NOW_S,
      currentItems: PAID_ITEMS,
      nextItems: TARGET_ITEMS,
      periodEnd: PERIOD_END,
      periodStart: winnerStart,
    });
    routes["POST /v1/subscription_schedules/sub_sched_1"] = () => json(winnerSchedule);
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () =>
      json(scheduleQueue.length > 0 ? scheduleQueue.shift() : winnerSchedule);
    scheduleQueue = [adoptedScheduleFixture()];
    const result = await confirmReduction();
    expect(result).toMatchObject({ ok: true, state: "scheduled" });

    // The stored document is the winner's and was never rewritten.
    const payload = (await operationRow()).reduction_dispatch_payload as {
      request: { phases: { start_date: number }[] };
    };
    expect(payload.request.phases[0].start_date).toBe(winnerStart);
    // And the ONE phases POST carried the winner's start date, not this
    // worker's candidate.
    const phases = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(phases).toHaveLength(1);
    expect(new URLSearchParams(phases[0].body).get("phases[0][start_date]")).toBe(
      String(winnerStart),
    );
  });

  it("B4 — recovers its OWN visible adoption by replay, and a GET supplies nothing", async () => {
    await prepareReduction();
    // The adoption landed and its acknowledgment was lost, so the subscription
    // now SHOWS the schedule while the operation records neither schedule nor
    // payload.
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "growth",
      seats: 0,
      direction: "decrease",
      prorationDate: PERIOD_END,
      selection: DECREASE_SELECTION,
    });
    await exec("SELECT public.stripe_commercial_consume_quote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
      QUOTE,
      COMMERCIAL_OWNER,
      COMMERCIAL_ACCOUNT_TEST,
      "test",
      COMMERCIAL_SUBSCRIPTION,
      digest(itemStateFingerprintInput(stateOf(proWithSeatsSubscription(NOW_S, 3)))),
      digest(DECREASE_SELECTION),
      "eur",
      0,
      OPERATION,
    ]);
    await exec(
      "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'dispatching',NULL,NULL,NULL,'prepared',NULL)",
      [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test"],
    );
    calls = [];
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3, { schedule: "sub_sched_1" })];
    expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });
    // The ORIGINAL settings came from the retained `:adopt` reply, and NO
    // schedule GET happened before the capture.
    const adoptIndex = calls.findIndex(
      (call) => call.method === "POST" && call.path === "/v1/subscription_schedules",
    );
    const firstScheduleGet = calls.findIndex(
      (call) => call.method === "GET" && call.path === "/v1/subscription_schedules/sub_sched_1",
    );
    expect(adoptIndex).toBeGreaterThanOrEqual(0);
    expect(firstScheduleGet).toBeGreaterThan(adoptIndex);
    expect((await operationRow()).reduction_dispatch_payload).toBeTruthy();
  });

  it("B4 — refuses a schedule that is not the one this operation recorded", async () => {
    await prepareReduction();
    await beginDirect({
      kind: "plan_change",
      quote: QUOTE,
      plan: "growth",
      seats: 0,
      direction: "decrease",
      prorationDate: PERIOD_END,
      selection: DECREASE_SELECTION,
    });
    await exec(
      "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'dispatching',NULL,NULL,NULL,'prepared',NULL)",
      [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test"],
    );
    await exec(
      "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'fenced',NULL,NULL,$5,'dispatching',NULL)",
      [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test", "sub_sched_1"],
    );
    calls = [];
    subscriptionQueue = [
      proWithSeatsSubscription(NOW_S, 3, { schedule: "sub_sched_SOMEONE_ELSE" }),
    ];
    expect(await confirmReduction()).toEqual({ ok: false, reason: "schedule_conflict" });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow()).reduction_dispatch_payload).toBeNull();
  });

  it("resolves a lost capture ACK by exact readback, and holds an unequal one", async () => {
    await prepareReduction();
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      const data = await invoke();
      if (args.p_reduction_payload) throw new Error("lost acknowledgment");
      return data;
    });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    scheduleQueue = [adoptedScheduleFixture()];
    expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });
    // The readback happened BEFORE the phases POST.
    const readIndex = rpcNames().indexOf("stripe_commercial_read_operation");
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(1);
    // Exactly one stored payload.
    expect((await operationRow()).reduction_dispatch_payload).toBeTruthy();
  });

  it("holds a reduction whose durable payload is absent", async () => {
    await prepareReduction();
    // Reach `dispatching` with a recorded schedule but no payload, which the
    // frozen RPCs allow only through a fenced advance.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_reduction_payload) throw new Error("transport failed");
      return invoke();
    });
    expect(await confirmReduction()).toEqual({
      ok: false,
      reason: "reduction_capture_uncertain",
    });
    const row = await operationRow();
    expect(row.state).toBe("dispatching");
    expect(row.reduction_dispatch_payload).toBeNull();
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);

    // Past retention there is no admissible adopt replay, so it stays held.
    rpcHooks.clear();
    calls = [];
    const past = (await createdAtMs()) + RETENTION_MS + 1;
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction({ now: past })).toEqual({
      ok: false,
      reason: "schedule_adopt_unrecoverable",
    });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow()).state).toBe("fenced");
  });

  it("refuses a payload the frozen SQL rejects, capturing nothing", async () => {
    await prepareReduction();
    // An unsupported source setting is held by the SERVER before capture, so
    // SQL is never offered an invalid document at all.
    routes["POST /v1/subscription_schedules"] = () =>
      json(
        adoptedSchedule({
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          items: PAID_ITEMS,
          phaseOver: { trial_end: NOW_S + 100 },
        }),
      );
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction()).toEqual({
      ok: false,
      reason: "reduction_adoption_phase_unsupported_trial_end",
    });
    const row = await operationRow();
    expect(row.reduction_dispatch_payload).toBeNull();
    expect(row.state).toBe("dispatching");
    expect(postsTo("/v1/subscription_schedules/sub_sched_1")).toHaveLength(0);

    // And the SQL half independently refuses such a document if one is offered.
    await expect(
      exec(
        "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,'awaiting_apply',NULL,NULL,$5,'dispatching',$6::jsonb)",
        [
          OPERATION,
          COMMERCIAL_OWNER,
          COMMERCIAL_ACCOUNT_TEST,
          "test",
          "sub_sched_1",
          JSON.stringify({ v: 1 }),
        ],
      ),
    ).rejects.toThrow(/payload_invalid/);
  });
});

describe("B5/B6 — the ADOPTION request pair, against independent literals", () => {
  /** The complete adoption request, written independently of the encoder. */
  const expectedAdoption = [["from_subscription", COMMERCIAL_SUBSCRIPTION]];
  const adoptionKey = `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}:adopt`;

  const assertAdoption = (post: {
    path: string;
    body: string;
    headers: Record<string, string>;
  }) => {
    expect(post.path).toBe("/v1/subscription_schedules");
    // The EXACT parameter multiset: `from_subscription` and nothing else — no
    // phases, no end_behavior, no settings, no customer, no expand.
    expect([...new URLSearchParams(post.body)].sort()).toEqual(expectedAdoption);
    expect(post.headers["Idempotency-Key"]).toBe(adoptionKey);
  };

  /**
   * A local model of the provider's own adoption state.
   *
   * The point of the lost-acknowledgment scenario is that the FIRST request had
   * a real EFFECT: a schedule exists, with the reply this operation never saw.
   * Simulating it by throwing and then hand-seeding an unrelated schedule would
   * also pass for a request that never arrived, which is the opposite case. So
   * the fake provider records the effect — endpoint, key, body and the exact
   * reply — before throwing, and everything the retry observes is derived from
   * that record.
   *
   * This models OUR OWN fake provider, deliberately: it asserts nothing about
   * what Stripe guarantees. Read staleness is modelled explicitly where a test
   * needs it, never assumed away.
   */
  const adoptionProvider = (reply: unknown) => {
    const effects: { path: string; key: string; body: string; reply: unknown }[] = [];
    let loseNext = true;
    routes["POST /v1/subscription_schedules"] = (url, init) => {
      const key = String((init.headers as Record<string, string>)?.["Idempotency-Key"] ?? "");
      // The effect happens ONCE for this key; a repeat under the same key is
      // the retained reply, not a second schedule.
      if (!effects.some((effect) => effect.key === key))
        effects.push({ path: url.pathname, key, body: String(init.body ?? ""), reply });
      if (loseNext) {
        loseNext = false;
        // The schedule now exists; only the response is lost.
        throw new Error("socket timeout");
      }
      return json(effects.find((effect) => effect.key === key)?.reply ?? reply);
    };
    // What the subscription shows is DERIVED from that effect, not seeded.
    routes[`GET /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(
        subscriptionQueue.length > 0
          ? subscriptionQueue.shift()
          : proWithSeatsSubscription(
              NOW_S,
              3,
              effects.length > 0 ? { schedule: "sub_sched_1" } : {},
            ),
      );
    return effects;
  };

  it("B4 — the first adoption really happens, loses its ACK, and its retained reply is replayed", async () => {
    await prepareReduction();
    const effects = adoptionProvider(adoptedScheduleFixture());

    // FIRST ADOPTION: the request lands, the schedule is created, the response
    // is lost. This operation recorded nothing.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction()).toEqual({ ok: false, reason: "schedule_adopt_uncertain" });
    const first = postsTo("/v1/subscription_schedules");
    expect(first).toHaveLength(1);
    assertAdoption(first[0]);
    expect(effects).toHaveLength(1);
    expect(effects[0].body).toBe(first[0].body);
    expect(effects[0].key).toBe(adoptionKey);
    expect((await operationRow()).schedule_id).toBeNull();

    // THE RETAINED RETRY, under the same key, against that same effect.
    calls = [];
    const resumed = await confirmReduction();
    expect(resumed, JSON.stringify({ resumed, sqlErrors })).toMatchObject({
      ok: true,
      state: "scheduled",
    });
    const retry = postsTo("/v1/subscription_schedules");
    expect(retry).toHaveLength(1);
    assertAdoption(retry[0]);
    // THE PAIR IS IDENTICAL, and the provider still has exactly ONE adoption.
    expect(retry[0].body).toBe(first[0].body);
    expect(retry[0].headers["Idempotency-Key"]).toBe(first[0].headers["Idempotency-Key"]);
    expect(effects).toHaveLength(1);
    expect((await operationRow()).schedule_id).toBe("sub_sched_1");
  });

  it("B2/B4 — explicit collection/payment: one real adoption, and the FULL phases pair", async () => {
    await prepareReduction();
    // A SUPPORTED explicit profile: the source subscription's own collection
    // method and default payment method, echoed by the adoption reply. They
    // belong in the stored expectations AND, because they are explicit
    // overrides, in both canonical phases of the request.
    const overrides = {
      collection_method: "charge_automatically",
      default_payment_method: "pm_card_1",
    };
    const explicit = adoptedSchedule({
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      items: PAID_ITEMS,
      defaultsOver: overrides,
      phaseOver: overrides,
    });
    const explicitUpdated = reductionSchedule(
      {
        nowSeconds: NOW_S,
        currentItems: PAID_ITEMS,
        nextItems: TARGET_ITEMS,
        periodEnd: PERIOD_END,
        periodStart: PERIOD_START,
        phaseOver: overrides,
      },
      { default_settings: { ...(explicit.default_settings as Record<string, unknown>) } },
    );
    const effects = adoptionProvider(explicit);
    routes["POST /v1/subscription_schedules/sub_sched_1"] = () => json(explicitUpdated);
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () =>
      json(scheduleQueue.length > 0 ? scheduleQueue.shift() : explicitUpdated);

    // The first adoption lands and loses its response.
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    await confirmReduction();
    const firstAdopt = postsTo("/v1/subscription_schedules");
    expect(firstAdopt).toHaveLength(1);
    assertAdoption(firstAdopt[0]);
    expect(effects).toHaveLength(1);

    // The retained adoption replay then captures the payload and sends the
    // FIRST phase update.
    calls = [];
    const resumed = await confirmReduction();
    expect(resumed, JSON.stringify({ resumed, sqlErrors })).toMatchObject({
      ok: true,
      state: "scheduled",
    });
    const retryAdopt = postsTo("/v1/subscription_schedules");
    expect(retryAdopt).toHaveLength(1);
    assertAdoption(retryAdopt[0]);
    expect(retryAdopt[0].body).toBe(firstAdopt[0].body);
    expect(effects).toHaveLength(1);
    const firstPhases = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(firstPhases).toHaveLength(1);

    // The explicit settings were captured as EXPECTATIONS in the durable
    // payload, which is what the later verification compares against.
    const payload = (await operationRow()).reduction_dispatch_payload as {
      expectedSettings: {
        defaultSettings: Record<string, unknown>;
        paidPhase: Record<string, unknown>;
      };
    };
    expect(payload.expectedSettings.defaultSettings).toMatchObject(overrides);
    expect(payload.expectedSettings.paidPhase).toMatchObject(overrides);

    // A RETAINED PHASES RETRY: the operation is reopened and the schedule read
    // is deliberately STALE (it still shows the single adopted phase), so the
    // stored body is replayed rather than verified as complete.
    await exec(
      "UPDATE public.stripe_commercial_operations SET state='awaiting_apply', resolved_at=NULL WHERE operation_id=$1",
      [OPERATION],
    );
    calls = [];
    subscriptionQueue = [
      proWithSeatsSubscription(NOW_S + 5 * 86_400, 3, { schedule: "sub_sched_1" }),
    ];
    scheduleQueue = [explicit];
    expect(await confirmReduction()).toMatchObject({ ok: true });
    const retryPhases = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(retryPhases).toHaveLength(1);

    // THE INDEPENDENT EXPECTATION for the explicit profile: literals, not the
    // production encoder. The overrides are restated on BOTH phases, the
    // reduced phase has no end_date/duration, and every index/quantity is
    // pinned.
    const expectedPhases = [
      ["end_behavior", "release"],
      ["phases[0][collection_method]", "charge_automatically"],
      ["phases[0][default_payment_method]", "pm_card_1"],
      ["phases[0][end_date]", String(PERIOD_END)],
      ["phases[0][items][0][price]", PRICE_IDS.proBase],
      ["phases[0][items][0][quantity]", "1"],
      ["phases[0][items][1][price]", PRICE_IDS.proSeat],
      ["phases[0][items][1][quantity]", "3"],
      ["phases[0][proration_behavior]", "none"],
      ["phases[0][start_date]", String(PERIOD_START)],
      ["phases[1][collection_method]", "charge_automatically"],
      ["phases[1][default_payment_method]", "pm_card_1"],
      ["phases[1][items][0][price]", PRICE_IDS.growthBase],
      ["phases[1][items][0][quantity]", "1"],
      ["phases[1][proration_behavior]", "none"],
      ["phases[1][start_date]", String(PERIOD_END)],
      ["proration_behavior", "none"],
    ];
    for (const post of [firstPhases[0], retryPhases[0]]) {
      expect([...new URLSearchParams(post.body)].sort()).toEqual(expectedPhases);
      expect(post.path).toBe("/v1/subscription_schedules/sub_sched_1");
      expect(post.headers["Idempotency-Key"]).toBe(
        `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}:phases`,
      );
    }
    expect(retryPhases[0].body).toBe(firstPhases[0].body);
    const keys = [...new URLSearchParams(retryPhases[0].body).keys()];
    expect(keys).not.toContain("phases[1][end_date]");
    expect(keys).not.toContain("phases[1][duration]");
    expect(keys).not.toContain("phases[2][start_date]");
  });
});

describe("B6/B7 — the stored payload is the only body, and recovery is read-only", () => {
  it("serialises the IDENTICAL endpoint/key/parameters on first call and retained retry", async () => {
    await prepareReduction();
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction()).toMatchObject({ ok: true, state: "scheduled" });
    const first = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(first).toHaveLength(1);

    // A RETAINED retry, with the configured growth base price MOVED and the
    // current period rolled forward. Neither may redefine the body.
    await exec(
      "UPDATE public.stripe_commercial_operations SET state='awaiting_apply', resolved_at=NULL WHERE operation_id=$1",
      [OPERATION],
    );
    calls = [];
    const movedEnv = {
      ...COMMERCIAL_ENV,
      STRIPE_PRICE_GROWTH_BASE_TEST: `price_tgrowth_v2:${PRODUCT_IDS.growth}:eur:month`,
    };
    routes["GET /v1/prices/price_tgrowth_v2"] = () =>
      json({
        id: "price_tgrowth_v2",
        object: "price",
        active: true,
        livemode: false,
        currency: "eur",
        product: PRODUCT_IDS.growth,
        unit_amount: APPROVED_MINOR.growthBase,
        recurring: { interval: "month", interval_count: 1 },
      });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S + 5 * 86_400, 3)];
    scheduleQueue = [adoptedScheduleFixture()];
    expect(await confirmReduction({ env: movedEnv })).toMatchObject({ ok: true });
    const retry = postsTo("/v1/subscription_schedules/sub_sched_1");
    expect(retry).toHaveLength(1);

    // THE INDEPENDENT EXPECTATION: literals, not the production encoder.
    const expected = [
      ["end_behavior", "release"],
      ["phases[0][end_date]", String(PERIOD_END)],
      ["phases[0][items][0][price]", PRICE_IDS.proBase],
      ["phases[0][items][0][quantity]", "1"],
      ["phases[0][items][1][price]", PRICE_IDS.proSeat],
      ["phases[0][items][1][quantity]", "3"],
      ["phases[0][proration_behavior]", "none"],
      ["phases[0][start_date]", String(PERIOD_START)],
      ["phases[1][items][0][price]", PRICE_IDS.growthBase],
      ["phases[1][items][0][quantity]", "1"],
      ["phases[1][proration_behavior]", "none"],
      ["phases[1][start_date]", String(PERIOD_END)],
      ["proration_behavior", "none"],
    ];
    for (const post of [first[0], retry[0]]) {
      expect([...new URLSearchParams(post.body)].sort()).toEqual(expected);
      expect(post.path).toBe("/v1/subscription_schedules/sub_sched_1");
      expect(post.headers["Idempotency-Key"]).toBe(
        `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}:phases`,
      );
    }
    // No invented end_date or duration on the reduced phase, and no method is
    // named where the original inherited one.
    const keys = [...new URLSearchParams(retry[0].body).keys()];
    expect(keys).not.toContain("phases[1][end_date]");
    expect(keys).not.toContain("phases[1][duration]");
    expect(keys.some((key) => key.includes("collection_method"))).toBe(false);
    expect(keys.some((key) => key.includes("default_payment_method"))).toBe(false);
  });

  it("B7 — lost phases ACK + restart + period rollover + >24h completes with ZERO POSTs", async () => {
    await prepareReduction();
    // The phases POST reaches the provider and its acknowledgment is lost.
    routes["POST /v1/subscription_schedules/sub_sched_1"] = () => {
      throw new Error("socket timeout");
    };
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await confirmReduction()).toEqual({ ok: false, reason: "schedule_update_uncertain" });
    const captured = await operationRow();
    expect(captured.state).toBe("awaiting_apply");
    expect(captured.reduction_dispatch_payload).toBeTruthy();

    // Discard every process-local trace, roll the period forward, cross the
    // retention boundary — and GENUINELY ROTATE THE OBSERVED PRICE out of the
    // catalogue. `price_tpro` is what the subscription actually carries, so a
    // recovery that still parsed the subscription against today's registry
    // could not read it at all and the operation stayed unresolved forever.
    rpcTrace = [];
    calls = [];
    const rotatedEnv = {
      ...COMMERCIAL_ENV,
      STRIPE_PRICE_PRO_BASE_TEST: `price_tpro_rotated:${PRODUCT_IDS.pro}:eur:month`,
    };
    // Prove the premise: the registry this recovery runs under no longer
    // recognises the price the subscription carries.
    const rotatedRegistry = buildPriceRegistry("test", rotatedEnv);
    expect(rotatedRegistry.ok).toBe(true);
    if (rotatedRegistry.ok) expect(rotatedRegistry.registry.has(PRICE_IDS.proBase)).toBe(false);
    subscriptionQueue = [proWithSeatsSubscription(NOW_S + 25 * 86_400, 3)];
    const result = await confirmReduction({
      now: NOW_MS + 25 * 86_400_000,
      env: rotatedEnv,
    });
    expect(result).toMatchObject({ ok: true, state: "scheduled" });
    // ZERO POSTs OF ANY KIND during the recovery.
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow()).state).toBe("applied");
    expect(rpcArgs("stripe_commercial_finish_operation")[0]).toMatchObject({
      p_state: "applied",
      p_expected_state: "awaiting_apply",
    });
    // And the recovery really did read its own durable row.
    expect(rpcNames()).toContain("stripe_commercial_read_operation");
  });

  it("B7 negative — changed or insufficient evidence stays held, with no deadline move", async () => {
    await prepareReduction();
    routes["POST /v1/subscription_schedules/sub_sched_1"] = () => {
      throw new Error("socket timeout");
    };
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    await confirmReduction();
    const before = await operationRow();

    // The read-back now shows an ALTERED paid phase (quantity 999).
    rpcTrace = [];
    calls = [];
    routes["GET /v1/subscription_schedules/sub_sched_1"] = () =>
      json(
        reductionSchedule({
          nowSeconds: NOW_S,
          currentItems: [
            { priceId: PRICE_IDS.proBase, quantity: 1 },
            { priceId: PRICE_IDS.proSeat, quantity: 999 },
          ],
          nextItems: TARGET_ITEMS,
          periodEnd: PERIOD_END,
          periodStart: PERIOD_START,
        }),
      );
    subscriptionQueue = [proWithSeatsSubscription(NOW_S + 25 * 86_400, 3)];
    expect(
      await confirmReduction({
        now: NOW_MS + 25 * 86_400_000,
        env: {
          ...COMMERCIAL_ENV,
          STRIPE_PRICE_PRO_BASE_TEST: `price_tpro_rotated:${PRODUCT_IDS.pro}:eur:month`,
        },
      }),
    ).toEqual({
      ok: false,
      reason: "schedule_phase0_items_unexpected",
    });
    expect(providerPosts()).toHaveLength(0);
    const after = await operationRow();
    // The payload is byte-identical and the boundary has not moved.
    expect(after.reduction_dispatch_payload).toEqual(before.reduction_dispatch_payload);
    expect(after.state).toBe("fenced");
    expect(rpcArgs("stripe_commercial_finish_operation")).toEqual([]);
  });

  it("A-F1 — a retained INCREASE replay survives a genuinely rotated observed price", async () => {
    await prepareIncrease();
    // The invoice-capture write fails before it lands, so the operation stays
    // `dispatching` with no captured invoice: the one state where a retained
    // replay is the only admissible recovery.
    rpcHooks.set("stripe_commercial_advance_operation", async (args, invoke) => {
      if (args.p_state === "awaiting_payment") throw new Error("transport failed");
      return invoke();
    });
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    await confirm();
    expect((await operationRow()).state).toBe("dispatching");
    expect((await operationRow()).invoice_id).toBeNull();

    // ROTATE the price the subscription ACTUALLY carries. The authoritative
    // subscription still reports `price_tgrowth`; today's catalogue no longer
    // has it. Before the correction this returned `state_item_unknown_price`
    // with ZERO reads of the durable operation.
    rpcHooks.clear();
    rpcTrace = [];
    calls = [];
    const rotatedEnv = {
      ...COMMERCIAL_ENV,
      STRIPE_PRICE_GROWTH_BASE_TEST: `price_tgrowth_rotated:${PRODUCT_IDS.growth}:eur:month`,
    };
    const rotated = buildPriceRegistry("test", rotatedEnv);
    expect(rotated.ok).toBe(true);
    if (rotated.ok) expect(rotated.registry.has(PRICE_IDS.growthBase)).toBe(false);

    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    expect(await confirm({ env: rotatedEnv })).toMatchObject({ ok: true, state: "applied" });
    // The replay used the ORIGINAL body — including the original base price,
    // which is no longer in the catalogue at all.
    const replays = postsTo(`/v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`);
    expect(replays).toHaveLength(1);
    expect(new URLSearchParams(replays[0].body).get("items[0][price]")).toBe(PRICE_IDS.proBase);
    expect(replays[0].headers["Idempotency-Key"]).toBe(
      `milo-chg:${COMMERCIAL_ACCOUNT_TEST}:test:${OPERATION}`,
    );
    // And the durable row was actually read and settled.
    expect(mocks.from).toHaveBeenCalledWith("stripe_commercial_operations");
    const row = await operationRow();
    expect(row).toMatchObject({ state: "applied", invoice_id: UPDATED_INVOICE });
  });

  it("A-F1 — a rotated catalogue still blocks a FRESH intent", async () => {
    // The correction must not become a catalogue bypass. With no durable
    // operation there is nothing to recover, so today's eligibility applies in
    // full and the unknown observed price refuses the whole read.
    await seedOwner();
    subscriptionQueue = [growthSubscription(NOW_S)];
    expect(
      await prepare({
        env: {
          ...COMMERCIAL_ENV,
          STRIPE_PRICE_GROWTH_BASE_TEST: `price_tgrowth_rotated:${PRODUCT_IDS.growth}:eur:month`,
        },
      }),
    ).toEqual({ ok: false, reason: "state_item_unknown_price" });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
    expect(providerPosts()).toHaveLength(0);
  });

  it("A-F1 — recovery is NOT an owner, account or mode bypass", async () => {
    await prepareIncrease();
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    expect((await operationRow()).state).toBe("awaiting_apply");

    // A valid persisted operation under the WRONG owner: the scoped SELECT
    // finds nothing and the owner's own mapping refuses first. Zero mutation.
    calls = [];
    rpcTrace = [];
    expect(await confirm({ userId: "00000000-0000-4000-8000-0000000000fe" })).toEqual({
      ok: false,
      reason: "no_customer",
    });
    expect(providerPosts()).toHaveLength(0);
    expect((await operationRow()).state).toBe("awaiting_apply");

    // The WRONG account/mode cannot be reached at all: both come from the
    // server configuration, never from the caller. Proving the SELECT is scoped
    // to them is done directly against SQL.
    expect(
      await one(
        `SELECT state FROM public.stripe_commercial_operations
           WHERE operation_id=$1 AND user_id=$2 AND account_id=$3 AND mode=$4`,
        [OPERATION, COMMERCIAL_OWNER, "acct_someone_else", "test"],
      ),
    ).toBeUndefined();
    expect(
      await one(
        `SELECT state FROM public.stripe_commercial_operations
           WHERE operation_id=$1 AND user_id=$2 AND account_id=$3 AND mode=$4`,
        [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "live"],
      ),
    ).toBeUndefined();
  });
});

/* ========================================================================== */
/* Track C — refunds, capacity and the guarded projection                     */
/* ========================================================================== */

describe("C1/C2/C3 — refund reservation against real SQL", () => {
  const execRefund = (over: { now?: number | (() => number); operationId?: string } = {}) =>
    executeApprovedRefund(
      {
        caseId: "CASE-1",
        operationId: over.operationId ?? OPERATION,
        mode: "test",
        operatorActor: "operator:rafal",
      },
      deps(over),
    );

  it("reserves, dispatches and settles once, consuming the approved case", async () => {
    await seedOwner();
    await seedRefundCase();
    expect(await execRefund()).toMatchObject({
      ok: true,
      state: "succeeded",
      refundedMinor: APPROVED_MINOR.growthBase,
    });
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    expect((await operationRow()).state).toBe("applied");
    expect(
      (
        await one<{ state: string }>(
          "SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-1'",
        )
      ).state,
    ).toBe("consumed");
    // The returned state TEXT was parsed, not treated as a boolean.
    expect(rpcArgs("stripe_commercial_settle_refund")[0]).toMatchObject({
      p_status: "succeeded",
      p_refund: "re_1",
    });
  });

  it("C1 — an overlapping recovery with a complete EMPTY list keeps the funds reserved", async () => {
    await seedOwner();
    await seedRefundCase();
    // Execution A's POST is held open; execution B resumes the same operation.
    const held = deferred();
    routes["POST /v1/refunds"] = async () => {
      await held.promise;
      return json(refundObject());
    };
    const attemptA = execRefund();
    // Let A reach its POST, then run B against the same operation.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vi.waitFor(async () => {
      expect((await operationRow()).state).toBe("dispatching");
    });
    routes["GET /v1/refunds"] = () => json(list([]));
    const resultB = await execRefund();
    expect(resultB).toEqual({ ok: false, reason: "refund_outcome_unknown" });
    // No synthetic settlement, no release, nothing terminal, no second POST.
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect(postsTo("/v1/refunds")).toHaveLength(1);

    held.resolve();
    // A's own result is unaffected and reconciles exactly once.
    expect(await attemptA).toMatchObject({ ok: true, state: "succeeded" });
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
  });

  it("C1 — an empty list PAST retention is still reserved and never released", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => {
      throw new Error("socket timeout");
    };
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_uncertain" });
    expect((await operationRow()).state).toBe("awaiting_apply");

    calls = [];
    rpcTrace = [];
    expect(await execRefund({ now: NOW_MS + 24 * 3600 * 1000 + 1 })).toEqual({
      ok: false,
      reason: "refund_outcome_unknown",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(await reservationRow()).toMatchObject({ state: "reserved" });
    expect((await operationRow()).state).toBe("awaiting_apply");
  });

  it("C1 — a competing case cannot over-reserve the same payment", async () => {
    await seedOwner();
    await seedRefundCase();
    await exec(
      "SELECT public.stripe_commercial_record_refund_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        "CASE-2",
        COMMERCIAL_OWNER,
        COMMERCIAL_ACCOUNT_TEST,
        "test",
        REFUND_INVOICE,
        COMMERCIAL_SUBSCRIPTION,
        "growth",
        APPROVED_MINOR.growthBase,
        "eur",
        "outage",
        "retainSubscription",
        "unchanged",
        "operator:rafal",
        new Date(NOW_MS - 2 * 86_400_000).toISOString(),
      ],
    );
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    const second = await executeApprovedRefund(
      { caseId: "CASE-2", operationId: OPERATION_B, mode: "test", operatorActor: "operator:rafal" },
      deps(),
    );
    expect(second).toEqual({ ok: false, reason: "refund_reservation_refused" });
    expect(await reservationRow("CASE-2")).toBeUndefined();
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("C2 — a wrong created amount never settles the approved reservation", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () =>
      json(refundObject({ amount: APPROVED_MINOR.growthBase - 1 }));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_amount_unexpected" });
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    expect((await operationRow()).state).toBe("awaiting_apply");
  });

  it("C2 — only an authoritative failed/canceled refund releases the funds", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => json(refundObject({ status: "pending" }));
    expect(await execRefund()).toMatchObject({ ok: true, state: "pending" });
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: "re_1" });
    expect((await operationRow()).state).toBe("awaiting_apply");

    // The same refund later fails authoritatively.
    calls = [];
    routes["GET /v1/refunds"] = () =>
      json(list([refundObject({ status: "failed", metadata: { milo_refund_case: "CASE-1" } })]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_failed" });
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
    expect((await operationRow()).state).toBe("refused");
    expect(postsTo("/v1/refunds")).toHaveLength(0);
  });

  it("C3 — a lost settle ACK is resolved by the identical settlement, not a second refund", async () => {
    await seedOwner();
    await seedRefundCase();
    let settles = 0;
    rpcHooks.set("stripe_commercial_settle_refund", async (_args, invoke) => {
      settles += 1;
      const data = await invoke();
      if (settles === 1) throw new Error("lost acknowledgment");
      return data;
    });
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    expect(settles).toBe(2);
    expect(postsTo("/v1/refunds")).toHaveLength(1);
    const reservation = await reservationRow();
    // The recorded refund id was never repointed and the amount is unchanged.
    expect(reservation).toMatchObject({ state: "settled", refund_id: "re_1" });
    expect(Number(reservation.amount)).toBe(APPROVED_MINOR.growthBase);
  });

  it("C3 — a CONSUMED case replays the durable success with zero refund POSTs", async () => {
    await seedOwner();
    await seedRefundCase();
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    expect(
      (
        await one<{ state: string }>(
          "SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-1'",
        )
      ).state,
    ).toBe("consumed");

    calls = [];
    rpcTrace = [];
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    // No `refund_case_consumed` failure, no new refund, no new reservation.
    expect(postsTo("/v1/refunds")).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_reserve_refund");
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
  });

  it("C3 — an unproved settle or finish stays uncertain", async () => {
    await seedOwner();
    await seedRefundCase();
    rpcHooks.set("stripe_commercial_settle_refund", async () => {
      throw new Error("transport failed");
    });
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_settlement_unavailable" });
    expect(await reservationRow()).toMatchObject({ state: "reserved" });
    expect((await operationRow()).state).toBe("dispatching");

    rpcHooks.clear();
    rpcHooks.set("stripe_commercial_finish_operation", async () => {
      throw new Error("transport failed");
    });
    routes["GET /v1/refunds"] = () =>
      json(list([refundObject({ metadata: { milo_refund_case: "CASE-1" } })]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_settlement_uncertain" });
  });
});

describe("C-R1/C-R2/C-R3/C-R4 — refund uncertainty, identity and durable settlement", () => {
  const execRefund = (
    over: { now?: number | (() => number); operationId?: string; caseId?: string } = {},
  ) =>
    executeApprovedRefund(
      {
        caseId: over.caseId ?? "CASE-1",
        operationId: over.operationId ?? OPERATION,
        mode: "test",
        operatorActor: "operator:rafal",
      },
      deps(over),
    );

  /**
   * A second, legitimate refund operation row, created and then CLOSED.
   *
   * `stripe_refund_reservations.operation_id` carries a foreign key, so the only
   * way to stage "this case's reservation belongs to ANOTHER operation" is to
   * have that other operation really exist — recorded case, real
   * `begin_operation`, no table write invented by the test. It is closed again
   * because the frozen schema permits exactly ONE open operation per
   * owner/account/mode, which is also why it must be staged first.
   */
  const beginOtherRefundOperation = async () => {
    await exec(
      "SELECT public.stripe_commercial_record_refund_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        "CASE-2",
        COMMERCIAL_OWNER,
        COMMERCIAL_ACCOUNT_TEST,
        "test",
        REFUND_INVOICE,
        COMMERCIAL_SUBSCRIPTION,
        "growth",
        APPROVED_MINOR.growthBase,
        "eur",
        "outage",
        "retainSubscription",
        "unchanged",
        "operator:rafal",
        new Date(NOW_MS - 2 * 86_400_000).toISOString(),
      ],
    );
    await exec(
      `SELECT * FROM public.stripe_commercial_begin_operation(
         $1,$2,$3,'test','refund',$4,'fingerprint-other','milo-ref:other',NULL::uuid,$5)`,
      [OPERATION_B, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, COMMERCIAL_SUBSCRIPTION, "CASE-2"],
    );
    await exec(
      "SELECT public.stripe_commercial_finish_operation($1,$2,$3,'test','refused','other_case','prepared')",
      [OPERATION_B, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST],
    );
  };

  it("C-R1/C-R2 — a reservation transport error never closes an in-flight refund", async () => {
    await seedOwner();
    await seedRefundCase();

    // EXECUTION A reserves, advances to `dispatching` and parks inside its
    // provider POST.
    const parkedPost = deferred();
    const postStarted = deferred();
    routes["POST /v1/refunds"] = async () => {
      postStarted.resolve();
      await parkedPost.promise;
      return json(refundObject());
    };
    const attemptA = execRefund();
    await postStarted.promise;
    expect((await operationRow()).state).toBe("dispatching");
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });

    // EXECUTION B resumes the SAME operation and only its reserve call fails.
    rpcTrace = [];
    rpcHooks.set("stripe_commercial_reserve_refund", async () => {
      throw new Error("transport failed");
    });
    const resultB = await execRefund();
    // Before the correction B reported `refund_reservation_refused` and really
    // closed the dispatched operation `refused`, with no authoritative
    // failed/canceled refund anywhere. Now the scoped reservation PROVES the
    // reservation is this operation's own, so B continues and reports the only
    // honest thing it can see: the outcome is not durable yet.
    expect(resultB).toEqual({ ok: false, reason: "refund_outcome_unknown" });
    // DECISIVE: B closed nothing at all.
    expect(rpcNames()).not.toContain("stripe_commercial_finish_operation");
    const duringFlight = await operationRow();
    expect(duringFlight.state).toBe("awaiting_apply");
    expect(duringFlight.refusal_code).toBeNull();
    expect(isOpenOperationState(duringFlight.state)).toBe(true);
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });

    // A's provider response then succeeds. The operation and the reservation
    // agree, exactly once — even though B moved the state under A, because
    // every write asserts the state it last observed and then re-reads.
    rpcHooks.clear();
    parkedPost.resolve();
    expect(await attemptA).toMatchObject({ ok: true, state: "succeeded" });
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    expect((await operationRow()).state).toBe("applied");
    // ONE financial intent in the whole interleaving.
    expect(postsTo("/v1/refunds")).toHaveLength(1);

    // And the replay is ACCURATE: the durable success, not `refund_case_refused`.
    calls = [];
    rpcTrace = [];
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
  });

  it("C-R1 — a FOREIGN reservation never closes a DISPATCHED operation", async () => {
    await seedOwner();
    await seedRefundCase();
    await beginOtherRefundOperation();
    const parkedPost = deferred();
    const postStarted = deferred();
    routes["POST /v1/refunds"] = async () => {
      postStarted.resolve();
      await parkedPost.promise;
      return json(refundObject());
    };
    const attemptA = execRefund();
    await postStarted.promise;
    expect((await operationRow()).state).toBe("dispatching");

    // The reservation on this case now belongs to ANOTHER operation, so real
    // SQL raises `refund_case_mismatch` — a deterministic rejection. It is
    // still not a licence to terminate a refund that is in flight.
    await exec("UPDATE public.stripe_refund_reservations SET operation_id=$2 WHERE case_id=$1", [
      "CASE-1",
      OPERATION_B,
    ]);
    rpcTrace = [];
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_reservation_uncertain" });
    expect(rpcNames()).not.toContain("stripe_commercial_finish_operation");
    const duringFlight = await operationRow();
    expect(duringFlight.state).toBe("dispatching");
    expect(duringFlight.refusal_code).toBeNull();

    // Restore the reservation's true owner and let A's POST complete: the
    // dispatched refund it really did create is settled exactly once.
    await exec("UPDATE public.stripe_refund_reservations SET operation_id=$2 WHERE case_id=$1", [
      "CASE-1",
      OPERATION,
    ]);
    parkedPost.resolve();
    expect(await attemptA).toMatchObject({ ok: true, state: "succeeded" });
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("C-R1 — a TRANSPORT failure before the reserve write keeps a PREPARED refund recoverable", async () => {
    await seedOwner();
    await seedRefundCase();
    // A healthy approved case. The reserve call fails before writing anything,
    // so the scoped read legitimately finds NO reservation row.
    rpcHooks.set("stripe_commercial_reserve_refund", async () => {
      throw new Error("socket hang up");
    });
    // Absence is not proof of an over-reservation, a spent case or any other
    // business rejection: before the correction this finished the operation
    // `refused/reservation_refused` and permanently burned a valid approval.
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_reservation_uncertain" });
    const held = await operationRow();
    expect(held.state).toBe("prepared");
    expect(held.refusal_code).toBeNull();
    expect(isOpenOperationState(held.state)).toBe(true);
    expect(await reservationRow()).toBeUndefined();
    expect(
      (
        await one<{ state: string }>(
          "SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-1'",
        )
      ).state,
    ).toBe("approved");
    expect(providerPosts()).toHaveLength(0);

    // The approval is still usable: the clean retry reserves and refunds once.
    rpcHooks.clear();
    calls = [];
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("C-R1 — a still-prepared operation keeps its deterministic reserve refusal", async () => {
    await seedOwner();
    await seedRefundCase();
    // A real rejection: the case has already been spent by another operation's
    // settled reservation, so `reserve_refund` refuses deterministically.
    await exec(
      "SELECT public.stripe_commercial_record_refund_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        "CASE-2",
        COMMERCIAL_OWNER,
        COMMERCIAL_ACCOUNT_TEST,
        "test",
        REFUND_INVOICE,
        COMMERCIAL_SUBSCRIPTION,
        "growth",
        APPROVED_MINOR.growthBase,
        "eur",
        "outage",
        "retainSubscription",
        "unchanged",
        "operator:rafal",
        new Date(NOW_MS - 2 * 86_400_000).toISOString(),
      ],
    );
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    calls = [];
    // CASE-2 cannot over-reserve the same payment: a genuine SQL rejection on a
    // still-`prepared` operation, closed under the prepared compare-and-set.
    expect(await execRefund({ caseId: "CASE-2", operationId: OPERATION_B })).toEqual({
      ok: false,
      reason: "refund_reservation_refused",
    });
    expect(await operationRow(OPERATION_B)).toMatchObject({
      state: "refused",
      refusal_code: "reservation_refused",
    });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
  });

  it("C-R2 — a DIFFERENT durable terminal is reported accurately, never as success", async () => {
    await seedOwner();
    await seedRefundCase();
    // The settlement commits, then this instance's `finish` loses its race to
    // another worker's durable `refused`.
    rpcHooks.set("stripe_commercial_finish_operation", async (args, invoke) => {
      if (args.p_state === "applied") {
        // Another worker closes the operation `refused` first, through real SQL.
        await exec(
          "SELECT public.stripe_commercial_finish_operation($1,$2,$3,$4,'refused','other_worker',$5)",
          [OPERATION, COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test", "dispatching"],
        );
      }
      return invoke();
    });
    const result = await execRefund();
    // Collapsing every terminal into a boolean reported `succeeded` here while
    // the operation was `refused`, and the next replay then contradicted it.
    expect(result).toEqual({ ok: false, reason: "refund_settled_but_operation_refused" });
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    const row = await operationRow();
    expect(row.state).toBe("refused");
    expect(row.refusal_code).toBe("other_worker");
    // Nothing reopened and nothing re-dispatched.
    expect(postsTo("/v1/refunds")).toHaveLength(1);
  });

  it("C-R3 — a creation response naming ANOTHER case settles nothing", async () => {
    await seedOwner();
    await seedRefundCase();
    // Same amount, same currency, same payment — a different case.
    routes["POST /v1/refunds"] = () =>
      json(refundObject({ metadata: { milo_refund_case: "CASE-OTHER" } }));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_refund_case_link" });
    // The approved reservation is untouched and nothing is applied.
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
    const row = await operationRow();
    expect(row.state).toBe("awaiting_apply");
    expect(
      (
        await one<{ state: string }>(
          "SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-1'",
        )
      ).state,
    ).toBe("approved");
  });

  it("C-R3 — a response with no case metadata at all settles nothing either", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => json(refundObject({ metadata: {} }));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_refund_case_link" });
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });
    expect(rpcArgs("stripe_commercial_settle_refund")).toEqual([]);
  });

  it("C-R4 — TWO lost settlement ACKs finish from the durable reservation, with no POST", async () => {
    await seedOwner();
    await seedRefundCase();
    // The first settlement COMMITS; its acknowledgment and the identical
    // retry's acknowledgment are both lost.
    rpcHooks.set("stripe_commercial_settle_refund", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    const first = await execRefund();
    // SQL already holds the exact terminal result.
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    // With the durable readback the committed settlement is recognised and the
    // operation completes; previously this returned
    // `refund_settlement_unavailable` and left the operation `dispatching`.
    expect(first).toMatchObject({ ok: true, state: "succeeded" });
    expect((await operationRow()).state).toBe("applied");
    expect(postsTo("/v1/refunds")).toHaveLength(1);

    // A FRESH execution against an EMPTY provider list still completes from the
    // durable row rather than hanging on rediscovery.
    rpcHooks.clear();
    calls = [];
    rpcTrace = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    expect(postsTo("/v1/refunds")).toHaveLength(0);
  });

  it("C-R4 — a settled reservation completes a still-OPEN operation after a restart", async () => {
    await seedOwner();
    await seedRefundCase();
    // Commit the settlement but lose both the settle ACK and the finish, so the
    // operation is left open with a settled reservation — the exact state the
    // review reported as permanently unresolvable behind an empty list.
    rpcHooks.set("stripe_commercial_settle_refund", async (_args, invoke) => {
      await invoke();
      throw new Error("lost acknowledgment");
    });
    rpcHooks.set("stripe_commercial_finish_operation", async () => {
      throw new Error("lost acknowledgment");
    });
    await execRefund();
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
    const open = await operationRow();
    expect(isOpenOperationState(open.state)).toBe(true);

    // Restart: no process state, an EMPTY provider refund list.
    rpcHooks.clear();
    calls = [];
    rpcTrace = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toMatchObject({ ok: true, state: "succeeded" });
    expect((await operationRow()).state).toBe("applied");
    // Zero POSTs; the idempotent reserve recognised the SAME reservation rather
    // than creating a second one, and the recorded refund id never moved.
    expect(providerPosts()).toHaveLength(0);
    expect(
      Number(
        (
          await one<{ count: string }>(
            "SELECT count(*)::text AS count FROM public.stripe_refund_reservations",
          )
        ).count,
      ),
    ).toBe(1);
    expect(await reservationRow()).toMatchObject({ state: "settled", refund_id: "re_1" });
  });

  it("C-R4 — a RELEASED reservation is reported as the release, never as success", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => json(refundObject({ status: "failed" }));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_failed" });
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
    expect((await operationRow()).state).toBe("refused");

    // A later execution replays the EXACT durable negative — the released
    // reservation's own failed status, not the mutable case state and never a
    // success — with no POST and no new reservation.
    calls = [];
    rpcTrace = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_failed" });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_reserve_refund");
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
    expect(await operationRow()).toMatchObject({
      state: "refused",
      refusal_code: "refund_failed",
    });
  });

  /**
   * The authoritative NEGATIVE terminal, reached with the finish write in each
   * of the three states it can be left in. In every case the funds are really
   * released by real SQL and the provider refund really failed.
   */
  const releaseWithFinish = async (finish: "lost" | "no-write" | "unreadable") => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => json(refundObject({ status: "failed" }));
    if (finish === "lost")
      rpcHooks.set("stripe_commercial_finish_operation", async (_args, invoke) => {
        await invoke();
        throw new Error("lost acknowledgment");
      });
    else
      rpcHooks.set("stripe_commercial_finish_operation", async () => {
        throw new Error("transport failed");
      });
    if (finish === "unreadable")
      rpcHooks.set("stripe_commercial_read_operation", async () => {
        throw new Error("read failed");
      });
    return execRefund();
  };

  it("C-R4 — a released reservation with a COMMITTED but unacknowledged finish replays accurately", async () => {
    // The release and the operation's closure both committed; only the
    // acknowledgment was lost.
    expect(await releaseWithFinish("lost")).toEqual({ ok: false, reason: "refund_failed" });
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
    expect(await operationRow()).toMatchObject({
      state: "refused",
      refusal_code: "refund_failed",
    });
    // The case is now `refused`. A restart must still replay the EXACT durable
    // release — not the mutable case status — with no new intent at all.
    rpcHooks.clear();
    calls = [];
    rpcTrace = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_failed" });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_reserve_refund");
    expect(rpcNames()).not.toContain("stripe_commercial_settle_refund");
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
  });

  it("C-R4 — a released reservation whose finish NEVER WROTE is resolved on restart", async () => {
    // The funds are released but this instance's finish fails before writing —
    // including its one retry from the state it then re-read — so the operation
    // is left OPEN against a released reservation and said so.
    expect(await releaseWithFinish("no-write")).toEqual({
      ok: false,
      reason: "refund_release_completion_uncertain",
    });
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
    const open = await operationRow();
    expect(isOpenOperationState(open.state)).toBe(true);
    expect(
      (
        await one<{ state: string }>(
          "SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-1'",
        )
      ).state,
    ).toBe("approved");

    // Restart with an EMPTY provider list: the durable release resolves the SAME
    // operation, with no second reservation and no new refund.
    rpcHooks.clear();
    calls = [];
    rpcTrace = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_failed" });
    expect(await operationRow()).toMatchObject({
      state: "refused",
      refusal_code: "refund_failed",
    });
    expect(providerPosts()).toHaveLength(0);
    expect(rpcNames()).not.toContain("stripe_commercial_settle_refund");
    expect(
      Number(
        (
          await one<{ count: string }>(
            "SELECT count(*)::text AS count FROM public.stripe_refund_reservations",
          )
        ).count,
      ),
    ).toBe(1);
  });

  it("C-R4 — a release whose completion CANNOT BE READ is reported as unresolved", async () => {
    // The release is authoritative, but this instance can neither write nor read
    // the operation's final state. Reporting a bare `refund_failed` would claim
    // the operation had been finished when nothing established that.
    expect(await releaseWithFinish("unreadable")).toEqual({
      ok: false,
      reason: "refund_release_completion_uncertain",
    });
    expect(await reservationRow()).toMatchObject({ state: "released", refund_id: "re_1" });
    expect(isOpenOperationState((await operationRow()).state)).toBe(true);
    expect(postsTo("/v1/refunds")).toHaveLength(1);

    // Once SQL is reachable again the same durable release resolves it.
    rpcHooks.clear();
    calls = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_failed" });
    expect((await operationRow()).state).toBe("refused");
    expect(providerPosts()).toHaveLength(0);
  });

  it("C-R4 — a released reservation for ANOTHER operation resolves nothing", async () => {
    await seedOwner();
    await seedRefundCase();
    await beginOtherRefundOperation();
    routes["POST /v1/refunds"] = () => {
      throw new Error("socket timeout");
    };
    await execRefund();
    // A released row that is not this operation's is not its negative terminal
    // either, so nothing is closed from it.
    await exec(
      "UPDATE public.stripe_refund_reservations SET operation_id=$2, state='released', refund_id='re_other', refund_status='failed' WHERE case_id=$1",
      ["CASE-1", OPERATION_B],
    );
    calls = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_reservation_uncertain" });
    expect(isOpenOperationState((await operationRow()).state)).toBe(true);
    expect(providerPosts()).toHaveLength(0);
  });

  it("C-R4 — a RESERVED reservation with no refund id still falls back to provider evidence", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => {
      throw new Error("socket timeout");
    };
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_uncertain" });
    expect(await reservationRow()).toMatchObject({ state: "reserved", refund_id: null });

    // No durable terminal exists, so the empty provider list is correctly
    // UNKNOWN — not a completion derived from a reserved row.
    calls = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_outcome_unknown" });
    expect(await reservationRow()).toMatchObject({ state: "reserved" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("C-R4 — an UNREADABLE reservation read is uncertainty, not a completion", async () => {
    await seedOwner();
    await seedRefundCase();
    routes["POST /v1/refunds"] = () => {
      throw new Error("socket timeout");
    };
    await execRefund();
    // The scoped reservation read itself fails on the resumed attempt.
    mocks.from.mockImplementationOnce(() => ({
      select: () => {
        const builder = {
          eq: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: { message: "read failed" } }),
        };
        return builder;
      },
    }));
    calls = [];
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_reservation_uncertain" });
    expect(await reservationRow()).toMatchObject({ state: "reserved" });
    expect(providerPosts()).toHaveLength(0);
  });

  it("C-R4 — a reservation for ANOTHER operation is not this operation's evidence", async () => {
    await seedOwner();
    await seedRefundCase();
    await beginOtherRefundOperation();
    routes["POST /v1/refunds"] = () => {
      throw new Error("socket timeout");
    };
    await execRefund();
    // Re-point the durable reservation at a different operation and settle it.
    await exec(
      "UPDATE public.stripe_refund_reservations SET operation_id=$2, state='settled', refund_id='re_other' WHERE case_id=$1",
      ["CASE-1", OPERATION_B],
    );
    calls = [];
    routes["GET /v1/refunds"] = () => json(list([]));
    // A settled reservation naming a DIFFERENT operation is not this
    // operation's completion: it is held, and because this operation is past
    // `prepared` it is not refused either.
    expect(await execRefund()).toEqual({ ok: false, reason: "refund_reservation_uncertain" });
    expect((await operationRow()).state).not.toBe("applied");
    expect(await reservationRow()).toMatchObject({ refund_id: "re_other" });
    expect(providerPosts()).toHaveLength(0);
  });
});

describe("C4 — capacity through the real usage RPC", () => {
  it("holds a reduction whose seats fit but whose PROJECTS overflow the target plan", async () => {
    await seedOwner({ planId: "pro", seats: 3 });
    // Four projects in the migrated per-entity store: inside pro's five, over
    // growth's three.
    await seedProjects(["p1", "p2", "p3", "p4"]);
    const usage = await one<{ projects: number; projects_known: boolean }>(
      "SELECT * FROM public.stripe_commercial_membership_usage($1)",
      [COMMERCIAL_OWNER],
    );
    expect(usage).toMatchObject({ projects: 4, projects_known: true });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    expect(await prepare({ planId: "growth", seats: 0 })).toEqual({
      ok: false,
      reason: "capacity_conflict_projects",
    });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it("treats an UNMIGRATED workspace as unknown projects, never zero", async () => {
    await seedOwner({ planId: "pro", seats: 3 });
    await exec("DELETE FROM public.workspace_meta WHERE user_id=$1", [COMMERCIAL_OWNER]);
    const usage = await one<{ projects: number | null; projects_known: boolean }>(
      "SELECT * FROM public.stripe_commercial_membership_usage($1)",
      [COMMERCIAL_OWNER],
    );
    expect(usage).toMatchObject({ projects: null, projects_known: false });
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    // Without workspace_meta the billing country is unreadable too, so the hold
    // happens even earlier — and it is a HOLD, never a convenient zero.
    expect(await prepare({ planId: "growth", seats: 0 })).toMatchObject({ ok: false });
    expect(rpcNames()).not.toContain("stripe_commercial_issue_quote");
  });

  it("preserves the released counter's distinct people and pending invitations", async () => {
    await seedOwner({ planId: "pro", seats: 3 });
    await seedProjects(["proj-a", "proj-b"]);
    // ONE person holding a working role on TWO projects is ONE working seat.
    await seedTeamPerson("00000000-0000-4000-8000-0000000000e1", "member@example.test", [
      "proj-a",
      "proj-b",
    ]);
    // A pending working invitation is not free.
    await seedInvitation("proj-a", "invitee@example.test");
    const usage = await one<{ working: number; viewer: number; known: boolean }>(
      "SELECT * FROM public.stripe_commercial_membership_usage($1)",
      [COMMERCIAL_OWNER],
    );
    // Owner + one distinct person + one pending invitation.
    expect(usage.known).toBe(true);
    expect(usage.working).toBe(3);
    subscriptionQueue = [proWithSeatsSubscription(NOW_S, 3)];
    const prepared = await prepare({ planId: "growth", seats: 0 });
    // Growth's three working seats exactly cover owner + person + invitation,
    // and its project bundle covers the two projects.
    expect(prepared).toMatchObject({ ok: true, projectAllowance: 3 });
  });
});

describe("C6 — the frozen baseline blocks widening through actual reconciliation", () => {
  const lease = async (holder: string) =>
    Number(
      (
        await one<{ f: string }>(
          "SELECT public.stripe_claim_account_lease($1,$2,$3,30)::text AS f",
          [COMMERCIAL_ACCOUNT_TEST, "test", holder],
        )
      ).f,
    );
  const receipt = (event: string) =>
    exec("SELECT public.stripe_record_webhook_receipt($1,$2,$3,$4,$5,$6,$7)", [
      event,
      COMMERCIAL_ACCOUNT_TEST,
      "test",
      "customer.subscription.updated",
      1,
      COMMERCIAL_SUBSCRIPTION,
      `fp_${event}`,
    ]);
  /** The guarded projection, through the SAME RPC name the lifecycle adapter
   * wires, via the production adapter. */
  const project = async (opts: {
    event: string;
    holder: string;
    fence: number;
    plan: string;
    seats: number;
    status?: string;
    paid?: boolean;
    grants: boolean;
  }) => {
    await receipt(opts.event);
    const { data, error } = (await mocks.rpc("stripe_commercial_guarded_projection", {
      p_account: COMMERCIAL_ACCOUNT_TEST,
      p_mode: "test",
      p_holder: opts.holder,
      p_fence: opts.fence,
      p_event_id: opts.event,
      p_customer: COMMERCIAL_CUSTOMER,
      p_subscription: COMMERCIAL_SUBSCRIPTION,
      p_replaces: null,
      p_plan_id: opts.plan,
      p_status: opts.status ?? "active",
      p_seat_quantity: opts.seats,
      p_period_end: new Date(PERIOD_END * 1000).toISOString(),
      p_cancel_at_period_end: false,
      p_invoice_paid: opts.paid ?? true,
      p_grants: opts.grants,
      p_observed_at: new Date(NOW_MS).toISOString(),
      p_event_created: 10,
    })) as { data: unknown; error: unknown };
    expect(error).toBeNull();
    return data;
  };

  it("freezes growth/0 and holds the granting pro/4 while the operation is open", async () => {
    await prepareIncrease();
    // The operation reaches `awaiting_payment` and stays open.
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    const operation = await operationRow();
    expect(operation.baseline_known).toBe(true);
    expect(operation.baseline_plan_id).toBe("growth");
    expect(operation.baseline_seat_quantity).toBe(0);

    const holder = "worker-1";
    const fence = await lease(holder);
    // A legitimate NON-GRANTING observation of the bigger plan is applied, and
    // it rewrites the observed row.
    expect(
      await project({
        event: "evt_nongrant",
        holder,
        fence,
        plan: "pro",
        seats: 4,
        status: "past_due",
        paid: false,
        grants: false,
      }),
    ).toBe("applied_no_grant");
    expect(
      await one<{ plan_id: string; seat_quantity: number }>(
        "SELECT plan_id,seat_quantity FROM public.stripe_subscriptions WHERE user_id=$1",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ plan_id: "pro", seat_quantity: 4 });

    // The granting pro/4 now LOOKS equal to the observed row — and is still
    // held, because the threshold is the operation's frozen baseline.
    expect(
      await project({ event: "evt_grant", holder, fence, plan: "pro", seats: 4, grants: true }),
    ).toBe("operation_pending_hold");
    expect(
      await one("SELECT * FROM public.entitlements WHERE user_id=$1", [COMMERCIAL_OWNER]),
    ).toBeUndefined();
    // A later diagnostic read does not enlarge the frozen baseline.
    const diagnostic = await one<{ known: boolean; reason: string }>(
      "SELECT * FROM public.stripe_commercial_verified_baseline($1,$2,$3,$4)",
      [COMMERCIAL_OWNER, COMMERCIAL_ACCOUNT_TEST, "test", COMMERCIAL_SUBSCRIPTION],
    );
    expect(diagnostic.known).toBe(false);
    const unchanged = await operationRow();
    expect(unchanged.baseline_plan_id).toBe("growth");
    expect(unchanged.baseline_seat_quantity).toBe(0);
    // The baseline allowance itself is still grantable.
    expect(
      await project({ event: "evt_equal", holder, fence, plan: "growth", seats: 0, grants: true }),
    ).toBe("applied_grant");
  });

  it("holds every granting projection when the baseline could not be proved", async () => {
    // A projection row that cannot prove an allowance (unpaid latest invoice).
    await seedOwner({ paid: false });
    subscriptionQueue = [growthSubscription(NOW_S)];
    const prepared = await prepare();
    // The owner is not currently granting, so no quote is even issued.
    expect(prepared).toMatchObject({ ok: true });
    subscriptionQueue = [growthSubscription(NOW_S), growthSubscription(NOW_S)];
    await confirm();
    expect((await operationRow()).baseline_known).toBe(false);

    const holder = "worker-2";
    const fence = await lease(holder);
    for (const plan of ["starter", "growth", "pro", "agency"]) {
      expect(
        await project({
          event: `evt_${plan}`,
          holder,
          fence,
          plan,
          seats: 0,
          grants: true,
        }),
        plan,
      ).toBe("operation_pending_hold");
    }
    // A non-granting projection is never held by the gate.
    expect(
      await project({
        event: "evt_revoke",
        holder,
        fence,
        plan: "growth",
        seats: 0,
        status: "unpaid",
        paid: false,
        grants: false,
      }),
    ).toBe("applied_no_grant");
    expect(
      await one("SELECT * FROM public.entitlements WHERE user_id=$1", [COMMERCIAL_OWNER]),
    ).toBeUndefined();
  });

  it("a TEST-mode observation writes no live entitlement at all", async () => {
    await seedOwner();
    const holder = "worker-3";
    const fence = await lease(holder);
    // Even a projection that CLAIMS a grant in test mode writes no live
    // entitlement. The production reconciler cannot even reach this input —
    // `grantsPaidAccess` requires live mode — so this is the belt-and-braces
    // half: mode isolation lives in the SQL as well as in the predicate.
    expect(
      await project({
        event: "evt_test_grant",
        holder,
        fence,
        plan: "pro",
        seats: 2,
        grants: true,
      }),
    ).toBe("applied_grant");
    // Test mode is isolated: the projection row exists, the live entitlement
    // does not.
    expect(
      await one<{ plan_id: string }>(
        "SELECT plan_id FROM public.stripe_subscriptions WHERE user_id=$1 AND mode='test'",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ plan_id: "pro" });
    expect(
      await one("SELECT * FROM public.entitlements WHERE user_id=$1", [COMMERCIAL_OWNER]),
    ).toBeUndefined();
  });
});

/* ========================================================================== */
/* C5/C6 — the EXPORTED lifecycle reconciler, in synthetic LIVE mode          */
/* ========================================================================== */

/**
 * The missing connection between the two accepted layers.
 *
 * The caller checks in `stripe-lifecycle.test.ts` prove what the reconciler
 * SENDS, against a mocked RPC. The block above proves what the frozen guard
 * DECIDES, against handwritten arguments. Neither shows the exported reconciler
 * driving the real guard over real rows — so neither can establish that a
 * granting live observation is actually held, that a legitimate revoke still
 * lands, or that a previously verified live entitlement survives.
 *
 * Here `receiveStripeWebhook` runs unchanged: a signed synthetic LIVE delivery,
 * the deterministic local provider, the production `supabaseAdmin` adapter and
 * the frozen SQL. Every RPC argument is the one the production code computed.
 *
 * Synthetic throughout: no live key, object, endpoint or network exists in this
 * process. The commercial operations themselves stay held in live mode; what is
 * exercised is the projection of provider state onto OUR OWN tables.
 */
describe("C5/C6 — the exported lifecycle reconciler through the frozen guard, LIVE", () => {
  // The event-id shape the frozen envelope accepts: `evt_` plus alphanumerics.
  const LIVE_EVENT = "evt_live1";
  const sign = (body: string, ts = NOW_S) =>
    `t=${ts},v1=${createHmac("sha256", COMMERCIAL_ENV.STRIPE_WEBHOOK_SECRET_LIVE)
      .update(`${ts}.${body}`)
      .digest("hex")}`;

  const liveEvent = (over: Record<string, unknown> = {}) => ({
    id: LIVE_EVENT,
    type: "customer.subscription.updated",
    created: NOW_S,
    livemode: true,
    api_version: STRIPE_LIFECYCLE_API_VERSION,
    data: { object: { id: COMMERCIAL_SUBSCRIPTION_LIVE, object: "subscription" } },
    ...over,
  });

  /** One real delivery through the exported entry point. */
  const deliver = (event: Record<string, unknown>, mode: "live" | "test" = "live") => {
    const raw = JSON.stringify(event);
    const secret =
      mode === "live"
        ? COMMERCIAL_ENV.STRIPE_WEBHOOK_SECRET_LIVE
        : COMMERCIAL_ENV.STRIPE_WEBHOOK_SECRET_TEST;
    const signature =
      mode === "live"
        ? sign(raw)
        : `t=${NOW_S},v1=${createHmac("sha256", secret).update(`${NOW_S}.${raw}`).digest("hex")}`;
    return receiveStripeWebhook(
      new Request("https://milogrowth.com/api/public/webhooks/stripe", {
        method: "POST",
        body: raw,
        headers: { "stripe-signature": signature },
      }),
      { env: COMMERCIAL_ENV, now: NOW_MS, fetch: mocks.fetch as unknown as typeof fetch },
    );
  };

  /** Exactly the arguments the production reconciler passed to the guard. */
  const projectionArgs = () => rpcArgs(STRIPE_PROJECTION_RPC);

  const liveSubscriptionRow = () =>
    one<{ plan_id: string; seat_quantity: number; status: string; latest_invoice_paid: boolean }>(
      `SELECT plan_id,seat_quantity,status,latest_invoice_paid FROM public.stripe_subscriptions
         WHERE user_id=$1 AND mode='live'`,
      [COMMERCIAL_OWNER],
    );
  const entitlementRow = () =>
    one<{ plan_id: string; status: string; provider_subscription_id: string | null }>(
      "SELECT plan_id,status,provider_subscription_id FROM public.entitlements WHERE user_id=$1",
      [COMMERCIAL_OWNER],
    );

  /**
   * The trusted LIVE starting point: the mapped customer, a growth/0 projection
   * that the frozen `verified_baseline` can prove, and the live entitlement that
   * allowance produced.
   */
  const seedLiveOwner = async (over: { paid?: boolean } = {}) => {
    await exec("SELECT public.stripe_upsert_customer($1,$2,$3,$4)", [
      COMMERCIAL_OWNER,
      COMMERCIAL_ACCOUNT_LIVE,
      "live",
      COMMERCIAL_CUSTOMER_LIVE,
    ]);
    await exec(
      `INSERT INTO public.stripe_subscriptions(user_id,account_id,mode,subscription_id,plan_id,
         status,seat_quantity,current_period_end,cancel_at_period_end,latest_invoice_paid,
         observed_at,last_event_created)
       VALUES($1,$2,'live',$3,'growth','active',0,$4,false,$5,$6,1)`,
      [
        COMMERCIAL_OWNER,
        COMMERCIAL_ACCOUNT_LIVE,
        COMMERCIAL_SUBSCRIPTION_LIVE,
        new Date(PERIOD_END * 1000).toISOString(),
        over.paid ?? true,
        new Date(NOW_MS - 86_400_000).toISOString(),
      ],
    );
    // The live entitlement that allowance granted, as the foundation writes it.
    await exec(
      `INSERT INTO public.entitlements(user_id,plan_id,status,current_period_end,
         cancel_at_period_end,provider,provider_customer_id,provider_subscription_id)
       VALUES($1,'growth','active',$2,false,'stripe',$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET plan_id=excluded.plan_id, status=excluded.status`,
      [
        COMMERCIAL_OWNER,
        new Date(PERIOD_END * 1000).toISOString(),
        COMMERCIAL_CUSTOMER_LIVE,
        COMMERCIAL_SUBSCRIPTION_LIVE,
      ],
    );
    await exec(
      `INSERT INTO public.workspace_meta(user_id,billing_profile)
       VALUES($1,'{"billingCountry":"DE"}'::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET billing_profile=excluded.billing_profile`,
      [COMMERCIAL_OWNER],
    );
  };

  /** A PENDING live plan change, created through the accepted RPC with exactly
   * the arguments production computes. */
  const seedPendingLiveOperation = async () =>
    exec(
      "SELECT * FROM public.stripe_commercial_begin_operation($1,$2,$3,'live','plan_change',$4,$5,$6,NULL::uuid,NULL,NULL,NULL,$7)",
      [
        OPERATION,
        COMMERCIAL_OWNER,
        COMMERCIAL_ACCOUNT_LIVE,
        COMMERCIAL_SUBSCRIPTION_LIVE,
        "fingerprint-live",
        `milo-chg:${COMMERCIAL_ACCOUNT_LIVE}:live:${OPERATION}`,
        selectionFingerprintInput({
          targetPlanId: "pro",
          targetSeatQuantity: 4,
          baseItemId: "si_live_base",
          basePriceId: LIVE_PRICE_IDS.proBase,
          seatItemId: null,
          seatPriceId: LIVE_PRICE_IDS.proSeat,
        }),
      ],
    );

  const liveRoutes = (subscription: unknown) => {
    routes[`GET /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION_LIVE}`] = () => json(subscription);
    routes["GET /v1/subscriptions"] = () => json(list([subscription]));
  };

  it.each<[string, Record<string, unknown>]>([
    ["an unreadable latest invoice", { latest_invoice: { id: "in_live_base", object: "invoice" } }],
    ["an absent latest invoice", { latest_invoice: null }],
    [
      "an invoice for another subscription",
      { latest_invoice: livePaidInvoice(NOW_S, { parent: null }) },
    ],
    [
      "a paid invoice with no paid_at",
      { latest_invoice: livePaidInvoice(NOW_S, { status_transitions: { paid_at: null } }) },
    ],
    [
      "items this account's catalogue cannot resolve",
      {
        items: {
          object: "list",
          has_more: false,
          data: [
            subscriptionItem(
              { id: "si_live_base", priceId: "price_unknown", productId: "prod_x", quantity: 1 },
              NOW_S,
            ),
          ],
        },
      },
    ],
  ])(
    "makes ZERO projection calls for a grant-shaped LIVE snapshot with %s",
    async (_label, over) => {
      await seedLiveOwner();
      await seedPendingLiveOperation();
      const before = await liveSubscriptionRow();
      liveRoutes(liveGrowthSubscription(NOW_S, over));
      rpcTrace = [];

      // Retryable, never acknowledged: the evidence supports neither a grant nor
      // a revoke, so the previously verified allowance stands.
      expect((await deliver(liveEvent())).status).toBe(503);
      expect(rpcNames()).not.toContain(STRIPE_PROJECTION_RPC);
      expect(rpcNames()).not.toContain("stripe_apply_subscription_projection");
      // The observed row and the live entitlement are untouched.
      expect(await liveSubscriptionRow()).toEqual(before);
      expect(await entitlementRow()).toMatchObject({ plan_id: "growth", status: "active" });
      // The receipt stays unresolved for a later replay.
      expect(
        (
          await one<{ status: string }>(
            "SELECT status FROM public.stripe_webhook_receipts WHERE event_id=$1",
            [LIVE_EVENT],
          )
        ).status,
      ).not.toBe("completed");
    },
  );

  it("applies a legitimate non-granting live observation, then HOLDS the granting one", async () => {
    await seedLiveOwner();
    await seedPendingLiveOperation();
    const baseline = await operationRow();
    expect(baseline).toMatchObject({
      baseline_known: true,
      baseline_plan_id: "growth",
      baseline_seat_quantity: 0,
    });

    // 1) A LEGITIMATE non-granting observation of the bigger plan: past_due with
    // an unpaid invoice. The gate never holds a revoke, so it is applied and it
    // rewrites the observed row the baseline was proved from.
    liveRoutes(
      liveProWithSeats(NOW_S, 4, {
        status: "past_due",
        latest_invoice: livePaidInvoice(NOW_S, { status: "open", amount_remaining: 1_000 }),
      }),
    );
    rpcTrace = [];
    expect((await deliver(liveEvent())).status).toBe(200);
    expect(projectionArgs()).toHaveLength(1);
    // The ACTUAL arguments the reconciler generated — not a fabricated
    // grant-shaped live call.
    expect(projectionArgs()[0]).toMatchObject({
      p_account: COMMERCIAL_ACCOUNT_LIVE,
      p_mode: "live",
      p_customer: COMMERCIAL_CUSTOMER_LIVE,
      p_subscription: COMMERCIAL_SUBSCRIPTION_LIVE,
      p_plan_id: "pro",
      p_status: "past_due",
      p_seat_quantity: 4,
      p_invoice_paid: false,
      p_grants: false,
    });
    expect(await liveSubscriptionRow()).toMatchObject({ plan_id: "pro", seat_quantity: 4 });
    // The revoke really takes effect — the gate must never block one — and it
    // NARROWS the entitlement rather than widening it to the observed `pro`.
    expect(await entitlementRow()).toMatchObject({ plan_id: "freePreview" });

    // 2) The SAME wider state, now paid and in a future period — a genuine
    // grant-shaped live observation. It is HELD by the frozen baseline, even
    // though the observed row now agrees with it.
    liveRoutes(liveProWithSeats(NOW_S, 4));
    rpcTrace = [];
    calls = [];
    expect((await deliver(liveEvent({ id: "evt_livegrant" }))).status).toBe(503);
    expect(projectionArgs()).toHaveLength(1);
    expect(projectionArgs()[0]).toMatchObject({
      p_plan_id: "pro",
      p_seat_quantity: 4,
      p_status: "active",
      p_invoice_paid: true,
      p_grants: true,
    });
    // The guard's own answer, and NOTHING WIDENED: the entitlement is not the
    // observed `pro`, and the held call wrote no projection row either.
    expect(sqlErrors).toEqual([]);
    expect(await entitlementRow()).toMatchObject({ plan_id: "freePreview" });
    const unchanged = await operationRow();
    expect(unchanged.baseline_plan_id).toBe("growth");
    expect(unchanged.baseline_seat_quantity).toBe(0);
    expect(
      (
        await one<{ status: string }>(
          "SELECT status FROM public.stripe_webhook_receipts WHERE event_id='evt_livegrant'",
        )
      ).status,
    ).toBe("uncertain");

    // 3) The baseline allowance ITSELF is still projectable: growth/0 applies.
    liveRoutes(liveGrowthSubscription(NOW_S));
    rpcTrace = [];
    expect((await deliver(liveEvent({ id: "evt_liveequal" }))).status).toBe(200);
    expect(projectionArgs()[0]).toMatchObject({
      p_plan_id: "growth",
      p_seat_quantity: 0,
      p_grants: true,
    });
    expect(await entitlementRow()).toMatchObject({ plan_id: "growth", status: "active" });
  });

  it("holds a granting live observation when the baseline could NOT be proved", async () => {
    // The owner's projection cannot prove an allowance (unpaid invoice), so the
    // operation records no baseline at all and every widening is ambiguous.
    await seedLiveOwner({ paid: false });
    await seedPendingLiveOperation();
    expect((await operationRow()).baseline_known).toBe(false);

    liveRoutes(liveGrowthSubscription(NOW_S));
    rpcTrace = [];
    expect((await deliver(liveEvent({ id: "evt_liveunknown" }))).status).toBe(503);
    expect(projectionArgs()[0]).toMatchObject({ p_grants: true, p_plan_id: "growth" });
    // Held with nothing written, and the previously verified entitlement stands.
    expect(await liveSubscriptionRow()).toMatchObject({ latest_invoice_paid: false });
    expect(await entitlementRow()).toMatchObject({ plan_id: "growth", status: "active" });
  });

  it("a TEST-mode delivery changes no live row and no live entitlement", async () => {
    await seedLiveOwner();
    await seedOwner();
    const liveBefore = await liveSubscriptionRow();
    routes[`GET /v1/subscriptions/${COMMERCIAL_SUBSCRIPTION}`] = () =>
      json(proWithSeatsSubscription(NOW_S, 2));
    routes["GET /v1/subscriptions"] = () => json(list([proWithSeatsSubscription(NOW_S, 2)]));
    rpcTrace = [];
    const response = await deliver(
      {
        id: "evt_test1",
        type: "customer.subscription.updated",
        created: NOW_S,
        livemode: false,
        api_version: STRIPE_LIFECYCLE_API_VERSION,
        data: { object: { id: COMMERCIAL_SUBSCRIPTION, object: "subscription" } },
      },
      "test",
    );
    expect(response.status).toBe(200);
    // It really did project — in TEST mode only.
    expect(projectionArgs()[0]).toMatchObject({
      p_mode: "test",
      p_account: COMMERCIAL_ACCOUNT_TEST,
      p_plan_id: "pro",
    });
    expect(
      await one<{ plan_id: string }>(
        "SELECT plan_id FROM public.stripe_subscriptions WHERE user_id=$1 AND mode='test'",
        [COMMERCIAL_OWNER],
      ),
    ).toMatchObject({ plan_id: "pro" });
    // The LIVE row and the live entitlement are untouched by a test delivery.
    expect(await liveSubscriptionRow()).toEqual(liveBefore);
    expect(await entitlementRow()).toMatchObject({ plan_id: "growth", status: "active" });
  });
});

describe("the state fingerprint stays a STALENESS check, not dispatch evidence", () => {
  it("binds a quote to the exact item state it was priced against", async () => {
    await seedOwner();
    subscriptionQueue = [growthSubscription(NOW_S)];
    await prepare();
    const stored = await one<{ state_fingerprint: string }>(
      "SELECT state_fingerprint FROM public.stripe_commercial_quotes WHERE quote_id=$1",
      [QUOTE],
    );
    expect(stored.state_fingerprint).toBe(
      digest(itemStateFingerprintInput(stateOf(growthSubscription(NOW_S)))),
    );
    // The canonical selection round-trips through the pure parser.
    const detail = (await operationRow())?.selection_detail ?? null;
    expect(detail).toBeNull();
    subscriptionQueue = [growthSubscription(NOW_S), proAfterUpdate()];
    await confirm();
    expect(parseSelectionDetail((await operationRow()).selection_detail)).toMatchObject({
      targetPlanId: "pro",
      basePriceId: PRICE_IDS.proBase,
      baseItemId: "si_base",
    });
  });
});
