-- Proposed P3 coordinator cutover. No cron/provider/publication starts here.
CREATE TABLE public.project_scheduler_control (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  revision integer NOT NULL CHECK(revision>0),
  engine text NOT NULL CHECK(engine IN ('monthly','weekly','paused')),
  preparation jsonb NOT NULL CHECK(jsonb_typeof(preparation)='object' AND octet_length(preparation::text)<1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,project_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.project_scheduler_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_scheduler_control FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_project_scheduler_control(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN coalesce((SELECT jsonb_build_object('revision',revision,'engine',engine,'preparation',preparation) FROM public.project_scheduler_control WHERE user_id=p_user AND project_id=p_project),jsonb_build_object('revision',0,'engine','monthly','preparation',jsonb_build_object('preparationWeekday',5,'preparationTime','16:00','reviewLeadHours',48)));
END; $$;

CREATE FUNCTION public.set_project_scheduler_control(p_user uuid,p_project text,p_expected integer,p_engine text,p_preparation jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision integer;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_expected IS NULL OR p_expected<0 OR p_engine IS NULL OR p_engine NOT IN ('monthly','weekly','paused')
    OR p_preparation IS NULL OR jsonb_typeof(p_preparation)<>'object' OR octet_length(p_preparation::text)>=1000
    OR coalesce(p_preparation->>'preparationWeekday','') !~ '^[1-7]$'
    OR coalesce(p_preparation->>'preparationTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_preparation->>'reviewLeadHours','') !~ '^[0-9]{1,3}$'
    OR (p_preparation->>'reviewLeadHours')::integer NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'invalid_scheduler_control' USING ERRCODE='22023';
  END IF;
  SELECT revision INTO current_revision FROM public.project_scheduler_control WHERE user_id=p_user AND project_id=p_project;
  IF coalesce(current_revision,0)<>p_expected THEN RAISE EXCEPTION 'scheduler_control_changed' USING ERRCODE='40001'; END IF;
  -- Never transfer a slot while an original process may still be working.
  -- Expired/unknown runs require existing recovery, not automatic takeover.
  IF EXISTS(SELECT 1 FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project AND status<>'released') THEN
    RAISE EXCEPTION 'scheduler_recovery_required' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.project_scheduler_control(user_id,project_id,revision,engine,preparation)
    VALUES(p_user,p_project,p_expected+1,p_engine,p_preparation)
    ON CONFLICT(user_id,project_id) DO UPDATE SET revision=p_expected+1,engine=p_engine,preparation=p_preparation,updated_at=now();
  RETURN public.read_project_scheduler_control(p_user,p_project);
END; $$;

ALTER TABLE public.auto_scheduler_leases DROP CONSTRAINT auto_scheduler_leases_planned_period_check;
ALTER TABLE public.auto_scheduler_leases ADD CONSTRAINT auto_scheduler_leases_planned_period_check CHECK(planned_period ~ '^([0-9]{4}-(0[1-9]|1[0-2])|week:[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2})$');
CREATE OR REPLACE FUNCTION public.claim_auto_scheduler_lease(p_user uuid,p_project text,p_period text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.auto_scheduler_leases%ROWTYPE; v_token uuid:=gen_random_uuid(); engine text; week_date date;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_period IS NULL OR p_period !~ '^([0-9]{4}-(0[1-9]|1[0-2])|week:[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2})$' THEN RAISE EXCEPTION 'invalid_scheduler_lease'; END IF;
  SELECT c.engine INTO engine FROM public.project_scheduler_control c WHERE user_id=p_user AND project_id=p_project;
  engine:=coalesce(engine,'monthly');
  IF engine='paused' OR (engine='monthly' AND p_period LIKE 'week:%') OR (engine='weekly' AND p_period NOT LIKE 'week:%') THEN
    RAISE EXCEPTION 'scheduler_engine_changed' USING ERRCODE='40001';
  END IF;
  IF p_period LIKE 'week:%' THEN
    week_date:=substring(p_period FROM 6)::date;
    IF extract(isodow FROM week_date)<>1 OR to_char(week_date,'YYYY-MM-DD')<>substring(p_period FROM 6) THEN RAISE EXCEPTION 'invalid_scheduler_lease'; END IF;
  END IF;
  INSERT INTO public.auto_scheduler_leases(user_id,project_id,planned_period,token,status) VALUES(p_user,p_project,p_period,v_token,'active') ON CONFLICT(user_id,project_id) DO NOTHING;
  SELECT * INTO v FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project FOR UPDATE;
  IF v.token=v_token THEN RETURN v_token; END IF;
  IF v.status='released' THEN
    UPDATE public.auto_scheduler_leases SET token=v_token,planned_period=p_period,status='active',acquired_at=now(),lease_until=now()+interval '15 minutes',finished_at=NULL WHERE user_id=p_user AND project_id=p_project;
    RETURN v_token;
  END IF;
  IF v.status='active' AND v.lease_until<=now() THEN UPDATE public.auto_scheduler_leases SET status='unknown' WHERE user_id=p_user AND project_id=p_project; END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.read_project_scheduler_control(uuid,text),public.set_project_scheduler_control(uuid,text,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_scheduler_control(uuid,text),public.set_project_scheduler_control(uuid,text,integer,text,jsonb) TO service_role;
