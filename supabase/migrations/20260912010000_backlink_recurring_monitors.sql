-- UNRELEASED. Private owner configuration only; no schedules or provider calls are enabled.
CREATE TABLE public.backlink_recurring_monitors (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 monitor_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 website_value text NOT NULL CHECK(length(website_value) BETWEEN 1 AND 8192),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=2000),
 next_due_at timestamptz NOT NULL,
 last_change_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,project_id)
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
   INSERT INTO public.backlink_recurring_monitors(user_id,project_id,website_value,revision,settings,next_due_at,last_change_id) VALUES(p_user,p_project,website,1,p_settings,clock_timestamp(),p_change) RETURNING * INTO current;
 END IF;
 RETURN to_jsonb(current)-'last_change_id';
END; $$;
REVOKE ALL ON FUNCTION public.read_backlink_recurring_monitor(uuid,text),public.save_backlink_recurring_monitor(uuid,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_backlink_recurring_monitor(uuid,text),public.save_backlink_recurring_monitor(uuid,text,uuid,bigint,text,jsonb) TO service_role;
