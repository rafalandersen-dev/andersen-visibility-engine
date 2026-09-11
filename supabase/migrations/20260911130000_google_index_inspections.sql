-- UNRELEASED. Private, explicit owner requests; no timer or provider call in SQL.
CREATE TABLE public.google_index_inspections (
 user_id uuid NOT NULL,
 project_id text NOT NULL,
 request_id uuid NOT NULL,
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 property text NOT NULL CHECK(length(property) BETWEEN 1 AND 8192),
 url text NOT NULL CHECK(length(url) BETWEEN 1 AND 8192),
 status text NOT NULL CHECK(status IN ('running','succeeded','failed','unknown','held')),
 lease_token uuid NOT NULL,
 lease_until timestamptz NOT NULL,
 observation jsonb,
 error_code text CHECK(error_code IN ('access','quota','unavailable')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
 CHECK(observation IS NULL OR (jsonb_typeof(observation)='object' AND octet_length(observation::text)<=1500000))
);
ALTER TABLE public.google_index_inspections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_index_inspections FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX google_index_inspections_history ON public.google_index_inspections(user_id,project_id,created_at DESC,request_id);

CREATE FUNCTION public.read_google_index_context(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project jsonb;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 SELECT data INTO project FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
 RETURN jsonb_build_object('property',project#>>'{gscOAuth,selectedSite,siteUrl}');
END; $$;

CREATE FUNCTION public.reserve_google_index_inspection(p_user uuid,p_project text,p_request uuid,p_property text,p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.google_index_inspections%ROWTYPE;
BEGIN
 context:=public.read_google_index_context(p_user,p_project);
 IF p_request IS NULL OR p_property IS NULL OR p_property IS DISTINCT FROM context->>'property' OR p_url IS NULL OR p_url !~ '^https?://[^/@[:space:]]+' OR p_url ~ '[[:space:]]' THEN RAISE EXCEPTION 'google_inspection_scope'; END IF;
 SELECT * INTO current FROM public.google_index_inspections WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
   IF current.project_id<>p_project OR current.property<>p_property OR current.url<>p_url THEN RAISE EXCEPTION 'google_inspection_replay'; END IF;
   IF current.status='running' AND current.lease_until<=clock_timestamp() THEN
     UPDATE public.google_index_inspections SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request RETURNING * INTO current;
   END IF;
   RETURN jsonb_build_object('claimed',false,'record',to_jsonb(current)-ARRAY['lease_token','lease_until']);
 END IF;
 UPDATE public.google_index_inspections SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND status='running' AND lease_until<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM public.google_index_inspections WHERE user_id=p_user AND project_id=p_project AND status='running') THEN RAISE EXCEPTION 'google_inspection_active'; END IF;
 IF (SELECT count(*) FROM public.google_index_inspections WHERE user_id=p_user AND project_id=p_project AND created_at>clock_timestamp()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'google_inspection_quota'; END IF;
 INSERT INTO public.google_index_inspections(user_id,project_id,request_id,property,url,status,lease_token,lease_until)
 VALUES(p_user,p_project,p_request,p_property,p_url,'running',gen_random_uuid(),clock_timestamp()+interval '60 seconds') RETURNING * INTO current;
 RETURN jsonb_build_object('claimed',true,'record',to_jsonb(current));
END; $$;

CREATE FUNCTION public.finish_google_index_inspection(p_user uuid,p_project text,p_request uuid,p_lease uuid,p_observation jsonb,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.google_index_inspections%ROWTYPE;
BEGIN
 context:=public.read_google_index_context(p_user,p_project);
 SELECT * INTO current FROM public.google_index_inspections WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'running' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF current.lease_until<=clock_timestamp() OR current.property IS DISTINCT FROM context->>'property' THEN
   UPDATE public.google_index_inspections SET status=CASE WHEN current.property IS DISTINCT FROM context->>'property' THEN 'held' ELSE 'unknown' END,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
   RETURN false;
 END IF;
 IF p_observation IS NOT NULL THEN
   IF p_error IS NOT NULL OR jsonb_typeof(p_observation)<>'object' OR p_observation->>'source' IS DISTINCT FROM 'google_index' OR p_observation->>'inspectionMode' IS DISTINCT FROM 'indexed_version' OR p_observation->>'url' IS DISTINCT FROM current.url OR p_observation->>'property' IS DISTINCT FROM current.property THEN RAISE EXCEPTION 'google_inspection_result_invalid'; END IF;
 ELSIF p_error IS NULL OR p_error NOT IN ('access','quota','unavailable') THEN RAISE EXCEPTION 'google_inspection_result_invalid'; END IF;
 UPDATE public.google_index_inspections SET status=CASE WHEN p_observation IS NOT NULL THEN 'succeeded' WHEN p_error='unavailable' THEN 'unknown' ELSE 'failed' END,observation=p_observation,error_code=p_error,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 RETURN true;
END; $$;

CREATE FUNCTION public.list_google_index_inspections(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.read_google_index_context(p_user,p_project);
 UPDATE public.google_index_inspections SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND status='running' AND lease_until<=clock_timestamp();
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)-ARRAY['lease_token','lease_until'] ORDER BY r.created_at DESC,r.request_id) FROM (SELECT * FROM public.google_index_inspections WHERE user_id=p_user AND project_id=p_project ORDER BY created_at DESC,request_id LIMIT 20) r),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.read_google_index_context(uuid,text),public.reserve_google_index_inspection(uuid,text,uuid,text,text),public.finish_google_index_inspection(uuid,text,uuid,uuid,jsonb,text),public.list_google_index_inspections(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_google_index_context(uuid,text),public.reserve_google_index_inspection(uuid,text,uuid,text,text),public.finish_google_index_inspection(uuid,text,uuid,uuid,jsonb,text),public.list_google_index_inspections(uuid,text) TO service_role;
