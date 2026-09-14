-- Candidate. Requires all three conversation/proposal migrations. No provider,
-- delivery or publishing side effects. Retired IDs prevent stale paid replay.
ALTER TABLE public.milo_conversations ADD COLUMN export_revision bigint NOT NULL DEFAULT 1
  CHECK(export_revision BETWEEN 1 AND 9007199254740991);
CREATE TABLE public.milo_erased_conversations (
  conversation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  project_id text NOT NULL CHECK(project_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  created_at timestamptz NOT NULL,
  erased_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX milo_erased_conversations_actor ON public.milo_erased_conversations(actor_id);
CREATE TABLE public.milo_erased_turns (
  turn_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.milo_erased_conversations(conversation_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL
);
CREATE INDEX milo_erased_turns_recent ON public.milo_erased_turns(created_at,conversation_id);
ALTER TABLE public.milo_erased_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milo_erased_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milo_erased_conversations,public.milo_erased_turns FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.retire_milo_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Account deletion also erases the identifier registry. A removed auth actor
  -- cannot authenticate an old request; never prevent its cascade with a new FK.
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.actor_id) THEN
    INSERT INTO public.milo_erased_conversations(conversation_id,actor_id,owner_id,project_id,created_at)
      VALUES(OLD.conversation_id,OLD.actor_id,OLD.owner_id,OLD.project_id,OLD.created_at) ON CONFLICT DO NOTHING;
    INSERT INTO public.milo_erased_turns(turn_id,conversation_id,created_at)
      SELECT turn_id,conversation_id,created_at FROM public.milo_conversation_turns WHERE conversation_id=OLD.conversation_id ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER retire_milo_conversation BEFORE DELETE ON public.milo_conversations
  FOR EACH ROW EXECUTE FUNCTION public.retire_milo_conversation();

CREATE FUNCTION public.guard_milo_retired_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recent_hour bigint; recent_minute bigint;
BEGIN
  IF TG_TABLE_NAME='milo_conversations' THEN
    IF NOT pg_try_advisory_xact_lock(hashtext('milo-conversation-id'),hashtext(NEW.conversation_id::text))
      THEN RAISE EXCEPTION 'milo_conversation_busy' USING ERRCODE='55P03'; END IF;
    IF EXISTS(SELECT 1 FROM public.milo_erased_conversations WHERE conversation_id=NEW.conversation_id)
      THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.milo_erased_turns WHERE turn_id=NEW.turn_id)
      THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
    -- Erasure cannot reset the original actor-wide creation rate allowance.
    SELECT count(*),count(*) FILTER(WHERE created_at>clock_timestamp()-interval '1 minute')
      INTO recent_hour,recent_minute FROM (
        SELECT created_at FROM public.milo_conversation_turns WHERE actor_id=NEW.actor_id AND created_at>clock_timestamp()-interval '1 hour'
        UNION ALL
        SELECT t.created_at FROM public.milo_erased_turns t JOIN public.milo_erased_conversations c USING(conversation_id)
          WHERE c.actor_id=NEW.actor_id AND t.created_at>clock_timestamp()-interval '1 hour'
      ) recent;
    IF recent_hour>=60 OR recent_minute>=10 THEN RAISE EXCEPTION 'milo_conversation_capacity'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_milo_retired_conversation BEFORE INSERT ON public.milo_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_milo_retired_identity();
CREATE TRIGGER guard_milo_retired_turn BEFORE INSERT ON public.milo_conversation_turns
  FOR EACH ROW EXECUTE FUNCTION public.guard_milo_retired_identity();

CREATE FUNCTION public.bump_milo_export_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  UPDATE public.milo_conversations SET export_revision=export_revision+1
    WHERE conversation_id=(CASE WHEN TG_OP='DELETE' THEN OLD.conversation_id ELSE NEW.conversation_id END);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
-- Existing mutators lock workspace -> conversation -> turn; retain-proposal
-- owns the exclusive workspace lock. These triggers preserve that ordering.
CREATE TRIGGER milo_turn_export_revision AFTER INSERT OR DELETE OR UPDATE OF body,locale,state,events,updated_at ON public.milo_conversation_turns
  FOR EACH ROW EXECUTE FUNCTION public.bump_milo_export_revision();
CREATE TRIGGER milo_proposal_export_revision AFTER INSERT OR UPDATE OR DELETE ON public.milo_draft_proposals
  FOR EACH ROW EXECUTE FUNCTION public.bump_milo_export_revision();

CREATE FUNCTION public.export_milo_conversation_page(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_after integer DEFAULT 0,p_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conversation public.milo_conversations%ROWTYPE; observed timestamptz:=clock_timestamp(); version text; expired bigint; proposal_scope text; entries jsonb; last_ordinal integer;
BEGIN
  IF p_after IS NULL OR p_after<0 OR p_after>500 OR (p_after>0 AND p_version IS NULL)
    OR (p_version IS NOT NULL AND p_version !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'milo_export_invalid'; END IF;
  PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  SELECT * INTO conversation FROM public.milo_conversations WHERE conversation_id=p_conversation
    AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  -- Clock-driven running -> unknown projection also participates in the token.
  SELECT count(*) INTO expired FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND state='running' AND lease_until<=observed;
  -- A draft can move out of this project without modifying its retained
  -- proposal. Include that visibility change in every page's snapshot fence.
  SELECT coalesce(string_agg(p.proposal_id::text||':'||(a.entity_id IS NOT NULL)::text,',' ORDER BY p.proposal_id),'') INTO proposal_scope
    FROM public.milo_draft_proposals p
    LEFT JOIN public.workspace_entities a ON a.user_id=p_owner AND a.collection='content' AND a.entity_id=p.asset_id AND a.data->>'projectId'=p_project
    WHERE p.conversation_id=p_conversation AND p.actor_id=p_actor AND p.owner_id=p_owner AND p.project_id=p_project;
  version:=encode(sha256(convert_to(jsonb_build_array(conversation.export_revision,conversation.title,conversation.turn_count,expired,proposal_scope)::text,'UTF8')),'hex');
  IF p_version IS NOT NULL AND p_version<>version THEN RAISE EXCEPTION 'milo_export_changed' USING ERRCODE='40001'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'turn',public.milo_conversation_turn_view(t)||jsonb_build_object('state',CASE WHEN t.state='running' AND t.lease_until<=observed THEN 'unknown' ELSE t.state END),
    'proposal',CASE WHEN p.proposal_id IS NOT NULL AND a.entity_id IS NOT NULL THEN jsonb_build_object(
      'proposalId',p.proposal_id,'assetId',p.asset_id,'before',p.before_fields,'fields',p.patch,
      'explanation',p.explanation,'createdAt',p.created_at,'appliedAt',p.applied_at) ELSE NULL END,
    'omittedProposals',CASE WHEN p.proposal_id IS NOT NULL AND a.entity_id IS NULL THEN 1 ELSE 0 END
  ) ORDER BY t.ordinal),'[]'::jsonb),max(t.ordinal) INTO entries,last_ordinal
    FROM (SELECT * FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND ordinal>p_after ORDER BY ordinal LIMIT 20) t
    LEFT JOIN public.milo_draft_proposals p ON p.turn_id=t.turn_id AND p.conversation_id=p_conversation AND p.actor_id=p_actor AND p.owner_id=p_owner AND p.project_id=p_project
    LEFT JOIN public.workspace_entities a ON a.user_id=p_owner AND a.collection='content' AND a.entity_id=p.asset_id AND a.data->>'projectId'=p_project;
  IF octet_length(entries::text)>4194304 THEN RAISE EXCEPTION 'milo_export_capacity'; END IF;
  RETURN jsonb_build_object('actorId',p_actor,'ownerId',p_owner,'projectId',p_project,'conversationId',p_conversation,
    'title',conversation.title,'version',version,'observedAt',observed,'turnCount',conversation.turn_count,
    'entries',entries,'nextAfter',coalesce(last_ordinal,p_after),'hasMore',coalesce(last_ordinal,p_after)<conversation.turn_count);
END; $$;

CREATE FUNCTION public.erase_milo_conversation(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE conversation public.milo_conversations%ROWTYPE; retired public.milo_erased_conversations%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$' OR p_conversation IS NULL
    THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-conversation-actor'),hashtext(p_actor::text))
    THEN RAISE EXCEPTION 'milo_conversation_busy' USING ERRCODE='55P03'; END IF;
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO conversation FROM public.milo_conversations WHERE conversation_id=p_conversation;
  SELECT * INTO retired FROM public.milo_erased_conversations WHERE conversation_id=p_conversation;
  IF (conversation.conversation_id IS NOT NULL AND (conversation.actor_id<>p_actor OR conversation.owner_id<>p_owner OR conversation.project_id<>p_project))
    OR (retired.conversation_id IS NOT NULL AND (retired.actor_id<>p_actor OR retired.owner_id<>p_owner OR retired.project_id<>p_project))
    THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF conversation.conversation_id IS NOT NULL OR retired.conversation_id IS NOT NULL THEN
    -- An actor may erase their own private history after client access was
    -- revoked. This reads no client draft and never mutates the owner's assets.
    PERFORM 1 FROM public.workspace_meta WHERE user_id=p_owner FOR UPDATE NOWAIT;
  ELSE
    -- Retire an as-yet-unconfirmed ID only in a currently authorized project.
    PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-conversation-id'),hashtext(p_conversation::text))
    THEN RAISE EXCEPTION 'milo_conversation_busy' USING ERRCODE='55P03'; END IF;
  -- Repeat identity checks after acquiring the ID lock: another actor's insert
  -- may have committed since the optimistic lookup above.
  SELECT * INTO conversation FROM public.milo_conversations WHERE conversation_id=p_conversation FOR UPDATE NOWAIT;
  SELECT * INTO retired FROM public.milo_erased_conversations WHERE conversation_id=p_conversation;
  IF (conversation.conversation_id IS NOT NULL AND (conversation.actor_id<>p_actor OR conversation.owner_id<>p_owner OR conversation.project_id<>p_project))
    OR (retired.conversation_id IS NOT NULL AND (retired.actor_id<>p_actor OR retired.owner_id<>p_owner OR retired.project_id<>p_project))
    THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF conversation.conversation_id IS NOT NULL THEN
    DELETE FROM public.milo_conversations WHERE conversation_id=p_conversation;
  ELSIF retired.conversation_id IS NULL THEN
    -- Retiring never-confirmed IDs is bounded per actor (real erasures keep their turns
    -- and are not counted), so a client cannot grow the registry without limit.
    IF (SELECT count(*) FROM public.milo_erased_conversations e WHERE e.actor_id=p_actor
        AND NOT EXISTS(SELECT 1 FROM public.milo_erased_turns t WHERE t.conversation_id=e.conversation_id))>=200
      THEN RAISE EXCEPTION 'milo_conversation_capacity'; END IF;
    INSERT INTO public.milo_erased_conversations(conversation_id,actor_id,owner_id,project_id,created_at)
      VALUES(p_conversation,p_actor,p_owner,p_project,clock_timestamp());
  END IF;
  RETURN jsonb_build_object('actorId',p_actor,'ownerId',p_owner,'projectId',p_project,'conversationId',p_conversation,'erased',true);
END; $$;
REVOKE ALL ON FUNCTION public.retire_milo_conversation(),public.guard_milo_retired_identity(),public.bump_milo_export_revision() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.export_milo_conversation_page(uuid,uuid,text,uuid,integer,text),public.erase_milo_conversation(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.export_milo_conversation_page(uuid,uuid,text,uuid,integer,text),public.erase_milo_conversation(uuid,uuid,text,uuid) TO service_role;
