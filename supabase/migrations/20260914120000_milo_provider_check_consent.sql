-- Candidate only. Requires 20260913120000_milo_conversations.sql.
-- Adds a separate, immutable per-turn consent for provider-backed checks started from
-- chat (Google index inspection, PageSpeed lab test, one site crawl). Owner decision
-- 14 September: current project members may consent; the owning account's existing
-- connection, reservations and quotas apply. Local security review (14 September):
-- only working members (editors and reviewers) and the owner may consent, because the
-- checks spend the owner's quota and viewer seats are free. No provider call, scheduler
-- or spending is enabled here.
ALTER TABLE public.milo_conversation_turns
  ADD COLUMN allow_provider_checks boolean NOT NULL DEFAULT false;

-- Private projection: claim tokens never enter browser reads.
CREATE OR REPLACE FUNCTION public.milo_conversation_turn_view(t public.milo_conversation_turns)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('turnId',t.turn_id,'ordinal',t.ordinal,'body',t.body,'locale',t.locale,'allowDraftGeneration',t.allow_draft_generation,
    'allowProviderChecks',t.allow_provider_checks,
    'state',CASE WHEN t.state='running' AND t.lease_until<=clock_timestamp() THEN 'unknown' ELSE t.state END,
    'events',t.events,'createdAt',t.created_at,'updatedAt',t.updated_at)
$$;
REVOKE ALL ON FUNCTION public.milo_conversation_turn_view(public.milo_conversation_turns) FROM PUBLIC,anon,authenticated,service_role;

-- Same behavior as the candidate definition plus p_allow_checks. A replay must match
-- both consent choices exactly; neither can be added to an existing request later.
DROP FUNCTION public.begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text,boolean);
CREATE FUNCTION public.begin_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_body text,p_locale text,p_allow_generation boolean DEFAULT false,p_allow_checks boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conversation public.milo_conversations%ROWTYPE; previous public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  IF p_conversation IS NULL OR p_turn IS NULL OR p_body IS NULL OR length(btrim(p_body))=0 OR octet_length(p_body)>8000
    OR p_locale IS NULL OR p_locale !~ '^[a-z]{2}$' OR p_allow_generation IS NULL OR p_allow_checks IS NULL
    OR (p_allow_generation AND p_actor IS DISTINCT FROM p_owner) THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  -- Serialize actor-wide creation/rate checks across all clients and projects.
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-conversation-actor'),hashtext(p_actor::text)) THEN RAISE EXCEPTION 'milo_conversation_busy' USING ERRCODE='55P03'; END IF;
  membership_revision:=public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  -- Provider checks run on the owner's account: a viewer may not commit that quota.
  IF p_allow_checks AND p_actor IS DISTINCT FROM p_owner AND NOT EXISTS(
      SELECT 1 FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor
        AND active AND (expires_at IS NULL OR expires_at>clock_timestamp()) AND role IN ('editor','reviewer'))
    THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  SELECT * INTO conversation FROM public.milo_conversations WHERE conversation_id=p_conversation FOR UPDATE NOWAIT;
  IF FOUND AND (conversation.actor_id<>p_actor OR conversation.owner_id<>p_owner OR conversation.project_id<>p_project)
    THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO previous FROM public.milo_conversation_turns WHERE turn_id=p_turn;
  IF FOUND THEN
    IF previous.conversation_id<>p_conversation OR previous.actor_id<>p_actor OR previous.body<>p_body OR previous.locale<>p_locale
      OR previous.allow_draft_generation<>p_allow_generation OR previous.allow_provider_checks<>p_allow_checks
      THEN RAISE EXCEPTION 'milo_conversation_conflict'; END IF;
    RETURN jsonb_build_object('created',false,'turn',public.milo_conversation_turn_view(previous));
  END IF;
  IF (SELECT count(*) FROM public.milo_conversation_turns WHERE actor_id=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=60
    OR (SELECT count(*) FROM public.milo_conversation_turns WHERE actor_id=p_actor AND created_at>clock_timestamp()-interval '1 minute')>=10
    THEN RAISE EXCEPTION 'milo_conversation_capacity'; END IF;
  IF conversation.conversation_id IS NULL THEN
    IF (SELECT count(*) FROM public.milo_conversations WHERE actor_id=p_actor)>=200 THEN RAISE EXCEPTION 'milo_conversation_capacity'; END IF;
    INSERT INTO public.milo_conversations(conversation_id,actor_id,owner_id,project_id,title)
      VALUES(p_conversation,p_actor,p_owner,p_project,left(btrim(p_body),160)) RETURNING * INTO conversation;
  END IF;
  IF conversation.turn_count>=500 THEN RAISE EXCEPTION 'milo_conversation_capacity'; END IF;
  -- Expiry is uncertainty, never a claim that a paid operation did not run.
  UPDATE public.milo_conversation_turns SET state='unknown',updated_at=clock_timestamp()
    WHERE conversation_id=p_conversation AND state='running' AND lease_until<=clock_timestamp();
  IF EXISTS(SELECT 1 FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND state IN ('pending','running'))
    THEN RAISE EXCEPTION 'milo_conversation_busy'; END IF;
  UPDATE public.milo_conversations SET turn_count=turn_count+1,updated_at=clock_timestamp()
    WHERE conversation_id=p_conversation RETURNING * INTO conversation;
  INSERT INTO public.milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision,allow_draft_generation,allow_provider_checks)
    VALUES(p_turn,p_conversation,p_actor,conversation.turn_count,p_body,p_locale,membership_revision,p_allow_generation,p_allow_checks) RETURNING * INTO previous;
  RETURN jsonb_build_object('created',true,'turn',public.milo_conversation_turn_view(previous));
END; $$;
REVOKE ALL ON FUNCTION public.begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text,boolean,boolean) TO service_role;
