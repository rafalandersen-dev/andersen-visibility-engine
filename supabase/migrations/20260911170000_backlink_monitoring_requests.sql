-- UNRELEASED. No budgets, permits, schedules or provider calls are provisioned.
CREATE TABLE public.backlink_monitoring_requests (
 user_id uuid NOT NULL, project_id text NOT NULL, request_id uuid NOT NULL,
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 website_value text NOT NULL CHECK(length(website_value) BETWEEN 1 AND 8192),
 scope jsonb NOT NULL CHECK(jsonb_typeof(scope)='object' AND octet_length(scope::text)<=1024),
 ceiling_microusd bigint NOT NULL CHECK(ceiling_microusd BETWEEN 24036 AND 27312),
 status text NOT NULL CHECK(status IN ('reserved','dispatched','succeeded','held','unknown')),
 accounting_state text NOT NULL DEFAULT 'pending' CHECK(accounting_state IN ('pending','unknown','settled')),
 lease_token uuid NOT NULL, lease_until timestamptz NOT NULL, dispatched_at timestamptz,
 observation jsonb CHECK(observation IS NULL OR (jsonb_typeof(observation)='object' AND octet_length(observation::text)<=100000)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX backlink_monitoring_active ON public.backlink_monitoring_requests(user_id,project_id) WHERE status IN ('reserved','dispatched');
CREATE INDEX backlink_monitoring_history ON public.backlink_monitoring_requests(user_id,project_id,created_at DESC,request_id);
-- Counters survive deletion of a project/account, including uncertain in-flight calls.
CREATE TABLE public.backlink_monitoring_limits (
 scope text PRIMARY KEY CHECK(scope='global' OR scope ~ '^user:[0-9a-f-]{36}$'),
 requests timestamptz[] NOT NULL DEFAULT '{}' CHECK(cardinality(requests)<=200),
 dispatches timestamptz[] NOT NULL DEFAULT '{}' CHECK(cardinality(dispatches)<=100),
 leases jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<=2000)
);
ALTER TABLE public.backlink_monitoring_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlink_monitoring_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backlink_monitoring_requests,public.backlink_monitoring_limits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_backlink_monitoring_owner(p_user uuid,p_project text,p_lock boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 IF p_user IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$' OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'backlink_monitoring_access'; END IF;
 SELECT data->>'websiteUrl' INTO website FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
 IF website IS NULL OR length(website) NOT BETWEEN 1 AND 8192 THEN RAISE EXCEPTION 'backlink_monitoring_access'; END IF;
 IF p_lock THEN
   PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'backlink_monitoring_access'; END IF;
   SELECT data->>'websiteUrl' INTO website FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
   IF website IS NULL THEN RAISE EXCEPTION 'backlink_monitoring_access'; END IF;
 END IF;
 RETURN website;
END; $$;

CREATE FUNCTION public.read_backlink_monitoring_context(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN jsonb_build_object('website',public.read_backlink_monitoring_owner(p_user,p_project)); END; $$;
REVOKE ALL ON FUNCTION public.read_backlink_monitoring_context(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_backlink_monitoring_context(uuid,text) TO service_role;

CREATE FUNCTION public.reserve_backlink_monitoring(p_user uuid,p_project text,p_request uuid,p_website text,p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.backlink_monitoring_requests%ROWTYPE; bucket public.backlink_monitoring_limits%ROWTYPE; key text; starts timestamptz[]; from_day date; to_day date; days integer;
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 IF p_request IS NULL OR p_website IS DISTINCT FROM website OR p_scope IS NULL OR jsonb_typeof(p_scope)<>'object' OR octet_length(p_scope::text)>1024 OR (SELECT count(*) FROM jsonb_object_keys(p_scope))<>4 OR p_scope->>'target' IS NULL OR p_scope->>'target' !~ '^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$' OR jsonb_typeof(p_scope->'includeSubdomains') IS DISTINCT FROM 'boolean' OR p_scope->>'dateFrom' IS NULL OR p_scope->>'dateTo' IS NULL OR p_scope->>'dateFrom' !~ '^\d{4}-\d{2}-\d{2}$' OR p_scope->>'dateTo' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'backlink_monitoring_scope'; END IF;
 from_day:=(p_scope->>'dateFrom')::date; to_day:=(p_scope->>'dateTo')::date; days:=to_day-from_day+1;
 IF days NOT BETWEEN 1 AND 92 OR from_day<'2019-01-30'::date OR to_day>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'backlink_monitoring_scope'; END IF;
 SELECT * INTO current FROM public.backlink_monitoring_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
   IF current.project_id<>p_project OR current.website_value<>p_website OR current.scope<>p_scope THEN RAISE EXCEPTION 'backlink_monitoring_replay'; END IF;
   RETURN jsonb_build_object('claimed',false,'record',to_jsonb(current)-ARRAY['lease_token','lease_until']);
 END IF;
 UPDATE public.backlink_monitoring_requests SET status=CASE WHEN dispatched_at IS NULL THEN 'held' ELSE 'unknown' END,updated_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND status IN ('reserved','dispatched') AND lease_until<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM public.backlink_monitoring_requests WHERE user_id=p_user AND project_id=p_project AND status IN ('reserved','dispatched')) THEN RAISE EXCEPTION 'backlink_monitoring_active'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('backlink_monitoring_limits')) THEN RAISE EXCEPTION 'backlink_monitoring_busy' USING ERRCODE='55P03'; END IF;
 FOREACH key IN ARRAY ARRAY['global','user:'||p_user::text] LOOP
   INSERT INTO public.backlink_monitoring_limits(scope) VALUES(key) ON CONFLICT DO NOTHING;
   SELECT * INTO bucket FROM public.backlink_monitoring_limits WHERE scope=key FOR UPDATE NOWAIT;
   SELECT coalesce(array_agg(t),'{}') INTO starts FROM unnest(bucket.requests) t WHERE t>clock_timestamp()-interval '1 hour';
   IF cardinality(starts)>=(CASE WHEN key='global' THEN 200 ELSE 20 END) THEN RAISE EXCEPTION 'backlink_monitoring_quota'; END IF;
   UPDATE public.backlink_monitoring_limits SET requests=array_append(starts,clock_timestamp()) WHERE scope=key;
 END LOOP;
 INSERT INTO public.backlink_monitoring_requests(user_id,project_id,request_id,website_value,scope,ceiling_microusd,status,lease_token,lease_until) VALUES(p_user,p_project,p_request,p_website,p_scope,24000+36*days,'reserved',gen_random_uuid(),clock_timestamp()+interval '60 seconds') RETURNING * INTO current;
 RETURN jsonb_build_object('claimed',true,'record',to_jsonb(current));
END; $$;

CREATE FUNCTION public.authorize_backlink_monitoring_dispatch(p_user uuid,p_project text,p_request uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.backlink_monitoring_requests%ROWTYPE; bucket public.backlink_monitoring_limits%ROWTYPE; key text; starts timestamptz[]; active jsonb; expense record;
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 SELECT * INTO current FROM public.backlink_monitoring_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'reserved' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease OR current.dispatched_at IS NOT NULL THEN RETURN false; END IF;
 IF current.website_value IS DISTINCT FROM website OR current.lease_until<=clock_timestamp()+interval '25 seconds' THEN
   UPDATE public.backlink_monitoring_requests SET status='held',updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request; RETURN false;
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('backlink_monitoring_limits')) THEN RAISE EXCEPTION 'backlink_monitoring_busy' USING ERRCODE='55P03'; END IF;
 FOREACH key IN ARRAY ARRAY['global','user:'||p_user::text] LOOP
   SELECT * INTO bucket FROM public.backlink_monitoring_limits WHERE scope=key FOR UPDATE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'backlink_monitoring_quota'; END IF;
   SELECT coalesce(array_agg(t),'{}') INTO starts FROM unnest(bucket.dispatches) t WHERE t>clock_timestamp()-interval '1 hour';
   SELECT coalesce(jsonb_object_agg(k,v),'{}') INTO active FROM jsonb_each_text(bucket.leases) e(k,v) WHERE v::timestamptz>clock_timestamp();
   IF cardinality(starts)>=(CASE WHEN key='global' THEN 100 ELSE 20 END) OR (SELECT count(*) FROM unnest(starts) t WHERE t>clock_timestamp()-interval '1 minute')>=(CASE WHEN key='global' THEN 10 ELSE 5 END) OR (SELECT count(*) FROM jsonb_object_keys(active))>=(CASE WHEN key='global' THEN 4 ELSE 2 END) THEN RAISE EXCEPTION 'backlink_monitoring_quota'; END IF;
   UPDATE public.backlink_monitoring_limits SET dispatches=array_append(starts,clock_timestamp()),leases=active||jsonb_build_object(p_request::text,current.lease_until) WHERE scope=key;
 END LOOP;
 SELECT * INTO expense FROM public.reserve_ai_expense(p_request,p_user,p_request,'dataforseo','backlinks-timeseries-new-lost-summary','backlink_monitoring',current.ceiling_microusd);
 IF expense.allowed IS DISTINCT FROM true OR expense.reason IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'backlink_monitoring_expense'; END IF;
 UPDATE public.backlink_monitoring_requests SET status='dispatched',dispatched_at=clock_timestamp(),updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 RETURN true;
END; $$;

CREATE FUNCTION public.finish_backlink_monitoring(p_user uuid,p_project text,p_request uuid,p_lease uuid,p_observation jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.backlink_monitoring_requests%ROWTYPE; actual bigint; accounting text:='pending';
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 SELECT * INTO current FROM public.backlink_monitoring_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE;
 IF NOT FOUND OR current.status<>'dispatched' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF current.website_value IS DISTINCT FROM website OR current.lease_until<=clock_timestamp() THEN
   UPDATE public.backlink_monitoring_requests SET status='unknown',updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request; RETURN false;
 END IF;
 IF p_observation IS NOT NULL THEN
   IF jsonb_typeof(p_observation)<>'object' OR octet_length(p_observation::text)>100000 OR p_observation->>'source' IS DISTINCT FROM 'dataforseo_index' OR p_observation->'scope' IS DISTINCT FROM current.scope OR jsonb_typeof(p_observation->'days') IS DISTINCT FROM 'array' OR jsonb_array_length(p_observation->'days')>92 OR jsonb_typeof(p_observation->'providerReportedCostUsd') IS DISTINCT FROM 'number' OR p_observation->>'providerTaskId' IS NULL OR length(p_observation->>'providerTaskId') NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'backlink_monitoring_result'; END IF;
   IF (p_observation->>'providerReportedCostUsd')::numeric<0 THEN RAISE EXCEPTION 'backlink_monitoring_result'; END IF;
   actual:=ceil((p_observation->>'providerReportedCostUsd')::numeric*1000000)::bigint;
   IF actual<0 OR actual>1000000000000 THEN RAISE EXCEPTION 'backlink_monitoring_result'; END IF;
 END IF;
 BEGIN
   PERFORM public.reconcile_ai_expense(p_request,p_user,actual,CASE WHEN p_observation IS NULL THEN 'uncertain' ELSE 'succeeded' END,CASE WHEN actual IS NULL THEN NULL ELSE 'DataForSEO task cost' END,p_observation->>'providerTaskId',NULL,NULL);
   accounting:=CASE WHEN actual IS NULL THEN 'unknown' ELSE 'settled' END;
 EXCEPTION WHEN OTHERS THEN
   -- Preserve usable evidence while the original expense reservation remains held.
   accounting:='pending';
 END;
 UPDATE public.backlink_monitoring_requests SET status=CASE WHEN p_observation IS NULL THEN 'unknown' ELSE 'succeeded' END,observation=p_observation,accounting_state=accounting,updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 -- Keep provider slots until original deadline even when local completion is uncertain.
 RETURN true;
END; $$;

CREATE FUNCTION public.list_backlink_monitoring(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.read_backlink_monitoring_owner(p_user,p_project);
 RETURN coalesce((SELECT jsonb_agg((to_jsonb(r)-ARRAY['lease_token','lease_until'])||jsonb_build_object('status',CASE WHEN r.status IN ('reserved','dispatched') AND r.lease_until<=clock_timestamp() THEN CASE WHEN r.dispatched_at IS NULL THEN 'held' ELSE 'unknown' END ELSE r.status END) ORDER BY r.created_at DESC,r.request_id) FROM (SELECT * FROM public.backlink_monitoring_requests WHERE user_id=p_user AND project_id=p_project ORDER BY created_at DESC,request_id LIMIT 20) r),'[]');
END; $$;
REVOKE ALL ON FUNCTION public.read_backlink_monitoring_owner(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reserve_backlink_monitoring(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.authorize_backlink_monitoring_dispatch(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_backlink_monitoring(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_backlink_monitoring(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_backlink_monitoring(uuid,text,uuid,text,jsonb),public.authorize_backlink_monitoring_dispatch(uuid,text,uuid,uuid),public.finish_backlink_monitoring(uuid,text,uuid,uuid,jsonb),public.list_backlink_monitoring(uuid,text) TO service_role;
