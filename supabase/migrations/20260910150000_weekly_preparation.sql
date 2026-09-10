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
  IF EXISTS(SELECT 1 FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project AND status<>'released')
    OR EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND state IN ('running','unknown')) THEN
    RAISE EXCEPTION 'scheduler_recovery_required' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.project_scheduler_control(user_id,project_id,revision,engine,preparation)
    VALUES(p_user,p_project,p_expected+1,p_engine,p_preparation)
    ON CONFLICT(user_id,project_id) DO UPDATE SET revision=p_expected+1,engine=p_engine,preparation=p_preparation,updated_at=now();
  -- Control changes invalidate in-flight workspace-based notification snapshots.
  UPDATE public.workspace_meta SET rev=rev+1 WHERE user_id=p_user;
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
    IF EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND state IN ('running','unknown')) THEN RETURN NULL; END IF;
    UPDATE public.auto_scheduler_leases SET token=v_token,planned_period=p_period,status='active',acquired_at=now(),lease_until=now()+interval '15 minutes',finished_at=NULL WHERE user_id=p_user AND project_id=p_project;
    RETURN v_token;
  END IF;
  IF v.status='active' AND v.lease_until<=now() THEN UPDATE public.auto_scheduler_leases SET status='unknown' WHERE user_id=p_user AND project_id=p_project; END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.read_project_scheduler_control(uuid,text),public.set_project_scheduler_control(uuid,text,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_scheduler_control(uuid,text),public.set_project_scheduler_control(uuid,text,integer,text,jsonb) TO service_role;

-- One immutable attempt per weekly slot/stage. An uncertain attempt cannot be
-- replaced with a fresh paid request. Keep small research output and archive IDs,
-- never copied article/image bodies or provider credentials.
CREATE TABLE public.weekly_preparation_stages (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  publish_at timestamptz NOT NULL,
  stage text NOT NULL CHECK(stage IN ('research','content','image')),
  period text NOT NULL,
  control_revision integer NOT NULL CHECK(control_revision>0),
  lease_token uuid NOT NULL,
  request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  output_id uuid NOT NULL DEFAULT gen_random_uuid(),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN ('running','unknown','retained','cancelled')),
  result jsonb CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=32000)),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  delivered_at timestamptz,
  delivery_hash text,
  PRIMARY KEY(user_id,project_id,publish_at,stage),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.weekly_preparation_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_preparation_stages FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.begin_weekly_preparation_stage(p_user uuid,p_project text,p_lease uuid,p_revision integer,p_publish timestamptz,p_stage text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE control public.project_scheduler_control%ROWTYPE; lease public.auto_scheduler_leases%ROWTYPE; current public.weekly_preparation_stages%ROWTYPE; zone text;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  SELECT * INTO control FROM public.project_scheduler_control WHERE user_id=p_user AND project_id=p_project;
  SELECT * INTO lease FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project;
  IF control.engine IS DISTINCT FROM 'weekly' OR p_revision IS NULL OR control.revision IS DISTINCT FROM p_revision
    OR p_lease IS NULL OR lease.token IS DISTINCT FROM p_lease OR lease.status IS DISTINCT FROM 'active' OR lease.lease_until<=clock_timestamp()
    OR lease.planned_period NOT LIKE 'week:%' THEN RAISE EXCEPTION 'scheduler_engine_changed' USING ERRCODE='40001'; END IF;
  IF p_publish IS NULL OR NOT isfinite(p_publish) OR p_publish<=clock_timestamp() OR p_stage IS NULL OR p_stage NOT IN ('research','content','image')
    OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_weekly_stage' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project AND data->'autoScheduler'->'enabled'='true'::jsonb) THEN RAISE EXCEPTION 'scheduler_disabled'; END IF;
  SELECT coalesce(nullif(btrim(data->'autoScheduler'->>'timeZone'),''),'Europe/Stockholm') INTO zone FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
  IF to_char(date_trunc('week',p_publish AT TIME ZONE zone),'YYYY-MM-DD')<>substring(lease.planned_period FROM 6) THEN RAISE EXCEPTION 'invalid_weekly_stage'; END IF;
  SELECT * INTO current FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND publish_at=p_publish AND stage=p_stage;
  IF current.request_id IS NOT NULL THEN
    -- No takeover, even if a setting, input hash, period or lease changed.
    RETURN jsonb_build_object('acquired',false,'requestId',current.request_id,'outputId',current.output_id,'state',CASE WHEN current.state='running' THEN 'unknown' ELSE current.state END,'inputHash',current.input_hash,'result',current.result);
  END IF;
  IF EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND publish_at=p_publish AND state='cancelled') THEN RAISE EXCEPTION 'weekly_slot_cancelled'; END IF;
  IF (SELECT count(*) FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project)>=3000 THEN RAISE EXCEPTION 'weekly_stage_capacity'; END IF;
  INSERT INTO public.weekly_preparation_stages(user_id,project_id,publish_at,stage,period,control_revision,lease_token,input_hash,state)
    VALUES(p_user,p_project,p_publish,p_stage,lease.planned_period,p_revision,p_lease,p_hash,'running') RETURNING * INTO current;
  RETURN jsonb_build_object('acquired',true,'requestId',current.request_id,'outputId',current.output_id,'state',current.state,'inputHash',current.input_hash,'result',NULL);
END; $$;
CREATE FUNCTION public.finish_weekly_preparation_stage(p_user uuid,p_project text,p_request uuid,p_hash text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.weekly_preparation_stages%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  SELECT * INTO current FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND request_id=p_request;
  IF current.request_id IS NULL OR p_hash IS NULL OR current.input_hash<>p_hash OR current.state='cancelled' THEN RAISE EXCEPTION 'weekly_stage_changed' USING ERRCODE='40001'; END IF;
  IF current.state='retained' THEN
    IF current.result IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'weekly_stage_changed' USING ERRCODE='40001'; END IF;
    RETURN true;
  END IF;
  IF p_result IS NOT NULL AND (jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>32000) THEN RAISE EXCEPTION 'invalid_weekly_result'; END IF;
  IF p_result IS NOT NULL AND current.stage IN ('content','image') AND NOT EXISTS(
    SELECT 1 FROM public.ai_generation_results r JOIN public.ai_generation_usage_receipts u ON u.id=r.receipt_id AND u.user_id=r.user_id
    WHERE r.user_id=p_user AND r.receipt_id::text=p_result->>'receiptId' AND u.native_attempt_id=current.request_id
      AND r.payload->>'projectId'=p_project AND r.payload->>'kind'=current.stage
      AND CASE WHEN current.stage='content' THEN r.payload->>'assetId' ELSE r.payload->>'imageId' END=current.output_id::text
      AND r.discarded_at IS NULL
  ) THEN RAISE EXCEPTION 'weekly_result_unconfirmed'; END IF;
  -- A stage is acknowledged only after its exact generated output is archived.
  UPDATE public.weekly_preparation_stages SET state=CASE WHEN p_result IS NULL THEN 'unknown' ELSE 'retained' END,result=p_result,finished_at=clock_timestamp()
    WHERE user_id=p_user AND project_id=p_project AND request_id=p_request;
  RETURN true;
END; $$;
CREATE FUNCTION public.read_weekly_preparation_stages(p_user uuid,p_project text,p_period text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('publishAt',s.publish_at,'stage',s.stage,'requestId',s.request_id,'outputId',s.output_id,'inputHash',s.input_hash,'state',CASE WHEN s.state='running' AND NOT EXISTS(SELECT 1 FROM public.auto_scheduler_leases l WHERE l.user_id=s.user_id AND l.project_id=s.project_id AND l.token=s.lease_token AND l.status='active' AND l.lease_until>clock_timestamp()) THEN 'unknown' ELSE s.state END,'result',s.result,'deliveredAt',s.delivered_at,'outputChanged',coalesce(s.stage='content' AND s.delivery_hash IS NOT NULL AND EXISTS(SELECT 1 FROM public.workspace_entities e WHERE e.user_id=s.user_id AND e.collection='content' AND e.entity_id=s.output_id::text AND md5(e.data::text)<>s.delivery_hash),false)) ORDER BY s.publish_at,s.stage) FROM public.weekly_preparation_stages s WHERE s.user_id=p_user AND s.project_id=p_project AND s.period=p_period),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.begin_weekly_preparation_stage(uuid,text,uuid,integer,timestamptz,text,text),public.finish_weekly_preparation_stage(uuid,text,uuid,text,jsonb),public.read_weekly_preparation_stages(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_weekly_preparation_stage(uuid,text,uuid,integer,timestamptz,text,text),public.finish_weekly_preparation_stage(uuid,text,uuid,text,jsonb),public.read_weekly_preparation_stages(uuid,text,text) TO service_role;

CREATE FUNCTION public.recover_weekly_preparation_stage(p_user uuid,p_project text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.weekly_preparation_stages%ROWTYPE; result jsonb; matches integer;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  SELECT * INTO current FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND request_id=p_request;
  IF current.request_id IS NULL OR current.state='cancelled' THEN RAISE EXCEPTION 'weekly_stage_changed'; END IF;
  IF current.state='retained' THEN RETURN current.result; END IF;
  IF current.stage='research' THEN RETURN NULL; END IF;
  SELECT count(*),jsonb_build_object('receiptId',min(r.receipt_id::text)) INTO matches,result
    FROM public.ai_generation_results r JOIN public.ai_generation_usage_receipts u ON u.id=r.receipt_id AND u.user_id=r.user_id
    WHERE r.user_id=p_user AND u.native_attempt_id=current.request_id AND r.payload->>'projectId'=p_project
      AND r.payload->>'kind'=current.stage
      AND CASE WHEN current.stage='content' THEN r.payload->>'assetId' ELSE r.payload->>'imageId' END=current.output_id::text
      AND r.discarded_at IS NULL;
  IF matches<>1 THEN RETURN NULL; END IF;
  PERFORM public.finish_weekly_preparation_stage(p_user,p_project,p_request,current.input_hash,result);
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.recover_weekly_preparation_stage(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_weekly_preparation_stage(uuid,text,uuid) TO service_role;
