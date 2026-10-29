-- Stripe COMMERCIAL operations — dormant backend support (28 October 2026).
--
-- Additive over the accepted dormant foundation (20261028183000), which is
-- READ-ONLY and is not modified, re-created or re-granted here. This migration
-- adds the durable state a plan/seat change, a cancellation/reversal and an
-- operator-approved support refund need, and the ONE gate that connects them to
-- the foundation's fenced projection.
--
-- Like the foundation this is INERT on its own: it creates no rows, fires no
-- trigger, changes no existing table, writes no entitlement and activates no
-- billing. Public live Checkout and every live financial mutation stay refused
-- in application code. Nothing here is production acceptance.
--
-- The invariants that are enforced HERE, in SQL, rather than by a boolean in
-- TypeScript:
--
--  1. ONE UNRESOLVED OPERATION per owner/account/mode. A partial unique index
--     makes "a new durable operation may not bypass an unresolved one" a
--     database fact, not a code convention.
--
--  2. MONOTONE OPERATION STATES. Every transition goes through
--     stripe_commercial_advance_operation / _finish_operation, which consult an
--     IMMUTABLE transition table. A terminal operation can never be reopened,
--     and 'applied' can only be reached from a state that actually awaited
--     authoritative evidence.
--
--  3. QUOTES ARE BOUND AND SINGLE-USE. A quote carries the owner, account,
--     mode, the exact subscription, a fingerprint of the exact current item
--     state it was computed from, a fingerprint of the selection, a stable
--     proration date, the provider-calculated amount/currency and an expiry.
--     stripe_commercial_consume_quote refuses a foreign, stale, altered,
--     expired or already-consumed quote and marks it consumed in the same
--     statement that hands out its terms.
--
--  4. REFUND RESERVATIONS ARE CONSERVATIVE AND CROSS-CASE SERIALIZED. Every
--     reserve locks a per-invoice ledger row, so two approved cases racing on
--     one invoice cannot both pass the remaining-funds bound. pending,
--     requires_action, succeeded and EVERY unknown/absent/timeout outcome keep
--     the reservation held; only an authoritative 'failed'/'canceled' releases
--     it.
--
--  5. A PENDING PAID CHANGE CANNOT BE GRANTED BY RECONCILIATION.
--     stripe_commercial_guarded_projection wraps the foundation's
--     stripe_apply_subscription_projection in the SAME transaction and under the
--     SAME lease, and refuses to let an increased plan or seat count be written
--     while the operation that would pay for it is unresolved. A historical paid
--     invoice, a successful HTTP status, a stale redelivery or an out-of-order
--     webhook therefore cannot widen an allowance. Decreases and revokes are
--     deliberately NOT held.
--
--     The comparison is against the IMMUTABLE allowance baseline captured on the
--     operation when it was created — never against the live
--     stripe_subscriptions row, which a NON-GRANTING projection (an observed
--     past_due/unpaid state for a bigger plan) legitimately rewrites. Comparing
--     with the live row let exactly that sequence raise the protective
--     threshold: non-grant pro/4 wrote pro/4, and the next granting pro/4 then
--     "equalled" the stored row and passed while the operation that would pay
--     for it was still `prepared`. The baseline is written once, read-only
--     afterwards, and an operation created without a verified baseline holds
--     every granting projection.
--
--     FROZEN IS NOT VERIFIED. Freezing alone only stops the threshold moving
--     AFTER the operation exists; a larger NON-GRANTING row written BEFORE it
--     would otherwise be frozen and labelled "verified". So the baseline is
--     accepted only when the stored row still PROVES a grant-eligible allowance
--     by the foundation's own predicate — see
--     stripe_commercial_verified_baseline.
--
--  6. BASELINE CAPTURE AND THE GATE ARE SERIALIZED. A read in
--     _begin_operation and the gate check in _guarded_projection are two
--     separate transactions that both decide against the same stripe_subscriptions
--     row, so without a shared lock the gate can observe "no pending operation"
--     while the operation is being created from a pre-write read. Both paths take
--     the same bounded, transaction-scoped advisory lock on the owner/account/mode
--     (stripe_commercial_owner_lock) before they read, so one of the two orders
--     always holds: either the operation exists when the gate looks, or the
--     baseline is captured from the row the projection already wrote. No row, no
--     table, no background job and no external service is involved, and the lock
--     is released by COMMIT/ROLLBACK.
--
--  7. A PLAN/SEAT CHANGE CARRIES ITS CANONICAL SELECTION FROM CREATION.
--     `selection_detail` is NOT NULL for 'plan_change'/'seat_change' (a table
--     CHECK, not a code convention), is written once, and a resumed attempt must
--     re-assert the identical value. A resumed selection is never retrofitted
--     from changed state: there is no path that stores a selection discovered
--     after the first attempt, because a post-dispatch view already reflects the
--     change it is supposed to prove. Other kinds carry no selection.
--
--  8. A STALE WORKER CANNOT SETTLE AN OPERATION ANOTHER INSTANCE MOVED.
--     _advance_operation and _finish_operation take an optional
--     p_expected_state and then act as a compare-and-set. A second instance that
--     still believes the operation is `prepared` therefore cannot close an
--     operation the first instance has already dispatched: its refusal is
--     rejected (false) instead of releasing a slot whose provider outcome is
--     unknown.
--
--  9. A REDUCTION CARRIES THE EXACT REQUEST IT DISPATCHED AND THE ORIGINAL
--     SETTINGS IT MUST PRESERVE. A reduction is expressed as a two-phase
--     subscription schedule whose FIRST phase restates what the customer has
--     already paid for. That original phase — its start, its items, its
--     quantities, and the default and per-phase settings the adoption created —
--     exists nowhere else durably: `params_fingerprint` hashes the operation's
--     terms and not the body, the quote's state fingerprint omits the current
--     period start and every material setting, and a later GET of the adopted
--     schedule is its configuration as it is NOW, not the first-adoption
--     snapshot. Two originals differing only in their default payment method,
--     their collection inheritance or their tax defaults would otherwise leave
--     identical persisted evidence.
--
--     So `reduction_dispatch_payload` records the COMPLETE canonical phase
--     request AND the explicit original settings expectation, once, in the SAME
--     statement that records the schedule id, under the existing
--     dispatching -> awaiting_apply compare-and-set, and BEFORE the first
--     `:phases` POST. Its only source is the VALIDATED ORIGINAL adoption
--     response (or that response's exact retained idempotent replay) plus the
--     durable quote and selection; nothing may be rebuilt from a current read.
--
--     It is append-once: the first write wins, an identical proposal does not
--     rewrite it, and an unequal payload or schedule is an evidence conflict. Its
--     version, bounded size and supported shape are checked here; every linkage
--     it claims — operation, owner scope, consumed quote, subscription, canonical
--     selection, target, currency, fixed effective boundary and schedule
--     identity — is re-proved against the durable row rather than trusted; and
--     every settings term is either a VARIABLE supported value recorded exactly
--     (and restated in the request where a phase update would otherwise drop it)
--     or a FIXED value of the one supported profile, verified explicitly in its
--     null/false/empty form. An absent term is never read as a neutral one: a
--     term outside the profile is refused here, which is the SQL half of holding
--     an arrangement this packet does not implement. A bound reduction cannot be
--     declared `awaiting_apply` without the pair, so missing durable evidence can
--     never be treated as ready. No arithmetic is performed on any financial
--     value: stored terms are compared, never recomputed.
--
-- After this migration the webhook path calls the guarded wrapper, so BOTH
-- migrations must be applied together. Applying 20261028183000 alone leaves the
-- webhook unable to project (the wrapper would not exist) — recorded as a
-- release gate in docs/billing/STRIPE_COMMERCIAL_OPERATIONS.md.

/* ---------------------------------------------------------------------------
   Durable state
   ------------------------------------------------------------------------ */

-- A short-lived, bound, single-use price quote. It exists so the customer
-- confirms EXACTLY what the provider calculated, from EXACTLY the subscription
-- state it was calculated against. Amounts are integer smallest units in the
-- subscription's own currency; nothing here converts, re-states or invents a
-- price.
CREATE TABLE public.stripe_commercial_quotes (
  quote_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL CHECK (account_id <> ''),
  mode text NOT NULL CHECK (mode IN ('live','test')),
  kind text NOT NULL CHECK (kind IN ('plan_change','seat_change')),
  subscription_id text NOT NULL CHECK (subscription_id <> ''),
  -- The exact observed item/status/period/pending-update/schedule state.
  state_fingerprint text NOT NULL CHECK (state_fingerprint <> ''),
  -- The exact selected item ids, prices and quantities.
  selection_fingerprint text NOT NULL CHECK (selection_fingerprint <> ''),
  target_plan_id text NOT NULL CHECK (target_plan_id IN ('starter','growth','pro','agency')),
  target_seat_quantity integer NOT NULL CHECK (target_seat_quantity BETWEEN 0 AND 1000),
  direction text NOT NULL CHECK (direction IN ('increase','decrease')),
  proration_date bigint NOT NULL CHECK (proration_date > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  amount_due bigint NOT NULL CHECK (amount_due >= 0),
  recurring_amount bigint NOT NULL CHECK (recurring_amount >= 0),
  effective_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid
  -- No `expires_at > created_at` constraint: the TTL bound in
  -- stripe_commercial_issue_quote is the control that matters, and a constraint
  -- here would forbid an operator expiring a quote EARLY, which must stay
  -- possible (an early expiry can only ever refuse a change, never allow one).
);
CREATE INDEX stripe_commercial_quotes_owner_idx
  ON public.stripe_commercial_quotes (user_id, account_id, mode, created_at);

-- One durable commercial operation. The id is the caller's stable operation id,
-- the idempotency key is the exact key sent to the provider, and
-- params_fingerprint pins the parameters, so a retry after a restart or a lost
-- acknowledgment resumes the SAME operation instead of starting a new one.
--
-- 'prepared'          durable, nothing dispatched yet
-- 'dispatching'       a duplicable provider mutation is about to be / was sent;
--                     the outcome is unknown until an authoritative read
-- 'awaiting_payment'  the provider accepted a payment-dependent update; the
--                     allowance has NOT changed and must not
-- 'awaiting_apply'    payment or the refund is authoritative-pending; the
--                     applied result is not yet proven
-- 'fenced'            unknown outcome past the provider's idempotency retention;
--                     NON-TERMINAL, the slot stays held, only an authoritative
--                     read may settle it
-- 'applied'/'refused'/'failed'  terminal
CREATE TABLE public.stripe_commercial_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL CHECK (account_id <> ''),
  mode text NOT NULL CHECK (mode IN ('live','test')),
  kind text NOT NULL CHECK (kind IN ('plan_change','seat_change','cancel','reverse_cancel','refund')),
  subscription_id text NOT NULL CHECK (subscription_id <> ''),
  quote_id uuid REFERENCES public.stripe_commercial_quotes(quote_id),
  case_id text,
  reverses_operation uuid REFERENCES public.stripe_commercial_operations(operation_id),
  params_fingerprint text NOT NULL CHECK (params_fingerprint <> ''),
  idempotency_key text NOT NULL CHECK (idempotency_key <> ''),
  state text NOT NULL DEFAULT 'prepared'
    CHECK (state IN ('prepared','dispatching','awaiting_payment','awaiting_apply','fenced','applied','refused','failed')),
  invoice_id text,
  refund_id text,
  schedule_id text,
  -- The latest invoice id observed BEFORE this operation dispatched anything,
  -- recorded on the first attempt and never overwritten. It is what makes
  -- "the exact update invoice" provable on a resumed attempt: without it, a
  -- retry after a lost acknowledgment reads a subscription that already carries
  -- the new invoice and has no way to tell it from a historical paid one.
  baseline_invoice_id text,
  -- The EXACT selection this operation was created for, in the canonical form
  -- the quote's selection fingerprint is computed from:
  --   plan#seats#baseItemId#basePriceId#seatItemId#seatPriceId
  -- Recorded once at CREATION, never overwritten, and used by recovery to prove
  -- that the items the subscription ACTUALLY carries are the ones that were
  -- quoted — equal plan and seat counts are not proof of the quoted item/price
  -- selection. Mandatory for the two kinds whose whole purpose is an exact item
  -- selection (see the CHECK below); NULL for cancel/reverse_cancel/refund, which
  -- select no item.
  selection_detail text CHECK (selection_detail IS NULL OR btrim(selection_detail) <> ''),
  -- The EXACT canonical phase request a REDUCTION was dispatched with, plus the
  -- EXPLICIT original settings it must preserve, recorded append-once in the same
  -- statement as `schedule_id` and BEFORE the first phase POST. See invariant 9
  -- and stripe_commercial_advance_operation for the full v1 contract and its
  -- validation; the shape is summarised here because the two CHECKs below are the
  -- part of it that holds even for a direct service_role write:
  --
  --   {"v":1,
  --    "operationId":"<this operation>","quoteId":"<the bound, CONSUMED quote>",
  --    "scheduleId":"sub_sched_…","subscriptionId":"sub_…",
  --    "selectionDetail":"<selection_detail, verbatim>",
  --    "targetPlanId":"growth","targetSeatQuantity":0,
  --    "effectiveBoundary":1764288000,
  --    "expectedSettings":{"profile":"automaticChargeNoTaxNoDiscount",
  --      "defaultSettings":{"collection_method":"charge_automatically",
  --        "billing_cycle_anchor":"automatic","automatic_tax":false,
  --        "invoice_settings":{"issuer":{"type":"self"}},
  --        "default_payment_method":"pm_card_1","default_source":null,
  --        …the remaining default_settings terms, explicitly null},
  --      "paidPhase":{"currency":"eur","collection_method":null,
  --        "billing_cycle_anchor":null,"invoice_settings":null,
  --        "default_payment_method":"pm_card_1","metadata":{},
  --        "add_invoice_items":[],"default_tax_rates":[],
  --        …the remaining phase terms, explicitly null},
  --      "paidItems":[{"price":"price_pro_base","quantity":1,"metadata":{},
  --        "tax_rates":[]}, …]},
  --    "request":{"end_behavior":"release","proration_behavior":"none",
  --      "phases":[{"start_date":1761696000,"end_date":1764288000,
  --                 "proration_behavior":"none",
  --                 "default_payment_method":"pm_card_1",
  --                 "items":[{"price":"price_pro_base","quantity":1},
  --                          {"price":"price_pro_seat","quantity":4}]},
  --                {"start_date":1764288000,"proration_behavior":"none",
  --                 "default_payment_method":"pm_card_1",
  --                 "items":[{"price":"price_growth_base","quantity":1}]}]}}
  --
  -- Phase 0 is the ORIGINAL paid current phase as the VALIDATED ADOPTION RESPONSE
  -- returned it (or as its exact retained idempotent replay returned it) — not a
  -- later authoritative GET, which can only show the configuration as it is now.
  -- Its start, item prices/quantities and settings are exactly the values nothing
  -- else retains. Phase 1 is the reduced phase, which IS re-derivable from the
  -- durable selection and quote and is therefore compared against them. The
  -- reduced phase carries NO end date: it is deliberately open-ended. Nothing
  -- here is a fingerprint and nothing is recomputed: `params_fingerprint` stays a
  -- fingerprint of the operation's terms.
  reduction_dispatch_payload jsonb,
  -- The IMMUTABLE previously VERIFIED allowance, captured from
  -- stripe_subscriptions when this operation was created, and only when that row
  -- still proved a grant-eligible, paid, current, identity-matching allowance.
  -- `baseline_known=false` means there was no PROVABLE allowance to compare
  -- against, which holds every granting projection rather than guessing one.
  -- These four columns are written by the INSERT in
  -- stripe_commercial_begin_operation and by nothing else, ever.
  baseline_known boolean NOT NULL DEFAULT false,
  baseline_plan_id text,
  baseline_seat_quantity integer,
  baseline_subscription_id text,
  refusal_code text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  resolved_at timestamptz,
  -- SELECTION COMPLETENESS, as a database fact. A plan or seat change that has
  -- no canonical selection cannot be created at all, so there is no "created
  -- without a selection, resumed with one" sequence to silently succeed, and no
  -- later attempt can supply a selection derived from the state its own dispatch
  -- already changed. A caller that does not yet hold a durable selection must be
  -- refused here rather than hold an operation it cannot prove.
  CONSTRAINT stripe_commercial_operations_selection_required
    CHECK (kind NOT IN ('plan_change','seat_change') OR selection_detail IS NOT NULL),
  -- A baseline is either fully present or fully absent. 'Partly known' is not a
  -- state the gate could evaluate conservatively.
  CONSTRAINT stripe_commercial_operations_baseline_complete
    CHECK ((NOT baseline_known
            AND baseline_plan_id IS NULL AND baseline_seat_quantity IS NULL
            AND baseline_subscription_id IS NULL)
        OR (baseline_known
            AND baseline_plan_id IS NOT NULL AND baseline_seat_quantity IS NOT NULL
            AND baseline_subscription_id IS NOT NULL)),
  -- A DISPATCH PAYLOAD IS ALWAYS BOUND, as a database fact. It may only exist on
  -- an item-selecting kind that carries a quote, a canonical selection and the
  -- schedule the payload was persisted WITH — so there is no "payload without a
  -- schedule" row for recovery to misread as a complete dispatch record, and no
  -- payload at all on a cancellation, a reversal or a refund.
  CONSTRAINT stripe_commercial_operations_reduction_payload_bound
    CHECK (reduction_dispatch_payload IS NULL
        OR (kind IN ('plan_change','seat_change') AND quote_id IS NOT NULL
            AND schedule_id IS NOT NULL AND selection_detail IS NOT NULL)),
  -- And it is always a recognised, bounded object carrying BOTH halves. The full
  -- v1 contract is validated by stripe_commercial_advance_operation, which is the
  -- only writer; these properties are repeated as a constraint because they are
  -- the ones that must hold even if a future writer, a migration or an operator
  -- touches the column directly. 4096 bytes is roughly twice the largest
  -- supported document (two phases, two paid items, the full settings
  -- expectation) and is measured on the canonical jsonb text.
  --
  -- Every operand here is strictly two-valued. `->'v' = '1'::jsonb` was NOT:
  -- for an object with no `v` at all it evaluates to UNKNOWN, and a CHECK accepts
  -- UNKNOWN, so an unversioned document could be written directly. IS NOT
  -- DISTINCT FROM is the correction, and the direct-write regression for it is in
  -- the executable tests.
  CONSTRAINT stripe_commercial_operations_reduction_payload_shape
    CHECK (reduction_dispatch_payload IS NULL
        OR (jsonb_typeof(reduction_dispatch_payload) = 'object'
            AND reduction_dispatch_payload->'v' IS NOT DISTINCT FROM '1'::jsonb
            AND reduction_dispatch_payload ? 'request'
            AND reduction_dispatch_payload ? 'expectedSettings'
            AND octet_length(reduction_dispatch_payload::text) <= 4096))
);
-- At most ONE unresolved operation per owner/account/mode, across every kind.
CREATE UNIQUE INDEX stripe_commercial_operations_open_idx
  ON public.stripe_commercial_operations (user_id, account_id, mode)
  WHERE state IN ('prepared','dispatching','awaiting_payment','awaiting_apply','fenced');
CREATE UNIQUE INDEX stripe_commercial_operations_key_idx
  ON public.stripe_commercial_operations (account_id, mode, idempotency_key);
-- One cancellation may be reversed at most once.
CREATE UNIQUE INDEX stripe_commercial_operations_reversal_idx
  ON public.stripe_commercial_operations (reverses_operation)
  WHERE reverses_operation IS NOT NULL AND state <> 'failed' AND state <> 'refused';

-- An OPERATOR-APPROVED support refund case. Every field here is trusted
-- server/operator input recorded durably BEFORE any refund may be attempted.
-- No end user can reach this table, and there is no "approved" boolean a caller
-- could send: the existence of this row, in state 'approved', IS the approval.
--
-- The subscription and access dispositions are SEPARATE and explicit. A refund
-- never implies a cancellation, and a successful refund never implies an active
-- invoice or paid access. The '…Held' dispositions are recorded faithfully but
-- are refused at execution time, because this packet does not implement them.
CREATE TABLE public.stripe_refund_cases (
  case_id text PRIMARY KEY CHECK (case_id <> '' AND length(case_id) <= 120),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL CHECK (account_id <> ''),
  mode text NOT NULL CHECK (mode IN ('live','test')),
  invoice_id text NOT NULL CHECK (invoice_id <> ''),
  subscription_id text,
  plan_id text NOT NULL CHECK (plan_id IN ('starter','growth','pro','agency')),
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  policy_basis text NOT NULL
    CHECK (policy_basis IN ('firstPayment14Day','legalRequired','outage','abuseException')),
  subscription_disposition text NOT NULL
    CHECK (subscription_disposition IN ('cancelAtPeriodEndSeparately','retainSubscription',
                                       'cancelImmediatelyHeld')),
  access_disposition text NOT NULL
    CHECK (access_disposition IN ('retainUntilPeriodEnd','unchanged','revokeOnRefundHeld')),
  approved_by text NOT NULL CHECK (approved_by <> '' AND length(approved_by) <= 200),
  requested_at timestamptz NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'approved' CHECK (state IN ('approved','consumed','refused')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_at >= requested_at)
);

-- The serialization point for refund reservations on one invoice. Concurrent
-- approved cases on the same invoice take this row FOR UPDATE, so the
-- remaining-funds bound is checked under a real lock rather than optimistically.
CREATE TABLE public.stripe_refund_invoice_ledger (
  account_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  invoice_id text NOT NULL,
  reserved_total bigint NOT NULL DEFAULT 0 CHECK (reserved_total >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, mode, invoice_id)
);

-- One reservation per approved case. 'reserved' is the only state money may be
-- dispatched from; 'settled' means an authoritative 'succeeded'; 'released'
-- means an authoritative 'failed'/'canceled'. Nothing else releases funds.
CREATE TABLE public.stripe_refund_reservations (
  case_id text PRIMARY KEY REFERENCES public.stripe_refund_cases(case_id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL REFERENCES public.stripe_commercial_operations(operation_id),
  account_id text NOT NULL CHECK (account_id <> ''),
  mode text NOT NULL CHECK (mode IN ('live','test')),
  invoice_id text NOT NULL CHECK (invoice_id <> ''),
  payment_id text NOT NULL CHECK (payment_id <> ''),
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','settled','released')),
  refund_id text,
  refund_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_refund_reservations_invoice_idx
  ON public.stripe_refund_reservations (account_id, mode, invoice_id, state);

-- Once-per-customer-per-plan policy usage. The 14-day first-payment guarantee
-- is a PRIMARY KEY here, so a second attempt is refused by the database.
CREATE TABLE public.stripe_refund_policy_uses (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_basis text NOT NULL,
  plan_id text NOT NULL,
  case_id text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, policy_basis, plan_id)
);

ALTER TABLE public.stripe_commercial_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_commercial_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_invoice_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refund_policy_uses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_commercial_quotes, public.stripe_commercial_operations,
  public.stripe_refund_cases, public.stripe_refund_invoice_ledger,
  public.stripe_refund_reservations, public.stripe_refund_policy_uses
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stripe_commercial_quotes, public.stripe_commercial_operations,
  public.stripe_refund_cases, public.stripe_refund_invoice_ledger,
  public.stripe_refund_reservations, public.stripe_refund_policy_uses
  TO service_role;

-- INHERITED DEFAULT-ACL ISOLATION, identical in shape to the accepted
-- foundation's block and for the same verified reason: production carries an
-- optional `sandbox_exec` role that is LOGIN and BYPASSRLS and NOT superuser,
-- and the public schema's DEFAULT PRIVILEGES grant it SELECT and INSERT on
-- every newly created table. RLS does not isolate a role that bypasses it, and
-- the revoke above names only PUBLIC/anon/authenticated, so without this block
-- all six stores here would be readable AND writable by that role from the
-- moment they were created.
--
-- This detects that OPTIONAL role and, only when it exists, revokes everything
-- on exactly these six tables from it, then VERIFIES the end state instead of
-- trusting the revoke — failing the whole install closed if any effective
-- classic right, any effective column right, or ANY direct ACL entry remains.
-- The ACL test is privilege-name-free (aclexplode + regrole), so a right not
-- enumerated here is still caught without naming a keyword an older server
-- would reject. It creates, alters or drops no role or membership, does not
-- touch DEFAULT PRIVILEGES, and changes no other object. Where the role is
-- absent it is a documented no-op.
DO $$
DECLARE leftover text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN RETURN; END IF;

  REVOKE ALL PRIVILEGES ON public.stripe_commercial_quotes,
    public.stripe_commercial_operations, public.stripe_refund_cases,
    public.stripe_refund_invoice_ledger, public.stripe_refund_reservations,
    public.stripe_refund_policy_uses FROM sandbox_exec;

  SELECT string_agg(t.name, ',' ORDER BY t.name) INTO leftover
    FROM (VALUES ('stripe_commercial_quotes'), ('stripe_commercial_operations'),
                 ('stripe_refund_cases'), ('stripe_refund_invoice_ledger'),
                 ('stripe_refund_reservations'), ('stripe_refund_policy_uses')) t(name)
    WHERE has_table_privilege('sandbox_exec', 'public.' || t.name,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege('sandbox_exec', 'public.' || t.name,
            'SELECT,INSERT,UPDATE,REFERENCES')
       OR EXISTS (SELECT 1 FROM pg_class c
            JOIN pg_namespace s ON s.oid = c.relnamespace,
            LATERAL aclexplode(c.relacl) a
            WHERE s.nspname = 'public' AND c.relname = t.name
              AND c.relacl IS NOT NULL AND a.grantee = 'sandbox_exec'::regrole);
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'stripe_commercial_table_privacy_incomplete: %', leftover;
  END IF;
END $$;

/* ---------------------------------------------------------------------------
   Immutable policy helpers
   ------------------------------------------------------------------------ */

-- Plan order, used ONLY to decide whether a projection would WIDEN an
-- allowance. freePreview is rank 0 and is never sold.
CREATE FUNCTION public.stripe_commercial_plan_rank(p_plan text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_plan WHEN 'starter' THEN 1 WHEN 'growth' THEN 2 WHEN 'pro' THEN 3
                     WHEN 'agency' THEN 4 WHEN 'freePreview' THEN 0 ELSE -1 END
$$;

-- The non-terminal operation states. A row in one of these holds the single
-- open slot and holds the projection gate.
CREATE FUNCTION public.stripe_commercial_open_state(p_state text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_state IN ('prepared','dispatching','awaiting_payment','awaiting_apply','fenced')
$$;

-- The MONOTONE state machine, written out rather than inferred. Every edge is
-- deliberate: nothing returns to 'prepared', nothing leaves a terminal state,
-- and 'applied' is reachable only from a state that actually awaited
-- authoritative evidence (or directly from 'dispatching', for an operation whose
-- single mutation was confirmed by an authoritative read in the same attempt).
CREATE FUNCTION public.stripe_commercial_transition(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_from, p_to) IN (
    ('prepared','dispatching'), ('prepared','fenced'), ('prepared','refused'), ('prepared','failed'),
    ('dispatching','awaiting_payment'), ('dispatching','awaiting_apply'), ('dispatching','fenced'),
    ('dispatching','applied'), ('dispatching','refused'), ('dispatching','failed'),
    ('awaiting_payment','awaiting_apply'), ('awaiting_payment','fenced'),
    ('awaiting_payment','applied'), ('awaiting_payment','refused'), ('awaiting_payment','failed'),
    ('awaiting_apply','fenced'), ('awaiting_apply','applied'),
    ('awaiting_apply','refused'), ('awaiting_apply','failed'),
    ('fenced','dispatching'), ('fenced','awaiting_payment'), ('fenced','awaiting_apply'),
    ('fenced','applied'), ('fenced','refused'), ('fenced','failed')
  )
$$;

-- Maximum attempts for one operation before it stops being retried
-- automatically and waits for an operator. It is NOT discarded and NOT failed:
-- an exhausted operation keeps its slot, so no new operation can bypass it.
CREATE FUNCTION public.stripe_commercial_attempt_limit() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 25 $$;

-- THE SHARED SERIALIZATION POINT for "capture a baseline / open an operation"
-- and "evaluate the projection gate / write a projection". Both decide against
-- the same stripe_subscriptions row in different transactions, and a lock in
-- only one of them leaves the window open, so they take the SAME transaction
-- scoped advisory lock on the exact owner/account/mode.
--
-- Advisory rather than a row lock on purpose: there is no row that both paths
-- already own (the foundation's lease is per account and is held only by the
-- webhook worker, and the foundation is immutable), and inventing a lock table
-- would add a store whose only content is a lock. The lock is bounded — one key
-- per owner/account/mode, taken AFTER argument validation, released by
-- COMMIT/ROLLBACK, never held across a provider call — and it introduces no
-- background job, scheduler or external service.
--
-- It is NOT a fairness or ordering guarantee: it only makes the two orders the
-- ONLY two possible outcomes. Either the operation is visible to the gate, or
-- the baseline is captured from the row the projection already committed.
CREATE FUNCTION public.stripe_commercial_owner_lock(
  p_user uuid, p_account text, p_mode text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'stripe_commercial_owner:' || p_user::text || ':' || p_account || ':' || p_mode,
    0::bigint));
END; $$;

-- A refund outcome that RELEASES its reservation. Deliberately only the two
-- authoritative negative terminals: 'pending', 'requires_action', 'succeeded'
-- and every unknown/absent/timeout outcome keep the funds reserved.
CREATE FUNCTION public.stripe_commercial_refund_releases(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_status IN ('failed','canceled','cancelled')
$$;

/* ---------------------------------------------------------------------------
   Server-authoritative reads (no client value is ever authority)
   ------------------------------------------------------------------------ */

-- The caller's persisted billing country, read on the SERVER from
-- workspace_meta. That JSON is user-editable, so this function returns the raw
-- stored country plus the review flag and lets the application compare it with
-- the locked paid subscription's currency; it never derives a market from a UI
-- locale and never trusts a client-supplied market.
CREATE FUNCTION public.stripe_commercial_billing_country(p_user uuid)
RETURNS TABLE(country text, needs_review boolean, stored_market text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  -- Every value is returned as TEXT exactly as stored (upper-cased country).
  -- Nothing is cast here: the JSON is user-editable, so a malformed value must
  -- be refused by the application's validator, not raise inside this read.
  RETURN QUERY
    SELECT upper(btrim(coalesce(m.billing_profile->>'billingCountry',''))),
           coalesce(m.billing_profile->>'billingMarketNeedsReview','') = 'true',
           nullif(btrim(coalesce(m.billing_profile->>'billingMarket','')), '')
      FROM public.workspace_meta m
     WHERE m.user_id = p_user;
END; $$;

-- The owner's CURRENT mapped Stripe subscription, keyed by the owner (the
-- foundation's own read is keyed by customer id, which a caller-initiated
-- operation does not have yet). This is the only source of the "previously
-- verified allowance" a pending change may not exceed.
CREATE FUNCTION public.stripe_commercial_current_subscription(
  p_user uuid, p_account text, p_mode text)
RETURNS TABLE(customer_id text, subscription_id text, plan_id text, status text,
              seat_quantity integer, current_period_end timestamptz,
              cancel_at_period_end boolean, latest_invoice_paid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  IF p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  RETURN QUERY
    SELECT c.customer_id, s.subscription_id, s.plan_id, s.status, s.seat_quantity,
           s.current_period_end, s.cancel_at_period_end, s.latest_invoice_paid
      FROM public.stripe_customers c
      LEFT JOIN public.stripe_subscriptions s
        ON s.user_id=c.user_id AND s.account_id=c.account_id AND s.mode=c.mode
     WHERE c.user_id=p_user AND c.account_id=p_account AND c.mode=p_mode;
END; $$;

-- THE PROOF behind `baseline_known`. It answers one question only: does the
-- stored projection STILL prove a verified, grant-eligible allowance for THIS
-- exact subscription, right now?
--
-- Why presence is not proof. stripe_subscriptions has no `grants` column: it
-- records the latest OBSERVED state, granting or not. A legitimate non-granting
-- projection — an observed past_due/unpaid/canceled state for an already larger
-- plan — therefore writes a row with a bigger plan and seat count than the
-- owner was ever entitled to. Freezing that row at operation-creation time would
-- publish exactly the threshold an attacker (or a stale redelivery) wants, under
-- the name "previously verified allowance". The reproduced sequence was
-- growth/0 granted → pro/4 past_due+unpaid observed → begin plan_change →
-- granting pro/4 passes the gate while the operation that pays for it is still
-- `prepared`.
--
-- So the predicate here is the foundation's OWN grant predicate from
-- stripe_apply_subscription_projection, re-evaluated against the stored row and
-- the database wall clock, plus the identity the operation is about:
--
--   * the row exists for this owner/account/mode;
--   * its subscription is exactly the one the operation names;
--   * the plan is sellable (public.stripe_sellable_plan, unchanged);
--   * the status is grant-ELIGIBLE ('active'/'trialing') — every revocable or
--     unrecognised status is explicitly NOT proof;
--   * the latest invoice is PAID;
--   * the period is present, finite, still in the future and inside the same
--     5-year sanity bound the foundation applies;
--   * the seat count is present.
--
-- And in LIVE mode only, the entitlement that allowance was actually written to
-- must still agree with it — same provider, active, same plan, same subscription,
-- a present/finite/future period. This is the `stripe_purchased_working_seats`
-- consistency, and it is what stops a WITHHELD grant from being read back as
-- one: a manualBeta/manualComped or granting legacy entitlement makes the
-- foundation return 'grant_withheld_manual' and write no Stripe allowance at
-- all, so the projection row alone would otherwise claim an allowance the owner
-- never received.
--
-- TEST MODE ISOLATION. In test mode the proof deliberately stops at the test
-- projection row and reads NO entitlement, because the foundation writes none:
-- a test-mode operation can only ever gate the test-mode projection, and
-- reading the live entitlement to justify a test baseline would be exactly the
-- cross-mode leak the foundation's mode isolation exists to prevent.
--
-- `reason` is diagnostic only; `known=false` is the whole decision, and it means
-- HOLD, never "assume the smaller plan". Nothing here is reconstructed: when the
-- stored row cannot prove an allowance, no plan, seat count or subscription is
-- returned at all, because the historical seat count may already have been
-- overwritten by the non-granting observation.
CREATE FUNCTION public.stripe_commercial_verified_baseline(
  p_user uuid, p_account text, p_mode text, p_subscription text)
RETURNS TABLE(known boolean, plan_id text, seat_quantity integer,
              subscription_id text, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v public.stripe_subscriptions; v_now timestamptz; v_ok boolean;
BEGIN
  IF p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR coalesce(p_subscription,'')='' THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;

  SELECT * INTO v FROM public.stripe_subscriptions s
    WHERE s.user_id=p_user AND s.account_id=p_account AND s.mode=p_mode;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'no_projection'::text;
    RETURN;
  END IF;

  v_now := clock_timestamp();
  IF coalesce(v.subscription_id,'')='' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'no_subscription'::text;
  ELSIF v.subscription_id <> p_subscription THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'subscription_mismatch'::text;
  ELSIF NOT public.stripe_sellable_plan(v.plan_id) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'plan_not_sellable'::text;
  ELSIF v.status NOT IN ('active','trialing') THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'status_not_grant_eligible'::text;
  ELSIF NOT coalesce(v.latest_invoice_paid,false) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'invoice_unpaid'::text;
  ELSIF v.current_period_end IS NULL OR NOT isfinite(v.current_period_end)
    OR v.current_period_end <= v_now
    OR v.current_period_end >= v_now + interval '5 years' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'period_not_current'::text;
  ELSIF v.seat_quantity IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text, 'seats_unknown'::text;
  ELSE
    IF p_mode='live' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.entitlements e
         WHERE e.user_id=p_user AND e.provider='stripe' AND e.status='active'
           AND e.plan_id=v.plan_id AND e.provider_subscription_id=v.subscription_id
           AND e.current_period_end IS NOT NULL AND isfinite(e.current_period_end)
           AND e.current_period_end > v_now) INTO v_ok;
      IF NOT coalesce(v_ok,false) THEN
        RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::text,
          'entitlement_inconsistent'::text;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT true, v.plan_id, v.seat_quantity, v.subscription_id, 'verified'::text;
  END IF;
END; $$;

-- Current seat AND project usage for a capacity check.
--
-- The seat half is the RELEASED public.count_project_team_seats, reused
-- unchanged: it already counts the owner plus every DISTINCT person holding a
-- working role anywhere in the account, plus every pending working invitation,
-- so a person on several projects is one seat and an outstanding invitation is
-- not free. It is reached through to_regprocedure, so an environment where that
-- chain is absent reports `known=false` and the application HOLDS the reduction
-- rather than guessing that nobody would be removed.
--
-- The project half is the plan's PROJECT BUNDLE usage, which the seat counter
-- does not express at all: a reduction can fit the team and still exceed the
-- target plan's project allowance. Projects are the owner's own
-- `workspace_entities` rows in the 'projects' collection, and they are
-- authoritative only for an owner whose workspace has been MIGRATED to the
-- per-entity store — the migration records "nothing reads the blob once
-- workspace_meta exists", so an owner with no workspace_meta row still keeps
-- projects in the legacy blob and is reported `projects_known=false`.
--
-- Nothing here removes a member, deletes a project, schedules a removal or bills
-- an invitation. Both halves report UNKNOWN rather than a convenient zero.
CREATE FUNCTION public.stripe_commercial_membership_usage(p_owner uuid)
RETURNS TABLE(working integer, viewer integer, known boolean,
              projects integer, projects_known boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_working integer; v_viewer integer; v_known boolean := false;
  v_projects integer; v_projects_known boolean := false; v_migrated boolean;
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  IF to_regprocedure('public.count_project_team_seats(uuid,text)') IS NOT NULL THEN
    BEGIN
      SELECT t.working, t.viewer INTO v_working, v_viewer
        FROM public.count_project_team_seats(p_owner) t;
      v_known := v_working IS NOT NULL AND v_viewer IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      v_working := NULL; v_viewer := NULL; v_known := false;
    END;
  END IF;
  IF NOT v_known THEN v_working := NULL; v_viewer := NULL; END IF;

  IF to_regclass('public.workspace_entities') IS NOT NULL
    AND to_regclass('public.workspace_meta') IS NOT NULL THEN
    BEGIN
      SELECT EXISTS (SELECT 1 FROM public.workspace_meta m WHERE m.user_id=p_owner)
        INTO v_migrated;
      IF v_migrated THEN
        SELECT count(*)::integer INTO v_projects FROM public.workspace_entities e
          WHERE e.user_id=p_owner AND e.collection='projects';
        v_projects_known := v_projects IS NOT NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_projects := NULL; v_projects_known := false;
    END;
  END IF;
  IF NOT v_projects_known THEN v_projects := NULL; END IF;

  RETURN QUERY SELECT v_working, v_viewer, v_known, v_projects, v_projects_known;
END; $$;

/* ---------------------------------------------------------------------------
   Quotes
   ------------------------------------------------------------------------ */

-- Persist a bound, short-lived quote. Refused while an unresolved operation
-- holds this owner's slot, so a quote can never be issued for a state another
-- in-flight operation is about to change.
CREATE FUNCTION public.stripe_commercial_issue_quote(
  p_quote uuid, p_user uuid, p_account text, p_mode text, p_kind text,
  p_subscription text, p_state_fingerprint text, p_selection_fingerprint text,
  p_target_plan text, p_target_seats integer, p_direction text,
  p_proration_date bigint, p_currency text, p_amount_due bigint,
  p_recurring_amount bigint, p_effective_at timestamptz, p_ttl_seconds integer)
RETURNS TABLE(quote_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_expires timestamptz;
BEGIN
  IF p_quote IS NULL OR p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR p_kind NOT IN ('plan_change','seat_change') OR coalesce(p_subscription,'')=''
    OR coalesce(p_state_fingerprint,'')='' OR coalesce(p_selection_fingerprint,'')=''
    OR p_direction NOT IN ('increase','decrease') OR p_proration_date IS NULL
    OR coalesce(p_ttl_seconds,0) NOT BETWEEN 60 AND 3600
    THEN RAISE EXCEPTION 'stripe_commercial_quote_unavailable'; END IF;

  IF EXISTS (SELECT 1 FROM public.stripe_commercial_operations o
              WHERE o.user_id=p_user AND o.account_id=p_account AND o.mode=p_mode
                AND public.stripe_commercial_open_state(o.state))
    THEN RAISE EXCEPTION 'stripe_commercial_operation_open'; END IF;

  v_expires := clock_timestamp() + p_ttl_seconds * interval '1 second';
  INSERT INTO public.stripe_commercial_quotes(
    quote_id,user_id,account_id,mode,kind,subscription_id,state_fingerprint,
    selection_fingerprint,target_plan_id,target_seat_quantity,direction,
    proration_date,currency,amount_due,recurring_amount,effective_at,created_at,expires_at)
  VALUES(p_quote,p_user,p_account,p_mode,p_kind,p_subscription,p_state_fingerprint,
    p_selection_fingerprint,p_target_plan,p_target_seats,p_direction,
    p_proration_date,lower(p_currency),p_amount_due,p_recurring_amount,p_effective_at,
    clock_timestamp(),v_expires);
  RETURN QUERY SELECT p_quote, v_expires;
END; $$;

-- Consume a quote: single-use, owner/account/mode/subscription scoped, bound to
-- the exact observed state and selection, and to the exact amount and currency
-- the customer confirmed. Every refusal has its own code, because "stale" and
-- "tampered" are different problems.
CREATE FUNCTION public.stripe_commercial_consume_quote(
  p_quote uuid, p_user uuid, p_account text, p_mode text, p_subscription text,
  p_state_fingerprint text, p_selection_fingerprint text,
  p_currency text, p_amount_due bigint, p_operation uuid)
RETURNS TABLE(kind text, target_plan_id text, target_seat_quantity integer,
              direction text, proration_date bigint, currency text,
              amount_due bigint, recurring_amount bigint, effective_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.stripe_commercial_quotes;
BEGIN
  IF p_quote IS NULL OR p_user IS NULL OR p_operation IS NULL
    THEN RAISE EXCEPTION 'stripe_commercial_quote_unavailable'; END IF;
  SELECT * INTO v FROM public.stripe_commercial_quotes WHERE quote_id=p_quote FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stripe_commercial_quote_unknown'; END IF;
  -- Foreign scope is never a "stale quote": it is someone else's quote.
  IF v.user_id<>p_user OR v.account_id<>coalesce(p_account,'') OR v.mode<>coalesce(p_mode,'')
    OR v.subscription_id<>coalesce(p_subscription,'')
    THEN RAISE EXCEPTION 'stripe_commercial_quote_foreign'; END IF;
  IF v.consumed_at IS NOT NULL THEN
    -- An identical replay of the SAME operation is idempotent; anything else is
    -- a second use of a single-use quote.
    IF v.consumed_by = p_operation THEN
      RETURN QUERY SELECT v.kind, v.target_plan_id, v.target_seat_quantity, v.direction,
        v.proration_date, v.currency, v.amount_due, v.recurring_amount, v.effective_at;
      RETURN;
    END IF;
    RAISE EXCEPTION 'stripe_commercial_quote_consumed';
  END IF;
  IF v.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'stripe_commercial_quote_expired'; END IF;
  IF v.state_fingerprint<>coalesce(p_state_fingerprint,'')
    THEN RAISE EXCEPTION 'stripe_commercial_quote_state_changed'; END IF;
  IF v.selection_fingerprint<>coalesce(p_selection_fingerprint,'')
    OR v.currency<>lower(coalesce(p_currency,'')) OR v.amount_due IS DISTINCT FROM p_amount_due
    THEN RAISE EXCEPTION 'stripe_commercial_quote_tampered'; END IF;

  UPDATE public.stripe_commercial_quotes
     SET consumed_at=clock_timestamp(), consumed_by=p_operation
   WHERE quote_id=p_quote;
  RETURN QUERY SELECT v.kind, v.target_plan_id, v.target_seat_quantity, v.direction,
    v.proration_date, v.currency, v.amount_due, v.recurring_amount, v.effective_at;
END; $$;

-- Read a quote WITHOUT consuming it. Needed by recovery: a resumed operation
-- must learn the terms it is bound to without re-asserting a state fingerprint
-- that its own dispatch may already have changed. Scoped to the
-- owner/account/mode, so no row is returned for anyone else's quote.
CREATE FUNCTION public.stripe_commercial_read_quote(
  p_quote uuid, p_user uuid, p_account text, p_mode text)
RETURNS TABLE(kind text, subscription_id text, state_fingerprint text,
              selection_fingerprint text, target_plan_id text, target_seat_quantity integer,
              direction text, proration_date bigint, currency text, amount_due bigint,
              recurring_amount bigint, effective_at timestamptz, expires_at timestamptz,
              consumed_by uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  RETURN QUERY
    SELECT q.kind, q.subscription_id, q.state_fingerprint, q.selection_fingerprint,
           q.target_plan_id, q.target_seat_quantity, q.direction, q.proration_date,
           q.currency, q.amount_due, q.recurring_amount, q.effective_at, q.expires_at,
           q.consumed_by
      FROM public.stripe_commercial_quotes q
     WHERE q.quote_id=p_quote AND q.user_id=p_user
       AND q.account_id=p_account AND q.mode=p_mode;
END; $$;

/* ---------------------------------------------------------------------------
   Operations
   ------------------------------------------------------------------------ */

-- Claim or idempotently RESUME one durable operation, and count the claim as the
-- attempt it is about to become. An existing operation id resumes only for the
-- same owner, account, mode, kind, subscription and parameter fingerprint;
-- anything else is a mismatch, never a silent takeover. A DIFFERENT operation id
-- while this owner still has an unresolved operation is refused by the partial
-- unique index, so a new operation can never bypass an unresolved one.
CREATE FUNCTION public.stripe_commercial_begin_operation(
  p_operation uuid, p_user uuid, p_account text, p_mode text, p_kind text,
  p_subscription text, p_fingerprint text, p_idempotency_key text,
  p_quote uuid DEFAULT NULL, p_case text DEFAULT NULL, p_reverses uuid DEFAULT NULL,
  p_baseline_invoice text DEFAULT NULL, p_selection text DEFAULT NULL)
RETURNS TABLE(state text, attempts integer, created_at timestamptz,
              invoice_id text, refund_id text, schedule_id text,
              baseline_invoice_id text, selection_detail text,
              baseline_known boolean, baseline_plan_id text,
              baseline_seat_quantity integer, baseline_subscription_id text,
              resumed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.stripe_commercial_operations; v_reversed public.stripe_commercial_operations;
  v_selection text; v_base record;
BEGIN
  IF p_operation IS NULL OR p_user IS NULL OR coalesce(p_account,'')=''
    OR p_mode NOT IN ('live','test')
    OR p_kind NOT IN ('plan_change','seat_change','cancel','reverse_cancel','refund')
    OR coalesce(p_subscription,'')='' OR coalesce(p_fingerprint,'')=''
    OR coalesce(p_idempotency_key,'')=''
    THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;

  v_selection := nullif(btrim(coalesce(p_selection,'')),'');
  -- SELECTION COMPLETENESS, refused up front for the two kinds that are defined
  -- by an exact item selection. The caller must already hold the canonical
  -- selection the quote's fingerprint was computed from; an operation that
  -- cannot state it is held here instead of being created and "resolved" later
  -- from a view its own dispatch has changed. This applies to a RESUMED attempt
  -- too: a recovery that cannot re-assert the selection has not proved it is
  -- resuming the same change.
  IF p_kind IN ('plan_change','seat_change') AND v_selection IS NULL
    THEN RAISE EXCEPTION 'stripe_commercial_selection_missing'; END IF;
  -- The other kinds select no item, so a selection on them is a caller error
  -- rather than extra evidence.
  IF p_kind NOT IN ('plan_change','seat_change') AND v_selection IS NOT NULL
    THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;

  -- Serialize with the projection gate BEFORE anything is read or written, so a
  -- baseline can never be captured from a row a concurrent projection is about
  -- to replace while that projection sees no pending operation. See
  -- stripe_commercial_owner_lock.
  PERFORM public.stripe_commercial_owner_lock(p_user, p_account, p_mode);

  SELECT * INTO v FROM public.stripe_commercial_operations
    WHERE operation_id=p_operation FOR UPDATE;
  IF FOUND THEN
    IF v.user_id<>p_user OR v.account_id<>p_account OR v.mode<>p_mode OR v.kind<>p_kind
      OR v.subscription_id<>p_subscription OR v.params_fingerprint<>p_fingerprint
      OR v.idempotency_key<>p_idempotency_key
      OR v.quote_id IS DISTINCT FROM p_quote OR v.case_id IS DISTINCT FROM p_case
      THEN RAISE EXCEPTION 'stripe_commercial_mismatch'; END IF;
    -- A resumed attempt must re-assert EXACTLY the selection this operation was
    -- created for. The recorded one stays authoritative and is never rewritten:
    -- an identical replay is identical in its selection and in its bound quote
    -- (compared above), and anything else is a mismatch, not a resume. Because
    -- the table CHECK makes selection_detail NOT NULL for plan/seat changes,
    -- there is no "created NULL, resumed non-NULL" sequence left to retrofit.
    IF v.selection_detail IS DISTINCT FROM v_selection
      THEN RAISE EXCEPTION 'stripe_commercial_mismatch'; END IF;
    IF NOT public.stripe_commercial_open_state(v.state) THEN
      RETURN QUERY SELECT v.state, v.attempts, v.created_at, v.invoice_id, v.refund_id,
        v.schedule_id, v.baseline_invoice_id, v.selection_detail, v.baseline_known,
        v.baseline_plan_id, v.baseline_seat_quantity, v.baseline_subscription_id, true;
      RETURN;
    END IF;
    IF v.attempts >= public.stripe_commercial_attempt_limit()
      THEN RAISE EXCEPTION 'stripe_commercial_attempts_exhausted'; END IF;
    -- The table is aliased because this function's RETURNS TABLE declares an
    -- output variable named `attempts`; an unqualified reference would be
    -- ambiguous and PostgreSQL refuses it outright.
    -- The baseline is NEVER overwritten: the first attempt observed the
    -- pre-dispatch state, and a later attempt's view is already contaminated.
    UPDATE public.stripe_commercial_operations AS o
       SET attempts=o.attempts+1, updated_at=now() WHERE o.operation_id=p_operation
      RETURNING o.* INTO v;
    RETURN QUERY SELECT v.state, v.attempts, v.created_at, v.invoice_id, v.refund_id,
      v.schedule_id, v.baseline_invoice_id, v.selection_detail, v.baseline_known,
      v.baseline_plan_id, v.baseline_seat_quantity, v.baseline_subscription_id, true;
    RETURN;
  END IF;

  -- A reversal must name an APPLIED cancellation this owner actually made on
  -- this exact subscription. Nothing here recreates a cancelled subscription.
  IF p_kind='reverse_cancel' THEN
    IF p_reverses IS NULL THEN RAISE EXCEPTION 'stripe_commercial_reversal_target_missing'; END IF;
    SELECT * INTO v_reversed FROM public.stripe_commercial_operations
      WHERE operation_id=p_reverses FOR UPDATE;
    IF NOT FOUND OR v_reversed.user_id<>p_user OR v_reversed.account_id<>p_account
      OR v_reversed.mode<>p_mode OR v_reversed.kind<>'cancel'
      OR v_reversed.subscription_id<>p_subscription OR v_reversed.state<>'applied'
      THEN RAISE EXCEPTION 'stripe_commercial_reversal_target_invalid'; END IF;
  ELSIF p_reverses IS NOT NULL THEN
    RAISE EXCEPTION 'stripe_commercial_unavailable';
  END IF;

  -- Capture the IMMUTABLE allowance baseline: the previously VERIFIED plan, seat
  -- count and subscription this owner provably holds right now, under the shared
  -- lock taken above. It is read once, here, and never updated — a later
  -- non-granting projection may rewrite the observed subscription row, but it may
  -- not move the threshold this operation is measured against.
  --
  -- Presence is explicitly NOT accepted as proof. The whole decision is
  -- stripe_commercial_verified_baseline, which re-evaluates the foundation's own
  -- grant predicate (grant-eligible status, paid invoice, present/finite/future
  -- period, sellable plan, this exact subscription, and in live mode a consistent
  -- Stripe entitlement). When it cannot prove an allowance, `baseline_known` is
  -- false and NOTHING is recorded — no plan, no seat count, no subscription — and
  -- the gate then HOLDS every granting projection for this operation. A
  -- conservative hold is deliberate: the historical allowance may already have
  -- been overwritten by a non-granting observation, and inventing the number it
  -- used to be would be inventing paid evidence.
  SELECT b.known, b.plan_id, b.seat_quantity, b.subscription_id INTO v_base
    FROM public.stripe_commercial_verified_baseline(p_user,p_account,p_mode,p_subscription) b;

  BEGIN
    INSERT INTO public.stripe_commercial_operations(
      operation_id,user_id,account_id,mode,kind,subscription_id,quote_id,case_id,
      reverses_operation,params_fingerprint,idempotency_key,state,attempts,
      baseline_invoice_id,selection_detail,
      baseline_known,baseline_plan_id,baseline_seat_quantity,baseline_subscription_id)
    VALUES(p_operation,p_user,p_account,p_mode,p_kind,p_subscription,p_quote,p_case,
      p_reverses,p_fingerprint,p_idempotency_key,'prepared',1,
      nullif(btrim(coalesce(p_baseline_invoice,'')),''),
      v_selection,
      coalesce(v_base.known,false),
      v_base.plan_id, v_base.seat_quantity, v_base.subscription_id);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'stripe_commercial_operation_open';
  END;
  RETURN QUERY SELECT 'prepared'::text, 1, now(), NULL::text, NULL::text, NULL::text,
    nullif(btrim(coalesce(p_baseline_invoice,'')),''),
    v_selection,
    coalesce(v_base.known,false),
    v_base.plan_id, v_base.seat_quantity, v_base.subscription_id,
    false;
END; $$;

-- A NON-TERMINAL, monotone advance. The evidence ids are append-only: an
-- invoice, refund or schedule id can be recorded once and never silently
-- repointed, so a later attempt cannot swap which invoice is being awaited.
--
-- `p_expected_state` makes this a COMPARE-AND-SET: the caller states the state it
-- last observed, and a worker whose view is stale is refused instead of moving an
-- operation another instance owns. NULL keeps the plain monotone behaviour for a
-- caller that has no durable view to assert.
--
-- `p_reduction_payload` is the trailing, optional REDUCTION DISPATCH PAYLOAD
-- (invariant 9): the complete canonical phase request, persisted ATOMICALLY with
-- the adopted `schedule_id` on the single dispatching -> awaiting_apply
-- compare-and-set, before the first `:phases` POST.
--
-- THE v1 CONTRACT, which the server builds ONLY from the validated ORIGINAL
-- `:adopt` reply (or that reply's exact retained idempotent replay) plus the
-- durable quote and selection — never from a current read of today's defaults:
--
--   {"v":1,                                -- the only recognised version
--    "operationId":  this operation id,
--    "quoteId":      the operation's bound quote, CONSUMED by this operation,
--    "scheduleId":   exactly the `p_schedule` persisted in this call,
--    "subscriptionId": the operation's subscription,
--    "selectionDetail": the operation's canonical selection, verbatim,
--    "targetPlanId": the quote's target plan,
--    "targetSeatQuantity": the quote's target seats (a JSON integer),
--    "effectiveBoundary": the quote's fixed boundary, in epoch seconds,
--    "expectedSettings": {"profile":"automaticChargeNoTaxNoDiscount",
--      "defaultSettings": {11 terms}, "paidPhase": {16 terms},
--      "paidItems":[ {price, quantity, metadata, tax_rates, discounts,
--                     billing_thresholds} ]},
--    "request": {"end_behavior":"release", "proration_behavior":"none",
--      "phases":[ {start_date, end_date, proration_behavior, items[1..2]
--                  [, default_payment_method]},
--                 {start_date,           proration_behavior, items[1..2]
--                  [, default_payment_method]} ]}}
--
-- The provider's own field names are used inside `request` and inside the
-- settings expectation, so the stored bytes name the fields they were read from
-- and will be sent as, and `request` is a deterministic URLSearchParams
-- serialisation away from the body (`phases[0][items][1][price]`, …). Both
-- `proration_behavior` levels are explicit, because only one of them being right
-- still charges or credits.
--
-- THE SUPPORTED PROFILE, `automaticChargeNoTaxNoDiscount`. A phase update
-- replaces the phases it is given, so a phase term that is not restated is unset
-- or falls back to the schedule's default settings. Rather than accept arbitrary
-- JSON, v1 supports ONE arrangement — the ORDINARY documented schedule response
-- for an automatically charged, untaxed, undiscounted subscription — and records
-- every term of it explicitly.
--
-- THE MINIMAL ORIGINAL-RESPONSE -> CANONICAL MAPPING. The key sets below ARE the
-- response's own key sets, so nothing is filled in mechanically and nothing
-- material is collapsed:
--
--   default_settings (all ten fields, kept 1:1)
--     application_fee_percent  -> null
--     automatic_tax            -> false, and ONLY after the server validates the
--                                 whole object: `{"enabled":false,
--                                 "liability":null}` maps to false; an enabled
--                                 tax, a non-null liability, or any further key
--                                 is NOT collapsed — it holds.
--     billing_cycle_anchor     -> "automatic", retained as the ordinary default.
--                                 Recording null instead would fabricate a
--                                 setting the response never carried.
--     collection_method        -> "charge_automatically"
--     default_payment_method   -> identity or explicit null (VARIABLE)
--     default_source           -> null
--     description              -> null
--     invoice_settings         -> `{"issuer":{"type":"self"}}` exactly, or an
--                                 explicit null for a response that genuinely
--                                 carried none. Any other content holds.
--     on_behalf_of             -> null
--     transfer_data            -> null
--
--   phases[0] (all seventeen fields: thirteen kept 1:1 here, four mapped into
--   `request`)
--     add_invoice_items        -> []
--     application_fee_percent  -> null
--     billing_cycle_anchor     -> null  (the PHASE value; distinct from the
--                                 defaults' "automatic")
--     collection_method        -> explicit null = INHERITS the defaults'
--                                 verified `charge_automatically`, and then no
--                                 canonical phase may name a method; or exactly
--                                 "charge_automatically" as a phase override,
--                                 and then BOTH canonical phases must restate
--                                 it. Nothing else is supported.
--     currency                 -> the quote's currency
--     default_payment_method   -> identity or explicit null (VARIABLE); an
--                                 identity must be restated in BOTH phases
--     default_tax_rates        -> []  (the response's own field name is used, so
--                                 there is no alias to misread; an item's
--                                 `tax_rates` is a different field that
--                                 OVERRIDES this one)
--     description              -> null
--     invoice_settings         -> null
--     metadata                 -> {}
--     on_behalf_of             -> null
--     transfer_data            -> null
--     trial_end                -> null
--     start_date, end_date, items -> `request.phases[0]`
--     proration_behavior       -> deliberately NOT part of the expectation. The
--                                 canonical request sets `none` at both levels on
--                                 purpose — the whole point of the change is that
--                                 nothing is prorated — so the original phase's
--                                 `create_prorations` is scoped intent overridden
--                                 explicitly, not a setting lost by omission.
--
--   phases[0].items[*] -> `paidItems[*]`
--     price, quantity, metadata -> {}, tax_rates -> []
--     plan                     -> NOT stored: it is the response's legacy mirror
--                                 of `price` and carries no independent fact.
--
-- A null/false/empty term must be PRESENT and explicit. An absent key is a
-- malformed payload, never a neutral value, so "the adoption returned nothing we
-- understood" can never be silently recorded as "there was nothing there". A
-- recorded term outside the profile — an enabled automatic tax, a legacy source,
-- a trial, an invoice-settings override, a `send_invoice` phase, a
-- `phase_start` anchor — is refused with
-- `stripe_commercial_payload_profile_unsupported`. A field the ordinary response
-- does not carry at all — a phase or item `discounts`, any `billing_thresholds`,
-- a phase-level `automatic_tax`, a `pause_collection` — has NO v1 representation,
-- so it is refused as an unexpected key ('payload_invalid'): the server must hold
-- such a response rather than invent a representation for it. Both are the SQL
-- half of the hold; the server's reader owns the other half, because SQL cannot
-- see the adoption response and therefore cannot know which fields it carried.
-- Nothing here implements tax, discounts, trials, thresholds or alternative
-- payment arrangements.
--
-- FINAL-PHASE TIMING. The reduced phase carries NO `end_date`, so it is
-- open-ended and the schedule does not complete on its own. `end_behavior` is
-- `release`, which is documented to RELEASE the subscription when a schedule
-- completes — it keeps the subscription running and cancels nothing — so the
-- omission is not a cancellation guard; it is simply the one final-timing form
-- this packet has specified, and `end_date`/`duration` are documented as
-- optional and mutually exclusive. A finite final end date would hand the
-- subscription back at an extra boundary whose behaviour this packet has not
-- specified, so it is refused as an unsupported shape. This is a documented
-- schema choice; no provider runtime outcome is claimed from these local tests.
--
-- WHAT IS PROVED HERE, rather than trusted:
--
--  * SUPPORTED AT ALL — only an item-selecting kind whose bound quote is this
--    owner's, for this account, mode and subscription, with direction
--    'decrease'. Every other operation offering a payload is refused
--    ('payload_unsupported'), so an increase, a cancellation or a refund cannot
--    smuggle one in.
--  * ONE CAPTURE POINT — a first write is accepted only as
--    dispatching -> awaiting_apply with p_expected_state='dispatching' and a
--    non-empty schedule. There is no same-state edge and no later capture point,
--    so no body is ever first persisted AFTER a phase POST.
--  * A CONSUMED QUOTE — at the first capture the bound quote must already be
--    consumed BY THIS OPERATION (`consumed_at` present, `consumed_by` equal), so
--    a body can never be recorded against terms the customer never confirmed or
--    against a quote another operation spent. Expiry is deliberately NOT
--    re-checked here or on readback: a quote is single-use and already consumed,
--    and re-testing its TTL would make a lawful recovery of a dispatched
--    reduction impossible minutes later.
--  * SHAPE, VERSION AND SIZE — exact key sets at every level, JSON types
--    checked (not coerced), integers matched as integer text so `1.0` or `1e3`
--    is not quietly accepted, quantities 1..1000, 1..2 items per phase, and a
--    4096-byte bound on the canonical jsonb text ('payload_invalid').
--  * THE SUPPORTED PROFILE — every settings term present and explicit, fixed
--    terms exactly in their documented form (which is NOT "null everywhere":
--    the defaults keep `billing_cycle_anchor="automatic"` and the `self` issuer),
--    the variable payment method typed and bounded, the paid phase's collection
--    method either inherited or an exact override, and the paid items' own terms
--    neutral ('payload_profile_unsupported' for a term outside the profile,
--    'payload_invalid' for a field the profile cannot represent at all).
--  * LINKAGE — the operation, quote, subscription, selection, target plan and
--    seats, the quote currency, the fixed effective boundary at BOTH phase
--    boundaries, the chronological order of the original phase, the schedule
--    identity, the alignment of `paidItems` with the canonical paid phase, and
--    the restatement of a recorded phase-level payment method are each compared
--    with the durable row ('payload_mismatch'). Phase 1's items must equal
--    exactly what the canonical selection and the quote's target imply, in
--    order, so an arbitrary JSON blob with the right keys is not accepted as
--    evidence of this reduction.
--  * APPEND-ONCE — the first write wins. An identical proposal is accepted and
--    does NOT rewrite the stored bytes; an unequal payload, or one offered with
--    a different or absent schedule, is an evidence conflict exactly like a
--    repointed invoice. Recovery from a lost acknowledgment is therefore an
--    exact READBACK, never a second write.
--  * READINESS — a bound reduction may not reach `awaiting_apply` without BOTH
--    the schedule and the payload ('reduction_payload_missing'), so an attempt
--    with no durable evidence of what it sent cannot be treated as dispatched.
--
-- Phase 0's start, item prices/quantities and settings are the ONE part that
-- cannot be re-derived from anything durable — that is precisely why they are
-- stored — so for those, presence, types, bounds and profile membership are what
-- is enforced. No financial value is summed, converted or recomputed anywhere
-- below.
CREATE FUNCTION public.stripe_commercial_advance_operation(
  p_operation uuid, p_user uuid, p_account text, p_mode text, p_state text,
  p_invoice text DEFAULT NULL, p_refund text DEFAULT NULL, p_schedule text DEFAULT NULL,
  p_expected_state text DEFAULT NULL, p_reduction_payload jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v public.stripe_commercial_operations;
  v_quote public.stripe_commercial_quotes;
  v_reduction boolean := false;
  v_schedule text := nullif(btrim(coalesce(p_schedule,'')),'');
  v_request jsonb; v_phase jsonb; v_item jsonb; v_items jsonb; v_expected jsonb;
  v_seat_price text; v_index integer;
  v_settings jsonb; v_defaults jsonb; v_paid jsonb; v_paid_items jsonb;
  v_pm jsonb; v_pm_text text; v_cm jsonb; v_cm_text text; v_key text;
BEGIN
  IF p_state NOT IN ('dispatching','awaiting_payment','awaiting_apply','fenced')
    THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  SELECT * INTO v FROM public.stripe_commercial_operations
    WHERE operation_id=p_operation AND user_id=p_user AND account_id=p_account AND mode=p_mode
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- THE COMPARE-AND-SET COMES FIRST, and so does the transition table: a stale
  -- worker returns false, writes nothing and never even reaches the evidence
  -- checks below, so a losing racer cannot raise a conflict about data it was
  -- never allowed to record.
  IF p_expected_state IS NOT NULL AND v.state <> p_expected_state THEN RETURN false; END IF;
  IF NOT public.stripe_commercial_transition(v.state, p_state) THEN RETURN false; END IF;
  IF p_invoice IS NOT NULL AND v.invoice_id IS NOT NULL AND v.invoice_id<>p_invoice
    THEN RAISE EXCEPTION 'stripe_commercial_evidence_conflict'; END IF;
  IF p_refund IS NOT NULL AND v.refund_id IS NOT NULL AND v.refund_id<>p_refund
    THEN RAISE EXCEPTION 'stripe_commercial_evidence_conflict'; END IF;
  IF p_schedule IS NOT NULL AND v.schedule_id IS NOT NULL AND v.schedule_id<>p_schedule
    THEN RAISE EXCEPTION 'stripe_commercial_evidence_conflict'; END IF;

  -- Is this operation a BOUND REDUCTION? Only the durable row and its quote
  -- decide: the kind selects items, the quote exists, belongs to the same owner,
  -- account, mode, kind and subscription, and its direction is 'decrease'.
  IF v.kind IN ('plan_change','seat_change') AND v.quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.stripe_commercial_quotes q WHERE q.quote_id=v.quote_id;
    IF FOUND THEN
      v_reduction := v_quote.direction='decrease' AND v_quote.kind=v.kind
        AND v_quote.user_id=v.user_id AND v_quote.account_id=v.account_id
        AND v_quote.mode=v.mode AND v_quote.subscription_id=v.subscription_id;
    END IF;
  END IF;

  IF p_reduction_payload IS NOT NULL THEN
    -- A payload offered by anything other than a bound reduction is a caller
    -- error, never extra evidence.
    IF NOT v_reduction THEN RAISE EXCEPTION 'stripe_commercial_payload_unsupported'; END IF;

    IF v.reduction_dispatch_payload IS NOT NULL THEN
      -- FIRST WRITE WINS. The stored bytes stay as they are; the pair must be
      -- restated identically, or this is a conflict rather than an amendment.
      IF v.reduction_dispatch_payload IS DISTINCT FROM p_reduction_payload
        OR v_schedule IS NULL OR v.schedule_id IS DISTINCT FROM v_schedule
        THEN RAISE EXCEPTION 'stripe_commercial_evidence_conflict'; END IF;
    ELSE
      -- THE SINGLE CAPTURE POINT.
      IF p_state <> 'awaiting_apply' OR coalesce(p_expected_state,'') <> 'dispatching'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_unsupported'; END IF;
      -- The schedule must be stated exactly as it will be stored, so the payload's
      -- own `scheduleId` and the column can never differ by padding.
      IF v_schedule IS NULL OR p_schedule IS DISTINCT FROM v_schedule
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
      -- THE QUOTE MUST ALREADY BE SPENT BY THIS OPERATION. The confirmed terms
      -- are what the body is built for, so a body may not be recorded against a
      -- quote nobody confirmed, or against one another operation consumed. TTL is
      -- not re-tested: see the contract note above.
      IF v_quote.consumed_at IS NULL OR v_quote.consumed_by IS DISTINCT FROM p_operation
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;

      /* ---- version, size and envelope shape ---- */
      IF jsonb_typeof(p_reduction_payload) <> 'object'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF octet_length(p_reduction_payload::text) > 4096
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF p_reduction_payload->'v' IS DISTINCT FROM '1'::jsonb
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF NOT (p_reduction_payload ?& ARRAY['v','operationId','quoteId','scheduleId',
                'subscriptionId','selectionDetail','targetPlanId','targetSeatQuantity',
                'effectiveBoundary','expectedSettings','request'])
        OR (SELECT count(*) FROM jsonb_object_keys(p_reduction_payload)) <> 11
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF coalesce(jsonb_typeof(p_reduction_payload->'operationId'),'') <> 'string'
        OR coalesce(jsonb_typeof(p_reduction_payload->'quoteId'),'') <> 'string'
        OR coalesce(jsonb_typeof(p_reduction_payload->'scheduleId'),'') <> 'string'
        OR coalesce(jsonb_typeof(p_reduction_payload->'subscriptionId'),'') <> 'string'
        OR coalesce(jsonb_typeof(p_reduction_payload->'selectionDetail'),'') <> 'string'
        OR coalesce(jsonb_typeof(p_reduction_payload->'targetPlanId'),'') <> 'string'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      -- Integers are matched as integer TEXT as well as by JSON type, so `1.0`,
      -- `1e3` and a quoted number are all refused rather than silently equal.
      IF coalesce(jsonb_typeof(p_reduction_payload->'targetSeatQuantity'),'') <> 'number'
        OR coalesce(p_reduction_payload->>'targetSeatQuantity','') !~ '^(0|[1-9][0-9]{0,3})$'
        OR coalesce(jsonb_typeof(p_reduction_payload->'effectiveBoundary'),'') <> 'number'
        OR coalesce(p_reduction_payload->>'effectiveBoundary','') !~ '^[1-9][0-9]{0,10}$'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;

      /* ---- the ORIGINAL settings expectation, in the one supported profile ---- */
      v_settings := p_reduction_payload->'expectedSettings';
      IF coalesce(jsonb_typeof(v_settings),'') <> 'object'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF NOT (v_settings ?& ARRAY['profile','defaultSettings','paidPhase','paidItems'])
        OR (SELECT count(*) FROM jsonb_object_keys(v_settings)) <> 4
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      -- An unrecognised profile NAME is not a malformed document: it is an
      -- arrangement this packet has not implemented, and it holds.
      IF v_settings->'profile' IS DISTINCT FROM '"automaticChargeNoTaxNoDiscount"'::jsonb
        THEN RAISE EXCEPTION 'stripe_commercial_payload_profile_unsupported'; END IF;
      v_defaults := v_settings->'defaultSettings';
      v_paid := v_settings->'paidPhase';
      v_paid_items := v_settings->'paidItems';
      IF coalesce(jsonb_typeof(v_defaults),'') <> 'object'
        OR coalesce(jsonb_typeof(v_paid),'') <> 'object'
        OR coalesce(jsonb_typeof(v_paid_items),'') <> 'array'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      -- EVERY term of the profile must be PRESENT, at both levels. A missing key
      -- is malformed, never "there was nothing there".
      -- The key sets are EXACTLY the ordinary response's own key sets: the ten
      -- `default_settings` fields, and the paid phase's seventeen fields minus the
      -- four that live in `request` (`start_date`, `end_date`, `items`,
      -- `proration_behavior`). A field the ordinary response does not carry — a
      -- phase `discounts`, a `billing_thresholds`, a phase-level `automatic_tax` —
      -- has no representation in v1 at all, so it arrives here as an unexpected
      -- key and is refused; the server must HOLD such a response before capture
      -- rather than invent a representation for it.
      IF NOT (v_defaults ?& ARRAY['application_fee_percent','automatic_tax',
                'billing_cycle_anchor','collection_method','default_payment_method',
                'default_source','description','invoice_settings','on_behalf_of',
                'transfer_data'])
        OR (SELECT count(*) FROM jsonb_object_keys(v_defaults)) <> 10
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF NOT (v_paid ?& ARRAY['add_invoice_items','application_fee_percent',
                'billing_cycle_anchor','collection_method','currency',
                'default_payment_method','default_tax_rates','description',
                'invoice_settings','metadata','on_behalf_of','transfer_data',
                'trial_end'])
        OR (SELECT count(*) FROM jsonb_object_keys(v_paid)) <> 13
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      -- THE FIXED TERMS THAT ARE NULL AT BOTH LEVELS.
      FOR v_key IN SELECT k FROM unnest(ARRAY['application_fee_percent','description',
            'on_behalf_of','transfer_data']) k LOOP
        IF v_defaults->v_key IS DISTINCT FROM 'null'::jsonb
          OR v_paid->v_key IS DISTINCT FROM 'null'::jsonb
          THEN RAISE EXCEPTION 'stripe_commercial_payload_profile_unsupported'; END IF;
      END LOOP;
      -- THE FIXED TERMS THAT DIFFER BY LEVEL. `billing_cycle_anchor` is
      -- `"automatic"` on the schedule's defaults and null on the phase in the
      -- ordinary response, and those are DIFFERENT facts: substituting a null
      -- default would fabricate a setting the response never had. Likewise the
      -- defaults carry the `self` issuer while the phase carries none.
      IF v_defaults->'billing_cycle_anchor' IS DISTINCT FROM '"automatic"'::jsonb
        OR v_paid->'billing_cycle_anchor' IS DISTINCT FROM 'null'::jsonb
        OR v_defaults->'collection_method' IS DISTINCT FROM '"charge_automatically"'::jsonb
        OR v_defaults->'automatic_tax' IS DISTINCT FROM 'false'::jsonb
        OR v_defaults->'default_source' IS DISTINCT FROM 'null'::jsonb
        OR v_paid->'invoice_settings' IS DISTINCT FROM 'null'::jsonb
        OR v_paid->'trial_end' IS DISTINCT FROM 'null'::jsonb
        OR v_paid->'metadata' IS DISTINCT FROM '{}'::jsonb
        OR v_paid->'add_invoice_items' IS DISTINCT FROM '[]'::jsonb
        OR v_paid->'default_tax_rates' IS DISTINCT FROM '[]'::jsonb
        THEN RAISE EXCEPTION 'stripe_commercial_payload_profile_unsupported'; END IF;
      -- The defaults' invoice settings are retained EXACTLY. Two forms are
      -- supported: the ordinary `{"issuer":{"type":"self"}}` the documented
      -- response carries, and an explicit null for a response that genuinely had
      -- none. Any other content — a due-date override, a custom field, a
      -- connected-account issuer — is a real invoicing arrangement and holds.
      IF v_defaults->'invoice_settings' IS DISTINCT FROM '{"issuer":{"type":"self"}}'::jsonb
        AND v_defaults->'invoice_settings' IS DISTINCT FROM 'null'::jsonb
        THEN RAISE EXCEPTION 'stripe_commercial_payload_profile_unsupported'; END IF;
      -- THE PAID PHASE'S COLLECTION METHOD is either an explicit null — the
      -- ordinary response, meaning the phase INHERITS the defaults' verified
      -- `charge_automatically` — or that exact value as a phase override. Both are
      -- supported and retained as distinct facts; any other method holds.
      v_cm := v_paid->'collection_method';
      IF v_cm IS DISTINCT FROM 'null'::jsonb
        AND v_cm IS DISTINCT FROM '"charge_automatically"'::jsonb
        THEN RAISE EXCEPTION 'stripe_commercial_payload_profile_unsupported'; END IF;
      v_cm_text := CASE WHEN jsonb_typeof(v_cm) = 'string' THEN v_cm #>> '{}' END;
      -- THE VARIABLE TERM. An identity or an explicit null, at each level
      -- separately, so "the phase overrides it" and "the phase inherits it" stay
      -- distinguishable.
      FOR v_key IN SELECT k FROM unnest(ARRAY['defaults','paid']) k LOOP
        v_pm := (CASE WHEN v_key='defaults' THEN v_defaults ELSE v_paid END)
                  ->'default_payment_method';
        IF coalesce(jsonb_typeof(v_pm),'') NOT IN ('null','string')
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        IF jsonb_typeof(v_pm) = 'string'
          AND (btrim(coalesce(v_pm #>> '{}','')) = '' OR length(v_pm #>> '{}') > 255)
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      END LOOP;
      -- The PHASE-level method is the one a phase update would drop, so it is the
      -- one the canonical request must restate; `v_pm_text` NULL means the paid
      -- phase inherited the default settings and neither phase may name a method.
      v_pm := v_paid->'default_payment_method';
      v_pm_text := CASE WHEN jsonb_typeof(v_pm) = 'string' THEN v_pm #>> '{}' END;
      -- THE PAID ITEMS' OWN TERMS. Same discipline, per item.
      IF jsonb_array_length(v_paid_items) NOT BETWEEN 1 AND 2
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_paid_items) LOOP
        IF coalesce(jsonb_typeof(v_item),'') <> 'object'
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        -- Exactly the ordinary response item's own fields, minus its legacy
        -- `plan` mirror of `price`, which carries no independent information and
        -- is deliberately not stored a second time. An item `discounts` or
        -- `billing_thresholds` is absent from the ordinary response and has no v1
        -- representation, so it arrives as an unexpected key and is refused.
        IF NOT (v_item ?& ARRAY['price','quantity','metadata','tax_rates'])
          OR (SELECT count(*) FROM jsonb_object_keys(v_item)) <> 4
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        IF coalesce(jsonb_typeof(v_item->'price'),'') <> 'string'
          OR btrim(coalesce(v_item->>'price','')) = ''
          OR length(v_item->>'price') > 255
          OR coalesce(jsonb_typeof(v_item->'quantity'),'') <> 'number'
          OR coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,3}$'
          OR (v_item->>'quantity')::integer > 1000
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        -- `tax_rates` on an item OVERRIDES the phase's `default_tax_rates`, so a
        -- non-empty one is a tax arrangement, not a detail.
        IF v_item->'metadata' IS DISTINCT FROM '{}'::jsonb
          OR v_item->'tax_rates' IS DISTINCT FROM '[]'::jsonb
          THEN RAISE EXCEPTION 'stripe_commercial_payload_profile_unsupported'; END IF;
      END LOOP;

      /* ---- the request body's own shape ---- */
      v_request := p_reduction_payload->'request';
      IF coalesce(jsonb_typeof(v_request),'') <> 'object'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF NOT (v_request ?& ARRAY['end_behavior','proration_behavior','phases'])
        OR (SELECT count(*) FROM jsonb_object_keys(v_request)) <> 3
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      -- `release` keeps the subscription running after the final phase; `cancel`
      -- would end one nobody asked to cancel. Both are explicit, never defaulted.
      IF v_request->'end_behavior' IS DISTINCT FROM '"release"'::jsonb
        OR v_request->'proration_behavior' IS DISTINCT FROM '"none"'::jsonb
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF coalesce(jsonb_typeof(v_request->'phases'),'') <> 'array'
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
      IF jsonb_array_length(v_request->'phases') <> 2
        THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;

      FOR v_index IN 0..1 LOOP
        v_phase := v_request->'phases'->v_index;
        IF coalesce(jsonb_typeof(v_phase),'') <> 'object'
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        -- Phase 0 ends at the paid boundary; phase 1 is open-ended, so an
        -- `end_date` on it is an unsupported shape, not a harmless extra.
        -- THE RECORDED PAYMENT METHOD MUST BE RESTATED, exactly, in both phases
        -- when the paid phase had one, and in neither when it did not. This is
        -- checked BEFORE the key count so the diagnosis is "the request does not
        -- restate the recorded expectation" rather than "unexpected key".
        IF (v_phase ? 'default_payment_method') <> (v_pm_text IS NOT NULL)
          OR (v_pm_text IS NOT NULL
              AND v_phase->'default_payment_method' IS DISTINCT FROM v_pm)
          THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
        -- AND SO MUST THE RECORDED COLLECTION METHOD. An explicit phase override
        -- may not be recorded while the request silently omits it — that is
        -- exactly the setting a phase update would drop. An INHERITED original
        -- (null) must stay inherited: no phase in the canonical request may name
        -- a method, because naming one would turn an inherited setting into an
        -- override the original never had.
        IF (v_phase ? 'collection_method') <> (v_cm_text IS NOT NULL)
          OR (v_cm_text IS NOT NULL
              AND v_phase->'collection_method' IS DISTINCT FROM v_cm)
          THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
        -- The CASEs are parenthesised deliberately: plpgsql reads an IF expression
        -- up to the first `THEN` at parenthesis depth zero, so a bare CASE here
        -- would truncate the condition.
        IF NOT (v_phase ?& ARRAY['start_date','proration_behavior','items'])
          OR (SELECT count(*) FROM jsonb_object_keys(v_phase))
               <> (CASE WHEN v_index=0 THEN 4 ELSE 3 END)
                  + (CASE WHEN v_pm_text IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN v_cm_text IS NOT NULL THEN 1 ELSE 0 END)
          OR (v_phase ? 'end_date') <> (v_index=0)
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        IF v_phase->'proration_behavior' IS DISTINCT FROM '"none"'::jsonb
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        IF coalesce(jsonb_typeof(v_phase->'start_date'),'') <> 'number'
          OR coalesce(v_phase->>'start_date','') !~ '^[1-9][0-9]{0,10}$'
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        IF v_index=0 AND (coalesce(jsonb_typeof(v_phase->'end_date'),'') <> 'number'
          OR coalesce(v_phase->>'end_date','') !~ '^[1-9][0-9]{0,10}$')
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        v_items := v_phase->'items';
        IF coalesce(jsonb_typeof(v_items),'') <> 'array'
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 2
          THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
          IF coalesce(jsonb_typeof(v_item),'') <> 'object'
            THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
          IF NOT (v_item ?& ARRAY['price','quantity'])
            OR (SELECT count(*) FROM jsonb_object_keys(v_item)) <> 2
            THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
          IF coalesce(jsonb_typeof(v_item->'price'),'') <> 'string'
            OR btrim(coalesce(v_item->>'price','')) = ''
            OR length(v_item->>'price') > 255
            THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
          IF coalesce(jsonb_typeof(v_item->'quantity'),'') <> 'number'
            OR coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,3}$'
            OR (v_item->>'quantity')::integer > 1000
            THEN RAISE EXCEPTION 'stripe_commercial_payload_invalid'; END IF;
        END LOOP;
      END LOOP;

      /* ---- linkage: every claim re-proved against the durable row ---- */
      IF lower(p_reduction_payload->>'operationId') <> lower(v.operation_id::text)
        OR lower(p_reduction_payload->>'quoteId') <> lower(v.quote_id::text)
        OR p_reduction_payload->>'scheduleId' <> v_schedule
        OR p_reduction_payload->>'subscriptionId' <> v.subscription_id
        OR p_reduction_payload->>'selectionDetail' <> v.selection_detail
        OR p_reduction_payload->>'targetPlanId' <> v_quote.target_plan_id
        OR p_reduction_payload->'targetSeatQuantity'
             IS DISTINCT FROM to_jsonb(v_quote.target_seat_quantity)
        -- The paid phase's currency is the quote's currency, so the recorded
        -- original cannot belong to a differently priced subscription.
        OR v_paid->'currency' IS DISTINCT FROM to_jsonb(v_quote.currency)
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;

      -- THE PAID ITEMS AND THE CANONICAL PAID PHASE ARE ONE FACT. The settings
      -- expectation and the body it was built with must describe the same items,
      -- in the same order, or the stored evidence would contradict itself.
      IF jsonb_array_length(v_paid_items) <> jsonb_array_length(v_request->'phases'->0->'items')
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
      FOR v_index IN 0..jsonb_array_length(v_paid_items)-1 LOOP
        IF v_paid_items->v_index->'price'
             IS DISTINCT FROM v_request->'phases'->0->'items'->v_index->'price'
          OR v_paid_items->v_index->'quantity'
             IS DISTINCT FROM v_request->'phases'->0->'items'->v_index->'quantity'
          THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
      END LOOP;

      -- THE ORIGINAL FIXED BOUNDARY. For a reduction the quote's proration date
      -- IS the paid period end it was calculated for, and its `effective_at` is
      -- the same instant. Both phase boundaries must restate exactly that value,
      -- and the original phase must START before it, so a rolled-over period or a
      -- later attempt cannot move the change to a different boundary.
      IF v_quote.effective_at IS NULL
        OR v_quote.effective_at <> to_timestamp(v_quote.proration_date)
        OR p_reduction_payload->'effectiveBoundary'
             IS DISTINCT FROM to_jsonb(v_quote.proration_date)
        OR v_request->'phases'->0->'end_date'
             IS DISTINCT FROM to_jsonb(v_quote.proration_date)
        OR v_request->'phases'->1->'start_date'
             IS DISTINCT FROM to_jsonb(v_quote.proration_date)
        OR (v_request->'phases'->0->>'start_date')::bigint >= v_quote.proration_date
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;

      -- THE TARGET SELECTION. The reduced phase is the one part of the body that
      -- IS re-derivable, from the canonical selection
      -- (plan#seats#baseItemId#basePriceId#seatItemId#seatPriceId) and the
      -- quote's target, so it is rebuilt here and compared exactly — in order —
      -- instead of being accepted because it merely looks like items.
      v_seat_price := nullif(split_part(v.selection_detail,'#',6),'-');
      IF split_part(v.selection_detail,'#',1) <> v_quote.target_plan_id
        OR split_part(v.selection_detail,'#',2) <> v_quote.target_seat_quantity::text
        OR coalesce(split_part(v.selection_detail,'#',4),'') IN ('','-')
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
      v_expected := jsonb_build_array(jsonb_build_object(
        'price', split_part(v.selection_detail,'#',4), 'quantity', 1));
      IF v_quote.target_seat_quantity > 0 THEN
        IF v_seat_price IS NULL THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
        v_expected := v_expected || jsonb_build_array(jsonb_build_object(
          'price', v_seat_price, 'quantity', v_quote.target_seat_quantity));
      END IF;
      IF v_request->'phases'->1->'items' IS DISTINCT FROM v_expected
        THEN RAISE EXCEPTION 'stripe_commercial_payload_mismatch'; END IF;
    END IF;
  END IF;

  -- FORWARD CAPTURE IS MANDATORY FOR A REDUCTION. `awaiting_apply` is the state
  -- that says "the phase update is dispatched or dispatchable against a known
  -- schedule"; without both the schedule and the payload there is no durable
  -- evidence of WHAT was sent, so the attempt is refused instead of being
  -- recorded as ready. Every other state, kind and direction is untouched.
  IF v_reduction AND p_state='awaiting_apply'
    AND (coalesce(v_schedule, v.schedule_id) IS NULL
      OR coalesce(p_reduction_payload, v.reduction_dispatch_payload) IS NULL)
    THEN RAISE EXCEPTION 'stripe_commercial_reduction_payload_missing'; END IF;

  UPDATE public.stripe_commercial_operations
     SET state=p_state,
         invoice_id=coalesce(p_invoice, invoice_id),
         refund_id=coalesce(p_refund, refund_id),
         schedule_id=coalesce(p_schedule, schedule_id),
         -- Append-once, exactly like the evidence ids above: a stored payload is
         -- never rewritten, not even by an identical proposal.
         reduction_dispatch_payload=coalesce(reduction_dispatch_payload, p_reduction_payload),
         dispatched_at=CASE WHEN p_state='dispatching' AND dispatched_at IS NULL
                            THEN clock_timestamp() ELSE dispatched_at END,
         updated_at=now()
   WHERE operation_id=p_operation;
  RETURN true;
END; $$;

-- Terminal settlement. 'applied' means an authoritative read proved the result;
-- 'refused' means the provider or the policy authoritatively said no; 'failed'
-- means the attempt provably did nothing. A terminal operation releases the slot
-- and, with it, the projection gate.
--
-- `p_expected_state` is the same COMPARE-AND-SET as the advance, and it is what
-- stops a stale instance from closing a dispatched operation: a worker that
-- refuses on a PRE-DISPATCH check asserts `prepared`, so if another instance has
-- already moved the operation to `dispatching` the refusal is rejected and the
-- unknown provider outcome keeps the slot.
CREATE FUNCTION public.stripe_commercial_finish_operation(
  p_operation uuid, p_user uuid, p_account text, p_mode text, p_state text,
  p_refusal text DEFAULT NULL, p_expected_state text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.stripe_commercial_operations;
BEGIN
  IF p_state NOT IN ('applied','refused','failed')
    THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  SELECT * INTO v FROM public.stripe_commercial_operations
    WHERE operation_id=p_operation AND user_id=p_user AND account_id=p_account AND mode=p_mode
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_expected_state IS NOT NULL AND v.state <> p_expected_state THEN RETURN false; END IF;
  IF NOT public.stripe_commercial_transition(v.state, p_state) THEN RETURN false; END IF;
  UPDATE public.stripe_commercial_operations
     SET state=p_state, refusal_code=p_refusal, resolved_at=clock_timestamp(), updated_at=now()
   WHERE operation_id=p_operation;
  IF v.kind='refund' AND v.case_id IS NOT NULL THEN
    UPDATE public.stripe_refund_cases
       SET state=CASE WHEN p_state='applied' THEN 'consumed'
                      WHEN p_state='refused' THEN 'refused' ELSE state END,
           updated_at=now()
     WHERE case_id=v.case_id AND state='approved';
  END IF;
  RETURN true;
END; $$;

-- An operator-facing read. Scoped to the owner/account/mode, so no row is
-- returned for anyone else's operation.
--
-- `reduction_dispatch_payload` is returned here, through this SAME scope, because
-- recovery after a lost capture acknowledgment must compare the EXACT stored
-- bytes before any provider POST. The argument list is unchanged; the column is
-- appended, so an existing caller that reads by name is unaffected. There is no
-- new grant: the column is reachable only through this SECURITY DEFINER read and
-- through the service_role table privileges the migration already granted.
CREATE FUNCTION public.stripe_commercial_read_operation(
  p_operation uuid, p_user uuid, p_account text, p_mode text)
RETURNS TABLE(kind text, state text, subscription_id text, invoice_id text, refund_id text,
              schedule_id text, refusal_code text, attempts integer,
              created_at timestamptz, resolved_at timestamptz,
              reduction_dispatch_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  RETURN QUERY
    SELECT o.kind, o.state, o.subscription_id, o.invoice_id, o.refund_id, o.schedule_id,
           o.refusal_code, o.attempts, o.created_at, o.resolved_at,
           o.reduction_dispatch_payload
      FROM public.stripe_commercial_operations o
     WHERE o.operation_id=p_operation AND o.user_id=p_user
       AND o.account_id=p_account AND o.mode=p_mode;
END; $$;

/* ---------------------------------------------------------------------------
   Operator-approved support refunds
   ------------------------------------------------------------------------ */

-- Record a trusted operator's approval. There is no caller path to this
-- function and no "approved" argument: the ROW is the approval, and it must
-- carry the actor, the case id, the amount and currency, the policy basis, the
-- original request time and BOTH dispositions. A missing or unrecognised
-- disposition or basis fails the CHECK constraints, so it can never be inferred.
CREATE FUNCTION public.stripe_commercial_record_refund_case(
  p_case text, p_user uuid, p_account text, p_mode text, p_invoice text,
  p_subscription text, p_plan text, p_amount bigint, p_currency text,
  p_basis text, p_subscription_disposition text, p_access_disposition text,
  p_actor text, p_requested_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.stripe_refund_cases;
BEGIN
  IF coalesce(p_case,'')='' OR p_user IS NULL OR coalesce(p_account,'')=''
    OR p_mode NOT IN ('live','test') OR coalesce(p_invoice,'')=''
    OR coalesce(p_actor,'')='' OR p_requested_at IS NULL OR p_amount IS NULL
    THEN RAISE EXCEPTION 'stripe_commercial_refund_case_unavailable'; END IF;
  SELECT * INTO v FROM public.stripe_refund_cases WHERE case_id=p_case FOR UPDATE;
  IF FOUND THEN
    -- Re-recording the identical approval is idempotent; changing ANY immutable
    -- term of an existing case is a conflict, never a silent amendment that
    -- returns success while the executor keeps using the previous values.
    --
    -- Every field is compared with the SAME normalisation the INSERT below
    -- applies (lower(currency), nullif(btrim(subscription))) and with
    -- IS DISTINCT FROM, so a nullable subscription is null-safe rather than
    -- always "equal". `subscription_id`, `plan_id` and `requested_at` are
    -- material: the subscription binds invoice ownership, the plan is part of the
    -- once-per-customer-per-plan guarantee key, and the request time is what the
    -- 14-day window is measured from.
    IF v.user_id IS DISTINCT FROM p_user OR v.account_id IS DISTINCT FROM p_account
      OR v.mode IS DISTINCT FROM p_mode OR v.invoice_id IS DISTINCT FROM p_invoice
      OR v.subscription_id IS DISTINCT FROM nullif(btrim(coalesce(p_subscription,'')),'')
      OR v.plan_id IS DISTINCT FROM p_plan
      OR v.amount IS DISTINCT FROM p_amount
      OR v.currency IS DISTINCT FROM lower(p_currency)
      OR v.policy_basis IS DISTINCT FROM p_basis
      OR v.subscription_disposition IS DISTINCT FROM p_subscription_disposition
      OR v.access_disposition IS DISTINCT FROM p_access_disposition
      OR v.approved_by IS DISTINCT FROM p_actor
      OR v.requested_at IS DISTINCT FROM p_requested_at
      THEN RAISE EXCEPTION 'stripe_commercial_refund_case_conflict'; END IF;
    RETURN v.state;
  END IF;
  INSERT INTO public.stripe_refund_cases(
    case_id,user_id,account_id,mode,invoice_id,subscription_id,plan_id,amount,currency,
    policy_basis,subscription_disposition,access_disposition,approved_by,requested_at)
  VALUES(p_case,p_user,p_account,p_mode,p_invoice,nullif(btrim(coalesce(p_subscription,'')),''),
    p_plan,p_amount,lower(p_currency),p_basis,p_subscription_disposition,p_access_disposition,
    p_actor,p_requested_at);
  RETURN 'approved';
END; $$;

CREATE FUNCTION public.stripe_commercial_read_refund_case(p_case text, p_account text, p_mode text)
RETURNS TABLE(user_id uuid, invoice_id text, subscription_id text, plan_id text, amount bigint,
              currency text, policy_basis text, subscription_disposition text,
              access_disposition text, approved_by text, requested_at timestamptz,
              approved_at timestamptz, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  RETURN QUERY
    SELECT c.user_id, c.invoice_id, c.subscription_id, c.plan_id, c.amount, c.currency,
           c.policy_basis, c.subscription_disposition, c.access_disposition, c.approved_by,
           c.requested_at, c.approved_at, c.state
      FROM public.stripe_refund_cases c
     WHERE c.case_id=p_case AND c.account_id=p_account AND c.mode=p_mode;
END; $$;

-- RESERVE funds for one approved case, under a per-invoice lock.
--
-- `p_allocated_paid` is the authoritative amount the exact InvoicePayment
-- allocated to THIS invoice, and `p_provider_reserved` is the total the provider
-- already shows as pending/requires_action/succeeded (or unknown) on the linked
-- payment.
--
-- The arithmetic counts EVERY local reservation that has not been authoritatively
-- released, and then adds only the provider-side total our own reservations do
-- not already account for:
--
--   remaining = allocated
--             - (all local non-released reservations)
--             - max(0, provider_reserved - local reservations with a refund id)
--
-- Both halves matter. Counting only the provider's figure would miss a refund
-- this system dispatched whose outcome is still unknown (no refund id yet, so it
-- cannot appear in any provider list). Trusting a known refund id to be covered
-- by the provider's figure would, on a stale or lagging read, free funds that are
-- actually committed — reproduced by the `frees the funds for a NEW case` test,
-- where a pending refund with a known id and a provider total of 0 would
-- otherwise have let a second case over-refund the same payment. Only an
-- authoritative failed/canceled outcome ever reduces this.
--
-- The 14-day first-payment guarantee is spent here, as a PRIMARY KEY insert, so
-- a second attempt for the same customer and plan is refused by the database
-- rather than by a code path.
CREATE FUNCTION public.stripe_commercial_reserve_refund(
  p_case text, p_operation uuid, p_user uuid, p_account text, p_mode text,
  p_invoice text, p_payment text, p_amount bigint, p_currency text,
  p_allocated_paid bigint, p_provider_reserved bigint)
RETURNS TABLE(reserved bigint, remaining bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case public.stripe_refund_cases; v_existing public.stripe_refund_reservations;
  v_local bigint; v_known bigint; v_remaining bigint;
BEGIN
  IF coalesce(p_case,'')='' OR p_operation IS NULL OR p_user IS NULL
    OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR coalesce(p_invoice,'')='' OR coalesce(p_payment,'')=''
    OR p_amount IS NULL OR p_amount <= 0
    OR p_allocated_paid IS NULL OR p_allocated_paid < 0
    OR p_provider_reserved IS NULL OR p_provider_reserved < 0
    THEN RAISE EXCEPTION 'stripe_commercial_refund_unavailable'; END IF;

  -- Serialize every case touching this invoice.
  INSERT INTO public.stripe_refund_invoice_ledger(account_id,mode,invoice_id)
    VALUES(p_account,p_mode,p_invoice) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.stripe_refund_invoice_ledger
    WHERE account_id=p_account AND mode=p_mode AND invoice_id=p_invoice FOR UPDATE;

  SELECT * INTO v_case FROM public.stripe_refund_cases WHERE case_id=p_case FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stripe_commercial_refund_case_unknown'; END IF;
  IF v_case.user_id<>p_user OR v_case.account_id<>p_account OR v_case.mode<>p_mode
    OR v_case.invoice_id<>p_invoice OR v_case.amount<>p_amount
    OR v_case.currency<>lower(coalesce(p_currency,''))
    THEN RAISE EXCEPTION 'stripe_commercial_refund_case_mismatch'; END IF;

  SELECT * INTO v_existing FROM public.stripe_refund_reservations
    WHERE case_id=p_case FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operation_id<>p_operation OR v_existing.payment_id<>p_payment
      OR v_existing.amount<>p_amount THEN RAISE EXCEPTION 'stripe_commercial_refund_case_mismatch'; END IF;
    IF v_existing.state='released' THEN RAISE EXCEPTION 'stripe_commercial_refund_released'; END IF;
    -- Idempotent: the reservation this operation already holds. Its own amount
    -- is subtracted from what remains, so a retry reports the same picture.
    SELECT coalesce(sum(r.amount),0),
           coalesce(sum(r.amount) FILTER (WHERE r.refund_id IS NOT NULL),0)
      INTO v_local, v_known FROM public.stripe_refund_reservations r
      WHERE r.account_id=p_account AND r.mode=p_mode AND r.invoice_id=p_invoice
        AND r.state<>'released';
    RETURN QUERY SELECT v_existing.amount,
      greatest(p_allocated_paid - v_local - greatest(p_provider_reserved - v_known, 0), 0);
    RETURN;
  END IF;
  IF v_case.state<>'approved' THEN RAISE EXCEPTION 'stripe_commercial_refund_case_spent'; END IF;

  SELECT coalesce(sum(r.amount),0),
         coalesce(sum(r.amount) FILTER (WHERE r.refund_id IS NOT NULL),0)
    INTO v_local, v_known FROM public.stripe_refund_reservations r
    WHERE r.account_id=p_account AND r.mode=p_mode AND r.invoice_id=p_invoice
      AND r.state<>'released';
  v_remaining := p_allocated_paid - v_local - greatest(p_provider_reserved - v_known, 0);
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'stripe_commercial_refund_over_reserved'; END IF;

  -- Spend the once-per-customer-per-plan guarantee in SQL.
  IF v_case.policy_basis='firstPayment14Day' THEN
    BEGIN
      INSERT INTO public.stripe_refund_policy_uses(user_id,policy_basis,plan_id,case_id)
        VALUES(p_user,'firstPayment14Day',v_case.plan_id,p_case);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'stripe_commercial_refund_policy_spent';
    END;
  END IF;

  INSERT INTO public.stripe_refund_reservations(
    case_id,operation_id,account_id,mode,invoice_id,payment_id,amount,currency)
  VALUES(p_case,p_operation,p_account,p_mode,p_invoice,p_payment,p_amount,lower(p_currency));
  UPDATE public.stripe_refund_invoice_ledger
     SET reserved_total=reserved_total+p_amount, updated_at=now()
   WHERE account_id=p_account AND mode=p_mode AND invoice_id=p_invoice;
  RETURN QUERY SELECT p_amount, greatest(v_remaining - p_amount, 0);
END; $$;

-- Record the provider's refund id and its CLASSIFIED status against the
-- reservation. 'succeeded' settles; an authoritative 'failed'/'canceled'
-- releases; everything else — pending, requires_action, an unrecognised status,
-- an absent status, a timeout — leaves the reservation held, deliberately.
-- The refund id, once recorded, cannot be repointed at another refund.
CREATE FUNCTION public.stripe_commercial_settle_refund(
  p_case text, p_operation uuid, p_account text, p_mode text,
  p_refund text, p_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.stripe_refund_reservations; v_next text;
BEGIN
  IF coalesce(p_case,'')='' OR p_operation IS NULL
    THEN RAISE EXCEPTION 'stripe_commercial_refund_unavailable'; END IF;
  SELECT * INTO v FROM public.stripe_refund_reservations
    WHERE case_id=p_case AND account_id=p_account AND mode=p_mode FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stripe_commercial_refund_unreserved'; END IF;
  IF v.operation_id<>p_operation THEN RAISE EXCEPTION 'stripe_commercial_refund_case_mismatch'; END IF;
  IF p_refund IS NOT NULL AND v.refund_id IS NOT NULL AND v.refund_id<>p_refund
    THEN RAISE EXCEPTION 'stripe_commercial_evidence_conflict'; END IF;
  IF v.state<>'reserved' THEN RETURN v.state; END IF;

  v_next := CASE WHEN p_status='succeeded' THEN 'settled'
                 WHEN public.stripe_commercial_refund_releases(p_status) THEN 'released'
                 ELSE 'reserved' END;
  UPDATE public.stripe_refund_reservations
     SET state=v_next, refund_id=coalesce(p_refund, refund_id),
         refund_status=nullif(btrim(coalesce(p_status,'')),''), updated_at=now()
   WHERE case_id=p_case;
  IF v_next='released' THEN
    UPDATE public.stripe_refund_invoice_ledger
       SET reserved_total=greatest(reserved_total - v.amount, 0), updated_at=now()
     WHERE account_id=p_account AND mode=p_mode AND invoice_id=v.invoice_id;
  END IF;
  RETURN v_next;
END; $$;

/* ---------------------------------------------------------------------------
   Pre-deletion barrier
   ------------------------------------------------------------------------ */

-- A READ-ONLY barrier for the public promise that deleting an account ends the
-- subscription. It deletes nothing, cancels nothing and touches no auth row: it
-- reports whether billing is provably finished. `blocked=true` means an auth or
-- data deletion MUST NOT proceed yet.
--
-- There is no real account-deletion handler in this product, so nothing calls
-- this on a deletion path today; that integration is an explicit acceptance gap.
CREATE FUNCTION public.stripe_commercial_deletion_barrier(p_user uuid)
RETURNS TABLE(blocked boolean, reason text, mode text, subscription_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'stripe_commercial_unavailable'; END IF;
  RETURN QUERY
    SELECT true, 'operation_unresolved'::text, o.mode, o.subscription_id
      FROM public.stripe_commercial_operations o
     WHERE o.user_id=p_user AND public.stripe_commercial_open_state(o.state)
     ORDER BY o.created_at LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT true, 'refund_reserved'::text, r.mode, c.subscription_id
      FROM public.stripe_refund_reservations r
      JOIN public.stripe_refund_cases c ON c.case_id=r.case_id
     WHERE c.user_id=p_user AND r.state='reserved'
     ORDER BY r.created_at LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT true, 'subscription_live'::text, s.mode, s.subscription_id
      FROM public.stripe_subscriptions s
     WHERE s.user_id=p_user
       AND s.status NOT IN ('canceled','cancelled','incomplete_expired')
     ORDER BY s.updated_at LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT false, 'clear'::text, NULL::text, NULL::text;
END; $$;

/* ---------------------------------------------------------------------------
   The projection gate
   ------------------------------------------------------------------------ */

-- The webhook path's ONLY write entry point from now on.
--
-- It wraps the accepted foundation's stripe_apply_subscription_projection
-- UNCHANGED, in the same transaction, under the same fenced lease, and adds one
-- rule: while an unresolved commercial operation holds this owner's slot, a
-- projection may not WIDEN the allowance.
--
-- Why this cannot be a TypeScript check: the thing being prevented is a paid
-- historical invoice (or a stale/duplicate/out-of-order redelivery, or an SCA
-- flow that has not completed) being reconciled into a bigger plan or seat count
-- before the exact update invoice for the pending change is authoritatively
-- paid AND applied. A successful HTTP status never grants anything, and neither
-- does an invoice that was paid for a previous period.
--
-- What is held: only a GRANTING projection whose plan rank or seat quantity
-- exceeds the IMMUTABLE allowance baseline captured when the pending operation
-- was created, or one naming a different subscription than that operation and
-- baseline. Nothing is written at all and the receipt is left 'uncertain'
-- (retryable), so the previously verified allowance and its entitlement survive
-- byte for byte.
--
-- The baseline is deliberately NOT the live stripe_subscriptions row. That row
-- is rewritten by every accepted projection, INCLUDING a non-granting one, so
-- comparing with it made the threshold movable: an observed `past_due` pro/4
-- (grants=false) wrote pro/4, and the next granting pro/4 then compared equal
-- and passed while the operation that would pay for it was still unresolved.
-- The baseline cannot move, so a non-granting observation can no longer raise
-- the bar, and an operation with no verified baseline holds every grant.
--
-- Freezing alone was not enough either, and this is the second half of the same
-- correction: a non-granting larger row written BEFORE the operation existed
-- would simply have been frozen as the baseline. `baseline_known` is therefore
-- set only by stripe_commercial_verified_baseline, which re-proves the
-- foundation's grant predicate, so `baseline_known=true` means "this allowance
-- was provably granted and is still paid and current", and false means HOLD.
-- Capture and this check are serialized by stripe_commercial_owner_lock, so the
-- gate cannot read "no pending operation" while a baseline is being captured
-- from the row this projection is about to replace.
--
-- What is NOT held, deliberately: decreases, projections equal to the baseline,
-- and every revoke/non-granting projection. A cancellation or a payment failure
-- during a pending change must still take effect, and a revoke followed by a
-- re-grant of the BASELINE allowance is still allowed.
CREATE FUNCTION public.stripe_commercial_guarded_projection(
  p_account text, p_mode text, p_holder text, p_fence bigint, p_event_id text,
  p_customer text, p_subscription text, p_replaces text, p_plan_id text,
  p_status text, p_seat_quantity integer, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_invoice_paid boolean, p_grants boolean,
  p_observed_at timestamptz, p_event_created bigint,
  p_session_request uuid DEFAULT NULL, p_session_id text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_user uuid; v_open public.stripe_commercial_operations; v_widens boolean;
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test') OR coalesce(p_customer,'')=''
    OR coalesce(p_subscription,'')='' THEN RAISE EXCEPTION 'stripe_projection_unavailable'; END IF;

  -- Take the lease FIRST, so the gate below is evaluated under the same
  -- ownership the foundation's write requires. A worker that lost its lease
  -- raises here and reads nothing.
  PERFORM public.stripe_require_lease(p_account,p_mode,p_holder,p_fence);

  SELECT c.user_id INTO v_user FROM public.stripe_customers c
    WHERE c.account_id=p_account AND c.mode=p_mode AND c.customer_id=p_customer;

  -- Serialize with baseline capture, under the SAME key _begin_operation uses,
  -- for EVERY projection of a known owner — not only a granting one. A
  -- non-granting projection rewrites the same stripe_subscriptions row the
  -- baseline is proved from, so the two paths must be ordered even when this one
  -- cannot widen anything. Taken after the lease so the lock order is always
  -- lease → owner, and _begin_operation never takes the lease, so the two paths
  -- cannot deadlock. An unknown customer takes no lock: the foundation writes no
  -- projection row for one.
  IF v_user IS NOT NULL THEN
    PERFORM public.stripe_commercial_owner_lock(v_user, p_account, p_mode);
  END IF;

  IF v_user IS NOT NULL AND coalesce(p_grants,false) THEN
    SELECT * INTO v_open FROM public.stripe_commercial_operations o
      WHERE o.user_id=v_user AND o.account_id=p_account AND o.mode=p_mode
        AND o.kind IN ('plan_change','seat_change')
        AND public.stripe_commercial_open_state(o.state)
      ORDER BY o.created_at LIMIT 1;
    IF FOUND THEN
      -- No verified allowance baseline, a baseline for a different
      -- subscription, a projection naming a subscription the pending operation
      -- is not about, or a plan this policy does not recognise: all ambiguous,
      -- so all held.
      v_widens := NOT v_open.baseline_known
        OR v_open.baseline_subscription_id IS NULL
        OR v_open.baseline_subscription_id <> p_subscription
        OR v_open.subscription_id <> p_subscription
        OR public.stripe_commercial_plan_rank(p_plan_id) < 0
        OR public.stripe_commercial_plan_rank(p_plan_id)
             > public.stripe_commercial_plan_rank(v_open.baseline_plan_id)
        OR coalesce(p_seat_quantity,0) > coalesce(v_open.baseline_seat_quantity,0);
      IF v_widens THEN
        PERFORM public.stripe_finish_webhook_receipt(
          p_event_id,p_account,p_mode,'uncertain',p_holder,p_fence);
        RETURN 'operation_pending_hold';
      END IF;
    END IF;
  END IF;

  RETURN public.stripe_apply_subscription_projection(
    p_account,p_mode,p_holder,p_fence,p_event_id,p_customer,p_subscription,p_replaces,
    p_plan_id,p_status,p_seat_quantity,p_period_end,p_cancel_at_period_end,
    p_invoice_paid,p_grants,p_observed_at,p_event_created,p_session_request,p_session_id);
END; $$;

/* ---------------------------------------------------------------------------
   Privileges — service_role only, PUBLIC/anon/authenticated explicitly revoked
   ------------------------------------------------------------------------ */

REVOKE ALL ON FUNCTION
  public.stripe_commercial_plan_rank(text),
  public.stripe_commercial_open_state(text),
  public.stripe_commercial_transition(text,text),
  public.stripe_commercial_attempt_limit(),
  public.stripe_commercial_owner_lock(uuid,text,text),
  public.stripe_commercial_refund_releases(text),
  public.stripe_commercial_billing_country(uuid),
  public.stripe_commercial_current_subscription(uuid,text,text),
  public.stripe_commercial_verified_baseline(uuid,text,text,text),
  public.stripe_commercial_membership_usage(uuid),
  public.stripe_commercial_issue_quote(uuid,uuid,text,text,text,text,text,text,text,integer,text,bigint,text,bigint,bigint,timestamptz,integer),
  public.stripe_commercial_consume_quote(uuid,uuid,text,text,text,text,text,text,bigint,uuid),
  public.stripe_commercial_read_quote(uuid,uuid,text,text),
  public.stripe_commercial_begin_operation(uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,text,text),
  public.stripe_commercial_advance_operation(uuid,uuid,text,text,text,text,text,text,text,jsonb),
  public.stripe_commercial_finish_operation(uuid,uuid,text,text,text,text,text),
  public.stripe_commercial_read_operation(uuid,uuid,text,text),
  public.stripe_commercial_record_refund_case(text,uuid,text,text,text,text,text,bigint,text,text,text,text,text,timestamptz),
  public.stripe_commercial_read_refund_case(text,text,text),
  public.stripe_commercial_reserve_refund(text,uuid,uuid,text,text,text,text,bigint,text,bigint,bigint),
  public.stripe_commercial_settle_refund(text,uuid,text,text,text,text),
  public.stripe_commercial_deletion_barrier(uuid),
  public.stripe_commercial_guarded_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.stripe_commercial_plan_rank(text),
  public.stripe_commercial_open_state(text),
  public.stripe_commercial_transition(text,text),
  public.stripe_commercial_attempt_limit(),
  public.stripe_commercial_owner_lock(uuid,text,text),
  public.stripe_commercial_refund_releases(text),
  public.stripe_commercial_billing_country(uuid),
  public.stripe_commercial_current_subscription(uuid,text,text),
  public.stripe_commercial_verified_baseline(uuid,text,text,text),
  public.stripe_commercial_membership_usage(uuid),
  public.stripe_commercial_issue_quote(uuid,uuid,text,text,text,text,text,text,text,integer,text,bigint,text,bigint,bigint,timestamptz,integer),
  public.stripe_commercial_consume_quote(uuid,uuid,text,text,text,text,text,text,bigint,uuid),
  public.stripe_commercial_read_quote(uuid,uuid,text,text),
  public.stripe_commercial_begin_operation(uuid,uuid,text,text,text,text,text,text,uuid,text,uuid,text,text),
  public.stripe_commercial_advance_operation(uuid,uuid,text,text,text,text,text,text,text,jsonb),
  public.stripe_commercial_finish_operation(uuid,uuid,text,text,text,text,text),
  public.stripe_commercial_read_operation(uuid,uuid,text,text),
  public.stripe_commercial_record_refund_case(text,uuid,text,text,text,text,text,bigint,text,text,text,text,text,timestamptz),
  public.stripe_commercial_read_refund_case(text,text,text),
  public.stripe_commercial_reserve_refund(text,uuid,uuid,text,text,text,text,bigint,text,bigint,bigint),
  public.stripe_commercial_settle_refund(text,uuid,text,text,text,text),
  public.stripe_commercial_deletion_barrier(uuid),
  public.stripe_commercial_guarded_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)
  TO service_role;
