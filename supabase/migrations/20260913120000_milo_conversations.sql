-- Candidate only. Requires the released project-team read/account foundation.
-- No provider, scheduler, publication, email or delegated spending is enabled.
CREATE TABLE public.milo_conversations (
  conversation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  project_id text NOT NULL CHECK(project_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  title text NOT NULL CHECK(octet_length(title) BETWEEN 1 AND 800),
  turn_count integer NOT NULL DEFAULT 0 CHECK(turn_count BETWEEN 0 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,project_collection,project_id)
    REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE INDEX milo_conversations_actor_scope ON public.milo_conversations(actor_id,owner_id,project_id,created_at DESC,conversation_id);
CREATE TABLE public.milo_conversation_turns (
  turn_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.milo_conversations(conversation_id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 500),
  body text NOT NULL CHECK(length(btrim(body))>0 AND octet_length(body)<=8000),
  locale text NOT NULL CHECK(locale ~ '^[a-z]{2}$'),
  membership_revision bigint NOT NULL CHECK(membership_revision BETWEEN 1 AND 9007199254740991),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','completed','failed','cancelled','unknown')),
  attempt_id uuid,
  lease_until timestamptz,
  events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(events)='array' AND jsonb_array_length(events)<=24 AND octet_length(events::text)<=120000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(conversation_id,ordinal),
  CHECK((attempt_id IS NULL)=(lease_until IS NULL))
);
CREATE INDEX milo_turns_actor_recent ON public.milo_conversation_turns(actor_id,created_at DESC);
CREATE UNIQUE INDEX milo_one_active_turn ON public.milo_conversation_turns(conversation_id) WHERE state IN ('pending','running');
ALTER TABLE public.milo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milo_conversation_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milo_conversations,public.milo_conversation_turns FROM PUBLIC,anon,authenticated,service_role;

-- Same lock order/authority as project-team reads, without loading draft bodies
-- or exposing the owner workspace. The caller retains these transaction locks.
CREATE FUNCTION public.assert_milo_conversation_access(p_actor uuid,p_owner uuid,p_project text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE membership_revision bigint:=1;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$'
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR (p_actor<>p_owner AND NOT EXISTS(SELECT 1 FROM public.project_team_members WHERE actor_id=p_actor AND owner_id=p_owner AND project_id=p_project AND active AND (expires_at IS NULL OR expires_at>clock_timestamp())))
    THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  PERFORM 1 FROM public.workspace_meta WHERE user_id=p_owner FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  PERFORM public.assert_project_team_account(p_owner);
  IF p_actor<>p_owner THEN
    PERFORM public.assert_project_team_account(p_actor);
    SELECT revision INTO membership_revision FROM public.project_team_members
      WHERE actor_id=p_actor AND owner_id=p_owner AND project_id=p_project AND active
        AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  END IF;
  PERFORM 1 FROM public.workspace_entities WHERE user_id=p_owner AND collection='projects' AND entity_id=p_project;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  RETURN membership_revision;
END; $$;

-- Private projection: claim tokens never enter browser reads.
CREATE FUNCTION public.milo_conversation_turn_view(t public.milo_conversation_turns)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('turnId',t.turn_id,'ordinal',t.ordinal,'body',t.body,'locale',t.locale,
    'state',CASE WHEN t.state='running' AND t.lease_until<=clock_timestamp() THEN 'unknown' ELSE t.state END,
    'events',t.events,'createdAt',t.created_at,'updatedAt',t.updated_at)
$$;

CREATE FUNCTION public.begin_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_body text,p_locale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conversation public.milo_conversations%ROWTYPE; previous public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  IF p_conversation IS NULL OR p_turn IS NULL OR p_body IS NULL OR length(btrim(p_body))=0 OR octet_length(p_body)>8000
    OR p_locale IS NULL OR p_locale !~ '^[a-z]{2}$' THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  -- Serialize actor-wide creation/rate checks across all clients and projects.
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-conversation-actor'),hashtext(p_actor::text)) THEN RAISE EXCEPTION 'milo_conversation_busy' USING ERRCODE='55P03'; END IF;
  membership_revision:=public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  SELECT * INTO conversation FROM public.milo_conversations WHERE conversation_id=p_conversation FOR UPDATE NOWAIT;
  IF FOUND AND (conversation.actor_id<>p_actor OR conversation.owner_id<>p_owner OR conversation.project_id<>p_project)
    THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO previous FROM public.milo_conversation_turns WHERE turn_id=p_turn;
  IF FOUND THEN
    IF previous.conversation_id<>p_conversation OR previous.actor_id<>p_actor OR previous.body<>p_body OR previous.locale<>p_locale
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
  INSERT INTO public.milo_conversation_turns(turn_id,conversation_id,actor_id,ordinal,body,locale,membership_revision)
    VALUES(p_turn,p_conversation,p_actor,conversation.turn_count,p_body,p_locale,membership_revision) RETURNING * INTO previous;
  RETURN jsonb_build_object('created',true,'turn',public.milo_conversation_turn_view(previous));
END; $$;

CREATE FUNCTION public.read_milo_conversation(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_after integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conversation public.milo_conversations%ROWTYPE; turns jsonb; last_ordinal integer;
BEGIN
  IF p_after IS NULL OR p_after<0 OR p_after>500 THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  SELECT * INTO conversation FROM public.milo_conversations WHERE conversation_id=p_conversation
    AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT coalesce(jsonb_agg(public.milo_conversation_turn_view(page) ORDER BY page.ordinal),'[]'::jsonb),max(page.ordinal)
    INTO turns,last_ordinal FROM (SELECT * FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND ordinal>p_after ORDER BY ordinal LIMIT 20) page;
  RETURN jsonb_build_object('actorId',p_actor,'ownerId',p_owner,'projectId',p_project,'conversationId',p_conversation,
    'title',conversation.title,'turnCount',conversation.turn_count,'turns',turns,
    'nextAfter',coalesce(last_ordinal,p_after),'hasMore',coalesce(last_ordinal,p_after)<conversation.turn_count);
END; $$;

CREATE FUNCTION public.list_milo_conversations(p_actor uuid,p_owner uuid,p_project text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conversations jsonb;
BEGIN
  IF p_offset IS NULL OR p_offset<0 OR p_offset>200 THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  SELECT coalesce(jsonb_agg(jsonb_build_object('conversationId',conversation_id,'title',title,'turnCount',turn_count,
    'createdAt',created_at,'updatedAt',updated_at) ORDER BY created_at DESC,conversation_id),'[]'::jsonb)
    INTO conversations FROM (SELECT * FROM public.milo_conversations WHERE actor_id=p_actor AND owner_id=p_owner AND project_id=p_project ORDER BY created_at DESC,conversation_id LIMIT 50 OFFSET p_offset) page;
  RETURN jsonb_build_object('actorId',p_actor,'ownerId',p_owner,'projectId',p_project,'conversations',conversations);
END; $$;

-- Server executor only: the first claimant receives a durable attempt token.
-- Browser retries and expired leases can never claim the same model work again.
CREATE FUNCTION public.claim_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  membership_revision:=public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND OR current_turn.membership_revision<>membership_revision THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF current_turn.state<>'pending' THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  UPDATE public.milo_conversation_turns SET state='running',attempt_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '3 minutes',updated_at=clock_timestamp()
    WHERE turn_id=p_turn RETURNING * INTO current_turn;
  RETURN jsonb_build_object('acquired',true,'attemptId',current_turn.attempt_id,'turn',public.milo_conversation_turn_view(current_turn));
END; $$;

CREATE FUNCTION public.advance_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_attempt uuid,p_expected integer,p_events jsonb,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  IF p_expected IS NULL OR p_expected<0 OR p_expected>24 OR p_events IS NULL OR jsonb_typeof(p_events)<>'array'
    OR jsonb_array_length(p_events)<1 OR jsonb_array_length(p_events)>24 OR octet_length(p_events::text)>120000
    OR p_state IS NULL OR p_state NOT IN ('running','completed','failed','unknown') THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  membership_revision:=public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND OR current_turn.membership_revision<>membership_revision THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF p_attempt IS NULL OR current_turn.attempt_id IS DISTINCT FROM p_attempt OR current_turn.state<>'running'
    OR current_turn.lease_until<=clock_timestamp() OR jsonb_array_length(current_turn.events)<>p_expected
    THEN RAISE EXCEPTION 'milo_conversation_conflict'; END IF;
  UPDATE public.milo_conversation_turns SET events=events||p_events,state=p_state,updated_at=clock_timestamp()
    WHERE turn_id=p_turn RETURNING * INTO current_turn;
  UPDATE public.milo_conversations SET updated_at=clock_timestamp() WHERE conversation_id=p_conversation;
  RETURN public.milo_conversation_turn_view(current_turn);
END; $$;

CREATE FUNCTION public.cancel_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE;
BEGIN
  PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF current_turn.state IN ('pending','running') THEN
    UPDATE public.milo_conversation_turns SET state='cancelled',updated_at=clock_timestamp() WHERE turn_id=p_turn RETURNING * INTO current_turn;
  END IF;
  RETURN public.milo_conversation_turn_view(current_turn);
END; $$;

REVOKE ALL ON FUNCTION public.assert_milo_conversation_access(uuid,uuid,text),public.milo_conversation_turn_view(public.milo_conversation_turns) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text),public.read_milo_conversation(uuid,uuid,text,uuid,integer),public.list_milo_conversations(uuid,uuid,text,integer),public.claim_milo_conversation_turn(uuid,uuid,text,uuid,uuid),public.advance_milo_conversation_turn(uuid,uuid,text,uuid,uuid,uuid,integer,jsonb,text),public.cancel_milo_conversation_turn(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_milo_conversation_turn(uuid,uuid,text,uuid,uuid,text,text),public.read_milo_conversation(uuid,uuid,text,uuid,integer),public.list_milo_conversations(uuid,uuid,text,integer),public.claim_milo_conversation_turn(uuid,uuid,text,uuid,uuid),public.advance_milo_conversation_turn(uuid,uuid,text,uuid,uuid,uuid,integer,jsonb,text),public.cancel_milo_conversation_turn(uuid,uuid,text,uuid,uuid) TO service_role;
