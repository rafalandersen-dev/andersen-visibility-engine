-- Stripe subscription lifecycle foundation (28 October 2026).
--
-- Server-owned mappings only. Every table/function here is service-role-only
-- (RLS enabled, no policies; grants restricted to service_role). The browser
-- and the webhook payload NEVER establish ownership: a Stripe customer is
-- linked to a user only via stripe_upsert_customer, called from server-resolved
-- checkout creation, never from webhook metadata.
--
-- This migration is INERT on its own: it creates no rows, fires no triggers,
-- changes no existing table and grants no entitlement. It is a FOUNDATION, not
-- production acceptance. Public paid checkout stays held in application code
-- (src/lib/stripe-lifecycle.functions.ts); nothing here activates billing.
--
-- Two invariants are enforced structurally rather than by convention:
--
--  1. MODE ISOLATION. Test-mode activity of any kind — active, cancelled,
--     unpaid, seat quantities, replays — never reads or writes
--     public.entitlements. The entitlement block is gated on p_mode='live' as
--     a whole, so a test customer mapped to a user who holds a live paid
--     entitlement cannot downgrade, upgrade or revoke that production row.
--
--  2. CURRENT-SUBSCRIPTION OWNERSHIP. Only the exact subscription the user is
--     currently mapped to can apply or revoke. A different subscription id may
--     take over only as an EXPLICITLY verified replacement (the caller must
--     name the subscription it observed as replaced, from the same
--     authoritative read, with a strictly newer observation time).
--
--  3. INDEPENDENT GRANT VERIFICATION. The caller's `p_grants` flag is NOT
--     trusted. stripe_apply_subscription_projection re-derives the grant from
--     the projected facts (live mode, a sellable plan, an entitlement-granting
--     status, a paid latest invoice and a finite billing period still in the
--     future by the DATABASE wall clock). A forged `true` next to a canceled,
--     unpaid, period-less or elapsed subscription grants nothing, restores
--     nothing and extends nothing.
--
-- Lease liveness is compared with clock_timestamp() — the wall clock AFTER the
-- row lock was actually acquired — not with now()/transaction start, so a
-- holder whose lease expired while it waited for the lock cannot write or
-- terminally acknowledge anything.

CREATE TABLE public.stripe_customers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, mode, customer_id),
  UNIQUE (user_id, account_id, mode)
);

-- The CURRENT mapped subscription per user/account/mode, mirrored from the
-- authoritative provider read. `observed_at` is the time of that read and is
-- the monotonicity guard: a stale or late re-read can never overwrite a newer
-- projection, and event timestamps are never used for this decision.
CREATE TABLE public.stripe_subscriptions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  subscription_id text NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('starter','growth','pro','agency')),
  status text NOT NULL CHECK (status <> ''),
  seat_quantity integer NOT NULL DEFAULT 0 CHECK (seat_quantity BETWEEN 0 AND 1000),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  latest_invoice_paid boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL,
  last_event_created bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, mode),
  UNIQUE (account_id, mode, subscription_id)
);

-- Durable, METADATA-ONLY webhook receipt journal: event id, type, object id and
-- a body fingerprint. No raw event body, no payment data, no customer payload is
-- ever stored. The retained (event_type, object_id) pair is exactly what the
-- bounded replay needs to re-fetch the current object from Stripe.
--
-- 'pending'   durably received, not yet reconciled (crash / lost ack lands here)
-- 'uncertain' reconciliation attempted and inconclusive — still RETRYABLE
-- 'applied'   projection + entitlement committed in the same transaction
-- 'ignored'   irrelevant or superseded; terminal, safe to acknowledge
CREATE TABLE public.stripe_webhook_receipts (
  event_id text NOT NULL,
  account_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  event_type text NOT NULL,
  event_created bigint NOT NULL,
  object_id text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','applied','uncertain','ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (event_id, account_id, mode)
);
CREATE INDEX stripe_webhook_receipts_replay_idx
  ON public.stripe_webhook_receipts (account_id, mode, received_at)
  WHERE status IN ('pending','uncertain');

-- Serialized per-account-per-mode lease with a monotonically increasing fence
-- token. The fence AND the holder AND the lease liveness are re-checked inside
-- the atomic projection write, so a reclaimed (crashed) holder's late write is
-- refused rather than applied out of turn.
CREATE TABLE public.stripe_account_leases (
  account_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  fence bigint NOT NULL DEFAULT 0,
  holder text,
  leased_until timestamptz,
  leased_at timestamptz,
  PRIMARY KEY (account_id, mode)
);

-- Persistent account/mode/request idempotency for caller-initiated checkout and
-- portal creation. `params_fingerprint` pins the SELECTED PARAMETERS, so a
-- retried requestId can only resume the identical request; a different owner,
-- account, mode, kind or parameter set under the same requestId is refused.
--
-- 'pending'  creation attempted, outcome unknown (safe to retry with the SAME
--            persistent Stripe idempotency key and identical parameters)
-- 'open'     a Checkout Session exists and is still usable — NOT terminal, so
--            another requestId or navigation cannot create a second session
-- 'fenced'   the outcome is unknown and too old to retry with the same Stripe
--            idempotency key. NON-TERMINAL on purpose: the unique slot stays
--            taken, so no new requestId can start a second subscription, and
--            only an explicit AUTHORITATIVE recovery (a complete session read)
--            may settle it. Age alone never releases it.
-- 'completed'/'expired'/'failed' terminal
CREATE TABLE public.stripe_checkout_requests (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  kind text NOT NULL CHECK (kind IN ('checkout','portal')),
  params_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','open','fenced','completed','expired','failed')),
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
-- At most ONE non-terminal request per owner/account/mode/kind.
CREATE UNIQUE INDEX stripe_checkout_requests_open_idx
  ON public.stripe_checkout_requests (user_id, account_id, mode, kind)
  WHERE status IN ('pending','open','fenced');

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_account_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_checkout_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_customers, public.stripe_subscriptions, public.stripe_webhook_receipts,
  public.stripe_account_leases, public.stripe_checkout_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stripe_customers, public.stripe_subscriptions, public.stripe_webhook_receipts,
  public.stripe_account_leases, public.stripe_checkout_requests TO service_role;

-- INHERITED DEFAULT-ACL ISOLATION for the five sensitive stores above.
--
-- RLS is not isolation for a role that bypasses it, and the revoke above only
-- names PUBLIC, anon and authenticated. The strict production installation
-- wrapper rolled a SEPARATE bounded migration back BEFORE COMMIT because that
-- environment's DEFAULT PRIVILEGES in schema public grant SELECT and INSERT on
-- every newly created table to the optional environment role sandbox_exec,
-- which is LOGIN and BYPASSRLS and NOT superuser — an actual reader and writer,
-- not a harmless owner alias. Without the block below each of these five tables
-- would be readable and insertable by that role from the moment it was created,
-- RLS notwithstanding.
--
-- What this does, and nothing more: when (and only when) that optional role
-- exists, REVOKE ALL PRIVILEGES on exactly those five tables from it. It
-- creates, alters or drops no role and no membership, does NOT alter DEFAULT
-- PRIVILEGES (every unrelated and future table keeps the environment's own
-- configuration), and changes no other table, index, policy, RLS setting,
-- grant or function privilege. Where the role is absent this is a documented
-- no-op that changes no ACL at all, so it is safe in every environment.
--
-- Function-level default privileges are a DIFFERENT question and stay out of
-- scope: the explicit PUBLIC/anon/authenticated function revoke at the end of
-- this migration is the control that matters there, it is unchanged, and this
-- block performs no general ACL cleanup.
DO $$
DECLARE leftover text;
BEGIN
  -- An OPTIONAL environment fixture, never created or modified here.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN RETURN; END IF;

  REVOKE ALL PRIVILEGES ON public.stripe_customers, public.stripe_subscriptions,
    public.stripe_webhook_receipts, public.stripe_account_leases,
    public.stripe_checkout_requests FROM sandbox_exec;

  -- Verify the intended END STATE instead of trusting the REVOKE: a right still
  -- reachable through a column grant, role membership or a role attribute is
  -- NOT isolation, so fail closed and leave the whole install refused. The
  -- ACL-entry test is deliberately privilege-name-free, so a right the lists
  -- here do not enumerate (MAINTAIN on 17, or anything later) is still caught
  -- without naming a keyword that an older server would reject.
  SELECT string_agg(t.name, ',' ORDER BY t.name) INTO leftover
    FROM (VALUES ('stripe_customers'), ('stripe_subscriptions'),
                 ('stripe_webhook_receipts'), ('stripe_account_leases'),
                 ('stripe_checkout_requests')) t(name)
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
    RAISE EXCEPTION 'stripe_lifecycle_table_privacy_incomplete: %', leftover;
  END IF;
END $$;

-- Link a Stripe customer to its owning user. Never called from webhook
-- metadata; only from server-resolved checkout creation. Refuses to silently
-- repoint an existing mapping to a different customer.
CREATE FUNCTION public.stripe_upsert_customer(p_user uuid, p_account text, p_mode text, p_customer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR coalesce(p_customer,'')='' THEN RAISE EXCEPTION 'stripe_customer_unavailable'; END IF;
  INSERT INTO public.stripe_customers(user_id,account_id,mode,customer_id)
    VALUES(p_user,p_account,p_mode,p_customer)
    ON CONFLICT (user_id,account_id,mode) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.stripe_customers
    WHERE user_id=p_user AND account_id=p_account AND mode=p_mode AND customer_id=p_customer)
    THEN RAISE EXCEPTION 'stripe_customer_conflict'; END IF;
END; $$;

-- The caller's OWN mapped customer for one account/mode. Returns NULL when the
-- user has no mapping; raises only on malformed input, so a transport/permission
-- failure is never mistaken for "no customer, create a new one".
CREATE FUNCTION public.stripe_owner_customer(p_user uuid, p_account text, p_mode text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_customer text;
BEGIN
  IF p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    THEN RAISE EXCEPTION 'stripe_customer_unavailable'; END IF;
  SELECT customer_id INTO v_customer FROM public.stripe_customers
    WHERE user_id=p_user AND account_id=p_account AND mode=p_mode;
  RETURN v_customer;
END; $$;

-- Ownership + current projection for an authoritative customer id. This is the
-- ONLY ownership source for webhook processing: the payload never names a user.
CREATE FUNCTION public.stripe_customer_projection(p_account text, p_mode text, p_customer text)
RETURNS TABLE(user_id uuid, subscription_id text, plan_id text, status text, observed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test') OR coalesce(p_customer,'')=''
    THEN RAISE EXCEPTION 'stripe_customer_unavailable'; END IF;
  RETURN QUERY
    SELECT c.user_id, s.subscription_id, s.plan_id, s.status, s.observed_at
      FROM public.stripe_customers c
      LEFT JOIN public.stripe_subscriptions s
        ON s.user_id=c.user_id AND s.account_id=c.account_id AND s.mode=c.mode
     WHERE c.account_id=p_account AND c.mode=p_mode AND c.customer_id=p_customer;
END; $$;

-- Acquire or renew the account/mode lease and return the new fence token.
-- Reclaims an expired or same-holder lease; refuses while another holder's
-- lease is still live (overlapping workers are serialized, not interleaved).
-- Liveness uses clock_timestamp(), so a worker that waited on the row lock is
-- judged by the wall clock at decision time, not at transaction start.
CREATE FUNCTION public.stripe_claim_account_lease(p_account text, p_mode text, p_holder text, p_ttl_seconds integer DEFAULT 30)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_fence bigint;
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test') OR coalesce(p_holder,'')=''
    OR coalesce(p_ttl_seconds,0) NOT BETWEEN 1 AND 300
    THEN RAISE EXCEPTION 'stripe_lease_unavailable'; END IF;
  INSERT INTO public.stripe_account_leases AS l (account_id,mode,fence,holder,leased_until,leased_at)
    VALUES(p_account,p_mode,1,p_holder,clock_timestamp()+p_ttl_seconds*interval '1 second',clock_timestamp())
    ON CONFLICT (account_id,mode) DO UPDATE SET
      fence=l.fence+1, holder=p_holder,
      leased_until=clock_timestamp()+p_ttl_seconds*interval '1 second', leased_at=clock_timestamp()
    WHERE l.leased_until IS NULL OR l.leased_until<clock_timestamp() OR l.holder=p_holder
    RETURNING l.fence INTO v_fence;
  IF v_fence IS NULL THEN RAISE EXCEPTION 'stripe_lease_held'; END IF;
  RETURN v_fence;
END; $$;

-- Bounded renewal of a lease this worker STILL owns. It cannot steal a live
-- lease and cannot resurrect a dead one: the fence, the holder and current
-- liveness must all still hold, and the fence is never advanced. Returns false
-- when ownership was lost, which is the caller's signal to stop writing.
CREATE FUNCTION public.stripe_renew_account_lease(p_account text, p_mode text, p_holder text, p_fence bigint, p_ttl_seconds integer DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_done boolean;
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test') OR coalesce(p_holder,'')=''
    OR p_fence IS NULL OR coalesce(p_ttl_seconds,0) NOT BETWEEN 1 AND 300
    THEN RAISE EXCEPTION 'stripe_lease_unavailable'; END IF;
  UPDATE public.stripe_account_leases
     SET leased_until=clock_timestamp()+p_ttl_seconds*interval '1 second'
   WHERE account_id=p_account AND mode=p_mode AND holder=p_holder AND fence=p_fence
     AND leased_until IS NOT NULL AND leased_until>=clock_timestamp()
   RETURNING true INTO v_done;
  RETURN coalesce(v_done,false);
END; $$;

-- Best-effort release; only the current fence holder can release, so a worker
-- that lost its lease cannot release the lease that reclaimed it.
CREATE FUNCTION public.stripe_release_account_lease(p_account text, p_mode text, p_holder text, p_fence bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.stripe_account_leases SET leased_until=NULL
    WHERE account_id=p_account AND mode=p_mode AND holder=p_holder AND fence=p_fence;
END; $$;

-- Lock the lease row and insist that THIS holder still owns it at THIS fence,
-- judged by the wall clock after the lock was granted. Every state change that
-- a crashed/superseded worker must not be able to make goes through here.
CREATE FUNCTION public.stripe_require_lease(p_account text, p_mode text, p_holder text, p_fence bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_fence bigint; v_holder text; v_until timestamptz;
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test') OR coalesce(p_holder,'')=''
    OR p_fence IS NULL THEN RAISE EXCEPTION 'stripe_lease_unavailable'; END IF;
  SELECT fence, holder, leased_until INTO v_fence, v_holder, v_until
    FROM public.stripe_account_leases
    WHERE account_id=p_account AND mode=p_mode FOR UPDATE;
  IF NOT FOUND OR v_fence IS DISTINCT FROM p_fence OR v_holder IS DISTINCT FROM p_holder
    OR v_until IS NULL OR v_until<clock_timestamp() THEN RAISE EXCEPTION 'stripe_lease_lost'; END IF;
END; $$;

-- Maximum reconciliation attempts for one receipt before it stops being
-- re-attempted automatically and waits for an operator. It is NOT discarded.
CREATE FUNCTION public.stripe_receipt_attempt_limit() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 25 $$;

-- The plans that may be sold through Stripe. freePreview is never sold and is
-- never an entitlement a projection may grant.
CREATE FUNCTION public.stripe_sellable_plan(p_plan text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_plan IN ('starter','growth','pro','agency')
$$;

-- Subscription statuses whose meaning is an EXPLICIT non-grant, and therefore
-- the only ones that may revoke their own exact mapped subscription. 'active'
-- and 'trialing' are excluded (they are grant-eligible, so a non-grant for them
-- means missing evidence) and so is every unrecognised status.
CREATE FUNCTION public.stripe_revocable_status(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_status IN ('past_due','unpaid','canceled','cancelled','incomplete',
                      'incomplete_expired','paused')
$$;

-- Durable receipt recording BEFORE any processing.
--   'recorded'  new event — process it
--   'retry'     already received but NOT completed (pending/uncertain): a
--               duplicate delivery after a crash or a lost acknowledgment must
--               be PROCESSED again, not acknowledged away
--   'completed' already applied or ignored — safe to acknowledge
--   'exhausted' retryable but past the attempt limit — kept for operator replay
-- A redelivery with a DIFFERENT body fingerprint under the same event id is a
-- conflict, not a silent duplicate.
CREATE FUNCTION public.stripe_record_webhook_receipt(p_event text, p_account text, p_mode text, p_type text, p_created bigint, p_object text, p_fingerprint text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing text; v_status text; v_attempts integer;
BEGIN
  IF coalesce(p_event,'')='' OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR coalesce(p_type,'')='' OR p_created IS NULL OR coalesce(p_object,'')=''
    OR coalesce(p_fingerprint,'')='' THEN RAISE EXCEPTION 'stripe_receipt_unavailable'; END IF;
  INSERT INTO public.stripe_webhook_receipts(event_id,account_id,mode,event_type,event_created,object_id,fingerprint)
    VALUES(p_event,p_account,p_mode,p_type,p_created,p_object,p_fingerprint)
    ON CONFLICT (event_id,account_id,mode) DO NOTHING;
  IF FOUND THEN RETURN 'recorded'; END IF;
  SELECT fingerprint, status, attempts INTO v_existing, v_status, v_attempts
    FROM public.stripe_webhook_receipts
    WHERE event_id=p_event AND account_id=p_account AND mode=p_mode;
  IF v_existing IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'stripe_receipt_conflict'; END IF;
  IF v_status IN ('applied','ignored') THEN RETURN 'completed'; END IF;
  IF v_attempts >= public.stripe_receipt_attempt_limit() THEN RETURN 'exhausted'; END IF;
  UPDATE public.stripe_webhook_receipts SET attempts=attempts+1
    WHERE event_id=p_event AND account_id=p_account AND mode=p_mode;
  RETURN 'retry';
END; $$;

-- Terminal/holding transition for a receipt that is not going through the
-- projection function. 'uncertain' stays RETRYABLE and can still be completed
-- later: an uncertain receipt transitions to 'applied' when reconciliation
-- finally succeeds. 'applied'/'ignored' are terminal and never reopened.
--
-- The LEASE is required for every transition: a worker whose lease expired
-- while a newer worker took over the account must not be able to terminally
-- acknowledge (or re-open) a receipt the new owner is processing.
CREATE FUNCTION public.stripe_finish_webhook_receipt(
  p_event text, p_account text, p_mode text, p_status text, p_holder text, p_fence bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_done boolean;
BEGIN
  IF p_status NOT IN ('applied','uncertain','ignored') THEN RAISE EXCEPTION 'stripe_receipt_unavailable'; END IF;
  PERFORM public.stripe_require_lease(p_account,p_mode,p_holder,p_fence);
  UPDATE public.stripe_webhook_receipts SET status=p_status,
    applied_at=CASE WHEN p_status='applied' THEN now() ELSE applied_at END
    WHERE event_id=p_event AND account_id=p_account AND mode=p_mode
      AND status IN ('pending','uncertain')
    RETURNING true INTO v_done;
  RETURN coalesce(v_done,false);
END; $$;

-- The largest per-invocation exclusion set a replay may carry. It mirrors the
-- application's MAX_REPLAY_LIMIT: one replay invocation processes at most that
-- many receipts, so it can never need to exclude more than that many ids. An
-- oversized list is a caller fault, not a bigger claim.
CREATE FUNCTION public.stripe_replay_exclusion_limit() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 25 $$;

-- Claim exactly ONE receipt left pending/uncertain by a crash, a lost
-- acknowledgment or a provider read failure, and count that claim as the
-- attempt it is about to become. Claiming one at a time is deliberate: a batch
-- claim charges an attempt to rows that a lease expiry or an early exit never
-- actually processed, and 25 of them cannot share one 30-second lease.
-- SKIP LOCKED keeps two workers from claiming the same receipt.
--
-- `p_exclude` is the caller's PER-INVOCATION exclusion set: the event ids this
-- replay invocation has already processed. Without it the oldest retryable
-- receipt is picked every pass, so one transient provider outage would spend a
-- whole run (and a whole slice of the attempt budget) on the SAME receipt while
-- newer pending rows never got a turn. Excluded rows are not read, not locked
-- and not charged an attempt — only the row actually claimed is. Exclusion is
-- per invocation by construction: a later invocation passes an empty set and
-- the receipt is retryable again, so nothing is discarded or acknowledged away.
--
-- The set is validated rather than trusted: one dimension, within the bound,
-- no NULL or blank id, no duplicates. Scope is unchanged — an id only ever
-- matches within this account and mode.
CREATE FUNCTION public.stripe_claim_replay_receipt(p_account text, p_mode text, p_exclude text[] DEFAULT NULL)
RETURNS TABLE(event_id text, event_type text, object_id text, event_created bigint, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_exclude text[];
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    THEN RAISE EXCEPTION 'stripe_replay_unavailable'; END IF;
  v_exclude := coalesce(p_exclude, ARRAY[]::text[]);
  IF coalesce(array_ndims(v_exclude),1) <> 1
    OR cardinality(v_exclude) > public.stripe_replay_exclusion_limit()
    OR EXISTS (SELECT 1 FROM unnest(v_exclude) e WHERE coalesce(e,'')='')
    OR (SELECT count(DISTINCT e) FROM unnest(v_exclude) e) <> cardinality(v_exclude)
    THEN RAISE EXCEPTION 'stripe_replay_exclusion_invalid'; END IF;
  RETURN QUERY
    WITH claimed AS (
      SELECT r.event_id FROM public.stripe_webhook_receipts r
       WHERE r.account_id=p_account AND r.mode=p_mode
         AND r.status IN ('pending','uncertain')
         AND r.attempts < public.stripe_receipt_attempt_limit()
         AND NOT (r.event_id = ANY(v_exclude))
       ORDER BY r.received_at, r.event_id
       LIMIT 1
       FOR UPDATE SKIP LOCKED
    )
    UPDATE public.stripe_webhook_receipts r SET attempts=r.attempts+1
      WHERE r.account_id=p_account AND r.mode=p_mode
        AND r.event_id IN (SELECT c.event_id FROM claimed c)
      RETURNING r.event_id, r.event_type, r.object_id, r.event_created, r.attempts;
END; $$;

/* ---------------------------------------------------------------------------
   Caller-initiated checkout / portal requests
   ------------------------------------------------------------------------ */

-- Claim or idempotently RESUME a request. An existing request_id resumes only
-- when it belongs to the same owner, account, mode, kind AND selected
-- parameters; anything else is a mismatch, never a silent takeover. A second
-- non-terminal request of the same kind is refused by the partial unique index,
-- so a fresh requestId or a re-navigation cannot open a second Checkout while
-- one is still open or still uncertain.
CREATE FUNCTION public.stripe_claim_checkout_request(
  p_request uuid, p_user uuid, p_account text, p_mode text, p_kind text, p_fingerprint text)
RETURNS TABLE(status text, session_id text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.stripe_checkout_requests;
BEGIN
  IF p_request IS NULL OR p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR p_kind NOT IN ('checkout','portal') OR coalesce(p_fingerprint,'')=''
    THEN RAISE EXCEPTION 'stripe_checkout_unavailable'; END IF;
  SELECT * INTO v_row FROM public.stripe_checkout_requests WHERE request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF v_row.user_id<>p_user OR v_row.account_id<>p_account OR v_row.mode<>p_mode
      OR v_row.kind<>p_kind OR v_row.params_fingerprint<>p_fingerprint
      THEN RAISE EXCEPTION 'stripe_checkout_mismatch'; END IF;
    RETURN QUERY SELECT v_row.status, v_row.session_id, v_row.created_at;
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.stripe_checkout_requests(request_id,user_id,account_id,mode,kind,params_fingerprint)
      VALUES(p_request,p_user,p_account,p_mode,p_kind,p_fingerprint);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'stripe_checkout_open';
  END;
  RETURN QUERY SELECT 'pending'::text, NULL::text, now();
END; $$;

-- Read one request WITHOUT claiming or resuming it: an OPERATOR-facing read for
-- inspecting a fenced request, and the read the migration tests assert scope
-- with. The application itself always learns the state from
-- stripe_claim_checkout_request (which additionally pins the parameters), so
-- this function is deliberately not on the caller path. Scoped to the
-- owner/account/mode/kind: no row is returned for anyone else's request.
CREATE FUNCTION public.stripe_read_checkout_request(
  p_request uuid, p_user uuid, p_account text, p_mode text, p_kind text)
RETURNS TABLE(status text, session_id text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
BEGIN
  IF p_request IS NULL OR p_user IS NULL OR coalesce(p_account,'')='' OR p_mode NOT IN ('live','test')
    OR p_kind NOT IN ('checkout','portal') THEN RAISE EXCEPTION 'stripe_checkout_unavailable'; END IF;
  RETURN QUERY
    SELECT r.status, r.session_id, r.created_at FROM public.stripe_checkout_requests r
     WHERE r.request_id=p_request AND r.user_id=p_user AND r.account_id=p_account
       AND r.mode=p_mode AND r.kind=p_kind;
END; $$;

-- A created Checkout Session is OPEN, not completed: access is granted only by
-- a reconciled webhook projection, never by session creation or a successful
-- return URL. Fenced to the owning request's owner/account/mode/kind. A fenced
-- (aged, unknown-outcome) request may be opened by recovery once an
-- authoritative read has actually found its session.
CREATE FUNCTION public.stripe_open_checkout_request(
  p_request uuid, p_user uuid, p_account text, p_mode text, p_kind text, p_session text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_done boolean;
BEGIN
  IF coalesce(p_session,'')='' THEN RAISE EXCEPTION 'stripe_checkout_unavailable'; END IF;
  UPDATE public.stripe_checkout_requests SET status='open', session_id=p_session, updated_at=now()
    WHERE request_id=p_request AND user_id=p_user AND account_id=p_account AND mode=p_mode
      AND kind=p_kind AND status IN ('pending','open','fenced')
      AND (session_id IS NULL OR session_id=p_session)
    RETURNING true INTO v_done;
  RETURN coalesce(v_done,false);
END; $$;

-- Hold an ambiguous attempt that is older than Stripe's idempotency retention.
-- NON-TERMINAL: the unique slot stays taken, so no second subscription can be
-- started, and the request can still be settled later by an authoritative
-- read. Age by itself never releases a slot and never fails a request.
CREATE FUNCTION public.stripe_fence_checkout_request(
  p_request uuid, p_user uuid, p_account text, p_mode text, p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_done boolean;
BEGIN
  UPDATE public.stripe_checkout_requests SET status='fenced', updated_at=now()
    WHERE request_id=p_request AND user_id=p_user AND account_id=p_account AND mode=p_mode
      AND kind=p_kind AND status IN ('pending','open','fenced')
    RETURNING true INTO v_done;
  RETURN coalesce(v_done,false);
END; $$;

-- Terminal settlement of a request: 'completed' (reconciled), 'expired' (the
-- provider itself reported the session expired) or 'failed' (an authoritative
-- read proved no session exists, or the attempt was refused before any
-- provider mutation). `p_session` pins the settlement to the exact session the
-- decision was made from; passing NULL is only for a request that never
-- reached a session.
CREATE FUNCTION public.stripe_settle_checkout_request(
  p_request uuid, p_user uuid, p_account text, p_mode text, p_kind text, p_status text,
  p_session text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_done boolean;
BEGIN
  IF p_status NOT IN ('completed','expired','failed') THEN RAISE EXCEPTION 'stripe_checkout_unavailable'; END IF;
  UPDATE public.stripe_checkout_requests SET status=p_status, updated_at=now(),
    completed_at=CASE WHEN p_status='completed' THEN now() ELSE completed_at END
    WHERE request_id=p_request AND user_id=p_user AND account_id=p_account AND mode=p_mode
      AND kind=p_kind AND status IN ('pending','open','fenced')
      AND (p_session IS NULL OR session_id=p_session)
    RETURNING true INTO v_done;
  RETURN coalesce(v_done,false);
END; $$;

-- EXPIRY driven by an authoritative webhook read, under the account lease.
-- Ownership of the request comes from the server-side customer mapping, never
-- from session metadata: the caller passes the user it resolved from
-- stripe_customers, and every one of request id, owner, account, mode,
-- kind='checkout' and the exact session id must match, so an unrelated event
-- cannot release another request's slot. A COMPLETED session is never settled
-- here — completion is committed atomically with the projection below.
CREATE FUNCTION public.stripe_expire_checkout_session(
  p_request uuid, p_user uuid, p_account text, p_mode text, p_session text,
  p_holder text, p_fence bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_done boolean;
BEGIN
  IF p_request IS NULL OR p_user IS NULL OR coalesce(p_session,'')=''
    THEN RAISE EXCEPTION 'stripe_checkout_unavailable'; END IF;
  PERFORM public.stripe_require_lease(p_account,p_mode,p_holder,p_fence);
  UPDATE public.stripe_checkout_requests SET status='expired', updated_at=now()
    WHERE request_id=p_request AND user_id=p_user AND account_id=p_account AND mode=p_mode
      AND kind='checkout' AND session_id=p_session AND status IN ('pending','open','fenced')
    RETURNING true INTO v_done;
  RETURN coalesce(v_done,false);
END; $$;

/* ---------------------------------------------------------------------------
   The single atomic write path
   ------------------------------------------------------------------------ */

-- Current-subscription mapping, entitlement, seat quantity, the settlement of
-- the originating Checkout request and the receipt completion, all in ONE
-- transaction.
--
-- Preconditions, all refused with an exception rather than a partial write:
--   * the lease row must still name THIS holder, at THIS fence, and still be
--     live by the wall clock after the lock was granted (a reclaimed, released
--     or expired lease loses);
--   * a receipt for this event/account/mode must exist and still be retryable
--     ('pending' or 'uncertain') — there is no apply without a durable receipt,
--     and an already 'applied'/'ignored' receipt cannot be re-applied.
--
-- Ownership comes ONLY from the pre-existing stripe_customers mapping.
-- Replacement: a subscription id other than the stored current one applies only
-- when the caller names the stored id in p_replaces AND observed the provider
-- strictly later than the stored observation. Everything else is superseded.
--
-- THE GRANT IS RE-DERIVED HERE. `p_grants` is only a request; it is granted
-- only if the projected facts independently justify it. A claimed grant the
-- database cannot confirm is refused outright ('grant_unverified', receipt left
-- retryable) rather than quietly downgraded, because a downgrade of a forged
-- "active" claim would be a revoke nobody asked for.
--
-- Entitlements are touched ONLY in live mode, only for the exact mapped
-- subscription, and never when the row is manually granted/comped — including
-- when provider is already 'stripe'. The write is a single conditional
-- statement, so a concurrent manual override either wins or loses atomically.
CREATE FUNCTION public.stripe_apply_subscription_projection(
  p_account text, p_mode text, p_holder text, p_fence bigint, p_event_id text,
  p_customer text, p_subscription text, p_replaces text, p_plan_id text,
  p_status text, p_seat_quantity integer, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_invoice_paid boolean, p_grants boolean,
  p_observed_at timestamptz, p_event_created bigint,
  p_session_request uuid DEFAULT NULL, p_session_id text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_receipt text; v_user uuid; v_current text; v_observed timestamptz;
  v_written boolean; v_outcome text; v_verified boolean; v_now timestamptz;
BEGIN
  IF coalesce(p_account,'')='' OR p_mode NOT IN ('live','test') OR coalesce(p_holder,'')=''
    OR p_fence IS NULL OR coalesce(p_event_id,'')='' OR coalesce(p_customer,'')=''
    OR coalesce(p_subscription,'')='' OR p_observed_at IS NULL
    THEN RAISE EXCEPTION 'stripe_projection_unavailable'; END IF;

  PERFORM public.stripe_require_lease(p_account,p_mode,p_holder,p_fence);

  SELECT status INTO v_receipt FROM public.stripe_webhook_receipts
    WHERE event_id=p_event_id AND account_id=p_account AND mode=p_mode FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stripe_receipt_missing'; END IF;
  IF v_receipt NOT IN ('pending','uncertain') THEN RAISE EXCEPTION 'stripe_receipt_settled'; END IF;

  -- INDEPENDENT grant verification, against the database wall clock. Nothing
  -- about the caller's claim is reused except the facts it is projecting.
  v_now := clock_timestamp();
  v_verified := coalesce(p_grants,false)
    AND public.stripe_sellable_plan(p_plan_id)
    AND p_status IN ('active','trialing')
    AND coalesce(p_invoice_paid,false)
    AND p_period_end IS NOT NULL
    AND isfinite(p_period_end)
    AND p_period_end > v_now
    AND p_period_end < v_now + interval '5 years';
  IF coalesce(p_grants,false) AND NOT v_verified THEN
    PERFORM public.stripe_finish_webhook_receipt(p_event_id,p_account,p_mode,'uncertain',p_holder,p_fence);
    RETURN 'grant_unverified';
  END IF;

  SELECT user_id INTO v_user FROM public.stripe_customers
    WHERE account_id=p_account AND mode=p_mode AND customer_id=p_customer;
  IF NOT FOUND THEN
    PERFORM public.stripe_finish_webhook_receipt(p_event_id,p_account,p_mode,'uncertain',p_holder,p_fence);
    RETURN 'unknown_customer';
  END IF;

  SELECT subscription_id, observed_at INTO v_current, v_observed
    FROM public.stripe_subscriptions
    WHERE user_id=v_user AND account_id=p_account AND mode=p_mode FOR UPDATE;

  IF v_current IS NULL THEN
    IF p_replaces IS NOT NULL THEN
      PERFORM public.stripe_finish_webhook_receipt(p_event_id,p_account,p_mode,'ignored',p_holder,p_fence);
      RETURN 'superseded_ignored';
    END IF;
  ELSIF v_current = p_subscription THEN
    -- Same subscription: a stale re-read must never overwrite a newer one.
    IF p_observed_at < v_observed THEN
      PERFORM public.stripe_finish_webhook_receipt(p_event_id,p_account,p_mode,'ignored',p_holder,p_fence);
      RETURN 'stale_ignored';
    END IF;
  ELSE
    -- Different subscription: only an explicitly verified, strictly newer
    -- replacement may take over the current mapping.
    IF p_replaces IS DISTINCT FROM v_current OR p_observed_at <= v_observed THEN
      PERFORM public.stripe_finish_webhook_receipt(p_event_id,p_account,p_mode,'ignored',p_holder,p_fence);
      RETURN 'superseded_ignored';
    END IF;
  END IF;

  INSERT INTO public.stripe_subscriptions AS s (
    user_id,account_id,mode,subscription_id,plan_id,status,seat_quantity,
    current_period_end,cancel_at_period_end,latest_invoice_paid,observed_at,
    last_event_created,updated_at)
  VALUES(
    v_user,p_account,p_mode,p_subscription,p_plan_id,p_status,coalesce(p_seat_quantity,0),
    p_period_end,coalesce(p_cancel_at_period_end,false),coalesce(p_invoice_paid,false),
    p_observed_at,coalesce(p_event_created,0),now())
  ON CONFLICT (user_id,account_id,mode) DO UPDATE SET
    subscription_id=excluded.subscription_id, plan_id=excluded.plan_id, status=excluded.status,
    seat_quantity=excluded.seat_quantity, current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    latest_invoice_paid=excluded.latest_invoice_paid, observed_at=excluded.observed_at,
    last_event_created=greatest(s.last_event_created,excluded.last_event_created),
    updated_at=now();

  v_outcome := CASE WHEN v_verified THEN 'applied_grant' ELSE 'applied_no_grant' END;

  -- MODE ISOLATION: test-mode activity stops here. No entitlement row is read
  -- or written, so a production entitlement and its limits are untouched.
  IF p_mode='live' THEN
    IF v_verified THEN
      INSERT INTO public.entitlements AS e (
        user_id,plan_id,status,current_period_end,cancel_at_period_end,provider,
        provider_customer_id,provider_subscription_id,updated_at)
      VALUES(v_user,p_plan_id,'active',p_period_end,coalesce(p_cancel_at_period_end,false),
        'stripe',p_customer,p_subscription,now())
      ON CONFLICT (user_id) DO UPDATE SET
        plan_id=excluded.plan_id, status='active', current_period_end=excluded.current_period_end,
        cancel_at_period_end=excluded.cancel_at_period_end, provider='stripe',
        provider_customer_id=excluded.provider_customer_id,
        provider_subscription_id=excluded.provider_subscription_id, updated_at=now()
      -- Manual beta/comped access is preserved even when provider is already
      -- 'stripe'; a legacy provider that currently grants paid access is
      -- preserved too (Stripe may only take over a non-granting row).
      WHERE e.status NOT IN ('manualBeta','manualComped')
        AND (e.provider='stripe' OR e.status<>'active')
      RETURNING true INTO v_written;
      IF NOT coalesce(v_written,false) THEN v_outcome := 'grant_withheld_manual'; END IF;
    ELSIF public.stripe_revocable_status(p_status) THEN
      -- Only the exact mapped subscription may revoke, only a Stripe row, and
      -- only from a status whose meaning is explicit. An unrecognised status is
      -- not evidence of cancellation, so it changes no entitlement at all.
      UPDATE public.entitlements SET plan_id='freePreview',
        status=CASE WHEN p_status='past_due' THEN 'pastDue'
                    WHEN p_status IN ('canceled','cancelled','unpaid','incomplete_expired') THEN 'cancelled'
                    ELSE 'freePreview' END,
        current_period_end=NULL, cancel_at_period_end=false, updated_at=now()
        WHERE user_id=v_user AND provider='stripe'
          AND provider_subscription_id=p_subscription
          AND status NOT IN ('manualBeta','manualComped')
        RETURNING true INTO v_written;
      IF NOT coalesce(v_written,false) THEN v_outcome := 'revoke_not_applicable'; END IF;
    ELSE
      v_outcome := 'revoke_not_applicable';
    END IF;
  END IF;

  -- The Checkout request that produced this subscription is settled in the SAME
  -- transaction as the projection and the receipt, so a crash can never leave
  -- "granted but still blocked" or "released but never projected". Identity is
  -- the server-resolved owner plus the exact request, session, account and mode.
  IF p_session_request IS NOT NULL AND coalesce(p_session_id,'')<>'' THEN
    UPDATE public.stripe_checkout_requests
       SET status='completed', updated_at=now(), completed_at=now()
     WHERE request_id=p_session_request AND user_id=v_user AND account_id=p_account
       AND mode=p_mode AND kind='checkout' AND session_id=p_session_id
       AND status IN ('pending','open','fenced');
  END IF;

  IF NOT public.stripe_finish_webhook_receipt(p_event_id,p_account,p_mode,'applied',p_holder,p_fence)
    THEN RAISE EXCEPTION 'stripe_receipt_not_completed'; END IF;
  RETURN v_outcome;
END; $$;

/* ---------------------------------------------------------------------------
   Purchased seat reads
   ------------------------------------------------------------------------ */

-- Extra PURCHASED working seats, read only from the authoritative LIVE
-- projection and only when the entitlement actually owns that subscription and
-- its billing period is still current. Everything else — test mode, manual
-- beta/comped, free, legacy providers, a lapsed period, an unpaid invoice,
-- a plan that disagrees with the projection — yields 0 extra seats, so the plan
-- bundle from the server stays in charge.
--
-- BOTH periods must be present, FINITE and still in the future, and the two
-- requirements are expressed identically on purpose. A malformed period is not
-- an unlimited grant: an absent, infinite or elapsed period on either row — the
-- projection or the entitlement that owns it — yields 0, exactly as a lapsed
-- one does. (A period-less entitlement row previously passed this read, which
-- is the review finding this clause now closes; the grant predicate in
-- stripe_apply_subscription_projection already refuses to WRITE such a row, so
-- the only way to hold one is a manual or legacy edit, which must not pay out.)
CREATE FUNCTION public.stripe_purchased_working_seats(p_user uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
  SELECT coalesce((
    SELECT s.seat_quantity
      FROM public.stripe_subscriptions s
      JOIN public.entitlements e ON e.user_id=s.user_id
     WHERE s.user_id=p_user
       AND s.mode='live'
       AND s.status IN ('active','trialing')
       AND s.latest_invoice_paid
       AND s.current_period_end IS NOT NULL
       AND isfinite(s.current_period_end)
       AND s.current_period_end>now()
       AND e.provider='stripe'
       AND e.status='active'
       AND e.plan_id=s.plan_id
       AND e.provider_subscription_id=s.subscription_id
       AND e.current_period_end IS NOT NULL
       AND isfinite(e.current_period_end)
       AND e.current_period_end>now()
     LIMIT 1), 0);
$$;

REVOKE ALL ON FUNCTION public.stripe_upsert_customer(uuid,text,text,text),
  public.stripe_owner_customer(uuid,text,text),
  public.stripe_customer_projection(text,text,text),
  public.stripe_claim_account_lease(text,text,text,integer),
  public.stripe_renew_account_lease(text,text,text,bigint,integer),
  public.stripe_release_account_lease(text,text,text,bigint),
  public.stripe_require_lease(text,text,text,bigint),
  public.stripe_receipt_attempt_limit(),
  public.stripe_replay_exclusion_limit(),
  public.stripe_sellable_plan(text),
  public.stripe_revocable_status(text),
  public.stripe_record_webhook_receipt(text,text,text,text,bigint,text,text),
  public.stripe_finish_webhook_receipt(text,text,text,text,text,bigint),
  public.stripe_claim_replay_receipt(text,text,text[]),
  public.stripe_claim_checkout_request(uuid,uuid,text,text,text,text),
  public.stripe_read_checkout_request(uuid,uuid,text,text,text),
  public.stripe_open_checkout_request(uuid,uuid,text,text,text,text),
  public.stripe_fence_checkout_request(uuid,uuid,text,text,text),
  public.stripe_settle_checkout_request(uuid,uuid,text,text,text,text,text),
  public.stripe_expire_checkout_session(uuid,uuid,text,text,text,text,bigint),
  public.stripe_purchased_working_seats(uuid),
  public.stripe_apply_subscription_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_upsert_customer(uuid,text,text,text),
  public.stripe_owner_customer(uuid,text,text),
  public.stripe_customer_projection(text,text,text),
  public.stripe_claim_account_lease(text,text,text,integer),
  public.stripe_renew_account_lease(text,text,text,bigint,integer),
  public.stripe_release_account_lease(text,text,text,bigint),
  public.stripe_require_lease(text,text,text,bigint),
  public.stripe_receipt_attempt_limit(),
  public.stripe_replay_exclusion_limit(),
  public.stripe_sellable_plan(text),
  public.stripe_revocable_status(text),
  public.stripe_record_webhook_receipt(text,text,text,text,bigint,text,text),
  public.stripe_finish_webhook_receipt(text,text,text,text,text,bigint),
  public.stripe_claim_replay_receipt(text,text,text[]),
  public.stripe_claim_checkout_request(uuid,uuid,text,text,text,text),
  public.stripe_read_checkout_request(uuid,uuid,text,text,text),
  public.stripe_open_checkout_request(uuid,uuid,text,text,text,text),
  public.stripe_fence_checkout_request(uuid,uuid,text,text,text),
  public.stripe_settle_checkout_request(uuid,uuid,text,text,text,text,text),
  public.stripe_expire_checkout_session(uuid,uuid,text,text,text,text,bigint),
  public.stripe_purchased_working_seats(uuid),
  public.stripe_apply_subscription_projection(text,text,text,bigint,text,text,text,text,text,text,integer,timestamptz,boolean,boolean,boolean,timestamptz,bigint,uuid,text)
  TO service_role;
