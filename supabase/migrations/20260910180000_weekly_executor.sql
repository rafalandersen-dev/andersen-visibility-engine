-- P3 executor recovery and fair dispatch. No project is switched or funded.
ALTER TABLE public.project_scheduler_control ADD COLUMN last_dispatch_at timestamptz;
CREATE FUNCTION public.next_weekly_preparation_target()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.project_scheduler_control%ROWTYPE;
BEGIN
  SELECT c.* INTO target FROM public.project_scheduler_control c
    JOIN public.workspace_entities p ON p.user_id=c.user_id AND p.collection='projects' AND p.entity_id=c.project_id
    WHERE c.engine='weekly' AND p.data->'autoScheduler'->'enabled'='true'::jsonb
    ORDER BY c.last_dispatch_at NULLS FIRST,c.user_id,c.project_id LIMIT 1 FOR UPDATE OF c SKIP LOCKED;
  IF target.project_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.project_scheduler_control SET last_dispatch_at=clock_timestamp() WHERE user_id=target.user_id AND project_id=target.project_id;
  RETURN jsonb_build_object('ownerId',target.user_id,'projectId',target.project_id);
END; $$;

-- Delivery evidence is written in the SAME transaction as the workspace entity.
-- It survives owner deletion, preventing a later cron from restoring deleted work.
CREATE FUNCTION public.track_weekly_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.collection='opportunities' THEN
    UPDATE public.weekly_preparation_stages SET delivered_at=coalesce(delivered_at,clock_timestamp()) WHERE user_id=NEW.user_id AND project_id=NEW.data->>'projectId' AND stage='research' AND result->'opportunity'->>'id'=NEW.entity_id;
  END IF;
  IF NEW.collection='content' THEN
    UPDATE public.weekly_preparation_stages SET delivered_at=coalesce(delivered_at,clock_timestamp()),delivery_hash=coalesce(delivery_hash,md5(NEW.data::text))
      WHERE user_id=NEW.user_id AND project_id=NEW.data->>'projectId' AND stage='content' AND output_id::text=NEW.entity_id;
    UPDATE public.weekly_preparation_stages s SET delivered_at=coalesce(s.delivered_at,clock_timestamp())
      WHERE s.user_id=NEW.user_id AND s.project_id=NEW.data->>'projectId' AND s.stage='image'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'images')='array' THEN NEW.data->'images' ELSE '[]'::jsonb END) i WHERE i->>'id'=s.output_id::text);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER track_weekly_delivery AFTER INSERT OR UPDATE ON public.workspace_entities FOR EACH ROW EXECUTE FUNCTION public.track_weekly_delivery();
REVOKE ALL ON FUNCTION public.track_weekly_delivery() FROM PUBLIC,anon,authenticated,service_role;

-- Cancellation is permanent for a slot, retains archives and never retries paid
-- research. Refuse while the original worker can still be in flight.
CREATE FUNCTION public.cancel_weekly_preparation_slot(p_user uuid,p_project text,p_request uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE slot timestamptz;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF EXISTS(SELECT 1 FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project AND status='active' AND lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'weekly_worker_active'; END IF;
  SELECT publish_at INTO slot FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND request_id=p_request;
  IF slot IS NULL THEN RAISE EXCEPTION 'weekly_stage_unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE user_id=p_user AND project_id=p_project AND publish_at=slot AND status IN ('pending','publishing')) THEN RAISE EXCEPTION 'weekly_cancel_queue_first'; END IF;
  UPDATE public.weekly_preparation_stages SET state='cancelled',finished_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND publish_at=slot;
  IF NOT EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND state IN ('running','unknown')) THEN
    UPDATE public.auto_scheduler_leases SET status='released',finished_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND planned_period LIKE 'week:%';
  END IF;
  RETURN true;
END; $$;

-- Archive reconciliation is explicit and read-only with respect to providers.
-- The expired lease may be closed only after all uncertain stages are resolved.
CREATE FUNCTION public.reconcile_weekly_preparation(p_user uuid,p_project text,p_period text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_stage record;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF EXISTS(SELECT 1 FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project AND status='active' AND lease_until>clock_timestamp()) THEN RETURN false; END IF;
  FOR v_stage IN SELECT s.request_id FROM public.weekly_preparation_stages s WHERE s.user_id=p_user AND s.project_id=p_project AND s.period=p_period AND s.state IN ('running','unknown') AND s.stage<>'research' LOOP
    PERFORM public.recover_weekly_preparation_stage(p_user,p_project,v_stage.request_id);
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND state IN ('running','unknown')) THEN RETURN false; END IF;
  UPDATE public.auto_scheduler_leases SET status='released',finished_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND planned_period=p_period AND planned_period LIKE 'week:%';
  RETURN true;
END; $$;

CREATE TABLE public.weekly_preparation_summaries (
  user_id uuid NOT NULL, project_id text NOT NULL, period text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object' AND octet_length(summary::text)<=8000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,period),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.weekly_preparation_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_preparation_summaries FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.save_weekly_preparation_summary(p_user uuid,p_project text,p_period text,p_summary jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_period IS NULL OR p_period !~ '^week:[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR p_summary IS NULL OR jsonb_typeof(p_summary)<>'object' OR octet_length(p_summary::text)>8000 THEN RAISE EXCEPTION 'invalid_weekly_summary'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.weekly_preparation_summaries WHERE user_id=p_user AND project_id=p_project AND period=p_period)
    AND (SELECT count(*) FROM public.weekly_preparation_summaries WHERE user_id=p_user AND project_id=p_project)>=520 THEN RAISE EXCEPTION 'weekly_summary_capacity'; END IF;
  INSERT INTO public.weekly_preparation_summaries(user_id,project_id,period,summary) VALUES(p_user,p_project,p_period,p_summary)
    ON CONFLICT(user_id,project_id,period) DO UPDATE SET summary=p_summary,updated_at=clock_timestamp()
    WHERE weekly_preparation_summaries.summary IS DISTINCT FROM p_summary;
  RETURN true;
END; $$;
CREATE FUNCTION public.read_weekly_preparation_summary(p_user uuid,p_project text,p_period text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN (SELECT jsonb_build_object('summary',summary,'updatedAt',updated_at) FROM public.weekly_preparation_summaries WHERE user_id=p_user AND project_id=p_project AND period=p_period);
END; $$;
REVOKE ALL ON FUNCTION public.next_weekly_preparation_target(),public.cancel_weekly_preparation_slot(uuid,text,uuid),public.reconcile_weekly_preparation(uuid,text,text),public.save_weekly_preparation_summary(uuid,text,text,jsonb),public.read_weekly_preparation_summary(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.next_weekly_preparation_target(),public.cancel_weekly_preparation_slot(uuid,text,uuid),public.reconcile_weekly_preparation(uuid,text,text),public.save_weekly_preparation_summary(uuid,text,text,jsonb),public.read_weekly_preparation_summary(uuid,text,text) TO service_role;

-- Automatic approval and queue admission share the workspace lock and lease.
-- A withdrawn grant is never revived by the service. Browser status alone does
-- not call this function; the server rederives output, blockers and authority.
CREATE FUNCTION public.arm_scheduler_publication(p_user uuid,p_project text,p_asset text,p_expected bigint,p_hash text,p_publish timestamptz,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_expected IS NULL OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user)
    OR p_publish IS NULL OR NOT isfinite(p_publish) OR p_publish<=clock_timestamp()
    OR NOT public.check_auto_scheduler_lease(p_user,p_project,p_token) THEN RAISE EXCEPTION 'scheduler_publication_changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project AND data->'autoScheduler'->'enabled'='true'::jsonb AND data->'autoScheduler'->>'mode'='auto_publish')
    OR NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project AND data->>'status'='Approved' AND (data->>'autoSchedulerPlannedAt')::timestamptz=p_publish)
    OR EXISTS(SELECT 1 FROM public.publication_approvals WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset AND NOT approved)
    OR EXISTS(SELECT 1 FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND publish_at=p_publish AND state IN ('cancelled','running','unknown'))
    THEN RAISE EXCEPTION 'scheduler_authority_changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE user_id=p_user AND project_id=p_project AND (asset_id=p_asset OR publish_at=p_publish)) THEN RETURN false; END IF;
  PERFORM public.set_publication_approval(p_user,p_project,p_asset,p_expected,p_hash,true);
  INSERT INTO public.scheduled_publishes(user_id,project_id,asset_id,publish_at,status) VALUES(p_user,p_project,p_asset,p_publish,'pending');
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.arm_scheduler_publication(uuid,text,text,bigint,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arm_scheduler_publication(uuid,text,text,bigint,text,timestamptz,uuid) TO service_role;
