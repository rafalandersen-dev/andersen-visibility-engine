-- UNRELEASED foundation. No invitation, member creation or delegated writes are
-- enabled by this migration. Role action policy remains the D07 owner decision.
CREATE TABLE public.project_team_members (
  owner_id uuid NOT NULL,
  project_id text NOT NULL CHECK(project_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  role text NOT NULL CHECK(role IN ('viewer','editor','reviewer')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  PRIMARY KEY(owner_id,project_id,actor_id),
  CHECK(owner_id<>actor_id),
  FOREIGN KEY(owner_id,project_collection,project_id)
    REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.project_team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_members FROM PUBLIC,anon,authenticated,service_role;

-- Service-only entry: p_actor is supplied by verified authentication middleware.
-- Never expose this function directly to authenticated clients. Membership
-- writers must use the same owner workspace lock before updating membership.
CREATE FUNCTION public.read_project_team_snapshot(p_actor uuid,p_owner uuid,p_project text,p_asset text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project jsonb; drafts jsonb; draft jsonb; membership_revision bigint:=1;
  workspace_revision bigint; remaining bigint; member_role text:='owner'; draft_hash text;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$'
    OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
    OR (p_asset IS NOT NULL AND (p_asset !~ '^[A-Za-z0-9_-]{1,64}$' OR p_offset<>0))
    THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  SELECT rev INTO workspace_revision FROM public.workspace_meta WHERE user_id=p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  -- A previously issued session must not bypass current account suspension.
  PERFORM 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL
    AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  IF p_actor<>p_owner THEN
    SELECT revision,role INTO membership_revision,member_role FROM public.project_team_members
      WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor
        AND active AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  END IF;
  SELECT jsonb_build_object('id',entity_id,'name',data->'name',
    'businessName',coalesce(data->'businessName','""'::jsonb),
    'description',coalesce(data->'description','""'::jsonb),
    'primaryLanguage',coalesce(data->'primaryLanguage','"English"'::jsonb))
    INTO project FROM public.workspace_entities
    WHERE user_id=p_owner AND collection='projects' AND entity_id=p_project;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  SELECT coalesce(jsonb_agg(summary ORDER BY entity_id),'[]'::jsonb) INTO drafts FROM (
    SELECT entity_id,jsonb_build_object('id',entity_id,'projectId',p_project,
      'title',data->'title','status',data->'status','updatedAt',data->'updatedAt') summary
    FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND data->>'projectId'=p_project
    ORDER BY entity_id LIMIT 100 OFFSET p_offset
  ) page;
  SELECT greatest(0,count(*)-p_offset-100) INTO remaining FROM public.workspace_entities
    WHERE user_id=p_owner AND collection='content' AND data->>'projectId'=p_project;
  IF remaining>100000 THEN RAISE EXCEPTION 'team_project_capacity'; END IF;
  IF p_asset IS NOT NULL THEN
    SELECT jsonb_build_object('id',entity_id,'projectId',p_project,
      'title',data->'title','status',data->'status','updatedAt',data->'updatedAt',
      'markdown',data->'markdown','h1',coalesce(data->'h1','""'::jsonb),
      'metaTitle',coalesce(data->'metaTitle','""'::jsonb),
      'metaDescription',coalesce(data->'metaDescription','""'::jsonb),
      'outline',coalesce(data->'outline','[]'::jsonb),
      'faq',coalesce((SELECT jsonb_agg(jsonb_build_object('q',f->'q','a',f->'a')) FROM jsonb_array_elements(data->'faq') f),'[]'::jsonb),
      'cta',coalesce(data->'cta','""'::jsonb),
      'images',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',im->'id','alt',coalesce(im->'alt','""'::jsonb),'caption',im->'caption'))) FROM jsonb_array_elements(data->'images') im),'[]'::jsonb))
      INTO draft FROM public.workspace_entities
      WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project;
    IF NOT FOUND OR octet_length(draft::text)>2000000 THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  END IF;
  IF p_asset IS NOT NULL THEN
    SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') INTO draft_hash FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project;
  END IF;
  RETURN jsonb_build_object('draftHash',draft_hash,'canEdit',member_role IN ('owner','editor'),'actorId',p_actor,'ownerId',p_owner,'projectId',p_project,
    'membershipRevision',membership_revision,'workspaceRevision',workspace_revision,
    'project',project,'drafts',drafts,'remaining',remaining,'draft',draft);
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_snapshot(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_snapshot(uuid,uuid,text,text,integer) TO service_role;
