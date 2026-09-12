-- UNRELEASED. Private owner configuration only; no schedules or provider calls are enabled.
CREATE TABLE public.backlink_recurring_monitors (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 monitor_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 website_value text NOT NULL CHECK(length(website_value) BETWEEN 1 AND 8192),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=2000),
 next_due_at timestamptz NOT NULL CHECK(next_due_at=date_trunc('milliseconds',next_due_at)),
 last_change_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,project_id),
 UNIQUE(user_id,project_id,monitor_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.backlink_recurring_monitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backlink_recurring_monitors FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_backlink_recurring_monitor(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.backlink_recurring_monitors%ROWTYPE;
BEGIN
 PERFORM public.read_backlink_monitoring_owner(p_user,p_project,false);
 SELECT * INTO current FROM public.backlink_recurring_monitors WHERE user_id=p_user AND project_id=p_project;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(current)-'last_change_id';
END; $$;

CREATE FUNCTION public.save_backlink_recurring_monitor(p_user uuid,p_project text,p_change uuid,p_revision bigint,p_website text,p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.backlink_recurring_monitors%ROWTYPE; keys integer;
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 IF p_change IS NULL OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 9007199254740990 OR p_website IS DISTINCT FROM website THEN RAISE EXCEPTION 'backlink_monitor_scope'; END IF;
 IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR octet_length(p_settings::text)>2000 THEN RAISE EXCEPTION 'backlink_monitor_settings'; END IF;
 SELECT count(*) INTO keys FROM jsonb_object_keys(p_settings);
 IF keys<>5 OR NOT(p_settings ?& ARRAY['enabled','cadence','lookbackDays','includeSubdomains','monthlyCapMicrousd']) OR jsonb_typeof(p_settings->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_settings->'includeSubdomains') IS DISTINCT FROM 'boolean' OR p_settings->>'cadence' NOT IN ('daily','weekly') OR jsonb_typeof(p_settings->'cadence') IS DISTINCT FROM 'string' OR jsonb_typeof(p_settings->'lookbackDays') IS DISTINCT FROM 'number' OR jsonb_typeof(p_settings->'monthlyCapMicrousd') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'backlink_monitor_settings'; END IF;
 IF (p_settings->>'lookbackDays')::numeric NOT BETWEEN 1 AND 92 OR (p_settings->>'lookbackDays')::numeric<>trunc((p_settings->>'lookbackDays')::numeric) OR (p_settings->>'monthlyCapMicrousd')::numeric NOT BETWEEN 0 AND 100000000 OR (p_settings->>'monthlyCapMicrousd')::numeric<>trunc((p_settings->>'monthlyCapMicrousd')::numeric) OR ((p_settings->>'enabled')::boolean AND (p_settings->>'monthlyCapMicrousd')::numeric<24000+36*(p_settings->>'lookbackDays')::integer) THEN RAISE EXCEPTION 'backlink_monitor_settings'; END IF;
 SELECT * INTO current FROM public.backlink_recurring_monitors WHERE user_id=p_user AND project_id=p_project FOR UPDATE NOWAIT;
 IF FOUND THEN
   IF current.last_change_id=p_change THEN
     IF current.revision<>p_revision+1 OR current.website_value IS DISTINCT FROM website OR current.settings IS DISTINCT FROM p_settings THEN RAISE EXCEPTION 'backlink_monitor_replay'; END IF;
     RETURN to_jsonb(current)-'last_change_id';
   END IF;
   IF current.revision<>p_revision THEN RAISE EXCEPTION 'backlink_monitor_conflict'; END IF;
   -- Preserve the existing due anchor. Editing or pausing is not a new occurrence.
   UPDATE public.backlink_recurring_monitors SET website_value=website,revision=revision+1,settings=p_settings,last_change_id=p_change,updated_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project RETURNING * INTO current;
 ELSE
   IF p_revision<>0 THEN RAISE EXCEPTION 'backlink_monitor_conflict'; END IF;
   INSERT INTO public.backlink_recurring_monitors(user_id,project_id,website_value,revision,settings,next_due_at,last_change_id) VALUES(p_user,p_project,website,1,p_settings,date_trunc('milliseconds',clock_timestamp()),p_change) RETURNING * INTO current;
 END IF;
 RETURN to_jsonb(current)-'last_change_id';
END; $$;
REVOKE ALL ON FUNCTION public.read_backlink_recurring_monitor(uuid,text),public.save_backlink_recurring_monitor(uuid,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_backlink_recurring_monitor(uuid,text),public.save_backlink_recurring_monitor(uuid,text,uuid,bigint,text,jsonb) TO service_role;


CREATE TABLE public.backlink_recurring_observations (
 user_id uuid NOT NULL, project_id text NOT NULL, monitor_id uuid NOT NULL, request_id uuid NOT NULL,
 settings_revision bigint NOT NULL CHECK(settings_revision BETWEEN 1 AND 9007199254740991),
 website_value text NOT NULL, scope jsonb NOT NULL,
 occurrence_at timestamptz NOT NULL, next_due_at timestamptz NOT NULL CHECK(next_due_at>occurrence_at),
 billing_month text NOT NULL CHECK(billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 ceiling_microusd bigint NOT NULL CHECK(ceiling_microusd BETWEEN 24036 AND 27312),
 undispatched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,request_id),
 UNIQUE(user_id,monitor_id,occurrence_at),
 FOREIGN KEY(user_id,project_id,monitor_id) REFERENCES public.backlink_recurring_monitors(user_id,project_id,monitor_id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,request_id) REFERENCES public.backlink_monitoring_requests(user_id,request_id) ON DELETE CASCADE
);
CREATE INDEX backlink_recurring_observation_period ON public.backlink_recurring_observations(user_id,monitor_id,billing_month);
ALTER TABLE public.backlink_recurring_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backlink_recurring_observations FROM PUBLIC,anon,authenticated,service_role;

-- Internal accounting projection. Recovery of the immutable supplier receipt is
-- reflected immediately; unresolved charges retain at least the whole ceiling.
CREATE FUNCTION public.backlink_recurring_spending(p_user uuid,p_monitor uuid,p_month text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'reservedOrSpentMicrousd',coalesce(sum(CASE WHEN o.undispatched_at IS NOT NULL THEN 0
    WHEN r.status='succeeded' AND r.accounting_state='settled' THEN ceil((r.observation->>'providerReportedCostUsd')::numeric*1000000)
    ELSE greatest(o.ceiling_microusd,ceil((r.observation->>'providerReportedCostUsd')::numeric*1000000)) END) FILTER(WHERE o.billing_month=p_month),0),
  'unsettled',coalesce(bool_or(o.undispatched_at IS NULL AND NOT(r.status='succeeded' AND r.accounting_state='settled')),false))
 FROM public.backlink_recurring_observations o JOIN public.backlink_monitoring_requests r USING(user_id,request_id)
 WHERE o.user_id=p_user AND o.monitor_id=p_monitor;
$$;

-- Internal, called only while holding the owner workspace lock. Expiry can prove
-- a request was never admitted; a dispatched/expense-bearing request is never freed.
CREATE FUNCTION public.release_undispatched_backlink_observations(p_user uuid,p_monitor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record;
BEGIN
 FOR item IN SELECT o.request_id FROM public.backlink_recurring_observations o JOIN public.backlink_monitoring_requests r USING(user_id,request_id)
 WHERE o.user_id=p_user AND o.monitor_id=p_monitor AND o.undispatched_at IS NULL AND r.status IN ('reserved','held') AND r.lease_until<=clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.ai_expense_requests a WHERE a.request_id=o.request_id) FOR UPDATE OF r,o NOWAIT LOOP
  UPDATE public.backlink_monitoring_requests SET status='held',updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=item.request_id;
  UPDATE public.backlink_recurring_observations SET undispatched_at=clock_timestamp() WHERE user_id=p_user AND request_id=item.request_id;
 END LOOP;
END; $$;

CREATE FUNCTION public.reserve_backlink_recurring_observation(p_user uuid,p_project text,p_request uuid,p_website text,p_scope jsonb,p_monitor uuid,p_revision bigint,p_occurrence timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; monitor public.backlink_recurring_monitors%ROWTYPE; saved public.backlink_recurring_observations%ROWTYPE; result jsonb; usage jsonb; observed_now timestamptz:=clock_timestamp(); step_seconds integer; occurrence timestamptz; next_due timestamptz; last_day date; first_day date; billing text; ceiling bigint;
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 SELECT * INTO monitor FROM public.backlink_recurring_monitors WHERE user_id=p_user AND project_id=p_project AND monitor_id=p_monitor FOR UPDATE NOWAIT;
 IF NOT FOUND OR p_website IS DISTINCT FROM website OR monitor.website_value IS DISTINCT FROM website OR p_revision IS DISTINCT FROM monitor.revision OR p_request IS NULL THEN RAISE EXCEPTION 'backlink_monitor_scope'; END IF;
 SELECT * INTO saved FROM public.backlink_recurring_observations WHERE user_id=p_user AND request_id=p_request;
 IF FOUND THEN
  IF saved.monitor_id IS DISTINCT FROM p_monitor OR saved.settings_revision IS DISTINCT FROM p_revision OR saved.occurrence_at IS DISTINCT FROM p_occurrence OR saved.scope IS DISTINCT FROM p_scope OR saved.website_value IS DISTINCT FROM website THEN RAISE EXCEPTION 'backlink_monitor_replay'; END IF;
  RETURN public.reserve_backlink_monitoring(p_user,p_project,p_request,p_website,p_scope);
 END IF;
 IF EXISTS(SELECT 1 FROM public.backlink_monitoring_requests WHERE user_id=p_user AND request_id=p_request) THEN RAISE EXCEPTION 'backlink_monitor_replay'; END IF;
 IF (monitor.settings->>'enabled')::boolean IS DISTINCT FROM true OR monitor.next_due_at>observed_now THEN RAISE EXCEPTION 'backlink_monitor_not_due'; END IF;
 PERFORM public.release_undispatched_backlink_observations(p_user,p_monitor);
 billing:=to_char(timezone('UTC',observed_now),'YYYY-MM');
 usage:=public.backlink_recurring_spending(p_user,p_monitor,billing);
 IF (usage->>'unsettled')::boolean THEN RAISE EXCEPTION 'backlink_monitor_unsettled'; END IF;
 step_seconds:=CASE monitor.settings->>'cadence' WHEN 'daily' THEN 86400 ELSE 604800 END;
 occurrence:=monitor.next_due_at+make_interval(secs=>floor(extract(epoch FROM observed_now-monitor.next_due_at)/step_seconds)::double precision*step_seconds);
 next_due:=occurrence+make_interval(secs=>step_seconds);
 last_day:=(occurrence AT TIME ZONE 'UTC')::date-1;
 first_day:=last_day-(monitor.settings->>'lookbackDays')::integer+1;
 IF p_occurrence IS DISTINCT FROM occurrence OR p_scope->>'dateFrom' IS DISTINCT FROM first_day::text OR p_scope->>'dateTo' IS DISTINCT FROM last_day::text OR p_scope->'includeSubdomains' IS DISTINCT FROM monitor.settings->'includeSubdomains' THEN RAISE EXCEPTION 'backlink_monitor_scope'; END IF;
 ceiling:=24000+36*(monitor.settings->>'lookbackDays')::integer;
 IF (usage->>'reservedOrSpentMicrousd')::numeric+ceiling>(monitor.settings->>'monthlyCapMicrousd')::numeric THEN RAISE EXCEPTION 'backlink_monitor_cap'; END IF;
 result:=public.reserve_backlink_monitoring(p_user,p_project,p_request,p_website,p_scope);
 IF (result->>'claimed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'backlink_monitor_replay'; END IF;
 INSERT INTO public.backlink_recurring_observations(user_id,project_id,monitor_id,request_id,settings_revision,website_value,scope,occurrence_at,next_due_at,billing_month,ceiling_microusd)
 VALUES(p_user,p_project,p_monitor,p_request,p_revision,website,p_scope,occurrence,next_due,billing,ceiling);
 UPDATE public.backlink_recurring_monitors SET next_due_at=next_due WHERE user_id=p_user AND project_id=p_project;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.backlink_recurring_spending(uuid,uuid,text),public.release_undispatched_backlink_observations(uuid,uuid),public.reserve_backlink_recurring_observation(uuid,text,uuid,text,jsonb,uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_backlink_recurring_observation(uuid,text,uuid,text,jsonb,uuid,bigint,timestamptz) TO service_role;


CREATE FUNCTION public.authorize_backlink_recurring_dispatch(p_user uuid,p_project text,p_request uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; monitor public.backlink_recurring_monitors%ROWTYPE; occurrence public.backlink_recurring_observations%ROWTYPE; current public.backlink_monitoring_requests%ROWTYPE; usage jsonb; allowed boolean:=false; valid boolean;
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 SELECT * INTO occurrence FROM public.backlink_recurring_observations WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE NOWAIT;
 IF NOT FOUND OR occurrence.undispatched_at IS NOT NULL THEN RETURN false; END IF;
 SELECT * INTO current FROM public.backlink_monitoring_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE NOWAIT;
 IF NOT FOUND OR current.status<>'reserved' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 SELECT * INTO monitor FROM public.backlink_recurring_monitors WHERE user_id=p_user AND project_id=p_project AND monitor_id=occurrence.monitor_id FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 usage:=public.backlink_recurring_spending(p_user,monitor.monitor_id,occurrence.billing_month);
 valid:=monitor.revision=occurrence.settings_revision AND monitor.website_value=website AND occurrence.website_value=website AND current.website_value=website
 AND (monitor.settings->>'enabled')::boolean AND occurrence.billing_month=to_char(timezone('UTC',clock_timestamp()),'YYYY-MM')
 AND (usage->>'reservedOrSpentMicrousd')::numeric<=(monitor.settings->>'monthlyCapMicrousd')::numeric;
 IF valid THEN
   -- A rejected SQL admission rolls back its entire subtransaction. A missing HTTP
   -- acknowledgement after successful admission remains dispatched and uncertain.
   BEGIN allowed:=public.authorize_backlink_monitoring_dispatch(p_user,p_project,p_request,p_lease);
   EXCEPTION WHEN OTHERS THEN allowed:=false;
   END;
 END IF;
 IF allowed THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_expense_requests WHERE request_id=p_request) AND EXISTS(SELECT 1 FROM public.backlink_monitoring_requests WHERE user_id=p_user AND request_id=p_request AND status IN ('reserved','held') AND lease_token=p_lease) THEN
   UPDATE public.backlink_monitoring_requests SET status='held',updated_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
   UPDATE public.backlink_recurring_observations SET undispatched_at=clock_timestamp() WHERE user_id=p_user AND request_id=p_request;
 END IF;
 RETURN false;
END; $$;

CREATE FUNCTION public.finish_backlink_recurring_observation(p_user uuid,p_project text,p_request uuid,p_lease uuid,p_observation jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.read_backlink_monitoring_owner(p_user,p_project,true);
 PERFORM 1 FROM public.backlink_recurring_observations WHERE user_id=p_user AND project_id=p_project AND request_id=p_request AND undispatched_at IS NULL FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Finish retains the admitted settings revision even if the owner paused meanwhile.
 RETURN public.finish_backlink_monitoring(p_user,p_project,p_request,p_lease,p_observation);
END; $$;
REVOKE ALL ON FUNCTION public.authorize_backlink_recurring_dispatch(uuid,text,uuid,uuid),public.finish_backlink_recurring_observation(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_backlink_recurring_dispatch(uuid,text,uuid,uuid),public.finish_backlink_recurring_observation(uuid,text,uuid,uuid,jsonb) TO service_role;
