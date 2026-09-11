-- UNRELEASED. Private, explicit owner requests; no timer or provider call in SQL.
CREATE TABLE public.technical_performance_requests (
 user_id uuid NOT NULL,
 project_id text NOT NULL,
 request_id uuid NOT NULL,
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 website_value text NOT NULL CHECK(length(website_value) BETWEEN 1 AND 8192),
 origin text NOT NULL CHECK(origin ~ '^https?://[^/?#@[:space:]]+$' AND length(origin)<=8192),
 source text NOT NULL CHECK(source IN ('crux','pagespeed')),
 scope text NOT NULL CHECK(scope IN ('url','origin')),
 device text NOT NULL,
 CHECK((source='crux' AND device IN ('PHONE','DESKTOP','TABLET','ALL')) OR (source='pagespeed' AND scope='url' AND device IN ('mobile','desktop'))),
 url text NOT NULL CHECK(length(url) BETWEEN 1 AND 8192),
 status text NOT NULL CHECK(status IN ('running','succeeded','failed','unknown','held')),
 lease_token uuid NOT NULL,
 lease_until timestamptz NOT NULL,
 dispatched_at timestamptz,
 observation jsonb,
 error_code text CHECK(error_code IN ('access','quota','unavailable','configuration')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
 CHECK(observation IS NULL OR (jsonb_typeof(observation)='object' AND octet_length(observation::text)<=32000))
);
ALTER TABLE public.technical_performance_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_performance_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX technical_performance_one_active_owner ON public.technical_performance_requests(user_id) WHERE status='running';
CREATE INDEX technical_performance_requests_owner_activity ON public.technical_performance_requests(user_id,created_at DESC);
CREATE INDEX technical_performance_requests_history ON public.technical_performance_requests(user_id,project_id,created_at DESC,request_id);

-- Deployment-wide provider admission survives project/account deletion.
CREATE TABLE public.technical_performance_provider_limits (
 source text PRIMARY KEY CHECK(source IN ('crux','pagespeed')),
 minute_start timestamptz NOT NULL, minute_count integer NOT NULL CHECK(minute_count BETWEEN 0 AND 10),
 hour_start timestamptz NOT NULL, hour_count integer NOT NULL CHECK(hour_count BETWEEN 0 AND 100),
 leases jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<4096)
);
ALTER TABLE public.technical_performance_provider_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_performance_provider_limits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_technical_performance_context(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 website:=public.read_technical_crawl_owner(p_user,p_project);
 RETURN jsonb_build_object('website',website);
END; $$;

CREATE FUNCTION public.reserve_technical_performance_request(p_user uuid,p_project text,p_request uuid,p_website text,p_origin text,p_url text,p_source text,p_scope text,p_device text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.technical_performance_requests%ROWTYPE;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 context:=public.read_technical_performance_context(p_user,p_project);
 IF p_request IS NULL OR p_website IS NULL OR p_website IS DISTINCT FROM context->>'website' OR p_origin IS NULL OR p_source IS NULL OR p_scope IS NULL OR p_device IS NULL OR p_url IS NULL OR p_url !~ '^https?://[^/@[:space:]]+' OR p_url ~ '[[:space:]]' OR p_origin !~ '^https?://[^/?#@[:space:]]+$' OR left(p_url,length(p_origin)+1)<>p_origin || '/' OR p_url ~ '#'  THEN RAISE EXCEPTION 'performance_scope'; END IF;
 SELECT * INTO current FROM public.technical_performance_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
   IF current.project_id<>p_project OR current.website_value<>p_website OR current.origin<>p_origin OR current.source<>p_source OR current.scope<>p_scope OR current.device<>p_device OR current.url<>p_url THEN RAISE EXCEPTION 'performance_replay'; END IF;
   IF current.status='running' AND current.lease_until<=clock_timestamp() THEN
     UPDATE public.technical_performance_requests SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request RETURNING * INTO current;
   END IF;
   RETURN jsonb_build_object('claimed',false,'record',to_jsonb(current)-ARRAY['lease_token','lease_until']);
 END IF;
 UPDATE public.technical_performance_requests SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND status='running' AND lease_until<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM public.technical_performance_requests WHERE user_id=p_user AND status='running') THEN RAISE EXCEPTION 'performance_active'; END IF;
 IF (SELECT count(*) FROM public.technical_performance_requests WHERE user_id=p_user AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'performance_quota'; END IF;
 INSERT INTO public.technical_performance_requests(user_id,project_id,request_id,website_value,origin,url,source,scope,device,status,lease_token,lease_until)
 VALUES(p_user,p_project,p_request,p_website,p_origin,p_url,p_source,p_scope,p_device,'running',gen_random_uuid(),clock_timestamp()+interval '90 seconds') RETURNING * INTO current;
 RETURN jsonb_build_object('claimed',true,'record',to_jsonb(current));
END; $$;

CREATE FUNCTION public.authorize_technical_performance_dispatch(p_user uuid,p_project text,p_request uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.technical_performance_requests%ROWTYPE; budget public.technical_performance_provider_limits%ROWTYPE; stamp timestamptz:=clock_timestamp(); active_leases jsonb;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 context:=public.read_technical_performance_context(p_user,p_project);
 SELECT * INTO current FROM public.technical_performance_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'running' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease OR current.dispatched_at IS NOT NULL THEN RETURN false; END IF;
 IF current.website_value IS DISTINCT FROM context->>'website' OR current.lease_until<=clock_timestamp()+interval '75 seconds' THEN
   UPDATE public.technical_performance_requests SET status=CASE WHEN current.website_value IS DISTINCT FROM context->>'website' THEN 'held' ELSE 'unknown' END,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
   RETURN false;
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('technical-performance-provider'),hashtext(current.source)) THEN RAISE EXCEPTION 'performance_provider_busy' USING ERRCODE='55P03'; END IF;
 INSERT INTO public.technical_performance_provider_limits VALUES(current.source,stamp,0,stamp,0,'{}') ON CONFLICT DO NOTHING;
 SELECT * INTO budget FROM public.technical_performance_provider_limits WHERE source=current.source FOR UPDATE NOWAIT;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO active_leases FROM jsonb_each(budget.leases) e WHERE (e.value#>>'{}')::timestamptz>stamp;
 IF budget.minute_start<=stamp-interval '1 minute' THEN budget.minute_start:=stamp;budget.minute_count:=0; END IF;
 IF budget.hour_start<=stamp-interval '1 hour' THEN budget.hour_start:=stamp;budget.hour_count:=0; END IF;
 IF budget.minute_count>=10 OR budget.hour_count>=100 OR (SELECT count(*) FROM jsonb_object_keys(active_leases))>=4 THEN
   UPDATE public.technical_performance_requests SET status='held',error_code='quota',updated_at=stamp WHERE user_id=p_user AND request_id=p_request;
   RETURN false;
 END IF;
 -- Slots remain until the run deadline, including after client timeout or project deletion.
 UPDATE public.technical_performance_provider_limits SET minute_start=budget.minute_start,minute_count=budget.minute_count+1,hour_start=budget.hour_start,hour_count=budget.hour_count+1,leases=active_leases||jsonb_build_object(current.lease_token::text,current.lease_until) WHERE source=current.source;
 UPDATE public.technical_performance_requests SET dispatched_at=clock_timestamp(),updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 RETURN true;
END; $$;

CREATE FUNCTION public.finish_technical_performance_request(p_user uuid,p_project text,p_request uuid,p_lease uuid,p_observation jsonb,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; current public.technical_performance_requests%ROWTYPE;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 context:=public.read_technical_performance_context(p_user,p_project);
 SELECT * INTO current FROM public.technical_performance_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'running' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF current.lease_until<=clock_timestamp() OR current.website_value IS DISTINCT FROM context->>'website' THEN
   UPDATE public.technical_performance_requests SET status=CASE WHEN current.website_value IS DISTINCT FROM context->>'website' THEN 'held' ELSE 'unknown' END,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
   RETURN false;
 END IF;
 IF p_observation IS NOT NULL THEN
   IF current.dispatched_at IS NULL THEN RAISE EXCEPTION 'performance_result_invalid'; END IF;
   IF p_error IS NOT NULL OR jsonb_typeof(p_observation)<>'object' OR p_observation->>'source' IS DISTINCT FROM (CASE WHEN current.source='crux' THEN 'crux' ELSE 'pagespeed_lighthouse' END) OR p_observation->>'evidenceKind' IS DISTINCT FROM (CASE WHEN current.source='crux' THEN 'field' ELSE 'lab' END) OR p_observation->>'requestedUrl' IS DISTINCT FROM current.url OR p_observation->>'device' IS DISTINCT FROM current.device OR (current.source='crux' AND p_observation->>'requestedScope' IS DISTINCT FROM current.scope) THEN RAISE EXCEPTION 'performance_result_invalid'; END IF;
 ELSIF p_error IS NULL OR p_error NOT IN ('access','quota','unavailable','configuration') THEN RAISE EXCEPTION 'performance_result_invalid'; END IF;
 UPDATE public.technical_performance_requests SET status=CASE WHEN p_observation IS NOT NULL THEN 'succeeded' WHEN p_error='unavailable' THEN 'unknown' ELSE 'failed' END,observation=p_observation,error_code=p_error,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 RETURN true;
END; $$;

CREATE FUNCTION public.list_technical_performance_requests(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.read_technical_performance_context(p_user,p_project);
 UPDATE public.technical_performance_requests SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND status='running' AND lease_until<=clock_timestamp();
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)-ARRAY['lease_token','lease_until'] ORDER BY r.created_at DESC,r.request_id) FROM (SELECT * FROM public.technical_performance_requests WHERE user_id=p_user AND project_id=p_project ORDER BY created_at DESC,request_id LIMIT 20) r),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.read_technical_performance_context(uuid,text),public.reserve_technical_performance_request(uuid,text,uuid,text,text,text,text,text,text),public.finish_technical_performance_request(uuid,text,uuid,uuid,jsonb,text),public.list_technical_performance_requests(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_technical_performance_context(uuid,text),public.reserve_technical_performance_request(uuid,text,uuid,text,text,text,text,text,text),public.finish_technical_performance_request(uuid,text,uuid,uuid,jsonb,text),public.list_technical_performance_requests(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.authorize_technical_performance_dispatch(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_technical_performance_dispatch(uuid,text,uuid,uuid) TO service_role;
