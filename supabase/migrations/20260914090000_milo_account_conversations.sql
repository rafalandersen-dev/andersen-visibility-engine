-- Candidate. Requires 20260913120000 and 20260913200000. Read-only account
-- directory of the authenticated actor's own private conversations. It grants
-- no project read, export, apply or membership; erasure keeps its existing RPC.
CREATE INDEX milo_conversations_actor_recent
  ON public.milo_conversations(actor_id,created_at DESC,conversation_id DESC);

CREATE FUNCTION public.list_my_milo_conversations(p_actor uuid,p_before_created timestamptz DEFAULT NULL,p_before_conversation uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE observed timestamptz:=clock_timestamp(); entries jsonb; remaining boolean;
BEGIN
  IF p_actor IS NULL OR (p_before_created IS NULL)<>(p_before_conversation IS NULL)
    THEN RAISE EXCEPTION 'milo_conversation_invalid'; END IF;
  PERFORM public.assert_project_team_account(p_actor);
  -- Only the actor's own rows: project owners never discover a member's history.
  -- A title is returned only while the checks of assert_milo_conversation_access
  -- currently pass. Revoked, expired or suspended scopes return identifiers only.
  WITH page AS (
    SELECT c.conversation_id,c.owner_id,c.project_id,c.title,c.created_at,
      row_number() OVER (ORDER BY c.created_at DESC,c.conversation_id DESC) AS rank_no,
      (EXISTS(SELECT 1 FROM auth.users u WHERE u.id=c.owner_id AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=observed))
        AND EXISTS(SELECT 1 FROM public.workspace_meta m WHERE m.user_id=c.owner_id)
        AND EXISTS(SELECT 1 FROM public.workspace_entities p WHERE p.user_id=c.owner_id AND p.collection='projects' AND p.entity_id=c.project_id)
        AND (c.actor_id=c.owner_id OR EXISTS(SELECT 1 FROM public.project_team_members t WHERE t.actor_id=c.actor_id AND t.owner_id=c.owner_id
          AND t.project_id=c.project_id AND t.active AND (t.expires_at IS NULL OR t.expires_at>observed)))) AS available
    FROM public.milo_conversations c
    WHERE c.actor_id=p_actor
      AND (p_before_created IS NULL OR (c.created_at,c.conversation_id)<(p_before_created,p_before_conversation))
    ORDER BY c.created_at DESC,c.conversation_id DESC LIMIT 26
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('conversationId',conversation_id,'ownerId',owner_id,'projectId',project_id,'createdAt',created_at,
      'access',CASE WHEN available THEN 'available' ELSE 'unavailable' END,
      'title',CASE WHEN available THEN title ELSE NULL END) ORDER BY rank_no) FILTER(WHERE rank_no<=25),'[]'::jsonb),
    count(*)>25
    INTO entries,remaining FROM page;
  RETURN jsonb_build_object('actorId',p_actor,'conversations',entries,'hasMore',remaining);
END; $$;
REVOKE ALL ON FUNCTION public.list_my_milo_conversations(uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_milo_conversations(uuid,timestamptz,uuid) TO service_role;
