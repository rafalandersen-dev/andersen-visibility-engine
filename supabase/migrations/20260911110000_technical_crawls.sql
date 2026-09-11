-- UNRELEASED. Owner-only technical crawl records. No timer or external request.
CREATE TABLE public.technical_crawls (
 user_id uuid NOT NULL,
 project_id text NOT NULL,
 run_id uuid NOT NULL,
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 website_value text NOT NULL CHECK(length(website_value) BETWEEN 1 AND 8192),
 origin text NOT NULL CHECK(origin ~ '^https?://[^/?#@[:space:]]+$' AND length(origin)<=8192),
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','running','completed','cancelled','failed','held')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<=4000000),
 lease_token uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,run_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX technical_crawl_active_project ON public.technical_crawls(user_id,project_id) WHERE status IN ('preparing','running');
CREATE INDEX technical_crawl_history ON public.technical_crawls(user_id,project_id,created_at DESC,run_id);
ALTER TABLE public.technical_crawls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_crawls FROM PUBLIC,anon,authenticated,service_role;

-- Read-only scope checks do not acquire the exclusive account admission lock.
CREATE FUNCTION public.read_technical_crawl_owner(p_user uuid,p_project text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 PERFORM public.assert_knowledge_project(p_user,p_project,false);
 IF NOT EXISTS(SELECT 1 FROM public.workspace_meta WHERE user_id=p_user) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'technical_crawl_unavailable'; END IF;
 SELECT data->>'websiteUrl' INTO website FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
 RETURN website;
END; $$;
REVOKE ALL ON FUNCTION public.read_technical_crawl_owner(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.assert_technical_crawl_owner(p_user uuid,p_project text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 -- Shared account admission lock, also used by inspection/performance reservations.
 -- Require the row: an absent request or workspace row is not a lock.
 PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'technical_crawl_unavailable'; END IF;
 PERFORM public.assert_knowledge_project(p_user,p_project,true);
 PERFORM 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'technical_crawl_unavailable'; END IF;
 SELECT data->>'websiteUrl' INTO website FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
 RETURN website;
END; $$;
REVOKE ALL ON FUNCTION public.assert_technical_crawl_owner(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.start_technical_crawl(p_user uuid,p_project text,p_run uuid,p_expected bigint,p_website text,p_origin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; previous public.technical_crawls%ROWTYPE;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 IF p_run IS NULL OR p_website IS NULL OR length(btrim(p_website))=0 OR website IS DISTINCT FROM p_website THEN RAISE EXCEPTION 'technical_crawl_website_changed'; END IF;
 SELECT * INTO previous FROM public.technical_crawls WHERE user_id=p_user AND run_id=p_run;
 IF FOUND THEN
   IF previous.project_id=p_project AND previous.website_value=p_website AND previous.origin=p_origin THEN RETURN to_jsonb(previous)-ARRAY['lease_token','lease_until']; END IF;
   RAISE EXCEPTION 'technical_crawl_replay';
 END IF;
 IF p_expected IS NULL OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user) THEN RAISE EXCEPTION 'technical_crawl_workspace_changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND status IN ('preparing','running')) THEN RAISE EXCEPTION 'technical_crawl_active'; END IF;
 IF (SELECT count(*) FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'technical_crawl_rate_limit'; END IF;
 INSERT INTO public.technical_crawls(user_id,project_id,run_id,website_value,origin) VALUES(p_user,p_project,p_run,p_website,p_origin) RETURNING * INTO previous;
 RETURN to_jsonb(previous)-ARRAY['lease_token','lease_until'];
END; $$;

CREATE FUNCTION public.claim_technical_crawl(p_user uuid,p_project text,p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.technical_crawls%ROWTYPE;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO current FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR UPDATE;
 IF NOT FOUND OR current.status NOT IN ('preparing','running') THEN RETURN NULL; END IF;
 IF current.website_value IS DISTINCT FROM website THEN
   UPDATE public.technical_crawls SET status='held',revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
   RETURN NULL;
 END IF;
 IF current.lease_until>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE public.technical_crawls SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '45 seconds',updated_at=clock_timestamp()
 WHERE user_id=p_user AND run_id=p_run RETURNING * INTO current;
 RETURN to_jsonb(current);
END; $$;

CREATE FUNCTION public.save_technical_crawl_step(p_user uuid,p_project text,p_run uuid,p_lease uuid,p_revision bigint,p_state jsonb,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.technical_crawls%ROWTYPE;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO current FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR UPDATE;
 IF NOT FOUND OR current.status NOT IN ('preparing','running') OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease OR current.lease_until IS NULL OR current.lease_until<=clock_timestamp() OR current.revision IS DISTINCT FROM p_revision THEN RETURN false; END IF;
 IF current.website_value IS DISTINCT FROM website THEN
   UPDATE public.technical_crawls SET status='held',revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
   RETURN false;
 END IF;
 IF p_status IS NULL OR p_status NOT IN ('running','completed','failed','held') OR p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR p_state->>'origin' IS DISTINCT FROM current.origin OR octet_length(p_state::text)>4000000 THEN RAISE EXCEPTION 'technical_crawl_state_invalid'; END IF;
 UPDATE public.technical_crawls SET state=p_state,status=p_status,revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
 RETURN true;
END; $$;

CREATE FUNCTION public.cancel_technical_crawl(p_user uuid,p_project text,p_run uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 UPDATE public.technical_crawls SET status='cancelled',revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE user_id=p_user AND project_id=p_project AND run_id=p_run AND status IN ('preparing','running','held');
 RETURN FOUND;
END; $$;

CREATE FUNCTION public.read_technical_crawl(p_user uuid,p_project text,p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.read_technical_crawl_owner(p_user,p_project);
 SELECT to_jsonb(c)-ARRAY['lease_token','lease_until'] INTO result FROM public.technical_crawls c WHERE user_id=p_user AND project_id=p_project AND run_id=p_run;
 RETURN result;
END; $$;
CREATE FUNCTION public.list_technical_crawls(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.read_technical_crawl_owner(p_user,p_project);
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY created_at DESC,run_id),'[]'::jsonb) INTO result
 FROM (SELECT run_id,origin,status,revision,created_at,updated_at FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project ORDER BY created_at DESC,run_id LIMIT 20) c;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.start_technical_crawl(uuid,text,uuid,bigint,text,text),public.claim_technical_crawl(uuid,text,uuid),public.save_technical_crawl_step(uuid,text,uuid,uuid,bigint,jsonb,text),public.cancel_technical_crawl(uuid,text,uuid),public.read_technical_crawl(uuid,text,uuid),public.list_technical_crawls(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_technical_crawl(uuid,text,uuid,bigint,text,text),public.claim_technical_crawl(uuid,text,uuid),public.save_technical_crawl_step(uuid,text,uuid,uuid,bigint,jsonb,text),public.cancel_technical_crawl(uuid,text,uuid),public.read_technical_crawl(uuid,text,uuid),public.list_technical_crawls(uuid,text) TO service_role;

CREATE FUNCTION public.read_technical_crawl_context(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 website:=public.read_technical_crawl_owner(p_user,p_project);
 RETURN jsonb_build_object('website',website,'revision',(SELECT rev FROM public.workspace_meta WHERE user_id=p_user),'appLanguage',(SELECT coalesce(data->>'appLanguage','en') FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project));
END; $$;
REVOKE ALL ON FUNCTION public.read_technical_crawl_context(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_technical_crawl_context(uuid,text) TO service_role;
