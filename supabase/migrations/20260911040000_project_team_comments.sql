-- UNRELEASED. Comments annotate an exact saved workspace revision and never
-- mutate a draft or confer approval, publishing or spending authority.
CREATE TABLE public.project_team_comments (
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  comment_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  author_name text NOT NULL,
  author_role text NOT NULL CHECK(author_role IN ('owner','viewer','editor','reviewer')),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  workspace_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  asset_collection text NOT NULL DEFAULT 'content' CHECK(asset_collection='content'),
  PRIMARY KEY(owner_id,comment_id),
  FOREIGN KEY(owner_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,asset_collection,asset_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE INDEX project_team_comments_asset ON public.project_team_comments(owner_id,project_id,asset_id,created_at,comment_id);
ALTER TABLE public.project_team_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_comments FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX project_team_comments_recent_activity ON public.project_team_comments(owner_id,project_id,created_at);
CREATE INDEX project_team_comments_actor_activity ON public.project_team_comments(owner_id,project_id,actor_id,created_at);
CREATE FUNCTION public.add_project_team_comment(p_actor uuid,p_owner uuid,p_project text,p_asset text,p_comment uuid,p_expected bigint,p_body text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; previous public.project_team_comments%ROWTYPE; author text; author_role_value text;
BEGIN
  IF p_comment IS NULL OR p_expected IS NULL OR p_expected<0 OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 4000
    THEN RAISE EXCEPTION 'team_comment_unavailable'; END IF;
  -- The snapshot reader takes the workspace lock, then verifies current active
  -- membership and exact project/asset. Keep that lock through insertion.
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0,true);
  IF p_asset IS NULL THEN RAISE EXCEPTION 'team_comment_unavailable'; END IF;
  SELECT * INTO previous FROM public.project_team_comments WHERE owner_id=p_owner AND comment_id=p_comment;
  IF FOUND THEN
    IF previous.project_id=p_project AND previous.asset_id=p_asset AND previous.actor_id=p_actor AND previous.body=btrim(p_body) AND previous.workspace_revision=p_expected THEN RETURN true; END IF;
    RAISE EXCEPTION 'team_comment_replay';
  END IF;
  IF (snapshot->>'workspaceRevision')::bigint<>p_expected THEN RAISE EXCEPTION 'team_comment_draft_changed' USING ERRCODE='40001'; END IF;
  IF (SELECT count(*) FROM public.project_team_comments WHERE owner_id=p_owner AND project_id=p_project AND created_at>clock_timestamp()-interval '1 hour')>=5000 THEN RAISE EXCEPTION 'team_comment_capacity'; END IF;
  IF (SELECT count(*) FROM public.project_team_comments WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'team_comment_capacity'; END IF;
  SELECT left(coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),nullif(btrim(raw_user_meta_data->>'full_name'),''),'Collaborator'),120) INTO author FROM auth.users WHERE id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_comment_unavailable'; END IF;
  IF p_actor=p_owner THEN author_role_value:='owner'; ELSE SELECT role INTO author_role_value FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor AND active; END IF;
  IF author_role_value IS NULL THEN RAISE EXCEPTION 'team_comment_unavailable'; END IF;
  INSERT INTO public.project_team_comments(owner_id,project_id,asset_id,comment_id,actor_id,author_name,author_role,body,workspace_revision)
    VALUES(p_owner,p_project,p_asset,p_comment,p_actor,author,author_role_value,btrim(p_body),p_expected);
  RETURN true;
END; $$;
CREATE FUNCTION public.read_project_team_comments(p_actor uuid,p_owner uuid,p_project text,p_asset text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; comments jsonb; remaining bigint;
BEGIN
  IF p_asset IS NULL OR p_offset IS NULL OR p_offset<0 OR p_offset>2147483500 THEN RAISE EXCEPTION 'team_comment_unavailable'; END IF;
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0);
  SELECT coalesce(jsonb_agg(jsonb_build_object('commentId',comment_id,'mine',actor_id=p_actor,'authorName',author_name,'authorRole',author_role,'authorRef',left(encode(sha256(convert_to(jsonb_build_array(owner_id,project_id,actor_id)::text,'UTF8')),'hex'),12),'body',body,'workspaceRevision',workspace_revision,'createdAt',created_at) ORDER BY created_at DESC,comment_id DESC),'[]'::jsonb)
    INTO comments FROM (SELECT * FROM public.project_team_comments WHERE owner_id=p_owner AND project_id=p_project AND asset_id=p_asset ORDER BY created_at DESC,comment_id DESC LIMIT 100 OFFSET p_offset) page;
  SELECT greatest(0,count(*)-p_offset-100) INTO remaining FROM public.project_team_comments WHERE owner_id=p_owner AND project_id=p_project AND asset_id=p_asset;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'assetId',p_asset,'comments',comments,'remaining',remaining);
END; $$;
REVOKE ALL ON FUNCTION public.add_project_team_comment(uuid,uuid,text,text,uuid,bigint,text),public.read_project_team_comments(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_project_team_comment(uuid,uuid,text,text,uuid,bigint,text),public.read_project_team_comments(uuid,uuid,text,text,integer) TO service_role;
