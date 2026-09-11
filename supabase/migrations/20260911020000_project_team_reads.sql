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

-- Called only inside service-mediated team operations under the workspace lock.
CREATE FUNCTION public.assert_project_team_account(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL
    AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_project_team_account(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Service-only entry: p_actor is supplied by verified authentication middleware.
-- Never expose this function directly to authenticated clients. Membership
-- writers must use the same owner workspace lock before updating membership.
CREATE FUNCTION public.read_project_team_snapshot(p_actor uuid,p_owner uuid,p_project text,p_asset text DEFAULT NULL,p_offset integer DEFAULT 0,p_write boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project jsonb; drafts jsonb; draft jsonb; membership_revision bigint:=1;
  workspace_revision bigint; remaining bigint; member_role text:='owner'; draft_hash text;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$'
    OR p_write IS NULL OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
    OR (p_asset IS NOT NULL AND (p_asset !~ '^[A-Za-z0-9_-]{1,64}$' OR p_offset<>0))
    THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  -- Reject unknown/removed/suspended actors without queuing on a victim's locks.
  -- These optimistic checks are repeated under the workspace lock below.
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR (p_actor<>p_owner AND NOT EXISTS(SELECT 1 FROM public.project_team_members
      WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor
        AND active AND (expires_at IS NULL OR expires_at>clock_timestamp())))
    THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  -- No queued lock wait survives a disconnected caller. Mutation callers opt
  -- into exclusive serialization before reading versions or checking quotas.
  IF p_write THEN
    SELECT rev INTO workspace_revision FROM public.workspace_meta WHERE user_id=p_owner FOR UPDATE NOWAIT;
  ELSE
    SELECT rev INTO workspace_revision FROM public.workspace_meta WHERE user_id=p_owner FOR SHARE NOWAIT;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  -- A previously issued session must not bypass current account suspension.
  PERFORM public.assert_project_team_account(p_owner);
  IF p_actor<>p_owner THEN PERFORM public.assert_project_team_account(p_actor); END IF;
  IF p_actor<>p_owner THEN
    SELECT revision,role INTO membership_revision,member_role FROM public.project_team_members
      WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor
        AND active AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE NOWAIT;
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
REVOKE ALL ON FUNCTION public.read_project_team_snapshot(uuid,uuid,text,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_snapshot(uuid,uuid,text,text,integer,boolean) TO service_role;

-- Actor-wide admission runs before private review context or image access.
-- Bounded counters/leases are operational state, not review history.
CREATE TABLE public.project_team_media_limits (
 actor_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 hour_start timestamptz NOT NULL,
 hour_count integer NOT NULL CHECK(hour_count BETWEEN 0 AND 600),
 minute_start timestamptz NOT NULL,
 minute_count integer NOT NULL CHECK(minute_count BETWEEN 0 AND 512),
 leases jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<2000)
);
ALTER TABLE public.project_team_media_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_media_limits FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.acquire_project_team_media(p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.project_team_media_limits%ROWTYPE; lease uuid; active jsonb; stamp timestamptz:=clock_timestamp();
BEGIN
 PERFORM public.assert_project_team_account(p_actor);
 INSERT INTO public.project_team_media_limits(actor_id,hour_start,hour_count,minute_start,minute_count) VALUES(p_actor,stamp,0,stamp,0) ON CONFLICT DO NOTHING;
 SELECT * INTO current FROM public.project_team_media_limits WHERE actor_id=p_actor FOR UPDATE;
 stamp:=clock_timestamp();
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO active FROM jsonb_each_text(current.leases) WHERE value::timestamptz>stamp;
 IF (SELECT count(*) FROM jsonb_object_keys(active))>=4 THEN RAISE EXCEPTION 'team_media_capacity'; END IF;
 IF current.hour_start<=stamp-interval '1 hour' THEN current.hour_start:=stamp;current.hour_count:=0; END IF;
 IF current.minute_start<=stamp-interval '1 minute' THEN current.minute_start:=stamp;current.minute_count:=0; END IF;
 IF current.hour_count>=600 OR current.minute_count>=512 THEN RAISE EXCEPTION 'team_media_capacity'; END IF;
 lease:=gen_random_uuid();
 UPDATE public.project_team_media_limits SET hour_start=current.hour_start,hour_count=current.hour_count+1,minute_start=current.minute_start,minute_count=current.minute_count+1,leases=active || jsonb_build_object(lease::text,stamp+interval '60 seconds') WHERE actor_id=p_actor;
 RETURN lease;
END; $$;
CREATE FUNCTION public.release_project_team_media(p_actor uuid,p_lease uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.project_team_media_limits SET leases=leases-p_lease::text WHERE actor_id=p_actor;
END; $$;
REVOKE ALL ON FUNCTION public.acquire_project_team_media(uuid),public.release_project_team_media(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_project_team_media(uuid),public.release_project_team_media(uuid,uuid) TO service_role;

-- Independent preview budgets do not consume media download slots or owner workspace locks.
CREATE TABLE public.project_team_preview_limits (
 scope text NOT NULL CHECK(scope IN ('actor','owner')),
 account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 hour_start timestamptz NOT NULL,
 hour_count integer NOT NULL CHECK(hour_count BETWEEN 0 AND 1200),
 minute_start timestamptz NOT NULL,
 minute_count integer NOT NULL CHECK(minute_count BETWEEN 0 AND 240),
 leases jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<2000),
 PRIMARY KEY(scope,account_id)
);
ALTER TABLE public.project_team_preview_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_preview_limits FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.acquire_project_team_preview(p_actor uuid,p_owner uuid,p_project text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.project_team_preview_limits%ROWTYPE; scope_name text; account uuid; active_leases jsonb; stamp timestamptz:=clock_timestamp(); lease uuid:=gen_random_uuid();
BEGIN
 -- Reject forged/removed/suspended scopes before touching a victim's budget.
 -- The context read will repeat authoritative authorization after admission.
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=stamp))
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=stamp))
 OR NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_owner AND collection='projects' AND entity_id=p_project)
 OR (p_actor<>p_owner AND NOT EXISTS(SELECT 1 FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor AND active AND (expires_at IS NULL OR expires_at>stamp)))
 THEN RAISE EXCEPTION 'team_preview_unavailable'; END IF;
 FOREACH scope_name IN ARRAY ARRAY['actor','owner'] LOOP
   account:=CASE WHEN scope_name='actor' THEN p_actor ELSE p_owner END;
   IF NOT pg_try_advisory_xact_lock(hashtext('team-preview-'||scope_name),hashtext(account::text)) THEN RAISE EXCEPTION 'team_preview_capacity'; END IF;
   INSERT INTO public.project_team_preview_limits(scope,account_id,hour_start,hour_count,minute_start,minute_count) VALUES(scope_name,account,stamp,0,stamp,0) ON CONFLICT DO NOTHING;
   SELECT * INTO current FROM public.project_team_preview_limits WHERE scope=scope_name AND account_id=account FOR UPDATE NOWAIT;
   SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO active_leases FROM jsonb_each_text(current.leases) WHERE value::timestamptz>stamp;
   IF (SELECT count(*) FROM jsonb_object_keys(active_leases))>=(CASE WHEN scope_name='actor' THEN 2 ELSE 8 END) THEN RAISE EXCEPTION 'team_preview_capacity'; END IF;
   IF current.hour_start<=stamp-interval '1 hour' THEN current.hour_start:=stamp;current.hour_count:=0; END IF;
   IF current.minute_start<=stamp-interval '1 minute' THEN current.minute_start:=stamp;current.minute_count:=0; END IF;
   IF current.hour_count>=(CASE WHEN scope_name='actor' THEN 240 ELSE 1200 END) OR current.minute_count>=(CASE WHEN scope_name='actor' THEN 60 ELSE 240 END) THEN RAISE EXCEPTION 'team_preview_capacity'; END IF;
   UPDATE public.project_team_preview_limits SET hour_start=current.hour_start,hour_count=current.hour_count+1,minute_start=current.minute_start,minute_count=current.minute_count+1,
     leases=active_leases || jsonb_build_object(lease::text,stamp+interval '60 seconds') WHERE scope=scope_name AND account_id=account;
 END LOOP;
 RETURN lease;
END; $$;
CREATE FUNCTION public.release_project_team_preview(p_actor uuid,p_owner uuid,p_lease uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('team-preview-actor'),hashtext(p_actor::text)) THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('team-preview-owner'),hashtext(p_owner::text)) THEN RETURN; END IF;
 -- A different actor cannot release an owner's shared slot by presenting its token.
 IF NOT EXISTS(SELECT 1 FROM public.project_team_preview_limits WHERE scope='actor' AND account_id=p_actor AND leases ? p_lease::text) THEN RETURN; END IF;
 UPDATE public.project_team_preview_limits SET leases=leases-p_lease::text WHERE scope='actor' AND account_id=p_actor;
 UPDATE public.project_team_preview_limits SET leases=leases-p_lease::text WHERE scope='owner' AND account_id=p_owner;
END; $$;
REVOKE ALL ON FUNCTION public.acquire_project_team_preview(uuid,uuid,text),public.release_project_team_preview(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_project_team_preview(uuid,uuid,text),public.release_project_team_preview(uuid,uuid,uuid) TO service_role;
