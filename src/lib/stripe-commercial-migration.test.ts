/**
 * Executable acceptance for the Stripe COMMERCIAL migration, on local PGlite.
 *
 * It installs the accepted foundation (20261028183000) verbatim and then the
 * additive commercial migration (20261028223000) on top, so every assertion here
 * is made against the real apply order. Nothing connects to a database server,
 * to Supabase or to Stripe.
 *
 * The decisive invariants under test are the financial ones: one unresolved
 * operation at a time, a monotone state machine, a bound single-use quote,
 * conservative cross-case refund reservations that only an authoritative
 * failure releases, the once-per-customer-per-plan guarantee, and the projection
 * gate that stops a pending paid change from being granted by reconciliation.
 *
 * The capacity reads are exercised against the REAL released sources rather than
 * stand-ins: the released `count_project_team_seats` body and the released
 * `workspace_entities`/`workspace_meta` tables are installed from their own
 * migration files, so "a person on several projects is one seat", "a pending
 * invitation is not free" and "an unmigrated workspace is UNKNOWN" are decided
 * by the shipped code and not by a fixture that repeats the expected numbers.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const ACCOUNT = "acct_fixturelive";
const OTHER_ACCOUNT = "acct_fixtureother";
const user = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const third = "00000000-0000-4000-8000-000000000003";
const OP = "00000000-0000-4000-8000-0000000000a1";
const OP2 = "00000000-0000-4000-8000-0000000000a2";
const OP3 = "00000000-0000-4000-8000-0000000000a3";
const QUOTE = "00000000-0000-4000-8000-0000000000b1";
const QUOTE2 = "00000000-0000-4000-8000-0000000000b2";
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const FUTURE = () => iso(30 * 24 * 3600 * 1000);
/**
 * One FIXED request time for the refund-case fixtures. `requested_at` is now a
 * material term of an approval, so a per-call `now()` would make an "identical
 * re-record" a genuine conflict — exactly what the conflict test asserts on
 * purpose below.
 */
const REQUESTED_AT = iso(-3600_000);

/**
 * Everything the released migrations below need to exist first: the Supabase
 * roles, the auth schema, a faithful copy of the live entitlements table, and
 * the pre-existing `app_role`/`user_roles`/`has_role` and `workspaces` objects
 * the released workspace-entity migration depends on. Nothing here stands in for
 * code under test.
 */
const BOOTSTRAP_SQL = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
  INSERT INTO auth.users VALUES('${user}','owner@example.test'),
    ('${second}','second@example.test'),('${third}','third@example.test');
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

const releasedSql = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");

/**
 * Released migrations installed VERBATIM, in apply order, because the two
 * capacity reads under test read their tables directly:
 *  - 20260726120000 is where the REAL `workspace_entities` (the project rows the
 *    project count comes from) and the REAL `workspace_meta` (whose mere
 *    existence is the "this owner is migrated" marker, and whose
 *    `billing_profile` the market read uses) are defined, with their triggers;
 *  - 20260911020000 / 20260911030000 define the REAL `project_team_members` and
 *    `project_team_invitations` the released seat counter aggregates.
 */
const RELEASED_DEPENDENCIES = [
  "20260726120000_workspace_entities.sql",
  "20260911020000_project_team_reads.sql",
  "20260911030000_project_team_membership.sql",
] as const;

/**
 * The RELEASED `count_project_team_seats`, sliced verbatim out of its own
 * migration. The released migration also drops and re-creates the invitation and
 * membership RPCs, which would pull in the whole team chain, so only the counter
 * statement is taken — unmodified, from the shipped file, and asserted to be the
 * real one by the install test. Nothing re-implements its arithmetic.
 */
const SEAT_COUNTER_SQL = (() => {
  const source = releasedSql("20260914150000_project_team_seats.sql");
  const start = source.indexOf("CREATE FUNCTION public.count_project_team_seats(");
  const end = source.indexOf("\n$$;", start);
  if (start < 0 || end < 0) throw new Error("released count_project_team_seats not found");
  return source.slice(start, end + "\n$$;".length);
})();

const FOUNDATION_SQL = releasedSql("20261028183000_stripe_subscription_lifecycle.sql");
const COMMERCIAL_SQL = releasedSql("20261028223000_stripe_commercial_operations.sql");

/**
 * Install the real apply order into a fresh database. `seatCounter: false` is the
 * environment whose team-seat chain is absent, which must report UNKNOWN rather
 * than a convenient zero; `sandboxRole` reproduces the production role that
 * inherits the public schema's DEFAULT PRIVILEGES.
 */
const install = async (opts: { seatCounter?: boolean; sandboxRole?: boolean } = {}) => {
  const fresh = new PGlite();
  await fresh.exec(BOOTSTRAP_SQL);
  if (opts.sandboxRole)
    await fresh.exec(`CREATE ROLE sandbox_exec LOGIN BYPASSRLS;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec;
      CREATE TABLE public.sentinel_before(id integer);`);
  for (const file of RELEASED_DEPENDENCIES) await fresh.exec(releasedSql(file));
  if (opts.seatCounter !== false) await fresh.exec(SEAT_COUNTER_SQL);
  await fresh.exec(FOUNDATION_SQL);
  await fresh.exec(COMMERCIAL_SQL);
  return fresh;
};

/** The six SENSITIVE stores this migration creates. */
const SENSITIVE_TABLES = [
  "stripe_commercial_quotes",
  "stripe_commercial_operations",
  "stripe_refund_cases",
  "stripe_refund_invoice_ledger",
  "stripe_refund_reservations",
  "stripe_refund_policy_uses",
] as const;

/**
 * Every function this migration creates, with its exact signature — including
 * the ones whose signature CHANGED in this packet, which is what the server
 * integration stage has to adapt to:
 *  - _begin_operation gained a trailing `p_selection text`;
 *  - _advance_operation and _finish_operation gained a trailing
 *    `p_expected_state text` compare-and-set argument;
 *  - _advance_operation then gained a further trailing
 *    `p_reduction_payload jsonb`, the durable reduction dispatch payload;
 *  - _owner_lock and _verified_baseline are new.
 *
 * _read_operation keeps its exact argument list and gained one RESULT column,
 * `reduction_dispatch_payload`, so its signature below is unchanged.
 */
const FUNCTION_SIGNATURES = [
  "public.stripe_commercial_plan_rank(text)",
  "public.stripe_commercial_open_state(text)",
  "public.stripe_commercial_transition(text,text)",
  "public.stripe_commercial_attempt_limit()",
  "public.stripe_commercial_owner_lock(uuid,text,text)",
  "public.stripe_commercial_refund_releases(text)",
  "public.stripe_commercial_billing_country(uuid)",
  "public.stripe_commercial_current_subscription(uuid,text,text)",
  "public.stripe_commercial_verified_baseline(uuid,text,text,text)",
  "public.stripe_commercial_membership_usage(uuid)",
  "public.stripe_commercial_issue_quote(uuid,uuid,text,text,text,text,text,text,text,integer,text,bigint,text,bigint,bigint,timestamptz,integer)",
  "public.stripe_commercial_consume_quote(uuid,uuid,text,text,text,text,text,text,bigint,uuid)",
  "public.stripe_commercial_read_quote(uuid,uuid,text,text)",
  "public.stripe_commercial_begin_operation(uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,text,text)",
  "public.stripe_commercial_advance_operation(uuid,uuid,text,text,text,text,text,text,text,jsonb)",
  "public.stripe_commercial_finish_operation(uuid,uuid,text,text,text,text,text)",
  "public.stripe_commercial_read_operation(uuid,uuid,text,text)",
  "public.stripe_commercial_record_refund_case(text,uuid,text,text,text,text,text,bigint,text,text,text,text,text,timestamptz)",
  "public.stripe_commercial_read_refund_case(text,text,text)",
  "public.stripe_commercial_reserve_refund(text,uuid,uuid,text,text,text,text,bigint,text,bigint,bigint)",
  "public.stripe_commercial_settle_refund(text,uuid,text,text,text,text)",
  "public.stripe_commercial_deletion_barrier(uuid)",
  "public.stripe_commercial_guarded_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)",
] as const;

beforeAll(async () => {
  db = await install();
}, 120000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE public.stripe_refund_reservations, public.stripe_refund_policy_uses,
      public.stripe_refund_invoice_ledger, public.stripe_refund_cases,
      public.stripe_commercial_operations, public.stripe_commercial_quotes;
    TRUNCATE public.stripe_checkout_requests, public.stripe_webhook_receipts,
      public.stripe_subscriptions, public.stripe_account_leases, public.stripe_customers;
    DELETE FROM public.entitlements;
    TRUNCATE public.project_team_members, public.project_team_invitations,
      public.project_team_audit;
    DELETE FROM public.workspace_entities;
    DELETE FROM public.workspace_meta;`);
});

/* ------------------------------ helpers --------------------------------- */

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const scalar = async (sql: string, params: unknown[] = []) =>
  Object.values((await one<Record<string, unknown>>(sql, params)) ?? {})[0];

const map = (customer: string, owner = user, mode = "live", account = ACCOUNT) =>
  db.query("SELECT public.stripe_upsert_customer($1,$2,$3,$4)", [owner, account, mode, customer]);

const lease = async (holder: string, mode = "live", account = ACCOUNT) =>
  Number(
    await scalar("SELECT public.stripe_claim_account_lease($1,$2,$3,30)::text AS f", [
      account,
      mode,
      holder,
    ]),
  );

const receipt = (event: string, mode = "live", account = ACCOUNT) =>
  db.query("SELECT public.stripe_record_webhook_receipt($1,$2,$3,$4,$5,$6,$7)", [
    event,
    account,
    mode,
    "customer.subscription.updated",
    1,
    "sub_1",
    `fp_${event}`,
  ]);

const projection = (opts: {
  holder: string;
  fence: number;
  event: string;
  customer: string;
  subscription: string;
  plan: string;
  status?: string;
  seats?: number;
  periodEnd?: string | null;
  paid?: boolean;
  grants?: boolean;
  observedAt?: string;
  mode?: string;
  replaces?: string | null;
  account?: string;
}) =>
  scalar(
    "SELECT public.stripe_commercial_guarded_projection($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) AS r",
    [
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      opts.holder,
      opts.fence,
      opts.event,
      opts.customer,
      opts.subscription,
      opts.replaces ?? null,
      opts.plan,
      opts.status ?? "active",
      opts.seats ?? 0,
      opts.periodEnd === undefined ? FUTURE() : opts.periodEnd,
      false,
      opts.paid ?? true,
      opts.grants ?? true,
      opts.observedAt ?? new Date().toISOString(),
      1,
    ],
  );

type ProjectOnceOpts = Omit<Parameters<typeof projection>[0], "holder" | "fence"> & {
  holder?: string;
};

/**
 * One complete webhook turn: record the receipt, claim the account lease,
 * project through the guarded wrapper, release the lease. Every projection in
 * these tests goes through the real fenced path rather than writing a row.
 */
const projectOnce = async (opts: ProjectOnceOpts) => {
  const mode = opts.mode ?? "live";
  const account = opts.account ?? ACCOUNT;
  const holder = opts.holder ?? `w_${opts.event}`;
  await receipt(opts.event, mode, account);
  const fence = await lease(holder, mode, account);
  try {
    return await projection({ ...opts, holder, fence });
  } finally {
    await db.query("SELECT public.stripe_release_account_lease($1,$2,$3,$4)", [
      account,
      mode,
      holder,
      fence,
    ]);
  }
};

const verifiedBaseline = (
  opts: { owner?: string; account?: string; mode?: string; subscription?: string } = {},
) =>
  one<{
    known: boolean;
    plan_id: string | null;
    seat_quantity: number | null;
    subscription_id: string | null;
    reason: string;
  }>("SELECT * FROM public.stripe_commercial_verified_baseline($1,$2,$3,$4)", [
    opts.owner ?? user,
    opts.account ?? ACCOUNT,
    opts.mode ?? "live",
    opts.subscription ?? "sub_1",
  ]);

const issueQuote = (
  opts: {
    quote?: string;
    owner?: string;
    account?: string;
    mode?: string;
    kind?: string;
    subscription?: string;
    stateFp?: string;
    selectionFp?: string;
    plan?: string;
    seats?: number;
    direction?: string;
    prorationDate?: number;
    currency?: string;
    amount?: number;
    recurring?: number;
    effectiveAt?: string | null;
    ttl?: number;
  } = {},
) =>
  one<{ quote_id: string; expires_at: string }>(
    "SELECT * FROM public.stripe_commercial_issue_quote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
    [
      opts.quote ?? QUOTE,
      opts.owner ?? user,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      opts.kind ?? "plan_change",
      opts.subscription ?? "sub_1",
      opts.stateFp ?? "state-a",
      opts.selectionFp ?? "selection-a",
      opts.plan ?? "pro",
      opts.seats ?? 0,
      opts.direction ?? "increase",
      opts.prorationDate ?? 1_700_000_000,
      opts.currency ?? "eur",
      opts.amount ?? 12_300,
      opts.recurring ?? 29_900,
      opts.effectiveAt ?? null,
      opts.ttl ?? 900,
    ],
  );

const consumeQuote = (
  opts: {
    quote?: string;
    owner?: string;
    account?: string;
    mode?: string;
    subscription?: string;
    stateFp?: string;
    selectionFp?: string;
    currency?: string;
    amount?: number;
    operation?: string;
  } = {},
) =>
  one<{ target_plan_id: string; amount_due: string; direction: string }>(
    "SELECT * FROM public.stripe_commercial_consume_quote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      opts.quote ?? QUOTE,
      opts.owner ?? user,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      opts.subscription ?? "sub_1",
      opts.stateFp ?? "state-a",
      opts.selectionFp ?? "selection-a",
      opts.currency ?? "eur",
      opts.amount ?? 12_300,
      opts.operation ?? OP,
    ],
  );

/**
 * The canonical selection a plan/seat change must carry from creation, in the
 * exact `plan#seats#baseItemId#basePriceId#seatItemId#seatPriceId` form the
 * quote's selection fingerprint is computed from.
 */
const SELECTION = "pro#0#si_base#price_base#si_seat#price_seat";

type BeginRow = {
  state: string;
  attempts: number;
  resumed: boolean;
  baseline_invoice_id: string | null;
  selection_detail: string | null;
  baseline_known: boolean;
  baseline_plan_id: string | null;
  baseline_seat_quantity: number | null;
  baseline_subscription_id: string | null;
};

type BeginOpts = {
  operation?: string;
  owner?: string;
  account?: string;
  mode?: string;
  kind?: string;
  subscription?: string;
  fingerprint?: string;
  key?: string;
  quote?: string | null;
  case?: string | null;
  reverses?: string | null;
  baseline?: string | null;
  /** Explicit `null` is the "caller has no durable selection" case. */
  selection?: string | null;
};

const begin = (opts: BeginOpts = {}) => {
  const kind = opts.kind ?? "plan_change";
  // The two item-selecting kinds default to a real selection, because SQL now
  // refuses to create one without it; every other kind selects no item.
  const selection =
    opts.selection !== undefined
      ? opts.selection
      : kind === "plan_change" || kind === "seat_change"
        ? SELECTION
        : null;
  return one<BeginRow>(
    "SELECT * FROM public.stripe_commercial_begin_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [
      opts.operation ?? OP,
      opts.owner ?? user,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      kind,
      opts.subscription ?? "sub_1",
      opts.fingerprint ?? "fp-a",
      opts.key ?? `milo-chg:${opts.operation ?? OP}`,
      opts.quote ?? null,
      opts.case ?? null,
      opts.reverses ?? null,
      opts.baseline ?? null,
      selection,
    ],
  );
};

const advance = (
  state: string,
  opts: {
    operation?: string;
    owner?: string;
    account?: string;
    mode?: string;
    invoice?: string | null;
    refund?: string | null;
    schedule?: string | null;
    /** The compare-and-set the caller last observed; `undefined` omits it. */
    expected?: string | null;
    /**
     * The reduction dispatch payload. An object is sent as its JSON text and a
     * raw string is sent verbatim, so a non-object JSON document (`null`, an
     * array, a bare number) can be offered exactly as a caller could send it.
     * `undefined` sends SQL NULL, which is the un-adapted caller.
     */
    payload?: Record<string, unknown> | string | null;
  } = {},
) =>
  scalar(
    "SELECT public.stripe_commercial_advance_operation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS r",
    [
      opts.operation ?? OP,
      opts.owner ?? user,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      state,
      opts.invoice ?? null,
      opts.refund ?? null,
      opts.schedule ?? null,
      opts.expected ?? null,
      opts.payload === undefined || opts.payload === null
        ? null
        : typeof opts.payload === "string"
          ? opts.payload
          : JSON.stringify(opts.payload),
    ],
  );

const finish = (
  state: string,
  opts: {
    operation?: string;
    owner?: string;
    account?: string;
    mode?: string;
    refusal?: string | null;
    expected?: string | null;
  } = {},
) =>
  scalar("SELECT public.stripe_commercial_finish_operation($1,$2,$3,$4,$5,$6,$7) AS r", [
    opts.operation ?? OP,
    opts.owner ?? user,
    opts.account ?? ACCOUNT,
    opts.mode ?? "live",
    state,
    opts.refusal ?? null,
    opts.expected ?? null,
  ]);

const recordCase = (
  opts: {
    id?: string;
    owner?: string;
    account?: string;
    mode?: string;
    invoice?: string;
    subscription?: string | null;
    plan?: string;
    amount?: number;
    currency?: string;
    basis?: string;
    subscriptionDisposition?: string;
    accessDisposition?: string;
    actor?: string;
    requestedAt?: string;
  } = {},
) =>
  scalar(
    "SELECT public.stripe_commercial_record_refund_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS r",
    [
      opts.id ?? "CASE-1",
      opts.owner ?? user,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      opts.invoice ?? "in_1",
      // An explicit `null` is the "approved case with no subscription" fixture,
      // so it must survive the default rather than be replaced by it.
      opts.subscription === undefined ? "sub_1" : opts.subscription,
      opts.plan ?? "pro",
      opts.amount ?? 29_900,
      opts.currency ?? "eur",
      opts.basis ?? "firstPayment14Day",
      opts.subscriptionDisposition ?? "cancelAtPeriodEndSeparately",
      opts.accessDisposition ?? "retainUntilPeriodEnd",
      opts.actor ?? "operator:rafal",
      opts.requestedAt ?? REQUESTED_AT,
    ],
  );

const reserve = (
  opts: {
    id?: string;
    operation?: string;
    owner?: string;
    account?: string;
    mode?: string;
    invoice?: string;
    payment?: string;
    amount?: number;
    currency?: string;
    allocated?: number;
    providerReserved?: number;
  } = {},
) =>
  one<{ reserved: string; remaining: string }>(
    "SELECT * FROM public.stripe_commercial_reserve_refund($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [
      opts.id ?? "CASE-1",
      opts.operation ?? OP,
      opts.owner ?? user,
      opts.account ?? ACCOUNT,
      opts.mode ?? "live",
      opts.invoice ?? "in_1",
      opts.payment ?? "pi_1",
      opts.amount ?? 29_900,
      opts.currency ?? "eur",
      opts.allocated ?? 29_900,
      opts.providerReserved ?? 0,
    ],
  );

const settleRefund = (
  status: string,
  opts: {
    id?: string;
    operation?: string;
    account?: string;
    mode?: string;
    refund?: string | null;
  } = {},
) =>
  scalar("SELECT public.stripe_commercial_settle_refund($1,$2,$3,$4,$5,$6) AS r", [
    opts.id ?? "CASE-1",
    opts.operation ?? OP,
    opts.account ?? ACCOUNT,
    opts.mode ?? "live",
    opts.refund ?? "re_1",
    status,
  ]);

/**
 * Drive an operation to a TERMINAL state the way the application does.
 *
 * `prepared -> applied` is deliberately NOT an edge in the state machine: an
 * applied operation must have recorded a dispatch first. Tests that only need
 * the slot released therefore go through `dispatching`, exactly like the server.
 */
const resolve = async (
  state: "applied" | "refused" | "failed",
  opts: {
    operation?: string;
    owner?: string;
    account?: string;
    mode?: string;
    refusal?: string;
  } = {},
) => {
  expect(await advance("dispatching", opts), "advance to dispatching").toBe(true);
  expect(await finish(state, opts), `finish ${state}`).toBe(true);
};

const operationState = async (operation = OP) =>
  await scalar("SELECT state FROM public.stripe_commercial_operations WHERE operation_id=$1", [
    operation,
  ]);
const reservationState = async (id = "CASE-1") =>
  await scalar("SELECT state FROM public.stripe_refund_reservations WHERE case_id=$1", [id]);

/* =========================== install and privacy ========================= */

describe("install", () => {
  it("is inert: creates every object, no rows, and leaves the foundation untouched", async () => {
    for (const table of SENSITIVE_TABLES)
      expect(Number(await scalar(`SELECT count(*) AS n FROM public.${table}`)), table).toBe(0);
    for (const signature of FUNCTION_SIGNATURES)
      expect(
        await scalar("SELECT to_regprocedure($1) IS NOT NULL AS n", [signature]),
        signature,
      ).toBe(true);
    // The accepted foundation function still exists, unchanged, and is still
    // the thing the wrapper delegates to.
    expect(
      await scalar(
        "SELECT to_regprocedure('public.stripe_apply_subscription_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)') IS NOT NULL AS n",
      ),
    ).toBe(true);
    expect(
      Number(
        await scalar(
          "SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='entitlements' AND NOT t.tgisinternal",
        ),
      ),
    ).toBe(0);
  }, 30000);

  // `SET search_path=''` is stored as a quoted GUC assignment, so the entry is
  // matched by NAME and its value is compared unquoted — an empty search_path is
  // the property under test, not one particular spelling of it.
  const EMPTY_SEARCH_PATH = `EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) c
      WHERE split_part(c,'=',1)='search_path' AND btrim(split_part(c,'=',2),'"')='')`;

  it("pins an EMPTY search_path on every function it creates", async () => {
    for (const signature of FUNCTION_SIGNATURES)
      expect(
        await scalar(
          `SELECT ${EMPTY_SEARCH_PATH} AS n FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
          [signature],
        ),
        signature,
      ).toBe(true);
  }, 30000);

  it("leaves the historical foundation's own tables and triggers exactly as released", async () => {
    // The foundation migration is READ-ONLY for this packet: no column was added
    // to its projection table and no trigger was attached to it.
    expect(
      await scalar(
        `SELECT string_agg(a.attname, ',' ORDER BY a.attnum) AS n
           FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
           JOIN pg_namespace s ON s.oid=c.relnamespace
          WHERE s.nspname='public' AND c.relname='stripe_subscriptions'
            AND a.attnum>0 AND NOT a.attisdropped`,
      ),
    ).toBe(
      "user_id,account_id,mode,subscription_id,plan_id,status,seat_quantity," +
        "current_period_end,cancel_at_period_end,latest_invoice_paid,observed_at," +
        "last_event_created,updated_at",
    );
    for (const table of ["stripe_subscriptions", "stripe_customers", "stripe_webhook_receipts"])
      expect(
        Number(
          await scalar(
            "SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname=$1 AND NOT t.tgisinternal",
            [table],
          ),
        ),
        table,
      ).toBe(0);
    // The seat counter in use is the RELEASED one, with its released signature
    // and its released SECURITY DEFINER / empty search_path properties.
    expect(SEAT_COUNTER_SQL).toContain("public.project_team_invitations");
    expect(SEAT_COUNTER_SQL).toContain("public.project_team_members");
    expect(
      await scalar(
        `SELECT p.prosecdef AND ${EMPTY_SEARCH_PATH} AS n
           FROM pg_proc p WHERE p.oid=to_regprocedure('public.count_project_team_seats(uuid,text)')`,
      ),
    ).toBe(true);
  }, 30000);

  it("enables RLS with zero policies on every new table", async () => {
    for (const table of SENSITIVE_TABLES) {
      const row = await one<{ rls: boolean; policies: string }>(
        `SELECT c.relrowsecurity AS rls,
                (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid)::text AS policies
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=$1`,
        [table],
      );
      expect(row.rls, table).toBe(true);
      expect(row.policies, table).toBe("0");
    }
  });

  it("gives anon and authenticated no table privilege and no function EXECUTE", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of SENSITIVE_TABLES)
        expect(
          await scalar("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS n", [
            role,
            `public.${table}`,
          ]),
          `${role}/${table}`,
        ).toBe(false);
      for (const signature of FUNCTION_SIGNATURES)
        expect(
          await scalar("SELECT has_function_privilege($1,$2,'EXECUTE') AS n", [role, signature]),
          `${role}/${signature}`,
        ).toBe(false);
    }
  }, 30000);

  it("keeps service_role as the only grantee, with a real write round trip", async () => {
    for (const signature of FUNCTION_SIGNATURES)
      expect(
        await scalar("SELECT has_function_privilege('service_role',$1,'EXECUTE') AS n", [
          signature,
        ]),
        signature,
      ).toBe(true);
    await db.exec("SET ROLE service_role");
    await db.query(
      "INSERT INTO public.stripe_refund_invoice_ledger(account_id,mode,invoice_id) VALUES($1,'live','in_probe')",
      [ACCOUNT],
    );
    expect(
      Number(
        await scalar(
          "SELECT count(*) AS n FROM public.stripe_refund_invoice_ledger WHERE invoice_id='in_probe'",
        ),
      ),
    ).toBe(1);
    await db.exec("RESET ROLE");
  }, 30000);
});

/**
 * The production condition the foundation already corrected, re-verified for the
 * new tables: an environment role that is LOGIN and BYPASSRLS and holds the
 * schema's DEFAULT PRIVILEGES would otherwise read AND write every table created
 * by this migration, RLS notwithstanding.
 */
describe("inherited default-ACL isolation", () => {
  it("reproduces the inherited grant on an unrelated table, then denies all six new ones", async () => {
    const fresh = await install({ sandboxRole: true });
    try {
      // The fixture is live: an unrelated table really is readable.
      await fresh.exec("SET ROLE sandbox_exec");
      await expect(fresh.query("SELECT * FROM public.sentinel_before")).resolves.toBeTruthy();
      for (const table of SENSITIVE_TABLES) {
        await expect(fresh.query(`SELECT 1 FROM public.${table} LIMIT 1`), table).rejects.toThrow();
        await expect(
          fresh.query(`INSERT INTO public.${table} DEFAULT VALUES`),
          table,
        ).rejects.toThrow();
      }
      await fresh.exec("RESET ROLE");
      for (const table of SENSITIVE_TABLES) {
        const row = await fresh.query<{ classic: boolean; column: boolean; acl: boolean }>(
          `SELECT has_table_privilege('sandbox_exec','public.'||$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS classic,
                  has_any_column_privilege('sandbox_exec','public.'||$1,'SELECT,INSERT,UPDATE,REFERENCES') AS column,
                  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace,
                          LATERAL aclexplode(c.relacl) a
                          WHERE s.nspname='public' AND c.relname=$1 AND c.relacl IS NOT NULL
                            AND a.grantee='sandbox_exec'::regrole) AS acl`,
          [table],
        );
        expect(row.rows[0], table).toEqual({ classic: false, column: false, acl: false });
      }
      // No function EXECUTE either, and an actual call is refused.
      for (const signature of FUNCTION_SIGNATURES)
        expect(
          (
            await fresh.query<{ n: boolean }>(
              "SELECT has_function_privilege('sandbox_exec',$1,'EXECUTE') AS n",
              [signature],
            )
          ).rows[0].n,
          signature,
        ).toBe(false);
      await fresh.exec("SET ROLE sandbox_exec");
      await expect(
        fresh.query("SELECT public.stripe_commercial_plan_rank('pro')"),
      ).rejects.toThrow();
      await fresh.exec("RESET ROLE");
      // DEFAULT PRIVILEGES and unrelated tables are untouched.
      expect(
        (
          await fresh.query<{ n: boolean }>(
            "SELECT has_table_privilege('sandbox_exec','public.sentinel_before','SELECT') AS n",
          )
        ).rows[0].n,
      ).toBe(true);
      expect(
        (
          await fresh.query<{ n: string }>(
            "SELECT count(*)::text AS n FROM pg_default_acl d JOIN pg_namespace s ON s.oid=d.defaclnamespace WHERE s.nspname='public'",
          )
        ).rows[0].n,
      ).toBe("1");
    } finally {
      await fresh.close();
    }
  }, 60000);

  it("installs cleanly and leaves no ACL entry when the optional role is absent", async () => {
    const fresh = await install();
    try {
      expect(
        (
          await fresh.query<{ n: string }>(
            "SELECT count(*)::text AS n FROM pg_roles WHERE rolname='sandbox_exec'",
          )
        ).rows[0].n,
      ).toBe("0");
      for (const table of SENSITIVE_TABLES)
        expect(
          (
            await fresh.query<{ n: boolean }>(
              "SELECT has_table_privilege('anon','public.'||$1,'SELECT') AS n",
              [table],
            )
          ).rows[0].n,
          table,
        ).toBe(false);
      // Still INERT on a brand-new database: every new store is empty.
      for (const table of SENSITIVE_TABLES)
        expect(
          (await fresh.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.${table}`))
            .rows[0].n,
          table,
        ).toBe("0");
    } finally {
      await fresh.close();
    }
  }, 60000);
});

/* ============================== quotes =================================== */

// Several of these tests run dozens of sequential PGlite statements, so they
// carry an explicit generous timeout rather than relying on the 5s default.
describe("quotes are bound and single-use", () => {
  it("issues, reads and consumes exactly once", async () => {
    const issued = await issueQuote();
    expect(issued.quote_id).toBe(QUOTE);
    const read = await one<{ target_plan_id: string; consumed_by: string | null }>(
      "SELECT * FROM public.stripe_commercial_read_quote($1,$2,$3,'live')",
      [QUOTE, user, ACCOUNT],
    );
    expect(read.target_plan_id).toBe("pro");
    expect(read.consumed_by).toBeNull();
    const consumed = await consumeQuote();
    expect(consumed.target_plan_id).toBe("pro");
    expect(Number(consumed.amount_due)).toBe(12_300);
    // A replay by the SAME operation is idempotent...
    await expect(consumeQuote()).resolves.toBeTruthy();
    // ...but a second, different operation cannot reuse it.
    await expect(consumeQuote({ operation: OP2 })).rejects.toThrow(
      /stripe_commercial_quote_consumed/,
    );
  });

  it("refuses a foreign, stale, altered or expired quote with distinct codes", async () => {
    await issueQuote();
    await expect(consumeQuote({ owner: second })).rejects.toThrow(
      /stripe_commercial_quote_foreign/,
    );
    await expect(consumeQuote({ account: OTHER_ACCOUNT })).rejects.toThrow(
      /stripe_commercial_quote_foreign/,
    );
    await expect(consumeQuote({ mode: "test" })).rejects.toThrow(/stripe_commercial_quote_foreign/);
    await expect(consumeQuote({ subscription: "sub_other" })).rejects.toThrow(
      /stripe_commercial_quote_foreign/,
    );
    // The item state moved under the quote: STALE, not tampered.
    await expect(consumeQuote({ stateFp: "state-b" })).rejects.toThrow(
      /stripe_commercial_quote_state_changed/,
    );
    // The selection, currency or amount was altered: TAMPERED.
    await expect(consumeQuote({ selectionFp: "selection-b" })).rejects.toThrow(
      /stripe_commercial_quote_tampered/,
    );
    await expect(consumeQuote({ amount: 1 })).rejects.toThrow(/stripe_commercial_quote_tampered/);
    await expect(consumeQuote({ currency: "pln" })).rejects.toThrow(
      /stripe_commercial_quote_tampered/,
    );
    await expect(consumeQuote({ quote: "00000000-0000-4000-8000-0000000000ff" })).rejects.toThrow(
      /stripe_commercial_quote_unknown/,
    );
    // Expiry is enforced on the stored row, not on a client clock.
    await db.query(
      "UPDATE public.stripe_commercial_quotes SET expires_at=now()-interval '1 second'",
    );
    await expect(consumeQuote()).rejects.toThrow(/stripe_commercial_quote_expired/);
  });

  it("refuses to issue a quote while an unresolved operation holds the slot", async () => {
    await begin();
    await expect(issueQuote()).rejects.toThrow(/stripe_commercial_operation_open/);
    await resolve("applied");
    await expect(issueQuote()).resolves.toBeTruthy();
  });

  it("refuses an out-of-range TTL and an unknown direction or kind", async () => {
    await expect(issueQuote({ ttl: 30 })).rejects.toThrow(/quote_unavailable/);
    await expect(issueQuote({ ttl: 7200 })).rejects.toThrow(/quote_unavailable/);
    await expect(issueQuote({ direction: "sideways" })).rejects.toThrow(/quote_unavailable/);
    await expect(issueQuote({ kind: "refund" })).rejects.toThrow(/quote_unavailable/);
  });

  it("scopes the read to the owner, account and mode", async () => {
    await issueQuote();
    for (const params of [
      [QUOTE, second, ACCOUNT, "live"],
      [QUOTE, user, OTHER_ACCOUNT, "live"],
      [QUOTE, user, ACCOUNT, "test"],
    ])
      expect(
        (await db.query("SELECT * FROM public.stripe_commercial_read_quote($1,$2,$3,$4)", params))
          .rows.length,
        JSON.stringify(params),
      ).toBe(0);
  });
});

/* ============================= operations ================================ */

describe("one unresolved operation per owner, monotone states", () => {
  it("refuses a second operation while one is unresolved, and releases on a terminal", async () => {
    expect((await begin()).state).toBe("prepared");
    await expect(begin({ operation: OP2, key: "k2" })).rejects.toThrow(
      /stripe_commercial_operation_open/,
    );
    // `refused` is reachable straight from `prepared`: a quote that could not be
    // consumed must release the slot without ever having dispatched anything.
    expect(await finish("refused", { refusal: "quote_refused" })).toBe(true);
    expect((await begin({ operation: OP2, key: "k2" })).state).toBe("prepared");
  });

  it("resumes the identical operation and counts the attempt, refusing any mismatch", async () => {
    expect((await begin()).attempts).toBe(1);
    const resumed = await begin();
    expect(resumed.resumed).toBe(true);
    expect(resumed.attempts).toBe(2);
    for (const over of [
      { owner: second },
      { account: OTHER_ACCOUNT },
      { mode: "test" },
      { kind: "cancel" },
      { subscription: "sub_other" },
      { fingerprint: "fp-b" },
      { key: "another-key" },
      { quote: QUOTE2 },
      // A resumed attempt must re-assert the IDENTICAL selection, and may not
      // omit it either: a recovery that cannot state the selection has not
      // proved which change it is resuming.
      { selection: "pro#4#si_base#price_base#si_seat#price_seat" },
    ])
      await expect(begin(over), JSON.stringify(over)).rejects.toThrow();
  });

  it("records the pre-dispatch invoice baseline once and never overwrites it", async () => {
    expect((await begin({ baseline: "in_before" })).baseline_invoice_id).toBe("in_before");
    // A later attempt sees the subscription AFTER the dispatch, so its view is
    // contaminated; the first attempt's baseline is the authoritative one.
    expect((await begin({ baseline: "in_after" })).baseline_invoice_id).toBe("in_before");
    expect(
      await scalar(
        "SELECT baseline_invoice_id FROM public.stripe_commercial_operations WHERE operation_id=$1",
        [OP],
      ),
    ).toBe("in_before");
  });

  it("stops resuming at the bounded attempt limit without releasing the slot", async () => {
    await begin();
    const limit = Number(await scalar("SELECT public.stripe_commercial_attempt_limit() AS n"));
    await db.query("UPDATE public.stripe_commercial_operations SET attempts=$1", [limit]);
    await expect(begin()).rejects.toThrow(/stripe_commercial_attempts_exhausted/);
    // The slot is STILL held: an exhausted operation is not discarded and no new
    // operation may bypass it.
    await expect(begin({ operation: OP2, key: "k2" })).rejects.toThrow(
      /stripe_commercial_operation_open/,
    );
    expect(await operationState()).toBe("prepared");
  });

  it("only allows the transitions the state machine names", async () => {
    await begin();
    // prepared -> awaiting_payment is not an edge: a dispatch must be recorded.
    expect(await advance("awaiting_payment")).toBe(false);
    expect(await advance("dispatching")).toBe(true);
    expect(await advance("awaiting_payment", { invoice: "in_update" })).toBe(true);
    // No going back.
    expect(await advance("dispatching")).toBe(false);
    expect(await finish("applied")).toBe(true);
    // Terminal is terminal, for every further transition.
    expect(await advance("fenced")).toBe(false);
    expect(await finish("failed")).toBe(false);
    expect(await finish("refused")).toBe(false);
  });

  it("keeps the recorded evidence append-only", async () => {
    await begin();
    await advance("dispatching");
    await advance("awaiting_payment", { invoice: "in_update" });
    await expect(advance("awaiting_apply", { invoice: "in_other" })).rejects.toThrow(
      /stripe_commercial_evidence_conflict/,
    );
    // The same invoice is accepted, and a null never erases it.
    expect(await advance("awaiting_apply", { invoice: "in_update" })).toBe(true);
    expect(
      await scalar(
        "SELECT invoice_id FROM public.stripe_commercial_operations WHERE operation_id=$1",
        [OP],
      ),
    ).toBe("in_update");
  });

  it("scopes advance, finish and read to the owner/account/mode", async () => {
    await begin();
    expect(await advance("dispatching", { owner: second })).toBe(false);
    expect(await advance("dispatching", { account: OTHER_ACCOUNT })).toBe(false);
    expect(await advance("dispatching", { mode: "test" })).toBe(false);
    expect(await finish("applied", { owner: second })).toBe(false);
    expect(
      (
        await db.query("SELECT * FROM public.stripe_commercial_read_operation($1,$2,$3,'live')", [
          OP,
          second,
          ACCOUNT,
        ])
      ).rows.length,
    ).toBe(0);
    expect(
      (
        await db.query("SELECT * FROM public.stripe_commercial_read_operation($1,$2,$3,'live')", [
          OP,
          user,
          ACCOUNT,
        ])
      ).rows.length,
    ).toBe(1);
  });

  it("binds a reversal to an APPLIED cancellation of the same subscription, once", async () => {
    // No target at all.
    await expect(begin({ operation: OP2, kind: "reverse_cancel", key: "k2" })).rejects.toThrow(
      /stripe_commercial_reversal_target_missing/,
    );
    await begin({ kind: "cancel" });
    // The named cancellation is not APPLIED yet, so it is not a reversal target.
    await expect(
      begin({ operation: OP2, kind: "reverse_cancel", key: "k2", reverses: OP }),
    ).rejects.toThrow(/stripe_commercial_reversal_target_invalid/);
    await resolve("applied", { operation: OP });
    // A different subscription may not be reversed through this cancellation.
    await expect(
      begin({
        operation: OP2,
        kind: "reverse_cancel",
        key: "k2",
        reverses: OP,
        subscription: "sub_other",
      }),
    ).rejects.toThrow(/stripe_commercial_reversal_target_invalid/);
    expect(
      (await begin({ operation: OP2, kind: "reverse_cancel", key: "k2", reverses: OP })).state,
    ).toBe("prepared");
    await resolve("applied", { operation: OP2 });
    // One cancellation can be reversed at most once.
    await expect(
      begin({ operation: OP3, kind: "reverse_cancel", key: "k3", reverses: OP }),
    ).rejects.toThrow();
    // A non-reversal operation may not name a reversal target at all.
    await expect(begin({ operation: OP3, key: "k3", reverses: OP })).rejects.toThrow(
      /stripe_commercial_unavailable/,
    );
  });
});

/* ======================== selection completeness ========================= */

/**
 * A plan or seat change is DEFINED by an exact item selection, so it may not
 * exist without one. The defect this closes: the first begin could store NULL
 * and a later attempt could pass a non-NULL selection, which was silently
 * accepted as a resume and never recorded — so recovery had no canonical
 * selection to prove the subscription carries the quoted items, while the
 * operation looked perfectly healthy.
 */
describe("a plan or seat change carries its canonical selection from creation", () => {
  it("refuses to create one without a selection, instead of holding an unprovable operation", async () => {
    for (const kind of ["plan_change", "seat_change"]) {
      await expect(begin({ kind, selection: null }), kind).rejects.toThrow(
        /stripe_commercial_selection_missing/,
      );
      // A blank or whitespace-only selection is the same missing selection.
      await expect(begin({ kind, selection: "   " }), kind).rejects.toThrow(
        /stripe_commercial_selection_missing/,
      );
      // Nothing was created, so no slot is held by a refusal.
      expect(
        Number(await scalar("SELECT count(*) AS n FROM public.stripe_commercial_operations")),
        kind,
      ).toBe(0);
    }
  });

  it("records it once and never retrofits a resumed selection from changed state", async () => {
    expect((await begin()).selection_detail).toBe(SELECTION);
    // The identical replay resumes and still reports the ORIGINAL selection.
    const resumed = await begin();
    expect(resumed.resumed).toBe(true);
    expect(resumed.selection_detail).toBe(SELECTION);
    // A selection discovered AFTER the first attempt — i.e. read back from a
    // state this operation's own dispatch already changed — is a mismatch.
    await expect(begin({ selection: "agency#9#si_x#price_x#si_y#price_y" })).rejects.toThrow(
      /stripe_commercial_mismatch/,
    );
    // And it is a mismatch in the other direction too: an attempt that cannot
    // state the selection cannot claim this operation.
    await expect(begin({ selection: null })).rejects.toThrow(/stripe_commercial_selection_missing/);
    expect(
      await scalar(
        "SELECT selection_detail FROM public.stripe_commercial_operations WHERE operation_id=$1",
        [OP],
      ),
    ).toBe(SELECTION);
  });

  it("is a DATABASE fact, not a code convention", async () => {
    // Even a direct service_role write cannot create a selectionless plan or
    // seat change, and cannot null an existing selection out.
    await db.exec("SET ROLE service_role");
    await expect(
      db.query(
        `INSERT INTO public.stripe_commercial_operations(
           operation_id,user_id,account_id,mode,kind,subscription_id,params_fingerprint,idempotency_key)
         VALUES($1,$2,$3,'live','plan_change','sub_1','fp','key-direct')`,
        [OP3, user, ACCOUNT],
      ),
    ).rejects.toThrow(/stripe_commercial_operations_selection_required/);
    await db.exec("RESET ROLE");
    await begin();
    await expect(
      db.query("UPDATE public.stripe_commercial_operations SET selection_detail=NULL"),
    ).rejects.toThrow(/stripe_commercial_operations_selection_required/);
  });

  it("requires NO selection for the kinds that select no item, and refuses a stray one", async () => {
    for (const kind of ["cancel", "refund", "reverse_cancel"])
      await expect(begin({ kind, selection: SELECTION }), kind).rejects.toThrow(
        /stripe_commercial_unavailable/,
      );
    expect((await begin({ kind: "cancel" })).selection_detail).toBeNull();
  });
});

/* ========================== the projection gate =========================== */

describe("the projection gate preserves the previously verified allowance", () => {
  const seed = async (plan = "growth", seats = 0) => {
    await map("cus_1");
    await receipt("evt_seed");
    const fence = await lease("worker-seed");
    expect(
      await projection({
        holder: "worker-seed",
        fence,
        event: "evt_seed",
        customer: "cus_1",
        subscription: "sub_1",
        plan,
        seats,
      }),
    ).toBe("applied_grant");
    await db.query("SELECT public.stripe_release_account_lease($1,'live','worker-seed',$2)", [
      ACCOUNT,
      fence,
    ]);
  };

  it("delegates to the accepted foundation when no operation is open", async () => {
    await seed();
    expect(
      Number(
        await scalar("SELECT count(*) AS n FROM public.entitlements WHERE user_id=$1", [user]),
      ),
    ).toBe(1);
    expect(await scalar("SELECT plan_id FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "growth",
    );
  });

  it("HOLDS a plan increase while the paid change is unresolved, writing nothing", async () => {
    await seed("growth", 0);
    await begin({ kind: "plan_change" });
    await receipt("evt_up");
    const fence = await lease("worker-up");
    expect(
      await projection({
        holder: "worker-up",
        fence,
        event: "evt_up",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
      }),
    ).toBe("operation_pending_hold");
    // Nothing moved, and the receipt is still retryable.
    expect(await scalar("SELECT plan_id FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "growth",
    );
    expect(
      await scalar("SELECT plan_id FROM public.stripe_subscriptions WHERE user_id=$1", [user]),
    ).toBe("growth");
    expect(
      await scalar("SELECT status FROM public.stripe_webhook_receipts WHERE event_id='evt_up'"),
    ).toBe("uncertain");
  });

  it("HOLDS a seat increase, and a historical paid invoice does not change that", async () => {
    await seed("growth", 1);
    await begin({ kind: "seat_change" });
    await receipt("evt_seats");
    const fence = await lease("worker-seats");
    expect(
      await projection({
        holder: "worker-seats",
        fence,
        event: "evt_seats",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "growth",
        seats: 4,
        paid: true,
      }),
    ).toBe("operation_pending_hold");
    expect(
      Number(
        await scalar("SELECT seat_quantity FROM public.stripe_subscriptions WHERE user_id=$1", [
          user,
        ]),
      ),
    ).toBe(1);
  });

  it("ALLOWS an equal projection, a decrease and every revoke while an operation is open", async () => {
    await seed("pro", 3);
    await begin({ kind: "plan_change" });
    await receipt("evt_same");
    let fence = await lease("w1");
    expect(
      await projection({
        holder: "w1",
        fence,
        event: "evt_same",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
        seats: 3,
      }),
    ).toBe("applied_grant");
    await db.query("SELECT public.stripe_release_account_lease($1,'live','w1',$2)", [
      ACCOUNT,
      fence,
    ]);

    await receipt("evt_down");
    fence = await lease("w2");
    expect(
      await projection({
        holder: "w2",
        fence,
        event: "evt_down",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "growth",
        seats: 0,
      }),
    ).toBe("applied_grant");
    await db.query("SELECT public.stripe_release_account_lease($1,'live','w2',$2)", [
      ACCOUNT,
      fence,
    ]);

    // A revoke must still take effect during a pending change.
    await receipt("evt_cancel");
    fence = await lease("w3");
    expect(
      await projection({
        holder: "w3",
        fence,
        event: "evt_cancel",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "growth",
        status: "canceled",
        grants: false,
        paid: false,
      }),
    ).toBe("applied_no_grant");
    expect(await scalar("SELECT status FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "cancelled",
    );
  });

  it("HOLDS a grant for a different subscription, and for an owner with no verified allowance", async () => {
    await map("cus_1");
    await begin({ kind: "plan_change" });
    await receipt("evt_fresh");
    let fence = await lease("w1");
    // No stored projection at all: an increase from nothing is ambiguous.
    expect(
      await projection({
        holder: "w1",
        fence,
        event: "evt_fresh",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
      }),
    ).toBe("operation_pending_hold");
    await db.query("SELECT public.stripe_release_account_lease($1,'live','w1',$2)", [
      ACCOUNT,
      fence,
    ]);

    await resolve("applied");
    await seed("growth");
    await begin({ operation: OP2, key: "k2", kind: "plan_change", subscription: "sub_1" });
    await receipt("evt_other_sub");
    fence = await lease("w4");
    expect(
      await projection({
        holder: "w4",
        fence,
        event: "evt_other_sub",
        customer: "cus_1",
        subscription: "sub_2",
        plan: "growth",
        replaces: "sub_1",
      }),
    ).toBe("operation_pending_hold");
  });

  it("opens the gate again once the operation is terminal", async () => {
    await seed("growth");
    await begin({ kind: "plan_change" });
    await receipt("evt_a");
    let fence = await lease("w1");
    expect(
      await projection({
        holder: "w1",
        fence,
        event: "evt_a",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
      }),
    ).toBe("operation_pending_hold");
    await db.query("SELECT public.stripe_release_account_lease($1,'live','w1',$2)", [
      ACCOUNT,
      fence,
    ]);
    await resolve("applied");
    fence = await lease("w2");
    expect(
      await projection({
        holder: "w2",
        fence,
        event: "evt_a",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
      }),
    ).toBe("applied_grant");
    expect(await scalar("SELECT plan_id FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "pro",
    );
  });

  it("refuses to run at all without the lease the foundation requires", async () => {
    await seed();
    await receipt("evt_nolease");
    await expect(
      projection({
        holder: "ghost",
        fence: 99,
        event: "evt_nolease",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
      }),
    ).rejects.toThrow(/stripe_lease_lost/);
  });

  it("holds nothing in test mode for a live operation, and keeps modes separate", async () => {
    await seed("growth");
    await map("cus_t", user, "test");
    await begin({ kind: "plan_change" });
    await receipt("evt_test", "test");
    const fence = await lease("wt", "test");
    // A LIVE operation does not gate the test-mode projection, and test mode
    // writes no entitlement at all.
    expect(
      await projection({
        holder: "wt",
        fence,
        event: "evt_test",
        customer: "cus_t",
        subscription: "sub_t",
        plan: "agency",
        mode: "test",
      }),
    ).toBe("applied_grant");
    expect(await scalar("SELECT plan_id FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "growth",
    );
  });

  it("preserves manual beta/comped and a granting legacy provider row", async () => {
    await map("cus_1");
    await db.query(
      "INSERT INTO public.entitlements(user_id,plan_id,status,provider) VALUES($1,'agency','manualBeta','none')",
      [user],
    );
    await receipt("evt_manual");
    const fence = await lease("wm");
    expect(
      await projection({
        holder: "wm",
        fence,
        event: "evt_manual",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "starter",
      }),
    ).toBe("grant_withheld_manual");
    expect(await scalar("SELECT status FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "manualBeta",
    );
  });
});

/* ===================== frozen AND verified baseline ====================== */

/**
 * The P1 this stage closes. Freezing the baseline stopped the threshold moving
 * AFTER an operation was created, but `baseline_known` was still set from the
 * mere PRESENCE of a plan, subscription and seat count — so a NON-GRANTING
 * observation of a bigger plan, written BEFORE the operation existed, was frozen
 * and labelled "previously verified allowance". The reproduced sequence:
 *
 *   growth/0 granted  ->  pro/4 past_due+unpaid observed (grants=false)
 *   ->  begin plan_change  ->  granting pro/4 passes while the operation that
 *       would pay for it is still `prepared`.
 *
 * `baseline_known` is now set only by stripe_commercial_verified_baseline, which
 * re-proves the foundation's own grant predicate. Everything it cannot prove is
 * an explicit HOLD, never a reconstructed seat count.
 */
describe("the baseline is frozen AND proven, never merely present", () => {
  const mapped = async () => {
    await map("cus_1");
  };
  const grant = (event: string, plan: string, seats: number, extra: Record<string, unknown> = {}) =>
    projectOnce({
      event,
      customer: "cus_1",
      subscription: "sub_1",
      plan,
      seats,
      ...extra,
    });
  /** Write a bigger row through a legitimately NON-GRANTING projection. */
  const observeNonGrant = (
    event: string,
    opts: { plan?: string; seats?: number; status?: string; paid?: boolean; periodEnd?: string },
  ) =>
    projectOnce({
      event,
      customer: "cus_1",
      subscription: "sub_1",
      plan: opts.plan ?? "pro",
      seats: opts.seats ?? 4,
      status: opts.status ?? "past_due",
      paid: opts.paid ?? false,
      periodEnd: opts.periodEnd,
      grants: false,
    });
  const storedRow = () =>
    scalar(
      "SELECT plan_id||'/'||seat_quantity||'/'||status AS r FROM public.stripe_subscriptions WHERE user_id=$1",
      [user],
    );
  const entitlementPlan = () =>
    scalar("SELECT plan_id FROM public.entitlements WHERE user_id=$1", [user]);

  it("reproduces the original P1 sequence and HOLDS the unpaid grant", async () => {
    await mapped();
    expect(await grant("evt_seed", "growth", 0)).toBe("applied_grant");
    const opened = await begin({ kind: "plan_change" });
    expect({
      known: opened.baseline_known,
      plan: opened.baseline_plan_id,
      seats: Number(opened.baseline_seat_quantity),
      subscription: opened.baseline_subscription_id,
    }).toEqual({ known: true, plan: "growth", seats: 0, subscription: "sub_1" });

    // A legitimate non-granting observation of a BIGGER plan.
    expect(await observeNonGrant("evt_nongrant", {})).toBe("applied_no_grant");
    expect(await storedRow()).toBe("pro/4/past_due");

    // The granting pro/4 that follows is HELD: it exceeds the frozen baseline.
    expect(await grant("evt_grant", "pro", 4)).toBe("operation_pending_hold");
    expect(await entitlementPlan()).not.toBe("pro");
    expect(await operationState()).toBe("prepared");
    expect(
      await scalar("SELECT status FROM public.stripe_webhook_receipts WHERE event_id='evt_grant'"),
    ).toBe("uncertain");
    // The pending operation is byte-for-byte unchanged.
    expect(
      await one<Record<string, unknown>>(
        `SELECT state, attempts, baseline_known, baseline_plan_id,
                baseline_seat_quantity::text AS seats, selection_detail
           FROM public.stripe_commercial_operations WHERE operation_id=$1`,
        [OP],
      ),
    ).toEqual({
      state: "prepared",
      attempts: 1,
      baseline_known: true,
      baseline_plan_id: "growth",
      seats: "0",
      selection_detail: SELECTION,
    });

    // The legitimate eventual resolution: once the operation is terminal, the
    // SAME redelivered event is applied and the allowance finally widens.
    await resolve("applied");
    expect(await grant("evt_grant", "pro", 4)).toBe("applied_grant");
    expect(await entitlementPlan()).toBe("pro");
  }, 30000);

  it("holds the same sequence for a SEAT-only increase", async () => {
    await mapped();
    expect(await grant("evt_seed", "growth", 1)).toBe("applied_grant");
    expect(Number((await begin({ kind: "seat_change" })).baseline_seat_quantity)).toBe(1);
    expect(await observeNonGrant("evt_nongrant", { plan: "growth", seats: 4 })).toBe(
      "applied_no_grant",
    );
    expect(await storedRow()).toBe("growth/4/past_due");
    expect(await grant("evt_grant", "growth", 4)).toBe("operation_pending_hold");
    expect(
      Number(
        await scalar("SELECT seat_quantity FROM public.stripe_subscriptions WHERE user_id=$1", [
          user,
        ]),
      ),
    ).toBe(4);
    expect(await entitlementPlan()).not.toBe("growth");
  }, 30000);

  it("never replaces the original baseline on a RETRIED begin", async () => {
    await mapped();
    await grant("evt_seed", "growth", 0);
    await begin({ kind: "plan_change" });
    await observeNonGrant("evt_nongrant", {});
    // The retry's own view is already contaminated by the non-granting write, so
    // the first attempt's proof stays authoritative.
    const resumed = await begin({ kind: "plan_change" });
    expect({
      resumed: resumed.resumed,
      attempts: resumed.attempts,
      known: resumed.baseline_known,
      plan: resumed.baseline_plan_id,
      seats: Number(resumed.baseline_seat_quantity),
    }).toEqual({ resumed: true, attempts: 2, known: true, plan: "growth", seats: 0 });
    expect(await grant("evt_grant", "pro", 4)).toBe("operation_pending_hold");
  }, 30000);

  // Requirement: a non-granting / unpaid / expired / unknown LARGER row observed
  // BEFORE the operation is created must not become a verified frozen baseline.
  const unprovable = [
    {
      label: "past_due and unpaid",
      observed: {} as Record<string, unknown>,
      reason: "status_not_grant_eligible",
    },
    {
      label: "grant-eligible but UNPAID",
      observed: { status: "active", paid: false },
      reason: "invoice_unpaid",
    },
    {
      label: "paid and active but EXPIRED",
      observed: { status: "active", paid: true, periodEnd: iso(-24 * 3600 * 1000) },
      reason: "period_not_current",
    },
    {
      label: "an UNRECOGNISED status",
      observed: { status: "weird_new_status", paid: true },
      reason: "status_not_grant_eligible",
    },
  ] as const;

  it.each(unprovable)(
    "refuses to freeze a larger $label row observed BEFORE begin",
    async ({ observed, reason }) => {
      await mapped();
      await grant("evt_seed", "growth", 0);
      await observeNonGrant("evt_before", observed);
      // The bigger row really is stored, and it really is not provable.
      expect(
        await scalar("SELECT plan_id FROM public.stripe_subscriptions WHERE user_id=$1", [user]),
      ).toBe("pro");
      expect(await verifiedBaseline()).toEqual({
        known: false,
        plan_id: null,
        seat_quantity: null,
        subscription_id: null,
        reason,
      });

      // So the operation is created with NO baseline at all — not with the
      // overwritten pro/4 numbers, and not with a reconstructed growth/0.
      const opened = await begin({ kind: "plan_change" });
      expect({
        known: opened.baseline_known,
        plan: opened.baseline_plan_id,
        seats: opened.baseline_seat_quantity,
        subscription: opened.baseline_subscription_id,
      }).toEqual({ known: false, plan: null, seats: null, subscription: null });

      // And every granting projection is held while it is unresolved.
      expect(await grant("evt_grant", "pro", 4)).toBe("operation_pending_hold");
      expect(await entitlementPlan()).not.toBe("pro");
      // Even a grant that merely restores the ORIGINAL allowance is held: with
      // nothing proven, a conservative hold is the only safe answer.
      expect(await grant("evt_equal", "growth", 0)).toBe("operation_pending_hold");
    },
    30000,
  );

  it("does not accept a WITHHELD live grant as a Stripe allowance", async () => {
    await mapped();
    // Manual beta access holds the entitlement, so the foundation writes the
    // projection row but grants no Stripe allowance at all.
    await db.query(
      "INSERT INTO public.entitlements(user_id,plan_id,status,provider) VALUES($1,'agency','manualBeta','none')",
      [user],
    );
    expect(await grant("evt_withheld", "pro", 4)).toBe("grant_withheld_manual");
    expect(await storedRow()).toBe("pro/4/active");
    expect((await verifiedBaseline()).reason).toBe("entitlement_inconsistent");
    expect((await begin({ kind: "plan_change" })).baseline_known).toBe(false);
    expect(await grant("evt_grant", "pro", 4)).toBe("operation_pending_hold");
    expect(await scalar("SELECT status FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "manualBeta",
    );
  }, 30000);

  it("requires a CONSISTENT live entitlement, and reports each divergence", async () => {
    await mapped();
    expect(await grant("evt_seed", "pro", 2)).toBe("applied_grant");
    expect(await verifiedBaseline()).toMatchObject({ known: true, reason: "verified" });
    for (const [label, sql] of [
      ["removed", "DELETE FROM public.entitlements WHERE user_id=$1"],
      ["manual", "UPDATE public.entitlements SET status='manualComped' WHERE user_id=$1"],
      ["legacy provider", "UPDATE public.entitlements SET provider='paddle' WHERE user_id=$1"],
      ["another plan", "UPDATE public.entitlements SET plan_id='agency' WHERE user_id=$1"],
      [
        "another subscription",
        "UPDATE public.entitlements SET provider_subscription_id='sub_9' WHERE user_id=$1",
      ],
      [
        "a lapsed period",
        "UPDATE public.entitlements SET current_period_end=now()-interval '1 day' WHERE user_id=$1",
      ],
      [
        "no period at all",
        "UPDATE public.entitlements SET current_period_end=NULL WHERE user_id=$1",
      ],
    ] as const) {
      await db.exec("BEGIN");
      await db.query(sql, [user]);
      expect((await verifiedBaseline()).reason, label).toBe("entitlement_inconsistent");
      await db.exec("ROLLBACK");
    }
    expect((await verifiedBaseline()).known).toBe(true);
  }, 30000);

  it("proves a TEST baseline from the test projection alone, reading no live entitlement", async () => {
    // A live entitlement that CONTRADICTS the test row.
    await db.query(
      "INSERT INTO public.entitlements(user_id,plan_id,status,provider) VALUES($1,'freePreview','freePreview','none')",
      [user],
    );
    await map("cus_t", user, "test");
    expect(
      await projectOnce({
        event: "evt_test",
        customer: "cus_t",
        subscription: "sub_t",
        plan: "pro",
        seats: 2,
        mode: "test",
      }),
    ).toBe("applied_grant");
    // Test mode writes no entitlement, so the proof must not require one.
    expect(await verifiedBaseline({ mode: "test", subscription: "sub_t" })).toMatchObject({
      known: true,
      plan_id: "pro",
      reason: "verified",
    });
    expect(
      Number(
        (await begin({ mode: "test", kind: "plan_change", subscription: "sub_t" }))
          .baseline_seat_quantity,
      ),
    ).toBe(2);
    // The live entitlement was neither read as evidence nor modified.
    expect(await scalar("SELECT status FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "freePreview",
    );
    // And the LIVE side of the same owner still has nothing proven.
    expect((await verifiedBaseline()).reason).toBe("no_projection");
  }, 30000);

  it("reports an absent projection and a foreign subscription as unproven", async () => {
    await mapped();
    expect((await verifiedBaseline()).reason).toBe("no_projection");
    await grant("evt_seed", "growth", 0);
    expect((await verifiedBaseline({ subscription: "sub_other" })).reason).toBe(
      "subscription_mismatch",
    );
    // An operation about a subscription the owner does not hold gets no baseline
    // and therefore holds every grant.
    expect((await begin({ subscription: "sub_other" })).baseline_known).toBe(false);
  });

  it("still allows a revoke and the re-grant of the PROVEN baseline", async () => {
    await mapped();
    await grant("evt_seed", "pro", 3);
    expect((await begin({ kind: "plan_change" })).baseline_known).toBe(true);
    // A cancellation during a pending change must still take effect.
    expect(
      await projectOnce({
        event: "evt_revoke",
        customer: "cus_1",
        subscription: "sub_1",
        plan: "pro",
        seats: 3,
        status: "canceled",
        grants: false,
        paid: false,
      }),
    ).toBe("applied_no_grant");
    expect(await scalar("SELECT status FROM public.entitlements WHERE user_id=$1", [user])).toBe(
      "cancelled",
    );
    // And re-granting exactly the frozen baseline is allowed, because it widens
    // nothing — the hold is on INCREASES, not on recovery.
    expect(await grant("evt_regrant", "pro", 3)).toBe("applied_grant");
    expect(await entitlementPlan()).toBe("pro");
    // A widening re-grant is still held.
    expect(await grant("evt_wider", "agency", 3)).toBe("operation_pending_hold");
  }, 30000);
});

/* ================= shared serialization of the two paths ================== */

/**
 * Requirement 3 of the review: a lock in only ONE of the two paths does not
 * close the window between "the gate saw no pending operation" and "the
 * projection wrote a wider row". Both paths take the SAME transaction-scoped
 * advisory lock, which is asserted here directly from pg_locks — PGlite is a
 * single connection, so what is provable locally is that the lock is really
 * taken, that it is the SAME key in both paths, and that it is released by the
 * transaction rather than leaked.
 */
describe("baseline capture and the gate share one bounded owner lock", () => {
  const advisoryLocks = async () =>
    (
      await db.query<{ classid: number; objid: number }>(
        "SELECT classid, objid FROM pg_locks WHERE locktype='advisory' ORDER BY classid, objid",
      )
    ).rows;

  it("is the same key in begin_operation and in the guarded projection, and is released on commit", async () => {
    await map("cus_1");
    await receipt("evt_lock");
    const fence = await lease("w_lock");

    await db.exec("BEGIN");
    await begin({ kind: "plan_change" });
    const fromBegin = await advisoryLocks();
    expect(fromBegin).toHaveLength(1);
    await db.exec("ROLLBACK");
    // Transaction-scoped: nothing is left held.
    expect(await advisoryLocks()).toHaveLength(0);

    await db.exec("BEGIN");
    await projection({
      holder: "w_lock",
      fence,
      event: "evt_lock",
      customer: "cus_1",
      subscription: "sub_1",
      plan: "pro",
    });
    const fromGate = await advisoryLocks();
    await db.exec("ROLLBACK");
    expect(await advisoryLocks()).toHaveLength(0);

    // The decisive assertion: ONE key, and the same one on both sides.
    expect(fromGate).toHaveLength(1);
    expect(fromGate).toEqual(fromBegin);
  });

  it("locks per owner, account and mode, and not at all for an unknown customer", async () => {
    await map("cus_1");
    await db.exec("BEGIN");
    await begin({ kind: "plan_change" });
    const live = await advisoryLocks();
    // A different mode is a different key, so a test-mode operation cannot
    // serialize against a live projection and does not try to.
    await begin({ operation: OP2, key: "k2", mode: "test", kind: "plan_change" });
    expect(await advisoryLocks()).toHaveLength(2);
    // A different owner is a different key too.
    await begin({ operation: OP3, key: "k3", owner: second, kind: "plan_change" });
    const all = await advisoryLocks();
    expect(all).toHaveLength(3);
    expect(all).toContainEqual(live[0]);
    await db.exec("ROLLBACK");

    // An unmapped customer resolves to no owner, so there is no key to take and
    // the foundation writes no projection row for it either.
    await receipt("evt_ghost");
    const fence = await lease("w_ghost");
    await db.exec("BEGIN");
    expect(
      await projection({
        holder: "w_ghost",
        fence,
        event: "evt_ghost",
        customer: "cus_unmapped",
        subscription: "sub_1",
        plan: "pro",
      }),
    ).toBe("unknown_customer");
    expect(await advisoryLocks()).toHaveLength(0);
    await db.exec("ROLLBACK");
  });
});

/* ====================== compare-and-set settlement ======================= */

/**
 * `p_expected_state` turns the advance and the finish into a compare-and-set, so
 * a worker whose durable view is stale cannot settle an operation another
 * instance has already moved. The server integration stage must pass the state
 * it last observed on EVERY call; these tests also pin the two transitions the
 * server must not attempt, because CAS does not add a same-state edge.
 */
describe("compare-and-set keeps a stale worker from settling a dispatched operation", () => {
  it("rejects a stale prepared worker's refusal and failure after another worker dispatched", async () => {
    await begin();
    // Worker A asserts what it observed and dispatches.
    expect(await advance("dispatching", { expected: "prepared" })).toBe(true);
    // Worker B still believes the operation is `prepared` and wants to close it
    // on a pre-dispatch check. Both of its terminal attempts are rejected.
    expect(await finish("refused", { expected: "prepared", refusal: "quote_refused" })).toBe(false);
    expect(await finish("failed", { expected: "prepared" })).toBe(false);
    expect(await advance("fenced", { expected: "prepared" })).toBe(false);
    // The actual dispatch keeps the slot: its provider outcome is unknown, so no
    // new operation may bypass it and nothing was recorded about a refusal.
    expect(await operationState()).toBe("dispatching");
    expect(
      await scalar(
        "SELECT refusal_code FROM public.stripe_commercial_operations WHERE operation_id=$1",
        [OP],
      ),
    ).toBeNull();
    await expect(begin({ operation: OP2, key: "k2" })).rejects.toThrow(
      /stripe_commercial_operation_open/,
    );
    // The worker that actually dispatched can still settle it.
    expect(await finish("applied", { expected: "dispatching" })).toBe(true);
    expect((await begin({ operation: OP2, key: "k2" })).state).toBe("prepared");
  });

  it("leaves the plain monotone behaviour unchanged when no state is asserted", async () => {
    await begin();
    // Without an assertion the transition table alone decides, which is what an
    // un-adapted caller still gets — and why the server must start asserting.
    expect(await advance("dispatching")).toBe(true);
    expect(await finish("refused", { refusal: "pre_dispatch_refusal" })).toBe(true);
    expect(await operationState()).toBe("refused");
  });

  it("cannot reopen a terminal operation, asserted or not", async () => {
    await begin();
    await advance("dispatching", { expected: "prepared" });
    expect(await finish("applied", { expected: "dispatching" })).toBe(true);
    for (const expected of [null, "applied", "dispatching"]) {
      expect(await advance("dispatching", { expected }), `advance/${expected}`).toBe(false);
      expect(await advance("awaiting_payment", { expected }), `await/${expected}`).toBe(false);
      expect(await finish("failed", { expected }), `failed/${expected}`).toBe(false);
      expect(await finish("applied", { expected }), `applied/${expected}`).toBe(false);
    }
    expect(await operationState()).toBe("applied");
  });

  it("keeps same-evidence recovery representable without a backward transition", async () => {
    await begin();
    await advance("dispatching", { expected: "prepared" });
    expect(
      await advance("awaiting_payment", { invoice: "in_update", expected: "dispatching" }),
    ).toBe(true);
    // A recovery re-reads the SAME invoice. The same-state edge does not exist,
    // so the attempt is refused rather than silently repeated — the server must
    // not attempt awaiting_payment -> awaiting_payment.
    expect(
      await advance("awaiting_payment", { invoice: "in_update", expected: "awaiting_payment" }),
    ).toBe(false);
    // Nor awaiting_apply -> awaiting_payment.
    expect(
      await advance("awaiting_apply", { invoice: "in_update", expected: "awaiting_payment" }),
    ).toBe(true);
    expect(
      await advance("awaiting_payment", { invoice: "in_update", expected: "awaiting_apply" }),
    ).toBe(false);
    expect(await operationState()).toBe("awaiting_apply");
    // Recovery is expressed by moving FORWARD on the same evidence, which the
    // append-only evidence rule accepts because the invoice is identical.
    expect(await finish("applied", { expected: "awaiting_apply" })).toBe(true);
    expect(
      await scalar(
        "SELECT invoice_id FROM public.stripe_commercial_operations WHERE operation_id=$1",
        [OP],
      ),
    ).toBe("in_update");
  });

  it("rejects an assertion that names a state this operation never reached", async () => {
    await begin();
    expect(await advance("dispatching", { expected: "fenced" })).toBe(false);
    expect(await finish("failed", { expected: "awaiting_apply" })).toBe(false);
    expect(await operationState()).toBe("prepared");
    // A foreign owner is still refused before the assertion is even considered.
    expect(await advance("dispatching", { owner: second, expected: "prepared" })).toBe(false);
  });
});

/* ===================== reduction dispatch payload ======================== */

/**
 * A reduction is dispatched as a two-phase schedule whose FIRST phase restates
 * what the customer has already paid for. That original phase is not recoverable
 * from anything else durable: `params_fingerprint` hashes the operation's terms
 * rather than the body, the quote's state fingerprint omits the current period
 * start and every material setting, and a later GET of the schedule is its
 * configuration NOW, not the first adoption. Two originals differing only in
 * their default payment method, their collection inheritance or their tax
 * defaults could otherwise leave identical persisted evidence.
 *
 * `reduction_dispatch_payload` closes that: the complete canonical phase request
 * AND the explicit original settings expectation are persisted append-once, in
 * the SAME statement as the adopted schedule id, under the existing
 * dispatching -> awaiting_apply compare-and-set and BEFORE the first phase POST.
 * Every linkage it claims is re-proved against the durable row, every fixed term
 * of the supported profile is verified in its exact null/false/empty form, and
 * anything outside the profile is HELD, so arbitrary JSON with the right keys is
 * not accepted as evidence.
 *
 * These are local schema and SQL-contract assertions on PGlite. They say nothing
 * about how the provider would execute any of these bodies.
 */
const SCHEDULE = "sub_sched_r1";
/** The FIXED paid period end a reduction is bound to, and the original start. */
const PERIOD_END = 1_764_288_000;
const PERIOD_START = 1_761_696_000;
/** plan#seats#baseItemId#basePriceId#seatItemId#seatPriceId — a reduction to
 * growth with no seats, whose existing seat item is being dropped. */
const REDUCTION_SELECTION = "growth#0#si_base#price_growth_base#si_seat#-";
/** The same, for a seat-only reduction from four seats to two. */
const SEAT_SELECTION = "pro#2#si_base#price_pro_base#si_seat#price_pro_seat";

type Obj = Record<string, unknown>;

/** The ORIGINAL default payment method the adoption response carried. */
const PM = "pm_card_1";
/** The other one, for "two originals must not collapse to one payload". */
const PM_OTHER = "pm_card_2";

/**
 * The four terms the supported profile fixes to an explicit null at BOTH the
 * default-settings and the paid-phase level. They are written out rather than
 * omitted: an absent key is a malformed payload, never a neutral value.
 *
 * `billing_cycle_anchor` and `invoice_settings` are deliberately NOT here. The
 * ordinary documented response carries `"automatic"` and the `self` issuer on the
 * schedule's defaults and nulls on the phase, and those are different facts.
 */
const FIXED_NULL_TERMS: Obj = {
  application_fee_percent: null,
  description: null,
  on_behalf_of: null,
  transfer_data: null,
};

/** The ten `default_settings` fields of the ordinary documented response, 1:1. */
const defaultSettings = (pm: string | null = PM): Obj => ({
  automatic_tax: false,
  billing_cycle_anchor: "automatic",
  collection_method: "charge_automatically",
  default_payment_method: pm,
  default_source: null,
  invoice_settings: { issuer: { type: "self" } },
  ...FIXED_NULL_TERMS,
});

/**
 * The thirteen paid-phase fields kept 1:1. The response's `start_date`,
 * `end_date`, `items` and `proration_behavior` map into `request` instead.
 * `collection_method` defaults to the ordinary `null`, which INHERITS the
 * defaults' verified `charge_automatically`.
 */
const paidPhaseSettings = (pm: string | null = PM, cm: string | null = null): Obj => ({
  add_invoice_items: [],
  billing_cycle_anchor: null,
  collection_method: cm,
  currency: "eur",
  default_payment_method: pm,
  default_tax_rates: [],
  invoice_settings: null,
  metadata: {},
  trial_end: null,
  ...FIXED_NULL_TERMS,
});

/** The response item's own fields, minus its legacy `plan` mirror of `price`. */
const paidItem = (price: string, quantity: number): Obj => ({
  price,
  quantity,
  metadata: {},
  tax_rates: [],
});

/** The ORIGINAL settings expectation, as the validated adoption response gave
 * it. `pm` and the phase collection method are the VARIABLE terms; everything
 * else is profile-fixed. */
const expectedSettings = (
  over: Obj = {},
  pm: string | null = PM,
  cm: string | null = null,
): Obj => ({
  profile: "automaticChargeNoTaxNoDiscount",
  defaultSettings: defaultSettings(pm),
  paidPhase: paidPhaseSettings(pm, cm),
  paidItems: [paidItem("price_pro_base", 1), paidItem("price_pro_seat", 4)],
  ...over,
});

/** The ORIGINAL paid phase, then the reduced phase. A recorded phase-level
 * payment method or collection method must be restated in BOTH, because a phase
 * update unsets what it is not given; an INHERITED one must be named in neither,
 * because naming it would create an override the original never had. */
const basePhases = (pm: string | null = PM, cm: string | null = null): Obj[] => [
  {
    start_date: PERIOD_START,
    end_date: PERIOD_END,
    proration_behavior: "none",
    ...(pm === null ? {} : { default_payment_method: pm }),
    ...(cm === null ? {} : { collection_method: cm }),
    items: [
      { price: "price_pro_base", quantity: 1 },
      { price: "price_pro_seat", quantity: 4 },
    ],
  },
  {
    start_date: PERIOD_END,
    proration_behavior: "none",
    ...(pm === null ? {} : { default_payment_method: pm }),
    ...(cm === null ? {} : { collection_method: cm }),
    items: [{ price: "price_growth_base", quantity: 1 }],
  },
];

const reductionPayload = (over: Obj = {}): Obj => ({
  v: 1,
  operationId: OP,
  quoteId: QUOTE,
  scheduleId: SCHEDULE,
  subscriptionId: "sub_1",
  selectionDetail: REDUCTION_SELECTION,
  targetPlanId: "growth",
  targetSeatQuantity: 0,
  effectiveBoundary: PERIOD_END,
  expectedSettings: expectedSettings(),
  request: { end_behavior: "release", proration_behavior: "none", phases: basePhases() },
  ...over,
});

/** The whole payload for one payment-method arrangement, settings and request
 * together — which is what makes two different originals two different
 * documents. */
const payloadForMethod = (phasePm: string | null, defaultPm: string | null = phasePm): Obj =>
  reductionPayload({
    expectedSettings: expectedSettings({ defaultSettings: defaultSettings(defaultPm) }, phasePm),
    request: {
      end_behavior: "release",
      proration_behavior: "none",
      phases: basePhases(phasePm),
    },
  });

/** The whole payload for one phase COLLECTION arrangement: `null` is the
 * ordinary inherited response, `"charge_automatically"` an explicit override that
 * both canonical phases must then restate. */
const payloadForCollection = (cm: string | null): Obj =>
  reductionPayload({
    expectedSettings: expectedSettings({}, PM, cm),
    request: {
      end_behavior: "release",
      proration_behavior: "none",
      phases: basePhases(PM, cm),
    },
  });

/** The same payload with the request object overridden field by field. */
const withRequest = (over: Obj): Obj =>
  reductionPayload({
    request: {
      end_behavior: "release",
      proration_behavior: "none",
      phases: basePhases(),
      ...over,
    },
  });

/** The same payload with the phases mutated in place. */
const withPhases = (mutate: (phases: Obj[]) => void): Obj => {
  const phases = basePhases();
  mutate(phases);
  return withRequest({ phases });
};

/** The same payload with the settings expectation mutated in place. */
const withSettings = (mutate: (settings: Obj) => void): Obj => {
  const settings = expectedSettings();
  mutate(settings);
  return reductionPayload({ expectedSettings: settings });
};
const settingsPart = (settings: Obj, part: "defaultSettings" | "paidPhase") =>
  settings[part] as Obj;
const settingsItems = (settings: Obj) => settings.paidItems as Obj[];

const phaseItems = (phases: Obj[], index: number) => phases[index].items as Obj[];

const storedPayload = (operation = OP) =>
  scalar(
    "SELECT reduction_dispatch_payload FROM public.stripe_commercial_operations WHERE operation_id=$1",
    [operation],
  );
const storedSchedule = (operation = OP) =>
  scalar("SELECT schedule_id FROM public.stripe_commercial_operations WHERE operation_id=$1", [
    operation,
  ]);
const readOperation = (
  opts: { operation?: string; owner?: string; account?: string; mode?: string } = {},
) =>
  db.query<{ state: string; schedule_id: string | null; reduction_dispatch_payload: unknown }>(
    "SELECT * FROM public.stripe_commercial_read_operation($1,$2,$3,$4)",
    [opts.operation ?? OP, opts.owner ?? user, opts.account ?? ACCOUNT, opts.mode ?? "live"],
  );

/**
 * The same TRUNCATE the per-test reset uses for these three stores. The refund
 * reservations are included because they reference the operations table, so
 * PostgreSQL refuses to truncate it alone.
 */
const resetOperations = () =>
  db.exec(`TRUNCATE public.stripe_refund_reservations,
    public.stripe_commercial_operations, public.stripe_commercial_quotes`);

/**
 * Issue a bound reduction quote, claim its operation and CONSUME the quote for
 * that operation, leaving it exactly where the server captures: `dispatching`,
 * nothing recorded yet. The consumption is part of the fixture because a capture
 * may only record a body for terms the customer actually confirmed.
 */
const seedReduction = async (
  opts: {
    kind?: string;
    plan?: string;
    seats?: number;
    direction?: string;
    selection?: string;
    boundary?: number;
    /** `null` is the quote with NO fixed effective boundary. */
    effectiveAt?: string | null;
    quote?: string | null;
    operation?: string;
    /** `false` leaves the operation `prepared`, before any dispatch. */
    dispatch?: boolean;
    /** `false` leaves the quote UNCONSUMED — nothing was confirmed. */
    consume?: boolean;
    /** Consume it for a DIFFERENT operation than the one being dispatched. */
    consumeBy?: string;
  } = {},
) => {
  const boundary = opts.boundary ?? PERIOD_END;
  const operation = opts.operation ?? OP;
  const quote = opts.quote === undefined ? QUOTE : opts.quote;
  if (quote)
    await issueQuote({
      quote,
      kind: opts.kind ?? "plan_change",
      plan: opts.plan ?? "growth",
      seats: opts.seats ?? 0,
      direction: opts.direction ?? "decrease",
      prorationDate: boundary,
      effectiveAt:
        opts.effectiveAt === undefined ? new Date(boundary * 1000).toISOString() : opts.effectiveAt,
      amount: 0,
    });
  await begin({
    operation,
    kind: opts.kind ?? "plan_change",
    quote,
    selection: opts.selection ?? REDUCTION_SELECTION,
  });
  // The confirmation the body is built for: single-use, bound, and spent by THIS
  // operation. The server's order is read -> begin -> consume -> dispatch.
  if (quote && opts.consume !== false)
    await consumeQuote({ quote, amount: 0, operation: opts.consumeBy ?? operation });
  if (opts.dispatch !== false)
    expect(await advance("dispatching", { operation, expected: "prepared" })).toBe(true);
};

/** The capture call the server makes, with everything in one statement. */
const capture = (payload: Obj | string | null, opts: { operation?: string } = {}) =>
  advance("awaiting_apply", {
    operation: opts.operation ?? OP,
    schedule: SCHEDULE,
    expected: "dispatching",
    payload,
  });

/** Nothing at all was recorded: the operation is still mid-dispatch. */
const nothingCaptured = async (operation = OP) => {
  expect(await operationState(operation), "state").toBe("dispatching");
  expect(await storedSchedule(operation), "schedule").toBeNull();
  expect(await storedPayload(operation), "payload").toBeNull();
};

describe("a reduction records the EXACT request it dispatched", () => {
  it("captures the schedule and the payload in one statement, and exposes both through the scoped read", async () => {
    // The column is JSONB and NULLABLE: an operation that dispatched no
    // reduction carries no payload at all.
    expect(
      await scalar(
        `SELECT format_type(a.atttypid,a.atttypmod) || '/' || a.attnotnull::text AS n
           FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
           JOIN pg_namespace s ON s.oid=c.relnamespace
          WHERE s.nspname='public' AND c.relname='stripe_commercial_operations'
            AND a.attname='reduction_dispatch_payload' AND NOT a.attisdropped`,
      ),
    ).toBe("jsonb/false");
    // And there is no leftover nine-argument overload a caller could reach to
    // bypass the payload rules: the new argument is a trailing DEFAULT on the
    // ONE function.
    expect(
      await scalar(
        "SELECT to_regprocedure('public.stripe_commercial_advance_operation(uuid,uuid,text,text,text,text,text,text,text)') IS NULL AS n",
      ),
    ).toBe(true);

    await seedReduction();
    expect(await capture(reductionPayload())).toBe(true);
    expect(await operationState()).toBe("awaiting_apply");
    expect(await storedSchedule()).toBe(SCHEDULE);
    expect(await storedPayload()).toEqual(reductionPayload());
    // The canonical stored document — the largest supported shape: two phases,
    // two paid items, the full settings expectation and a named payment method —
    // is well inside the 4096-byte bound.
    expect(
      Number(
        await scalar(
          `SELECT octet_length(reduction_dispatch_payload::text) AS n
             FROM public.stripe_commercial_operations WHERE operation_id=$1`,
          [OP],
        ),
      ),
    ).toBe(1694);

    const own = await readOperation();
    expect(own.rows.length).toBe(1);
    expect(own.rows[0].state).toBe("awaiting_apply");
    expect(own.rows[0].schedule_id).toBe(SCHEDULE);
    // The read is the EXACT readback a lost acknowledgment is resolved by.
    expect(own.rows[0].reduction_dispatch_payload).toEqual(reductionPayload());

    // And it is returned through the SAME owner/account/mode scope as the rest
    // of the row: no foreign reader sees the dispatched body.
    for (const scope of [
      { owner: second },
      { owner: third },
      { account: OTHER_ACCOUNT },
      { mode: "test" },
    ])
      expect((await readOperation(scope)).rows.length, JSON.stringify(scope)).toBe(0);
  });

  it("refuses an unrecognised version, a non-object, a malformed or an oversized payload", async () => {
    await seedReduction();
    const invalid: [string, Obj | string][] = [
      ["json null", "null"],
      ["an array", "[]"],
      ["a bare number", "5"],
      ["a bare string", '"phases"'],
      ["version 2", reductionPayload({ v: 2 })],
      ["a quoted version", reductionPayload({ v: "1" })],
      ["an oversized document", reductionPayload({ filler: "x".repeat(5000) })],
      ["an extra envelope key", reductionPayload({ extra: 1 })],
      ["a missing envelope key", { ...reductionPayload(), request: undefined }],
      ["a non-string selection", reductionPayload({ selectionDetail: 7 })],
      ["a quoted seat quantity", reductionPayload({ targetSeatQuantity: "0" })],
      ["a fractional boundary", reductionPayload({ effectiveBoundary: 1764288000.5 })],
      ["a missing request key", withRequest({ phases: undefined })],
      ["an extra request key", withRequest({ metadata: {} })],
      ["end_behavior cancel", withRequest({ end_behavior: "cancel" })],
      ["request proration always_invoice", withRequest({ proration_behavior: "always_invoice" })],
      ["one phase", withRequest({ phases: [basePhases()[0]] })],
      ["three phases", withRequest({ phases: [...basePhases(), basePhases()[1]] })],
      [
        "phase proration create_prorations",
        withPhases((p) => (p[0].proration_behavior = "create_prorations")),
      ],
      ["a missing phase proration", withPhases((p) => delete p[1].proration_behavior)],
      ["an end_date on the reduced phase", withPhases((p) => (p[1].end_date = PERIOD_END + 100))],
      ["no end_date on the original phase", withPhases((p) => delete p[0].end_date)],
      ["an extra phase key", withPhases((p) => (p[1].currency = "eur"))],
      ["a string start_date", withPhases((p) => (p[0].start_date = String(PERIOD_START)))],
      ["an empty item list", withPhases((p) => (p[0].items = []))],
      ["three items", withPhases((p) => phaseItems(p, 0).push({ price: "price_x", quantity: 1 }))],
      ["an item with an extra key", withPhases((p) => (phaseItems(p, 0)[0].id = "si_base"))],
      ["an item with no quantity", withPhases((p) => delete phaseItems(p, 0)[0].quantity)],
      ["a blank price", withPhases((p) => (phaseItems(p, 0)[0].price = "  "))],
      ["a fractional quantity", withPhases((p) => (phaseItems(p, 0)[1].quantity = 1.5))],
      ["a zero quantity", withPhases((p) => (phaseItems(p, 0)[1].quantity = 0))],
      ["an over-bounded quantity", withPhases((p) => (phaseItems(p, 0)[1].quantity = 1001))],
    ];
    for (const [label, candidate] of invalid) {
      await expect(capture(candidate), label).rejects.toThrow(/stripe_commercial_payload_invalid/);
      await nothingCaptured();
    }
  });

  it("re-proves every linkage against the durable operation, quote and boundary", async () => {
    await seedReduction();
    const mismatched: [string, Obj | null][] = [
      ["another operation", reductionPayload({ operationId: OP2 })],
      ["another quote", reductionPayload({ quoteId: QUOTE2 })],
      ["another schedule", reductionPayload({ scheduleId: "sub_sched_other" })],
      ["another subscription", reductionPayload({ subscriptionId: "sub_other" })],
      ["another selection", reductionPayload({ selectionDetail: SEAT_SELECTION })],
      ["another target plan", reductionPayload({ targetPlanId: "starter" })],
      ["another target seat count", reductionPayload({ targetSeatQuantity: 2 })],
      ["another boundary", reductionPayload({ effectiveBoundary: PERIOD_END + 86_400 })],
      ["a moved original end", withPhases((p) => (p[0].end_date = PERIOD_END + 86_400))],
      ["a moved reduced start", withPhases((p) => (p[1].start_date = PERIOD_END + 86_400))],
      [
        "an original phase starting at the boundary",
        withPhases((p) => (p[0].start_date = PERIOD_END)),
      ],
      [
        "an original phase starting after it",
        withPhases((p) => (p[0].start_date = PERIOD_END + 1)),
      ],
      [
        "a reduced phase that is not the target",
        withPhases((p) => (phaseItems(p, 1)[0].price = "price_agency_base")),
      ],
      [
        "a reduced phase with an unquoted seat item",
        withPhases((p) => phaseItems(p, 1).push({ price: "price_pro_seat", quantity: 1 })),
      ],
      ["a reduced base quantity above one", withPhases((p) => (phaseItems(p, 1)[0].quantity = 2))],
      // The recorded original currency is the quote's currency, so the settings
      // cannot have been read from a differently priced subscription.
      [
        "another paid-phase currency",
        withSettings((s) => (settingsPart(s, "paidPhase").currency = "usd")),
      ],
      // The settings expectation and the body it was built with must describe the
      // SAME paid items, in the same order.
      [
        "paid item evidence for another price",
        withSettings((s) => (settingsItems(s)[1].price = "price_other_seat")),
      ],
      [
        "paid item evidence for another quantity",
        withSettings((s) => (settingsItems(s)[1].quantity = 3)),
      ],
      ["fewer paid items than the paid phase", withSettings((s) => settingsItems(s).pop())],
      // The payload itself is well formed, but there is no schedule to bind it
      // to, so it is not evidence of a dispatch.
      ["no schedule at all", null],
    ];
    for (const [label, candidate] of mismatched) {
      if (candidate === null)
        await expect(
          advance("awaiting_apply", { expected: "dispatching", payload: reductionPayload() }),
          label,
        ).rejects.toThrow(/stripe_commercial_payload_mismatch/);
      else
        await expect(capture(candidate), label).rejects.toThrow(
          /stripe_commercial_payload_mismatch/,
        );
      await nothingCaptured();
    }
  });

  it("rebuilds the reduced phase from the canonical selection, in order, for a seat reduction", async () => {
    await seedReduction({
      kind: "seat_change",
      plan: "pro",
      seats: 2,
      selection: SEAT_SELECTION,
    });
    const seatPayload = (items: Obj[]) =>
      reductionPayload({
        selectionDetail: SEAT_SELECTION,
        targetPlanId: "pro",
        targetSeatQuantity: 2,
        request: {
          end_behavior: "release",
          proration_behavior: "none",
          phases: [basePhases()[0], { ...basePhases()[1], items }],
        },
      });
    const expected: Obj[] = [
      { price: "price_pro_base", quantity: 1 },
      { price: "price_pro_seat", quantity: 2 },
    ];
    // The seat item is MANDATORY above zero seats, must carry the quoted price
    // and the quoted quantity, and the base item comes first.
    for (const [label, items] of [
      ["no seat item", [expected[0]]],
      ["the wrong seat quantity", [expected[0], { price: "price_pro_seat", quantity: 3 }]],
      ["an unquoted seat price", [expected[0], { price: "price_other_seat", quantity: 2 }]],
      ["a reversed order", [expected[1], expected[0]]],
    ] as [string, Obj[]][])
      await expect(capture(seatPayload(items)), label).rejects.toThrow(
        /stripe_commercial_payload_mismatch/,
      );
    await nothingCaptured();
    expect(await capture(seatPayload(expected))).toBe(true);
    expect(await storedPayload()).toEqual(seatPayload(expected));
  });

  it("requires every original settings term to be present and well formed", async () => {
    await seedReduction();
    const malformed: [string, Obj][] = [
      ["no settings object at all", { ...reductionPayload(), expectedSettings: undefined }],
      ["a settings array", reductionPayload({ expectedSettings: [] })],
      ["a settings string", reductionPayload({ expectedSettings: "neutral" })],
      ["a missing settings section", withSettings((s) => delete s.paidItems)],
      ["an extra settings section", withSettings((s) => (s.extra = 1))],
      ["default settings as an array", withSettings((s) => (s.defaultSettings = []))],
      ["a paid phase as a string", withSettings((s) => (s.paidPhase = "inherited"))],
      ["paid items as an object", withSettings((s) => (s.paidItems = {}))],
      // A term that is simply ABSENT is malformed: "we saw nothing" may never be
      // recorded as "there was nothing".
      [
        "an omitted default term",
        withSettings((s) => delete settingsPart(s, "defaultSettings").on_behalf_of),
      ],
      [
        "an omitted paid-phase term",
        withSettings((s) => delete settingsPart(s, "paidPhase").trial_end),
      ],
      [
        "an omitted paid-phase currency",
        withSettings((s) => delete settingsPart(s, "paidPhase").currency),
      ],
      [
        "an extra default term",
        withSettings((s) => (settingsPart(s, "defaultSettings").pause_collection = null)),
      ],
      [
        "an extra paid-phase term",
        withSettings((s) => (settingsPart(s, "paidPhase").trial_continuation = null)),
      ],
      ["no paid items", withSettings((s) => (s.paidItems = []))],
      ["three paid items", withSettings((s) => settingsItems(s).push(paidItem("price_extra", 1)))],
      ["a paid item missing a term", withSettings((s) => delete settingsItems(s)[0].tax_rates)],
      ["a paid item with an extra term", withSettings((s) => (settingsItems(s)[0].id = "si_base"))],
      ["a paid item with no price", withSettings((s) => (settingsItems(s)[0].price = ""))],
      ["a paid item with a zero quantity", withSettings((s) => (settingsItems(s)[0].quantity = 0))],
      // The one VARIABLE term is typed and bounded, and `null` is a value, not an
      // absence.
      [
        "a numeric payment method",
        withSettings((s) => (settingsPart(s, "paidPhase").default_payment_method = 7)),
      ],
      [
        "a blank payment method",
        withSettings((s) => (settingsPart(s, "defaultSettings").default_payment_method = "   ")),
      ],
      [
        "an over-long payment method",
        withSettings(
          (s) => (settingsPart(s, "paidPhase").default_payment_method = `pm_${"x".repeat(300)}`),
        ),
      ],
      // A FIELD THE ORDINARY RESPONSE DOES NOT CARRY has no v1 representation at
      // all, so it arrives as an unexpected key. The server must HOLD such an
      // adoption response before capture rather than invent a representation; it
      // cannot record one here either way.
      [
        "a phase-level discount field",
        withSettings((s) => (settingsPart(s, "paidPhase").discounts = [{ coupon: "c_1" }])),
      ],
      [
        "phase billing thresholds",
        withSettings((s) => (settingsPart(s, "paidPhase").billing_thresholds = { amount_gte: 1 })),
      ],
      [
        "a phase-level automatic tax",
        withSettings((s) => (settingsPart(s, "paidPhase").automatic_tax = false)),
      ],
      [
        "a paused collection",
        withSettings((s) => (settingsPart(s, "defaultSettings").pause_collection = null)),
      ],
      ["item discounts", withSettings((s) => (settingsItems(s)[0].discounts = [{ coupon: "c" }]))],
      [
        "item billing thresholds",
        withSettings((s) => (settingsItems(s)[1].billing_thresholds = { usage_gte: 10 })),
      ],
      // The legacy `plan` mirror of `price` is not stored a second time.
      ["an item plan mirror", withSettings((s) => (settingsItems(s)[0].plan = "price_pro_base"))],
    ];
    for (const [label, candidate] of malformed) {
      await expect(capture(candidate), label).rejects.toThrow(/stripe_commercial_payload_invalid/);
      await nothingCaptured();
    }
  });

  it("HOLDS every arrangement outside the one supported profile", async () => {
    await seedReduction();
    const held: [string, Obj][] = [
      ["an unknown profile name", withSettings((s) => (s.profile = "taxInclusive"))],
      ["a numeric profile", withSettings((s) => (s.profile = 1))],
      [
        "automatic tax on the defaults",
        withSettings((s) => (settingsPart(s, "defaultSettings").automatic_tax = true)),
      ],
      [
        "an invoiced collection method on the phase",
        withSettings((s) => (settingsPart(s, "paidPhase").collection_method = "send_invoice")),
      ],
      [
        "an invoiced collection method on the defaults",
        withSettings(
          (s) => (settingsPart(s, "defaultSettings").collection_method = "send_invoice"),
        ),
      ],
      // The ordinary response anchors the DEFAULTS to "automatic" and the phase
      // to null. Each is held when it is anything else — including the other
      // level's ordinary value, which would be a real change of billing cycle.
      [
        "a phase-start anchor on the defaults",
        withSettings(
          (s) => (settingsPart(s, "defaultSettings").billing_cycle_anchor = "phase_start"),
        ),
      ],
      [
        "a nulled anchor on the defaults",
        withSettings((s) => (settingsPart(s, "defaultSettings").billing_cycle_anchor = null)),
      ],
      [
        "an automatic anchor on the phase",
        withSettings((s) => (settingsPart(s, "paidPhase").billing_cycle_anchor = "automatic")),
      ],
      // The `self` issuer is retained exactly; any other invoicing content holds.
      [
        "a connected-account issuer",
        withSettings(
          (s) =>
            (settingsPart(s, "defaultSettings").invoice_settings = {
              issuer: { type: "account", account: "acct_1" },
            }),
        ),
      ],
      [
        "a phase invoice-settings override",
        withSettings(
          (s) => (settingsPart(s, "paidPhase").invoice_settings = { issuer: { type: "self" } }),
        ),
      ],
      [
        "a legacy default source",
        withSettings((s) => (settingsPart(s, "defaultSettings").default_source = "card_1")),
      ],
      ["a trial", withSettings((s) => (settingsPart(s, "paidPhase").trial_end = PERIOD_END))],
      [
        "phase metadata",
        withSettings((s) => (settingsPart(s, "paidPhase").metadata = { note: "x" })),
      ],
      [
        "a pending invoice item",
        withSettings(
          (s) => (settingsPart(s, "paidPhase").add_invoice_items = [{ price: "price_x" }]),
        ),
      ],
      [
        "a phase default tax rate",
        withSettings((s) => (settingsPart(s, "paidPhase").default_tax_rates = ["txr_1"])),
      ],
      [
        "an application fee",
        withSettings((s) => (settingsPart(s, "defaultSettings").application_fee_percent = 1)),
      ],
      [
        "an on-behalf-of account",
        withSettings((s) => (settingsPart(s, "paidPhase").on_behalf_of = "acct_1")),
      ],
      [
        "transfer data",
        withSettings(
          (s) => (settingsPart(s, "defaultSettings").transfer_data = { destination: "acct_1" }),
        ),
      ],
      [
        "a phase description",
        withSettings((s) => (settingsPart(s, "paidPhase").description = "legacy")),
      ],
      // An item's `tax_rates` OVERRIDES the phase's `default_tax_rates`, so a
      // non-empty one is a tax arrangement rather than a detail.
      ["an item tax rate", withSettings((s) => (settingsItems(s)[0].tax_rates = ["txr_1"]))],
      ["item metadata", withSettings((s) => (settingsItems(s)[1].metadata = { note: "x" }))],
    ];
    for (const [label, candidate] of held) {
      await expect(capture(candidate), label).rejects.toThrow(
        /stripe_commercial_payload_profile_unsupported/,
      );
      await nothingCaptured();
    }
  });

  it("binds the recorded payment method to BOTH canonical phases and keeps the two originals distinct", async () => {
    await seedReduction();
    // A recorded phase-level method must be restated in both phases, exactly:
    // a phase update drops what it is not given, so an omission would silently
    // hand the paid phase, or the reduced one, to another method.
    for (const [label, candidate] of [
      ["omitted from the paid phase", withPhases((p) => delete p[0].default_payment_method)],
      ["omitted from the reduced phase", withPhases((p) => delete p[1].default_payment_method)],
      ["altered on the reduced phase", withPhases((p) => (p[1].default_payment_method = PM_OTHER))],
      [
        "named although the original inherited it",
        reductionPayload({
          expectedSettings: expectedSettings({}, null),
          request: {
            end_behavior: "release",
            proration_behavior: "none",
            phases: basePhases(PM),
          },
        }),
      ],
    ] as [string, Obj][])
      await expect(capture(candidate), label).rejects.toThrow(/stripe_commercial_payload_mismatch/);
    await nothingCaptured();

    // An INHERITED original is a different, equally explicit fact: the paid phase
    // overrode nothing, the defaults carry the identity, and neither canonical
    // phase may name a method.
    const inherited = payloadForMethod(null, PM);
    expect(await capture(inherited)).toBe(true);
    expect(await storedPayload()).toEqual(inherited);

    // Two originals that differ ONLY in the payment method are two different
    // documents, and the second cannot replace the first.
    await resetOperations();
    await seedReduction();
    const original = payloadForMethod(PM);
    const other = payloadForMethod(PM_OTHER);
    expect(JSON.stringify(original)).not.toBe(JSON.stringify(other));
    expect(await capture(original)).toBe(true);
    expect(await storedPayload()).toEqual(original);
    await expect(
      advance("fenced", { schedule: SCHEDULE, expected: "awaiting_apply", payload: other }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
    expect(await storedPayload()).toEqual(original);
    expect(await operationState()).toBe("awaiting_apply");
  });

  it("accepts the ORDINARY documented schedule response, mapped field for field", async () => {
    // The official public sample's `default_settings` and first phase, with this
    // suite's synthetic ids, dates and currency in place of the documentation
    // examples. Nothing here was fetched: it is the saved public reference.
    const officialDefaults: Obj = {
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
    };
    const officialPhase: Obj = {
      add_invoice_items: [],
      application_fee_percent: null,
      billing_cycle_anchor: null,
      collection_method: null,
      currency: "eur",
      default_payment_method: null,
      default_tax_rates: [],
      description: null,
      end_date: PERIOD_END,
      invoice_settings: null,
      items: [
        {
          metadata: {},
          plan: "price_pro_base",
          price: "price_pro_base",
          quantity: 1,
          tax_rates: [],
        },
        {
          metadata: {},
          plan: "price_pro_seat",
          price: "price_pro_seat",
          quantity: 4,
          tax_rates: [],
        },
      ],
      metadata: {},
      on_behalf_of: null,
      proration_behavior: "create_prorations",
      start_date: PERIOD_START,
      transfer_data: null,
      trial_end: null,
    };

    // THE MAPPING, executed rather than described.
    //  - `automatic_tax` collapses to a canonical boolean ONLY after BOTH of its
    //    fields are validated and it carries nothing else;
    //  - `start_date`, `end_date`, `items` and `proration_behavior` move into
    //    `request`, where the body deliberately overrides the original
    //    `create_prorations` with `none` — scoped intent, not setting loss;
    //  - an item's legacy `plan` mirror of `price` is not stored twice.
    const tax = officialDefaults.automatic_tax as Obj;
    expect(tax).toEqual({ enabled: false, liability: null });
    const REQUEST_FIELDS = ["start_date", "end_date", "items", "proration_behavior"];
    const mapped: Obj = {
      profile: "automaticChargeNoTaxNoDiscount",
      defaultSettings: {
        ...officialDefaults,
        automatic_tax:
          tax.enabled === false && tax.liability === null && Object.keys(tax).length === 2
            ? false
            : tax,
      },
      paidPhase: Object.fromEntries(
        Object.entries(officialPhase).filter(([key]) => !REQUEST_FIELDS.includes(key)),
      ),
      paidItems: (officialPhase.items as Obj[]).map((item) =>
        Object.fromEntries(Object.entries(item).filter(([key]) => key !== "plan")),
      ),
    };
    // The mapping lands exactly on the fixture the rest of this suite uses, in
    // its ordinary form: an INHERITED payment method and collection method.
    expect(mapped).toEqual(expectedSettings({}, null, null));

    await seedReduction();
    const ordinary = reductionPayload({
      expectedSettings: mapped,
      request: {
        end_behavior: "release",
        proration_behavior: "none",
        phases: basePhases(null, null),
      },
    });
    expect(ordinary).toEqual(payloadForMethod(null, null));
    expect(await capture(ordinary)).toBe(true);
    expect(await storedPayload()).toEqual(ordinary);
    expect((await readOperation()).rows[0].reduction_dispatch_payload).toEqual(ordinary);
  });

  it("retains an INHERITED phase collection method and an explicit override distinctly", async () => {
    await seedReduction();
    const phasesOf = (payload: Obj) => (payload.request as Obj).phases as Obj[];
    const override = (cm: string | null, change: (phases: Obj[]) => void) => {
      const payload = payloadForCollection(cm);
      change(phasesOf(payload));
      return payload;
    };
    for (const [label, candidate] of [
      // Naming a method the original only INHERITED would create an override the
      // original never had.
      [
        "named although the phase inherited it",
        reductionPayload({
          expectedSettings: expectedSettings({}, PM, null),
          request: {
            end_behavior: "release",
            proration_behavior: "none",
            phases: basePhases(PM, "charge_automatically"),
          },
        }),
      ],
      // And recording an explicit override while the request omits it is exactly
      // the setting a phase update would unset.
      [
        "an override omitted from the paid phase",
        override("charge_automatically", (p) => delete p[0].collection_method),
      ],
      [
        "an override omitted from the reduced phase",
        override("charge_automatically", (p) => delete p[1].collection_method),
      ],
      [
        "an override altered on the reduced phase",
        override("charge_automatically", (p) => (p[1].collection_method = "send_invoice")),
      ],
    ] as [string, Obj][])
      await expect(capture(candidate), label).rejects.toThrow(/stripe_commercial_payload_mismatch/);
    await nothingCaptured();

    // The ordinary inherited original captures with no method named anywhere.
    const inherited = payloadForCollection(null);
    expect(phasesOf(inherited).some((phase) => "collection_method" in phase)).toBe(false);
    expect(await capture(inherited)).toBe(true);
    expect(await storedPayload()).toEqual(inherited);

    // The two arrangements are two different documents, and the explicit one
    // cannot replace a recorded inherited one.
    const explicit = payloadForCollection("charge_automatically");
    expect(JSON.stringify(explicit)).not.toBe(JSON.stringify(inherited));
    await expect(
      advance("fenced", { schedule: SCHEDULE, expected: "awaiting_apply", payload: explicit }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
    expect(await storedPayload()).toEqual(inherited);

    // An explicit override is supported on its own operation, restated in BOTH
    // canonical phases.
    await resetOperations();
    await seedReduction();
    expect(
      phasesOf(explicit).every((phase) => phase.collection_method === "charge_automatically"),
    ).toBe(true);
    expect(await capture(explicit)).toBe(true);
    expect(await storedPayload()).toEqual(explicit);

    // The retained issuer gets the same discipline: its two supported forms are
    // two different originals, and the second cannot replace the first.
    await resetOperations();
    await seedReduction();
    const nulledIssuer = withSettings(
      (s) => (settingsPart(s, "defaultSettings").invoice_settings = null),
    );
    expect(await capture(reductionPayload())).toBe(true);
    await expect(
      advance("fenced", { schedule: SCHEDULE, expected: "awaiting_apply", payload: nulledIssuer }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
    expect(await storedPayload()).toEqual(reductionPayload());
  });

  it("captures only against a quote this operation actually consumed", async () => {
    // Nothing was confirmed: the terms the body is built for do not exist yet.
    await seedReduction({ consume: false });
    await expect(capture(reductionPayload())).rejects.toThrow(/stripe_commercial_payload_mismatch/);
    await nothingCaptured();
    expect(
      await scalar("SELECT consumed_by FROM public.stripe_commercial_quotes WHERE quote_id=$1", [
        QUOTE,
      ]),
    ).toBeNull();

    // Someone else's spend of the same in-scope quote is not this operation's
    // confirmation either.
    await resetOperations();
    await seedReduction({ consumeBy: OP2 });
    await expect(capture(reductionPayload())).rejects.toThrow(/stripe_commercial_payload_mismatch/);
    await nothingCaptured();

    // And a quote that was consumed by THIS operation stays usable as evidence
    // after its TTL has passed: it is single-use and already spent, so re-testing
    // the TTL here would make a lawful recovery impossible minutes later.
    await resetOperations();
    await seedReduction();
    await db.exec("SET ROLE service_role");
    await db.query(
      "UPDATE public.stripe_commercial_quotes SET expires_at=now() - interval '2 hours' WHERE quote_id=$1",
      [QUOTE],
    );
    await db.exec("RESET ROLE");
    expect(await capture(reductionPayload())).toBe(true);
    expect(await storedPayload()).toEqual(reductionPayload());
  });

  it("refuses a payload from anything that is not a BOUND reduction quote", async () => {
    // An increase: nothing is scheduled, so no phase body exists to record.
    await seedReduction({ direction: "increase", effectiveAt: null });
    await expect(capture(reductionPayload())).rejects.toThrow(
      /stripe_commercial_payload_unsupported/,
    );
    await nothingCaptured();
    // The increase flow itself is untouched by the new argument, INCLUDING the
    // un-adapted NINE-argument call shape, which still resolves through the
    // trailing default.
    expect(
      await scalar(
        "SELECT public.stripe_commercial_advance_operation($1,$2,$3,'live','awaiting_payment','in_up',NULL,NULL,'dispatching') AS r",
        [OP, user, ACCOUNT],
      ),
    ).toBe(true);
    expect(
      await advance("awaiting_apply", { invoice: "in_up", expected: "awaiting_payment" }),
    ).toBe(true);
    expect(await finish("applied", { expected: "awaiting_apply" })).toBe(true);

    await resetOperations();
    // A plan change with NO bound quote cannot prove a direction at all.
    await seedReduction({ quote: null });
    await expect(capture(reductionPayload())).rejects.toThrow(
      /stripe_commercial_payload_unsupported/,
    );
    await nothingCaptured();

    // And the kinds that select no item at all.
    for (const kind of ["cancel", "refund"]) {
      await resetOperations();
      await begin({ kind });
      expect(await advance("dispatching", { expected: "prepared" })).toBe(true);
      await expect(capture(reductionPayload()), kind).rejects.toThrow(
        /stripe_commercial_payload_unsupported/,
      );
      await nothingCaptured();
      // Their own forward transitions still need no payload whatsoever.
      expect(await advance("awaiting_apply", { expected: "dispatching" }), kind).toBe(true);
      expect(await finish("applied", { expected: "awaiting_apply" }), kind).toBe(true);
    }
  });

  it("captures at exactly one point: dispatching -> awaiting_apply, asserted", async () => {
    // Not on the dispatch itself, not on a fence, and not without the assertion
    // that this attempt is the one that dispatched.
    await seedReduction({ dispatch: false });
    await expect(
      advance("dispatching", {
        schedule: SCHEDULE,
        expected: "prepared",
        payload: reductionPayload(),
      }),
    ).rejects.toThrow(/stripe_commercial_payload_unsupported/);
    expect(await operationState()).toBe("prepared");
    expect(await advance("dispatching", { expected: "prepared" })).toBe(true);
    await expect(
      advance("fenced", {
        schedule: SCHEDULE,
        expected: "dispatching",
        payload: reductionPayload(),
      }),
    ).rejects.toThrow(/stripe_commercial_payload_unsupported/);
    await expect(
      advance("awaiting_apply", { schedule: SCHEDULE, payload: reductionPayload() }),
    ).rejects.toThrow(/stripe_commercial_payload_unsupported/);
    await nothingCaptured();
    // A fenced attempt never captured anything, so it stays HELD rather than
    // being able to declare itself ready later.
    expect(await advance("fenced", { expected: "dispatching" })).toBe(true);
    await expect(
      advance("awaiting_apply", {
        schedule: SCHEDULE,
        expected: "dispatching",
        payload: reductionPayload(),
      }),
    ).resolves.toBe(false);
    await expect(
      advance("awaiting_apply", { schedule: SCHEDULE, expected: "fenced" }),
    ).rejects.toThrow(/stripe_commercial_reduction_payload_missing/);
    expect(await operationState()).toBe("fenced");
    expect(await storedPayload()).toBeNull();
  });

  it("refuses to declare a reduction READY without both the schedule and the payload", async () => {
    await seedReduction();
    // A schedule alone proves adoption, not what was sent.
    await expect(
      advance("awaiting_apply", { schedule: SCHEDULE, expected: "dispatching" }),
    ).rejects.toThrow(/stripe_commercial_reduction_payload_missing/);
    // Neither does nothing at all, which is what the un-adapted caller sends —
    // in its ten-argument and its original nine-argument shape alike.
    await expect(advance("awaiting_apply", { expected: "dispatching" })).rejects.toThrow(
      /stripe_commercial_reduction_payload_missing/,
    );
    await expect(
      db.query(
        "SELECT public.stripe_commercial_advance_operation($1,$2,$3,'live','awaiting_apply',NULL,NULL,$4,'dispatching')",
        [OP, user, ACCOUNT, SCHEDULE],
      ),
    ).rejects.toThrow(/stripe_commercial_reduction_payload_missing/);
    await nothingCaptured();
    // The slot is still held by the unresolved operation, so no new operation
    // bypasses an attempt whose provider outcome is unknown.
    await expect(begin({ operation: OP2, key: "k2" })).rejects.toThrow(
      /stripe_commercial_operation_open/,
    );
    expect(await capture(reductionPayload())).toBe(true);
  });

  it("lets the FIRST write win: no identical rewrite, no unequal replacement, no stale write", async () => {
    await seedReduction();
    expect(await capture(reductionPayload())).toBe(true);
    const original = await storedPayload();

    // A racing worker that still believes the operation is `dispatching` loses
    // on the compare-and-set: false, and nothing is written or raised.
    expect(await capture(withPhases((p) => (phaseItems(p, 0)[1].quantity = 9)))).toBe(false);
    // The identical retry is the same stale assertion, so it is also false, and
    // the server resolves it by reading the stored bytes back.
    expect(await capture(reductionPayload())).toBe(false);
    expect(await storedPayload()).toEqual(original);
    expect(await storedSchedule()).toBe(SCHEDULE);

    // An UNEQUAL payload offered with a current assertion is an evidence
    // conflict, exactly like a repointed invoice — never an amendment.
    await expect(
      advance("fenced", {
        schedule: SCHEDULE,
        expected: "awaiting_apply",
        payload: withPhases((p) => (phaseItems(p, 0)[1].quantity = 9)),
      }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
    // So is the same payload against a different schedule, or with the schedule
    // left out, because the pair is what was recorded atomically.
    await expect(
      advance("fenced", {
        schedule: "sub_sched_other",
        expected: "awaiting_apply",
        payload: reductionPayload(),
      }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
    await expect(
      advance("fenced", { expected: "awaiting_apply", payload: reductionPayload() }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
    expect(await operationState()).toBe("awaiting_apply");
    expect(await storedPayload()).toEqual(original);

    // Restating the identical pair on a legitimate forward move is accepted and
    // changes nothing. Equality is on the JSON DOCUMENT, not on its serialised
    // key order, so a restatement that emits the same fields in another order is
    // still the same evidence rather than a conflict.
    const reordered = JSON.stringify(
      Object.fromEntries(Object.entries(reductionPayload()).reverse()),
    );
    expect(reordered).not.toBe(JSON.stringify(reductionPayload()));
    expect(
      await advance("fenced", {
        schedule: SCHEDULE,
        expected: "awaiting_apply",
        payload: reordered,
      }),
    ).toBe(true);
    expect(await storedPayload()).toEqual(original);
  });

  it("keeps the captured evidence on a terminal operation, which accepts nothing further", async () => {
    await seedReduction();
    expect(await capture(reductionPayload())).toBe(true);
    expect(await finish("applied", { expected: "awaiting_apply" })).toBe(true);
    for (const expected of [null, "applied", "awaiting_apply"])
      expect(
        await advance("fenced", { schedule: SCHEDULE, expected, payload: reductionPayload() }),
        `fenced/${expected}`,
      ).toBe(false);
    expect(await operationState()).toBe("applied");
    expect(await storedPayload()).toEqual(reductionPayload());
    // A resolved operation releases the slot exactly as before.
    expect((await begin({ operation: OP2, key: "k2" })).state).toBe("prepared");
  });

  it("is a DATABASE fact: an unbound or unrecognised payload cannot be written directly", async () => {
    await seedReduction();
    await db.exec("SET ROLE service_role");
    const write = (value: string, where = "") =>
      db.query(
        `UPDATE public.stripe_commercial_operations
            SET reduction_dispatch_payload=$1::jsonb ${where} WHERE operation_id=$2`,
        [value, OP],
      );
    // No schedule recorded yet, so a payload may not exist at all.
    await expect(write(JSON.stringify(reductionPayload()))).rejects.toThrow(
      /reduction_payload_bound/,
    );
    // With the schedule present the binding holds, but the version, the object
    // shape and the size bound are still enforced by the table itself.
    await expect(
      write(JSON.stringify(reductionPayload({ v: 2 })), `, schedule_id='${SCHEDULE}'`),
    ).rejects.toThrow(/reduction_payload_shape/);
    // THE MISSING-VERSION ESCAPE. `->'v' = '1'::jsonb` is UNKNOWN when there is
    // no `v` at all, and a CHECK accepts UNKNOWN, so an unversioned document used
    // to pass this constraint. Both halves must be present to be rejected for the
    // right reason: the document below is otherwise complete.
    const unversioned = { ...reductionPayload(), v: undefined };
    expect(JSON.stringify(unversioned)).not.toContain('"v"');
    await expect(write(JSON.stringify(unversioned), `, schedule_id='${SCHEDULE}'`)).rejects.toThrow(
      /reduction_payload_shape/,
    );
    // And so is a document with no settings expectation at all.
    await expect(
      write(
        JSON.stringify({ ...reductionPayload(), expectedSettings: undefined }),
        `, schedule_id='${SCHEDULE}'`,
      ),
    ).rejects.toThrow(/reduction_payload_shape/);
    await expect(
      write(JSON.stringify([reductionPayload()]), `, schedule_id='${SCHEDULE}'`),
    ).rejects.toThrow(/reduction_payload_shape/);
    await expect(
      write(
        JSON.stringify(reductionPayload({ filler: "x".repeat(5000) })),
        `, schedule_id='${SCHEDULE}'`,
      ),
    ).rejects.toThrow(/reduction_payload_shape/);
    await expect(write(JSON.stringify({ v: 1 }), `, schedule_id='${SCHEDULE}'`)).rejects.toThrow(
      /reduction_payload_shape/,
    );
    await db.exec("RESET ROLE");
    // A cancellation can never carry one, whatever a direct writer attempts.
    await resetOperations();
    await begin({ kind: "cancel" });
    await db.exec("SET ROLE service_role");
    await expect(
      write(JSON.stringify(reductionPayload()), `, schedule_id='${SCHEDULE}'`),
    ).rejects.toThrow(/reduction_payload_bound/);
    await db.exec("RESET ROLE");
  });

  it("holds a reduction whose quote carries no fixed effective boundary", async () => {
    await seedReduction({ effectiveAt: null });
    await expect(capture(reductionPayload())).rejects.toThrow(/stripe_commercial_payload_mismatch/);
    await nothingCaptured();
  });
});

/* ============================ refund cases =============================== */

describe("operator-approved refund cases", () => {
  it("records a complete approval and is idempotent for an identical re-record", async () => {
    expect(await recordCase()).toBe("approved");
    expect(await recordCase()).toBe("approved");
    const read = await one<Record<string, unknown>>(
      "SELECT * FROM public.stripe_commercial_read_refund_case($1,$2,'live')",
      ["CASE-1", ACCOUNT],
    );
    expect(read.approved_by).toBe("operator:rafal");
    expect(read.policy_basis).toBe("firstPayment14Day");
    expect(read.subscription_disposition).toBe("cancelAtPeriodEndSeparately");
    expect(read.access_disposition).toBe("retainUntilPeriodEnd");
    expect(read.state).toBe("approved");
  });

  it("refuses a changed term on an existing case rather than amending it", async () => {
    await recordCase();
    for (const over of [
      { amount: 1 },
      { currency: "pln" },
      { basis: "outage" },
      { actor: "operator:someone-else" },
      { owner: second },
      { invoice: "in_other" },
      { subscriptionDisposition: "retainSubscription" },
      { accessDisposition: "unchanged" },
      // The three terms a re-approval previously changed SILENTLY. Each is
      // material: the subscription binds invoice ownership, the plan is part of
      // the once-per-customer-per-plan key, and the request time is what the
      // 14-day window is measured from.
      { subscription: "sub_other" },
      { subscription: null },
      { plan: "growth" },
      { requestedAt: iso(-7200_000) },
    ])
      await expect(recordCase(over), JSON.stringify(over)).rejects.toThrow(
        /stripe_commercial_refund_case_conflict/,
      );
  });

  it("compares a NULLABLE subscription null-safely in both directions", async () => {
    // A case recorded WITHOUT a subscription: an IS DISTINCT FROM comparison is
    // what makes "null stays null" idempotent and "null became sub_1" a conflict.
    expect(await recordCase({ id: "CASE-N", subscription: null })).toBe("approved");
    expect(await recordCase({ id: "CASE-N", subscription: null })).toBe("approved");
    // Blank and whitespace normalise to the same NULL the INSERT stored.
    expect(await recordCase({ id: "CASE-N", subscription: "   " })).toBe("approved");
    await expect(recordCase({ id: "CASE-N", subscription: "sub_1" })).rejects.toThrow(
      /stripe_commercial_refund_case_conflict/,
    );
    // And the reverse: a recorded subscription cannot be dropped to null.
    await recordCase({ id: "CASE-S", invoice: "in_s", subscription: "sub_1" });
    await expect(recordCase({ id: "CASE-S", invoice: "in_s", subscription: null })).rejects.toThrow(
      /stripe_commercial_refund_case_conflict/,
    );
  });

  it("accepts an identical re-approval whose terms differ only in NORMALISATION", async () => {
    await recordCase({ currency: "eur", subscription: "sub_1" });
    // The comparison applies the same lower(currency) / btrim(subscription) the
    // INSERT applied, so these are the same approval, not an amendment.
    expect(await recordCase({ currency: "EUR", subscription: "  sub_1  " })).toBe("approved");
    expect(
      await scalar("SELECT currency FROM public.stripe_refund_cases WHERE case_id='CASE-1'"),
    ).toBe("eur");
    expect(
      await scalar("SELECT subscription_id FROM public.stripe_refund_cases WHERE case_id='CASE-1'"),
    ).toBe("sub_1");
  });

  it("refuses a missing or unrecognised basis, disposition, actor, amount or request time", async () => {
    await expect(recordCase({ basis: "goodwill" })).rejects.toThrow();
    await expect(recordCase({ subscriptionDisposition: "cancelNow" })).rejects.toThrow();
    await expect(recordCase({ accessDisposition: "revokeNow" })).rejects.toThrow();
    await expect(recordCase({ actor: "" })).rejects.toThrow(/refund_case_unavailable/);
    await expect(recordCase({ amount: 0 })).rejects.toThrow();
    await expect(recordCase({ plan: "freePreview" })).rejects.toThrow();
    // An approval cannot predate the request it approves.
    await expect(recordCase({ requestedAt: iso(3600_000) })).rejects.toThrow();
  });

  it("records the explicitly HELD dispositions faithfully, for the executor to refuse", async () => {
    expect(
      await recordCase({
        id: "CASE-HELD",
        subscriptionDisposition: "cancelImmediatelyHeld",
        accessDisposition: "revokeOnRefundHeld",
      }),
    ).toBe("approved");
    const read = await one<Record<string, unknown>>(
      "SELECT * FROM public.stripe_commercial_read_refund_case($1,$2,'live')",
      ["CASE-HELD", ACCOUNT],
    );
    expect(read.subscription_disposition).toBe("cancelImmediatelyHeld");
    expect(read.access_disposition).toBe("revokeOnRefundHeld");
  });

  it("scopes the case read to the account and mode", async () => {
    await recordCase();
    expect(
      (
        await db.query("SELECT * FROM public.stripe_commercial_read_refund_case($1,$2,'live')", [
          "CASE-1",
          OTHER_ACCOUNT,
        ])
      ).rows.length,
    ).toBe(0);
    expect(
      (
        await db.query("SELECT * FROM public.stripe_commercial_read_refund_case($1,$2,'test')", [
          "CASE-1",
          ACCOUNT,
        ])
      ).rows.length,
    ).toBe(0);
  });
});

/* ========================= refund reservations =========================== */

describe("refund reservations are conservative and cross-case serialized", () => {
  it("reserves within the remaining funds and is idempotent for its own operation", async () => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    const first = await reserve({ amount: 10_000, allocated: 29_900 });
    expect(Number(first.reserved)).toBe(10_000);
    expect(Number(first.remaining)).toBe(19_900);
    const again = await reserve({ amount: 10_000, allocated: 29_900 });
    expect(Number(again.reserved)).toBe(10_000);
    expect(await reservationState()).toBe("reserved");
  });

  it("refuses cumulative over-refunding across cases on the same invoice", async () => {
    await recordCase({ id: "CASE-A", amount: 20_000 });
    await recordCase({ id: "CASE-B", amount: 15_000 });
    await begin({ kind: "refund", case: "CASE-A" });
    await reserve({ id: "CASE-A", amount: 20_000, allocated: 29_900 });
    await resolve("applied");
    await begin({ operation: OP2, key: "k2", kind: "refund", case: "CASE-B" });
    // 20_000 is already locally reserved with no refund id yet, so only 9_900
    // remains: a second 15_000 must be refused, not clipped.
    await expect(
      reserve({ id: "CASE-B", operation: OP2, amount: 15_000, allocated: 29_900 }),
    ).rejects.toThrow(/stripe_commercial_refund_over_reserved/);
  });

  it("counts the provider's pending, requires_action, succeeded and unknown totals", async () => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    // The provider already shows 25_000 committed on this payment.
    await expect(
      reserve({ amount: 10_000, allocated: 29_900, providerReserved: 25_000 }),
    ).rejects.toThrow(/stripe_commercial_refund_over_reserved/);
    expect(
      Number(await scalar("SELECT count(*) AS n FROM public.stripe_refund_reservations")),
    ).toBe(0);
  });

  it("refuses a reservation whose amount, currency, invoice, owner or scope disagrees with the case", async () => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    for (const over of [
      { amount: 9_000 },
      { currency: "pln" },
      { invoice: "in_other" },
      { owner: second },
      { account: OTHER_ACCOUNT },
      { mode: "test" },
    ])
      await expect(
        reserve({ amount: 10_000, allocated: 29_900, ...over }),
        JSON.stringify(over),
      ).rejects.toThrow();
    await expect(reserve({ id: "CASE-MISSING" })).rejects.toThrow(
      /stripe_commercial_refund_case_unknown/,
    );
  });

  it("spends the 14-day guarantee once per customer and plan, in SQL", async () => {
    await recordCase({ id: "CASE-1", amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    await reserve({ id: "CASE-1", amount: 10_000, allocated: 29_900 });
    await settleRefund("succeeded");
    await resolve("applied");
    // A second first-payment case for the same plan is refused by the PRIMARY KEY.
    await recordCase({ id: "CASE-2", amount: 5_000, invoice: "in_2" });
    await begin({ operation: OP2, key: "k2", kind: "refund", case: "CASE-2" });
    await expect(
      reserve({ id: "CASE-2", operation: OP2, invoice: "in_2", amount: 5_000, allocated: 29_900 }),
    ).rejects.toThrow(/stripe_commercial_refund_policy_spent/);
    // A different plan has its own guarantee.
    await recordCase({ id: "CASE-3", amount: 5_000, invoice: "in_3", plan: "agency" });
    await expect(
      reserve({ id: "CASE-3", operation: OP2, invoice: "in_3", amount: 5_000, allocated: 29_900 }),
    ).resolves.toBeTruthy();
  });

  it("does not spend the guarantee for an exception basis", async () => {
    await recordCase({ id: "CASE-1", amount: 5_000, basis: "outage" });
    await begin({ kind: "refund", case: "CASE-1" });
    await reserve({ id: "CASE-1", amount: 5_000, allocated: 29_900 });
    expect(Number(await scalar("SELECT count(*) AS n FROM public.stripe_refund_policy_uses"))).toBe(
      0,
    );
  });

  it.each([
    ["pending", "reserved"],
    ["requires_action", "reserved"],
    ["succeeded", "settled"],
    ["failed", "released"],
    ["canceled", "released"],
    ["cancelled", "released"],
    ["", "reserved"],
    ["weird_new_status", "reserved"],
  ])("maps a %s outcome to the %s reservation state", async (status, expected) => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    await reserve({ amount: 10_000, allocated: 29_900 });
    expect(await settleRefund(status)).toBe(expected);
    expect(await reservationState()).toBe(expected);
    const ledger = Number(
      await scalar(
        "SELECT reserved_total FROM public.stripe_refund_invoice_ledger WHERE invoice_id='in_1'",
      ),
    );
    expect(ledger).toBe(expected === "released" ? 0 : 10_000);
  });

  it("frees the funds for a NEW case only after an authoritative failure", async () => {
    await recordCase({ id: "CASE-A", amount: 20_000 });
    // CASE-B is an approved OUTAGE exception, so this test isolates the
    // remaining-funds bound from the once-per-plan guarantee.
    await recordCase({ id: "CASE-B", amount: 20_000, basis: "outage" });
    await begin({ kind: "refund", case: "CASE-A" });
    await reserve({ id: "CASE-A", amount: 20_000, allocated: 29_900 });
    // A pending outcome does NOT free them.
    await settleRefund("pending", { id: "CASE-A" });
    await resolve("applied");
    await begin({ operation: OP2, key: "k2", kind: "refund", case: "CASE-B" });
    await expect(
      reserve({ id: "CASE-B", operation: OP2, amount: 20_000, allocated: 29_900 }),
    ).rejects.toThrow(/over_reserved/);
    // An authoritative failure does.
    await settleRefund("failed", { id: "CASE-A" });
    await expect(
      reserve({ id: "CASE-B", operation: OP2, amount: 20_000, allocated: 29_900 }),
    ).resolves.toBeTruthy();
  });

  it("never re-reserves a released case and never repoints a recorded refund id", async () => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    await reserve({ amount: 10_000, allocated: 29_900 });
    await settleRefund("failed");
    await expect(reserve({ amount: 10_000, allocated: 29_900 })).rejects.toThrow(
      /stripe_commercial_refund_released/,
    );
    await resolve("refused", { refusal: "refund_failed" });
    await recordCase({ id: "CASE-2", amount: 10_000, invoice: "in_2", plan: "growth" });
    await begin({ operation: OP2, key: "k2", kind: "refund", case: "CASE-2" });
    await reserve({
      id: "CASE-2",
      operation: OP2,
      invoice: "in_2",
      amount: 10_000,
      allocated: 29_900,
    });
    await settleRefund("pending", { id: "CASE-2", operation: OP2, refund: "re_2" });
    await expect(
      settleRefund("succeeded", { id: "CASE-2", operation: OP2, refund: "re_other" }),
    ).rejects.toThrow(/stripe_commercial_evidence_conflict/);
  });

  it("refuses a settlement from another operation or an unreserved case", async () => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    await reserve({ amount: 10_000, allocated: 29_900 });
    await expect(settleRefund("succeeded", { operation: OP2 })).rejects.toThrow(
      /refund_case_mismatch/,
    );
    await expect(settleRefund("succeeded", { id: "CASE-NONE" })).rejects.toThrow(
      /stripe_commercial_refund_unreserved/,
    );
  });

  it("marks the case consumed or refused when the operation finishes", async () => {
    await recordCase({ amount: 10_000 });
    await begin({ kind: "refund", case: "CASE-1" });
    await reserve({ amount: 10_000, allocated: 29_900 });
    await settleRefund("succeeded");
    await resolve("applied");
    expect(
      await scalar("SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-1'"),
    ).toBe("consumed");
    await recordCase({ id: "CASE-2", amount: 10_000, invoice: "in_2", plan: "growth" });
    await begin({ operation: OP2, key: "k2", kind: "refund", case: "CASE-2" });
    expect(await finish("refused", { operation: OP2, refusal: "refund_failed" })).toBe(true);
    expect(
      await scalar("SELECT state FROM public.stripe_refund_cases WHERE case_id='CASE-2'"),
    ).toBe("refused");
  });
});

/* ======================= reads and the deletion barrier ================== */

describe("server-authoritative reads", () => {
  it("returns the persisted billing country and review flag without casting", async () => {
    await db.query(
      "INSERT INTO public.workspace_meta(user_id,billing_profile) VALUES($1,$2::jsonb)",
      [user, JSON.stringify({ billingCountry: "se", billingMarketNeedsReview: false })],
    );
    const read = await one<{ country: string; needs_review: boolean }>(
      "SELECT * FROM public.stripe_commercial_billing_country($1)",
      [user],
    );
    expect(read.country).toBe("SE");
    expect(read.needs_review).toBe(false);
    // A malformed or review-flagged profile must not raise inside the read.
    await db.query("UPDATE public.workspace_meta SET billing_profile=$2::jsonb WHERE user_id=$1", [
      user,
      JSON.stringify({
        billingCountry: 7,
        billingMarketNeedsReview: true,
        billingMarketLockedAt: "not-a-date",
      }),
    ]);
    const bad = await one<{ country: string; needs_review: boolean }>(
      "SELECT * FROM public.stripe_commercial_billing_country($1)",
      [user],
    );
    expect(bad.country).toBe("7");
    expect(bad.needs_review).toBe(true);
    // No profile row at all is simply no row.
    expect(
      (await db.query("SELECT * FROM public.stripe_commercial_billing_country($1)", [second])).rows
        .length,
    ).toBe(0);
  });

  it("reads the owner's own current subscription, scoped to account and mode", async () => {
    await map("cus_1");
    await receipt("evt_s");
    const fence = await lease("w");
    await projection({
      holder: "w",
      fence,
      event: "evt_s",
      customer: "cus_1",
      subscription: "sub_1",
      plan: "pro",
      seats: 2,
    });
    const read = await one<{ customer_id: string; plan_id: string; seat_quantity: number }>(
      "SELECT * FROM public.stripe_commercial_current_subscription($1,$2,'live')",
      [user, ACCOUNT],
    );
    expect(read.customer_id).toBe("cus_1");
    expect(read.plan_id).toBe("pro");
    expect(Number(read.seat_quantity)).toBe(2);
    for (const params of [
      [second, ACCOUNT, "live"],
      [user, OTHER_ACCOUNT, "live"],
      [user, ACCOUNT, "test"],
    ])
      expect(
        (
          await db.query(
            "SELECT * FROM public.stripe_commercial_current_subscription($1,$2,$3)",
            params,
          )
        ).rows.length,
        JSON.stringify(params),
      ).toBe(0);
  });

  /**
   * The real released shapes: `workspace_meta`'s EXISTENCE is the migration
   * marker, project rows are the owner's own 'projects' entities, and the people
   * count comes from the released `count_project_team_seats` over real
   * membership and invitation rows.
   */
  const seedWorkspace = async (opts: { migrated?: boolean; owner?: string } = {}) => {
    const owner = opts.owner ?? user;
    if (opts.migrated !== false)
      await db.query("INSERT INTO public.workspace_meta(user_id) VALUES($1)", [owner]);
    await db.query(
      `INSERT INTO public.workspace_entities(user_id,collection,entity_id,data) VALUES
         ($1,'projects','p','{"name":"First"}'::jsonb),
         ($1,'projects','q','{"name":"Second"}'::jsonb),
         ($1,'content','c1','{"title":"not a project"}'::jsonb)`,
      [owner],
    );
  };

  const usage = () =>
    one<{
      working: number;
      viewer: number;
      known: boolean;
      projects: number | null;
      projects_known: boolean;
    }>("SELECT * FROM public.stripe_commercial_membership_usage($1)", [user]);

  it("counts the owner's OWN project rows, excluding other collections and other owners", async () => {
    await seedWorkspace();
    // A foreign owner's projects and the owner's non-project entities must not
    // be counted toward this owner's project bundle.
    await seedWorkspace({ owner: second });
    const read = await usage();
    expect({ projects: Number(read.projects), projects_known: read.projects_known }).toEqual({
      projects: 2,
      projects_known: true,
    });
  });

  it("reports the project count UNKNOWN for an owner with no MIGRATED workspace", async () => {
    // Entities without the workspace_meta marker: the legacy blob is still
    // authoritative for this owner, so the count is unknown, never zero.
    await seedWorkspace({ migrated: false });
    const read = await usage();
    expect(read.projects_known).toBe(false);
    expect(read.projects).toBeNull();
  });

  it("counts account-wide DISTINCT people and pending invitations via the released counter", async () => {
    await seedWorkspace();
    // One person holding roles on TWO projects is ONE working seat, not two.
    await db.query(
      `INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES
         ($1,'p',$2,'editor'), ($1,'q',$2,'viewer')`,
      [user, second],
    );
    // A viewer-only person occupies a viewer seat.
    await db.query(
      "INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role) VALUES($1,'p',$2,'viewer')",
      [user, third],
    );
    // An outstanding working invitation is NOT free.
    await db.query(
      `INSERT INTO public.project_team_invitations(owner_id,project_id,invite_id,recipient_email,role,expires_at)
         VALUES($1,'p','00000000-0000-4000-8000-0000000000e1','pending@example.test','reviewer',now()+interval '7 days')`,
      [user],
    );
    const read = await usage();
    // owner + the multi-project person + the pending reviewer = 3 working;
    // the viewer-only person = 1 viewer.
    expect({
      working: Number(read.working),
      viewer: Number(read.viewer),
      known: read.known,
    }).toEqual({ working: 3, viewer: 1, known: true });

    // An EXPIRED invitation stops counting, through the released counter's own
    // clause rather than through anything this packet added.
    await db.query(
      "UPDATE public.project_team_invitations SET expires_at=now()-interval '1 day' WHERE owner_id=$1",
      [user],
    );
    expect(Number((await usage()).working)).toBe(2);
  });

  it("reports BOTH halves UNKNOWN when their released sources are absent", async () => {
    const fresh = await install({ seatCounter: false });
    try {
      const absent = (
        await fresh.query<{
          known: boolean;
          working: number | null;
          projects: number | null;
          projects_known: boolean;
        }>("SELECT * FROM public.stripe_commercial_membership_usage($1)", [user])
      ).rows[0];
      expect(absent.known).toBe(false);
      expect(absent.working).toBeNull();
      // No workspace_meta row for this owner either: unknown, not zero.
      expect(absent.projects_known).toBe(false);
      expect(absent.projects).toBeNull();
    } finally {
      await fresh.close();
    }
  }, 60000);

  it("blocks deletion while a subscription, an operation or reserved funds remain", async () => {
    const barrier = () =>
      one<{ blocked: boolean; reason: string }>(
        "SELECT * FROM public.stripe_commercial_deletion_barrier($1)",
        [user],
      );
    expect(await barrier()).toMatchObject({ blocked: false, reason: "clear" });

    await map("cus_1");
    await receipt("evt_s");
    const fence = await lease("w");
    await projection({
      holder: "w",
      fence,
      event: "evt_s",
      customer: "cus_1",
      subscription: "sub_1",
      plan: "pro",
    });
    expect(await barrier()).toMatchObject({ blocked: true, reason: "subscription_live" });

    await begin({ kind: "cancel" });
    // An unresolved operation outranks everything else.
    expect(await barrier()).toMatchObject({ blocked: true, reason: "operation_unresolved" });
    await resolve("applied");

    await db.query("UPDATE public.stripe_subscriptions SET status='canceled' WHERE user_id=$1", [
      user,
    ]);
    expect(await barrier()).toMatchObject({ blocked: false, reason: "clear" });

    await recordCase({ amount: 10_000 });
    await begin({ operation: OP2, key: "k2", kind: "refund", case: "CASE-1" });
    await reserve({ operation: OP2, amount: 10_000, allocated: 29_900 });
    await resolve("applied", { operation: OP2 });
    expect(await barrier()).toMatchObject({ blocked: true, reason: "refund_reserved" });
    await settleRefund("failed", { operation: OP2 });
    expect(await barrier()).toMatchObject({ blocked: false, reason: "clear" });
  });
});

/* ============================ policy helpers ============================= */

describe("immutable policy helpers mirror the application", () => {
  it("ranks plans and refuses an unknown one", async () => {
    for (const [plan, rank] of [
      ["freePreview", 0],
      ["starter", 1],
      ["growth", 2],
      ["pro", 3],
      ["agency", 4],
      ["enterprise", -1],
    ] as const)
      expect(
        Number(await scalar("SELECT public.stripe_commercial_plan_rank($1) AS n", [plan])),
        plan,
      ).toBe(rank);
  });

  it("treats exactly the five non-terminal states as open", async () => {
    for (const state of ["prepared", "dispatching", "awaiting_payment", "awaiting_apply", "fenced"])
      expect(
        await scalar("SELECT public.stripe_commercial_open_state($1) AS n", [state]),
        state,
      ).toBe(true);
    for (const state of ["applied", "refused", "failed"])
      expect(
        await scalar("SELECT public.stripe_commercial_open_state($1) AS n", [state]),
        state,
      ).toBe(false);
  });

  it("releases a reservation only for an authoritative failure", async () => {
    for (const status of ["failed", "canceled", "cancelled"])
      expect(
        await scalar("SELECT public.stripe_commercial_refund_releases($1) AS n", [status]),
        status,
      ).toBe(true);
    for (const status of ["pending", "requires_action", "succeeded", "", "unknown"])
      expect(
        await scalar("SELECT public.stripe_commercial_refund_releases($1) AS n", [status]),
        status,
      ).toBe(false);
  });
});
