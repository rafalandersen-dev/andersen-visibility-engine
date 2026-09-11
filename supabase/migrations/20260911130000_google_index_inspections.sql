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
 dispatched_at timestamptz,
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
CREATE UNIQUE INDEX google_index_one_active_project ON public.google_index_inspections(user_id,project_id) WHERE status='running';
CREATE INDEX google_index_inspections_history ON public.google_index_inspections(user_id,project_id,created_at DESC,request_id);

-- Reserve before OAuth refresh as well as inspection. Buckets survive tenant/project deletion.
CREATE TABLE public.google_index_dispatch_limits (
 source text PRIMARY KEY CHECK(source='google_index'),
 minute_start timestamptz NOT NULL, minute_count integer NOT NULL CHECK(minute_count BETWEEN 0 AND 30),
 hour_start timestamptz NOT NULL, hour_count integer NOT NULL CHECK(hour_count BETWEEN 0 AND 300),
 leases jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<4096)
);
CREATE TABLE public.google_index_account_limits (
 user_id uuid PRIMARY KEY,
 minute_start timestamptz NOT NULL, minute_count integer NOT NULL CHECK(minute_count BETWEEN 0 AND 5),
 hour_start timestamptz NOT NULL, hour_count integer NOT NULL CHECK(hour_count BETWEEN 0 AND 30),
 leases jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<1024)
);
ALTER TABLE public.google_index_dispatch_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_index_account_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_index_dispatch_limits,public.google_index_account_limits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_google_index_context(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project jsonb;
BEGIN
 PERFORM public.read_technical_crawl_owner(p_user,p_project);
 SELECT data INTO project FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
 RETURN jsonb_build_object('property',project#>>'{gscOAuth,selectedSite,siteUrl}');
END; $$;

CREATE FUNCTION public.reserve_google_index_inspection(p_user uuid,p_project text,p_request uuid,p_property text,p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.google_index_inspections%ROWTYPE; stamp timestamptz:=clock_timestamp(); new_lease uuid:=gen_random_uuid(); new_until timestamptz;
 budget public.google_index_dispatch_limits%ROWTYPE; account_budget public.google_index_account_limits%ROWTYPE; active_leases jsonb; account_leases jsonb;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
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
 -- Shared admission happens before returning a claim, so token refresh also consumes retained capacity.
 new_until:=stamp+interval '60 seconds';
 IF NOT pg_try_advisory_xact_lock(hashtext('google-index-dispatch'),0) THEN RAISE EXCEPTION 'google_inspection_busy' USING ERRCODE='55P03'; END IF;
 INSERT INTO public.google_index_dispatch_limits VALUES('google_index',stamp,0,stamp,0,'{}') ON CONFLICT DO NOTHING;
 SELECT * INTO budget FROM public.google_index_dispatch_limits WHERE source='google_index' FOR UPDATE NOWAIT;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO active_leases FROM jsonb_each(budget.leases) e WHERE (e.value#>>'{}')::timestamptz>stamp;
 IF budget.minute_start<=stamp-interval '1 minute' THEN budget.minute_start:=stamp;budget.minute_count:=0; END IF;
 IF budget.hour_start<=stamp-interval '1 hour' THEN budget.hour_start:=stamp;budget.hour_count:=0; END IF;
 INSERT INTO public.google_index_account_limits VALUES(p_user,stamp,0,stamp,0,'{}') ON CONFLICT DO NOTHING;
 SELECT * INTO account_budget FROM public.google_index_account_limits WHERE user_id=p_user FOR UPDATE NOWAIT;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO account_leases FROM jsonb_each(account_budget.leases) e WHERE (e.value#>>'{}')::timestamptz>stamp;
 IF account_budget.minute_start<=stamp-interval '1 minute' THEN account_budget.minute_start:=stamp;account_budget.minute_count:=0; END IF;
 IF account_budget.hour_start<=stamp-interval '1 hour' THEN account_budget.hour_start:=stamp;account_budget.hour_count:=0; END IF;
 IF budget.minute_count>=30 OR budget.hour_count>=300 OR (SELECT count(*) FROM jsonb_object_keys(active_leases))>=8 OR account_budget.minute_count>=5 OR account_budget.hour_count>=30 OR (SELECT count(*) FROM jsonb_object_keys(account_leases))>=2 THEN RAISE EXCEPTION 'google_inspection_quota'; END IF;
 -- Keep capacity through completion, timeout and deletion until the original deadline.
 UPDATE public.google_index_dispatch_limits SET minute_start=budget.minute_start,minute_count=budget.minute_count+1,hour_start=budget.hour_start,hour_count=budget.hour_count+1,leases=active_leases||jsonb_build_object(new_lease::text,new_until) WHERE source='google_index';
 UPDATE public.google_index_account_limits SET minute_start=account_budget.minute_start,minute_count=account_budget.minute_count+1,hour_start=account_budget.hour_start,hour_count=account_budget.hour_count+1,leases=account_leases||jsonb_build_object(new_lease::text,new_until) WHERE user_id=p_user;
 INSERT INTO public.google_index_inspections(user_id,project_id,request_id,property,url,status,lease_token,lease_until)
 VALUES(p_user,p_project,p_request,p_property,p_url,'running',new_lease,new_until) RETURNING * INTO current;
 RETURN jsonb_build_object('claimed',true,'record',to_jsonb(current));
END; $$;

CREATE FUNCTION public.authorize_google_index_dispatch(p_user uuid,p_project text,p_request uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.google_index_inspections%ROWTYPE;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 context:=public.read_google_index_context(p_user,p_project);
 SELECT * INTO current FROM public.google_index_inspections WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'running' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease OR current.dispatched_at IS NOT NULL THEN RETURN false; END IF;
 IF current.property IS DISTINCT FROM context->>'property' OR current.lease_until<=clock_timestamp()+interval '20 seconds' THEN
   UPDATE public.google_index_inspections SET status=CASE WHEN current.property IS DISTINCT FROM context->>'property' THEN 'held' ELSE 'unknown' END,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
   RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.google_index_dispatch_limits WHERE source='google_index' AND (leases->>p_lease::text)::timestamptz=current.lease_until) OR NOT EXISTS(SELECT 1 FROM public.google_index_account_limits WHERE user_id=p_user AND (leases->>p_lease::text)::timestamptz=current.lease_until) THEN RETURN false; END IF;
 UPDATE public.google_index_inspections SET dispatched_at=clock_timestamp(),updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 RETURN true;
END; $$;

CREATE FUNCTION public.finish_google_index_inspection(p_user uuid,p_project text,p_request uuid,p_lease uuid,p_observation jsonb,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.google_index_inspections%ROWTYPE;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 context:=public.read_google_index_context(p_user,p_project);
 SELECT * INTO current FROM public.google_index_inspections WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'running' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF current.lease_until<=clock_timestamp() OR current.property IS DISTINCT FROM context->>'property' THEN
   UPDATE public.google_index_inspections SET status=CASE WHEN current.property IS DISTINCT FROM context->>'property' THEN 'held' ELSE 'unknown' END,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
   RETURN false;
 END IF;
 IF p_observation IS NOT NULL THEN
   IF current.dispatched_at IS NULL THEN RAISE EXCEPTION 'google_inspection_result_invalid'; END IF;
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

REVOKE ALL ON FUNCTION public.authorize_google_index_dispatch(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_google_index_dispatch(uuid,text,uuid,uuid) TO service_role;
