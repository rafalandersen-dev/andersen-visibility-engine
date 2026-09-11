-- UNRELEASED. Per-connection proof and deployment/account/destination admission.
-- Deployment ceiling:8 concurrent connections,120 starts/minute,1200 starts/hour.
CREATE TABLE public.technical_crawl_dispatch_limits (
 scope text NOT NULL CHECK(scope IN ('global','account','target','account_address','address')),
 scope_key text NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 253),
 minute_start timestamptz NOT NULL,
 minute_count integer NOT NULL CHECK(minute_count BETWEEN 0 AND 120),
 hour_start timestamptz NOT NULL,
 hour_count integer NOT NULL CHECK(hour_count BETWEEN 0 AND 1200),
 leases jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(leases)='object' AND octet_length(leases::text)<2000),
 last_used timestamptz NOT NULL,
 PRIMARY KEY(scope,scope_key)
);
CREATE INDEX technical_crawl_dispatch_idle ON public.technical_crawl_dispatch_limits(last_used);
ALTER TABLE public.technical_crawl_dispatch_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_crawl_dispatch_limits FROM PUBLIC,anon,authenticated,service_role;

-- Bind a pre-DNS reservation to its run and allow exactly one address promotion.
CREATE TABLE public.technical_crawl_dispatch_tickets (
 lease uuid PRIMARY KEY,user_id uuid NOT NULL,project_id text NOT NULL,run_id uuid NOT NULL,
 run_lease uuid NOT NULL,origin text NOT NULL,expires_at timestamptz NOT NULL,address inet
);
ALTER TABLE public.technical_crawl_dispatch_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_crawl_dispatch_tickets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.acquire_technical_crawl_dispatch(p_user uuid,p_project text,p_run uuid,p_run_lease uuid,p_origin text,p_address inet,p_prior_lease uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run public.technical_crawls%ROWTYPE; budget public.technical_crawl_dispatch_limits%ROWTYPE; stamp timestamptz:=clock_timestamp(); lease uuid:=gen_random_uuid(); target text; kind text; key text; active_leases jsonb; expires timestamptz; ticket public.technical_crawl_dispatch_tickets%ROWTYPE;
BEGIN
 -- Authority precedes target-budget access, so forged targets cannot consume another site's allowance.
 PERFORM public.assert_technical_crawl_ownership(p_user,p_project,p_origin);
 SELECT * INTO run FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR SHARE NOWAIT;
 IF NOT FOUND OR run.status NOT IN ('preparing','running') OR run.origin IS DISTINCT FROM p_origin OR run.website_value IS DISTINCT FROM (SELECT data->>'websiteUrl' FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project) OR p_run_lease IS NULL OR run.lease_token IS DISTINCT FROM p_run_lease OR run.lease_until IS NULL OR run.lease_until<clock_timestamp()+interval '15 seconds' THEN RAISE EXCEPTION 'technical_dispatch_ownership'; END IF;
 target:=substring(run.origin from '^https?://([^/:]+)');
 IF target IS NULL OR length(target)>253 THEN RAISE EXCEPTION 'technical_dispatch_ownership'; END IF;
 IF (p_prior_lease IS NOT NULL AND p_address IS NULL) OR (p_address IS NOT NULL AND masklen(p_address)<>(CASE WHEN family(p_address)=4 THEN 32 ELSE 128 END)) THEN RAISE EXCEPTION 'technical_dispatch_ownership'; END IF;
 expires:=least(run.lease_until,clock_timestamp()+interval '20 seconds');
 IF p_prior_lease IS NOT NULL THEN
   SELECT t.* INTO ticket FROM public.technical_crawl_dispatch_tickets t WHERE t.lease=p_prior_lease FOR UPDATE NOWAIT;
   IF NOT FOUND OR ticket.user_id<>p_user OR ticket.project_id<>p_project OR ticket.run_id<>p_run OR ticket.run_lease<>p_run_lease OR ticket.origin<>p_origin OR ticket.address IS NOT NULL OR ticket.expires_at<clock_timestamp()+interval '10 seconds' THEN RAISE EXCEPTION 'technical_dispatch_ownership'; END IF;
   lease:=ticket.lease;expires:=ticket.expires_at;
 END IF;
 FOREACH kind IN ARRAY CASE WHEN p_address IS NULL THEN ARRAY['global','account','target'] ELSE ARRAY['global','account','target','account_address','address'] END LOOP
   key:=CASE WHEN kind='global' THEN 'deployment' WHEN kind='account' THEN p_user::text WHEN kind='target' THEN target WHEN kind='account_address' THEN p_user::text||':'||host(p_address) ELSE host(p_address) END;
   IF NOT pg_try_advisory_xact_lock(hashtext('technical-dispatch-'||kind),hashtext(key)) THEN RAISE EXCEPTION 'technical_dispatch_capacity'; END IF;
   INSERT INTO public.technical_crawl_dispatch_limits VALUES(kind,key,stamp,0,stamp,0,'{}',stamp) ON CONFLICT DO NOTHING;
   SELECT * INTO budget FROM public.technical_crawl_dispatch_limits WHERE scope=kind AND scope_key=key FOR UPDATE NOWAIT;
   SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO active_leases FROM jsonb_each(budget.leases) e WHERE (e.value#>>'{}')::timestamptz>clock_timestamp();
   IF p_prior_lease IS NOT NULL AND kind IN ('global','account','target') THEN
     IF NOT active_leases ? lease::text THEN RAISE EXCEPTION 'technical_dispatch_capacity'; END IF;
     CONTINUE;
   END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(active_leases))>=(CASE WHEN kind='global' THEN 8 WHEN kind='address' THEN 4 ELSE 2 END) THEN RAISE EXCEPTION 'technical_dispatch_capacity'; END IF;
   IF budget.minute_start<=stamp-interval '1 minute' THEN budget.minute_start:=stamp;budget.minute_count:=0; END IF;
   IF budget.hour_start<=stamp-interval '1 hour' THEN budget.hour_start:=stamp;budget.hour_count:=0; END IF;
   IF budget.minute_count>=(CASE WHEN kind='global' THEN 120 WHEN kind='account_address' THEN 30 ELSE 60 END) OR budget.hour_count>=(CASE WHEN kind='global' THEN 1200 WHEN kind='account_address' THEN 300 ELSE 600 END) THEN RAISE EXCEPTION 'technical_dispatch_capacity'; END IF;
   UPDATE public.technical_crawl_dispatch_limits SET minute_start=budget.minute_start,minute_count=budget.minute_count+1,hour_start=budget.hour_start,hour_count=budget.hour_count+1,leases=active_leases||jsonb_build_object(lease::text,expires),last_used=stamp WHERE scope=kind AND scope_key=key;
 END LOOP;
 IF p_prior_lease IS NULL THEN
   INSERT INTO public.technical_crawl_dispatch_tickets VALUES(lease,p_user,p_project,p_run,p_run_lease,p_origin,expires,p_address);
 ELSE
   UPDATE public.technical_crawl_dispatch_tickets SET address=p_address WHERE technical_crawl_dispatch_tickets.lease=p_prior_lease;
 END IF;
 DELETE FROM public.technical_crawl_dispatch_tickets WHERE technical_crawl_dispatch_tickets.lease IN (SELECT t.lease FROM public.technical_crawl_dispatch_tickets t WHERE t.expires_at<stamp ORDER BY t.expires_at LIMIT 4 FOR UPDATE SKIP LOCKED);
 -- Bounded cleanup of idle operational rows; active/rate windows are never pruned.
 DELETE FROM public.technical_crawl_dispatch_limits WHERE (scope,scope_key) IN (SELECT scope,scope_key FROM public.technical_crawl_dispatch_limits WHERE last_used<stamp-interval '24 hours' ORDER BY last_used LIMIT 4 FOR UPDATE SKIP LOCKED);
 RETURN jsonb_build_object('lease',lease,'expiresAt',expires);
END; $$;

CREATE FUNCTION public.release_technical_crawl_dispatch(p_user uuid,p_origin text,p_lease uuid,p_address inet)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target text:=substring(p_origin from '^https?://([^/:]+)');
BEGIN
 IF p_user IS NULL OR p_lease IS NULL OR target IS NULL THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('technical-dispatch-global'),hashtext('deployment')) OR NOT pg_try_advisory_xact_lock(hashtext('technical-dispatch-account'),hashtext(p_user::text)) OR NOT pg_try_advisory_xact_lock(hashtext('technical-dispatch-target'),hashtext(target)) OR (p_address IS NOT NULL AND (NOT pg_try_advisory_xact_lock(hashtext('technical-dispatch-account_address'),hashtext(p_user::text||':'||host(p_address))) OR NOT pg_try_advisory_xact_lock(hashtext('technical-dispatch-address'),hashtext(host(p_address))))) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.technical_crawl_dispatch_limits WHERE scope='account' AND scope_key=p_user::text AND leases ? p_lease::text) THEN RETURN; END IF;
 UPDATE public.technical_crawl_dispatch_limits SET leases=leases-p_lease::text WHERE (scope='global' AND scope_key='deployment') OR (scope='account' AND scope_key=p_user::text) OR (scope='target' AND scope_key=target) OR (scope='account_address' AND scope_key=p_user::text||':'||host(p_address)) OR (scope='address' AND scope_key=host(p_address));
 DELETE FROM public.technical_crawl_dispatch_tickets WHERE user_id=p_user AND origin=p_origin AND lease=p_lease;
END; $$;

CREATE FUNCTION public.hold_technical_crawl_admission(p_user uuid,p_project text,p_run uuid,p_lease uuid,p_revision bigint,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 IF p_reason IS NULL OR p_reason NOT IN ('capacity','ownership') THEN RAISE EXCEPTION 'technical_admission_invalid'; END IF;
 UPDATE public.technical_crawls SET status='held',resume_status=CASE WHEN website_value IS NOT DISTINCT FROM website THEN status ELSE NULL END,admission_hold=CASE WHEN website_value IS NOT DISTINCT FROM website THEN p_reason ELSE NULL END,retry_after=CASE WHEN website_value IS NOT DISTINCT FROM website AND p_reason='capacity' THEN clock_timestamp()+interval '1 minute' ELSE NULL END,revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE user_id=p_user AND project_id=p_project AND run_id=p_run AND status IN ('preparing','running') AND lease_token=p_lease AND lease_until>clock_timestamp() AND revision=p_revision;
 RETURN FOUND;
END; $$;

CREATE FUNCTION public.resume_technical_crawl_admission(p_user uuid,p_project text,p_run uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run public.technical_crawls%ROWTYPE;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO run FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR UPDATE NOWAIT;
 IF NOT FOUND OR run.status<>'held' OR run.admission_hold IS NULL OR run.resume_status IS NULL OR run.retry_after>clock_timestamp() THEN RETURN false; END IF;
 PERFORM public.assert_technical_crawl_ownership(p_user,p_project,run.origin);
 IF EXISTS(SELECT 1 FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND status IN ('preparing','running')) THEN RAISE EXCEPTION 'technical_crawl_active'; END IF;
 UPDATE public.technical_crawls SET status=resume_status,resume_status=NULL,admission_hold=NULL,retry_after=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.acquire_technical_crawl_dispatch(uuid,text,uuid,uuid,text,inet,uuid),public.release_technical_crawl_dispatch(uuid,text,uuid,inet),public.hold_technical_crawl_admission(uuid,text,uuid,uuid,bigint,text),public.resume_technical_crawl_admission(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_technical_crawl_dispatch(uuid,text,uuid,uuid,text,inet,uuid),public.release_technical_crawl_dispatch(uuid,text,uuid,inet),public.hold_technical_crawl_admission(uuid,text,uuid,uuid,bigint,text),public.resume_technical_crawl_admission(uuid,text,uuid) TO service_role;
