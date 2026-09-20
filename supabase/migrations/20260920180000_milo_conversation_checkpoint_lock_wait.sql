-- CANDIDATE ONLY — not part of the applied release set until integration applies it.
-- Executor-only bounded lock WAIT for Milo conversation checkpoints.
--
-- ROOT CAUSE (structurally confirmed from released SQL; the specific live lock-holder
-- is a HYPOTHESIS, not captured):
--   Every executor checkpoint RPC (claim / advance / check_execution) calls
--   `assert_milo_conversation_access`, which takes `workspace_meta … FOR SHARE NOWAIT`
--   (20260913120000 L52), and the write RPCs then take the conversation/turn rows
--   `FOR UPDATE NOWAIT`. Many OWNER workspace writes hold `workspace_meta` FOR UPDATE
--   for their transaction — `save_project_team_edit` (20260911050000), the generic
--   workspace save (20260726120000), content-write rev-bump triggers (20260910180000 /
--   20260911105000), draft/approval paths. A NOWAIT request fails INSTANTLY (55P03)
--   whenever such a write is mid-flight; the owner's live-view read
--   (`read_milo_conversation`) also holds the conversation row FOR SHARE, conflicting
--   with the write RPCs' FOR UPDATE. Client-side NOWAIT retries cannot wait out another
--   transaction's lock. On the 20 Sep turn the diagnostic recorded stage `reply_model`
--   / 55P03 with no `responding` event — CONSISTENT WITH a pre-model status-checkpoint
--   failure, but the diagnostic does not pinpoint the exact substage and does not prove
--   "retries exhausted"; the lock-holder identity was not captured.
--
-- FIX (minimal executor-only boundary; browser path untouched):
--   A new `assert_milo_conversation_execution` mirrors `assert_milo_conversation_access`
--   EXACTLY but waits for `workspace_meta` / `project_team_members` (FOR SHARE, no
--   NOWAIT). The three executor RPCs are redefined FROM THEIR LATEST released bodies —
--   `claim` from the dispatch migration (20260913160000: the release-gated start
--   window, `enabled` control, `pg_try_advisory_xact_lock` admission and the global-8 /
--   actor-2 concurrency gates are all PRESERVED verbatim), `advance` and `check` from
--   20260913120000 — changing ONLY: call the new assert; take conversation/turn rows
--   FOR UPDATE / FOR SHARE (no NOWAIT); run under a bounded `SET lock_timeout`.
--
-- BOUNDED-TIME REASONING (corrected): `lock_timeout` is PER LOCK ACQUISITION, not a
--   whole-RPC budget. An RPC makes several sequential blocking acquisitions
--   (workspace_meta, [project_team_members for a collaborator], the conversation row,
--   the turn row — auth.users stays NOWAIT via the unchanged assert_project_team_account,
--   which is rare-contention). Worst case is the SUM: at most 4 blocking waits, so with
--   `lock_timeout = 1500ms` the per-RPC worst case is ~6 s — kept under the 10 s per-RPC
--   `teamCall` timeout and the terminal-cleanup budget with margin. The realistic case
--   is a single contended lock (~≤1.5 s): Postgres grants a queued request as soon as
--   the current holder commits (new requests queue behind it), so a brief autosave/
--   live-view holder is waited out rather than failing instantly. If a lock is held
--   past the timeout the statement still raises 55P03 and the unchanged bounded,
--   abort-aware client retry is the secondary net (no retry count increased).
--
-- DEADLOCK (accurate, not overclaimed): converting NOWAIT→blocking introduces the
--   possibility of lock waits that NOWAIT precluded. The account-first lock ORDER is
--   preserved (workspace_meta → auth.users → project_team_members → conversation →
--   turn), consistent with every other function, which avoids the obvious ordered-lock
--   cycles; and `lock_timeout` (plus Postgres deadlock detection) BOUNDS and BREAKS any
--   residual cycle with a 55P03 rather than an unbounded hang. This is a bounded,
--   self-breaking guarantee — NOT a proof of deadlock-freedom.
--
-- PRESERVED: identical authorization/revocation/account predicates and
--   'milo_conversation_unavailable' raises; the claim's dispatch-window / enabled /
--   advisory-admission / concurrency gates; advance's attempt-lease, expected-count and
--   idempotency guards. No model/tool/claim work is added or replayed; no budget/refund.
--   The browser RPCs (read/list/begin/cancel/resume/enqueue) and
--   `assert_milo_conversation_access` keep their NOWAIT / fail-fast behaviour, so the
--   PR147 browser read-retry and read deadline are unaffected.

-- Executor-only access assert: identical checks to assert_milo_conversation_access, but
-- the frequently-contended owner locks WAIT (bounded by lock_timeout) instead of failing
-- instantly. Internal helper: not granted to any client role; callable only by the
-- same-owner SECURITY DEFINER executor RPCs. auth.users stays fail-fast via the unchanged
-- assert_project_team_account (rare contention, not the observed contender).
CREATE FUNCTION public.assert_milo_conversation_execution(p_actor uuid,p_owner uuid,p_project text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE membership_revision bigint:=1;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$'
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR (p_actor<>p_owner AND NOT EXISTS(SELECT 1 FROM public.project_team_members WHERE actor_id=p_actor AND owner_id=p_owner AND project_id=p_project AND active AND (expires_at IS NULL OR expires_at>clock_timestamp())))
    THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_owner FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  PERFORM public.assert_project_team_account(p_owner);
  IF p_actor<>p_owner THEN
    PERFORM public.assert_project_team_account(p_actor);
    SELECT revision INTO membership_revision FROM public.project_team_members
      WHERE actor_id=p_actor AND owner_id=p_owner AND project_id=p_project AND active
        AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  END IF;
  PERFORM 1 FROM public.workspace_entities WHERE user_id=p_owner AND collection='projects' AND entity_id=p_project;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  RETURN membership_revision;
END; $$;
REVOKE ALL ON FUNCTION public.assert_milo_conversation_execution(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- claim: redefined FROM 20260913160000 (dispatch). ALL dispatch-window / enabled /
-- advisory-admission / concurrency gates preserved verbatim; only the assert call and
-- the two row locks (NOWAIT→blocking) and the bounded lock_timeout change.
CREATE OR REPLACE FUNCTION public.claim_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  membership_revision:=public.assert_milo_conversation_execution(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE;
  IF NOT FOUND OR current_turn.membership_revision<>membership_revision THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF current_turn.state<>'pending' OR current_turn.dispatch_until IS NULL OR current_turn.dispatch_until<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM public.milo_conversation_dispatch_control WHERE singleton AND enabled)
    THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  -- Separate statements are intentional: count with a fresh READ COMMITTED
  -- snapshot after acquiring admission, never from the lock expression's snapshot.
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-execution-capacity'),0)
    THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  IF (SELECT count(*) FROM public.milo_conversation_turns WHERE state='running' AND lease_until>clock_timestamp())>=8
    OR (SELECT count(*) FROM public.milo_conversation_turns WHERE actor_id=p_actor AND state='running' AND lease_until>clock_timestamp())>=2
    THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  UPDATE public.milo_conversation_turns SET state='running',attempt_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
    WHERE turn_id=p_turn RETURNING * INTO current_turn;
  RETURN jsonb_build_object('acquired',true,'attemptId',current_turn.attempt_id,'turn',public.milo_conversation_turn_view(current_turn));
END; $$;

-- advance: redefined FROM 20260913120000 (never redefined since). Only the assert call,
-- the two row locks (NOWAIT→blocking) and the bounded lock_timeout change; the
-- attempt-lease / expected-count / idempotency guards are byte-for-byte preserved.
CREATE OR REPLACE FUNCTION public.advance_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_attempt uuid,p_expected integer,p_events jsonb,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  IF p_expected IS NULL OR p_expected<0 OR p_expected>24 OR p_events IS NULL OR jsonb_typeof(p_events)<>'array'
    OR jsonb_array_length(p_events)<1 OR jsonb_array_length(p_events)>24 OR octet_length(p_events::text)>120000
    OR p_state IS NULL OR p_state NOT IN ('running','completed','failed','unknown') THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  membership_revision:=public.assert_milo_conversation_execution(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE;
  IF NOT FOUND OR current_turn.membership_revision<>membership_revision THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF p_attempt IS NULL OR current_turn.attempt_id IS DISTINCT FROM p_attempt OR current_turn.state<>'running'
    OR current_turn.lease_until<=clock_timestamp() OR jsonb_array_length(current_turn.events)<>p_expected
    THEN RAISE EXCEPTION 'milo_conversation_conflict'; END IF;
  UPDATE public.milo_conversation_turns SET events=events||p_events,state=p_state,updated_at=clock_timestamp()
    WHERE turn_id=p_turn RETURNING * INTO current_turn;
  UPDATE public.milo_conversations SET updated_at=clock_timestamp() WHERE conversation_id=p_conversation;
  RETURN public.milo_conversation_turn_view(current_turn);
END; $$;

-- check_execution: redefined FROM 20260913120000 (never redefined since). Only the
-- assert call, the two row locks (NOWAIT→blocking) and the bounded lock_timeout change.
CREATE OR REPLACE FUNCTION public.check_milo_conversation_execution(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_attempt uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE current_membership_revision bigint;
BEGIN
  current_membership_revision:=public.assert_milo_conversation_execution(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  PERFORM 1 FROM public.milo_conversation_turns WHERE turn_id=p_turn AND conversation_id=p_conversation AND actor_id=p_actor
    AND attempt_id=p_attempt AND state='running' AND lease_until>clock_timestamp()
    AND milo_conversation_turns.membership_revision=current_membership_revision FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.claim_milo_conversation_turn(uuid,uuid,text,uuid,uuid),public.advance_milo_conversation_turn(uuid,uuid,text,uuid,uuid,uuid,integer,jsonb,text),public.check_milo_conversation_execution(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_milo_conversation_turn(uuid,uuid,text,uuid,uuid),public.advance_milo_conversation_turn(uuid,uuid,text,uuid,uuid,uuid,integer,jsonb,text),public.check_milo_conversation_execution(uuid,uuid,text,uuid,uuid,uuid) TO service_role;
