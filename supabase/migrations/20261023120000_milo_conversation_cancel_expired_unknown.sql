-- CANDIDATE ONLY — not applied. Review and apply as its own packet.
--
-- DEFECT (reproduced on released SQL, 23 October 2026; cv-evidence):
--   cancel_milo_conversation_turn (20260913120000, never redefined) set ANY 'running'
--   row to 'cancelled', including one whose lease had already expired. The turn view
--   presents that row as 'unknown' (20260914120000: running AND lease_until<=now), so
--   a Stop from a stale view or a direct cancel call rewrote an uncertain outcome
--   (the executor may have run and been charged, or lost its outcome write) into a
--   definite "Further work cancelled". Repro: claim, expire lease, view 'unknown',
--   cancel returns and persists 'cancelled'.
--
-- FIX (only this function): an expired-lease running row is NOT cancelled. Nothing is
--   written and the unchanged view ('unknown') is returned, keeping uncertainty
--   monotonic. pending and live-lease running still become 'cancelled'; every other
--   state is returned unchanged, as before. Access/ownership checks, NOWAIT locks,
--   error names, return shape and grants are identical. Nothing is claimed, resumed
--   or replayed; the expired attempt still cannot advance (its lease is expired).
CREATE OR REPLACE FUNCTION public.cancel_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE;
BEGIN
  PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF current_turn.state='pending'
    OR (current_turn.state='running' AND current_turn.lease_until>clock_timestamp()) THEN
    UPDATE public.milo_conversation_turns SET state='cancelled',updated_at=clock_timestamp() WHERE turn_id=p_turn RETURNING * INTO current_turn;
  END IF;
  RETURN public.milo_conversation_turn_view(current_turn);
END; $$;
REVOKE ALL ON FUNCTION public.cancel_milo_conversation_turn(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_milo_conversation_turn(uuid,uuid,text,uuid,uuid) TO service_role;
