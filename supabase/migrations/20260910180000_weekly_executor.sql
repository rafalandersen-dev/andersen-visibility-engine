-- P3 executor recovery and fair dispatch. No project is switched or funded.
ALTER TABLE public.project_scheduler_control ADD COLUMN last_dispatch_at timestamptz;
CREATE FUNCTION public.next_weekly_preparation_targets()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE targets jsonb;
BEGIN
  WITH selected AS (
    SELECT c.user_id,c.project_id FROM public.project_scheduler_control c
      JOIN public.workspace_entities p ON p.user_id=c.user_id AND p.collection='projects' AND p.entity_id=c.project_id
      WHERE c.engine='weekly' AND p.data->'autoScheduler'->'enabled'='true'::jsonb
        AND NOT EXISTS(SELECT 1 FROM public.auto_scheduler_leases l WHERE l.user_id=c.user_id AND l.project_id=c.project_id AND l.status='active' AND l.lease_until>clock_timestamp())
      ORDER BY c.last_dispatch_at NULLS FIRST,c.user_id,c.project_id LIMIT 20 FOR UPDATE OF c SKIP LOCKED
  ), dispatched AS (
    UPDATE public.project_scheduler_control c SET last_dispatch_at=clock_timestamp()
      FROM selected s WHERE c.user_id=s.user_id AND c.project_id=s.project_id
      RETURNING c.user_id,c.project_id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('ownerId',user_id,'projectId',project_id)),'[]'::jsonb) INTO targets FROM dispatched;
  RETURN targets;
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
    -- Advance the baseline only for a first retained-image attachment to the
    -- untouched delivered draft. Other content and existing images must match;
    -- owner changes before, alongside or after delivery remain visible.
    IF TG_OP='UPDATE' AND OLD.data->>'status'='Draft'
      AND (OLD.data-ARRAY['images','updatedAt','assembled','checklist','readiness','qualityScoreStale'])
        = (NEW.data-ARRAY['images','updatedAt','assembled','checklist','readiness','qualityScoreStale']) THEN
      UPDATE public.weekly_preparation_stages c SET delivery_hash=md5(NEW.data::text)
      WHERE c.user_id=NEW.user_id AND c.project_id=NEW.data->>'projectId'
        AND c.stage='content' AND c.output_id::text=NEW.entity_id
        AND c.delivery_hash=md5(OLD.data::text)
        AND EXISTS(SELECT 1 FROM public.weekly_preparation_stages i
          WHERE i.user_id=c.user_id AND i.project_id=c.project_id AND i.publish_at=c.publish_at
            AND i.stage='image' AND i.state='retained' AND i.delivered_at IS NULL
            AND jsonb_typeof(NEW.data->'images')='array'
            AND jsonb_array_length(NEW.data->'images')=jsonb_array_length(coalesce(OLD.data->'images','[]'::jsonb))+1
            AND ((NEW.data->'images') - (jsonb_array_length(NEW.data->'images')-1))=coalesce(OLD.data->'images','[]'::jsonb)
            AND (NEW.data->'images')->-1->>'id'=i.output_id::text);
    END IF;
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
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE user_id=p_user AND project_id=p_project AND publish_at=slot AND status IN ('pending','publishing','review_required')) THEN RAISE EXCEPTION 'weekly_cancel_queue_first'; END IF;
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
REVOKE ALL ON FUNCTION public.next_weekly_preparation_targets(),public.cancel_weekly_preparation_slot(uuid,text,uuid),public.reconcile_weekly_preparation(uuid,text,text),public.save_weekly_preparation_summary(uuid,text,text,jsonb),public.read_weekly_preparation_summary(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.next_weekly_preparation_targets(),public.cancel_weekly_preparation_slot(uuid,text,uuid),public.reconcile_weekly_preparation(uuid,text,text),public.save_weekly_preparation_summary(uuid,text,text,jsonb),public.read_weekly_preparation_summary(uuid,text,text) TO service_role;

-- Automatic approval and queue admission share the workspace lock and lease.
-- A withdrawn grant is never revived by the service. Browser status alone does
-- not call this function; the server rederives output, blockers and authority.
CREATE FUNCTION public.arm_scheduler_publication(p_user uuid,p_project text,p_asset text,p_expected bigint,p_hash text,p_publish timestamptz,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE queue_id uuid := gen_random_uuid();
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
  PERFORM set_config('milo.approved_queue_id',queue_id::text,true);
  INSERT INTO public.scheduled_publishes(id,user_id,project_id,asset_id,publish_at,status) VALUES(queue_id,p_user,p_project,p_asset,p_publish,'pending');
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.arm_scheduler_publication(uuid,text,text,bigint,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arm_scheduler_publication(uuid,text,text,bigint,text,timestamptz,uuid) TO service_role;

-- One bounded account-scoped read for operational capacity sweeps. An absent
-- row means the existing monthly default; an unavailable read is never defaulted.
CREATE FUNCTION public.read_workspace_scheduler_controls(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_meta WHERE user_id=p_user) THEN RAISE EXCEPTION 'scheduler_workspace_unavailable'; END IF;
  IF (SELECT count(*) FROM public.project_scheduler_control WHERE user_id=p_user)>1000 THEN RAISE EXCEPTION 'scheduler_control_capacity'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('projectId',project_id,'engine',engine)) FROM public.project_scheduler_control WHERE user_id=p_user),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.read_workspace_scheduler_controls(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_workspace_scheduler_controls(uuid) TO service_role;

-- Manual rescheduling preserves the old queue until exact approval, revision
-- and in-flight checks pass. Cancellation plus replacement is one transaction.
CREATE FUNCTION public.schedule_approved_publication(p_user uuid,p_project text,p_asset text,p_expected bigint,p_hash text,p_publish timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE queued public.scheduled_publishes%ROWTYPE; queue_id uuid := gen_random_uuid();
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_expected IS NULL OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user)
    OR p_publish IS NULL OR NOT isfinite(p_publish) OR p_publish<clock_timestamp()+interval '5 minutes'
    OR NOT public.read_publication_approval(p_user,p_project,p_asset,p_hash)
    OR NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project AND data->>'status' IN ('Approved','Exported'))
    THEN RAISE EXCEPTION 'schedule_approval_changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE user_id=p_user AND asset_id=p_asset AND status='publishing') THEN RAISE EXCEPTION 'schedule_in_flight'; END IF;
  UPDATE public.scheduled_publishes SET status='cancelled',updated_at=clock_timestamp() WHERE user_id=p_user AND asset_id=p_asset AND status IN ('pending','review_required');
  PERFORM set_config('milo.approved_queue_id',queue_id::text,true);
  INSERT INTO public.scheduled_publishes(id,user_id,project_id,asset_id,publish_at,status) VALUES(queue_id,p_user,p_project,p_asset,p_publish,'pending') RETURNING * INTO queued;
  RETURN to_jsonb(queued);
END; $$;
REVOKE ALL ON FUNCTION public.schedule_approved_publication(uuid,text,text,bigint,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_approved_publication(uuid,text,text,bigint,text,timestamptz) TO service_role;

-- Rollout preserves booked times as explicit review holds, never generic
-- failures or inferred approvals. Stop if a connector request may be in flight.
LOCK TABLE public.scheduled_publishes IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE status='publishing') THEN
    RAISE EXCEPTION 'publication_rollout_wait_for_in_flight';
  END IF;
END; $$;
ALTER TABLE public.scheduled_publishes DROP CONSTRAINT IF EXISTS scheduled_publishes_status_check;
ALTER TABLE public.scheduled_publishes ADD CONSTRAINT scheduled_publishes_status_check
  CHECK(status IN ('pending','publishing','published','failed','cancelled','review_required'));
DROP INDEX IF EXISTS public.scheduled_publishes_active_asset_idx;
CREATE UNIQUE INDEX scheduled_publishes_active_asset_idx ON public.scheduled_publishes(asset_id)
  WHERE status IN ('pending','publishing','review_required');

-- Also cover writes from the old application during migration-before-deploy.
-- Only revision-locked exact-version RPCs issue a one-row transaction-local
-- admission proof. A historical approval row cannot authorize a legacy insert.
CREATE FUNCTION public.hold_unapproved_scheduled_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='pending' AND (current_setting('milo.approved_queue_id',true) IS DISTINCT FROM NEW.id::text
    OR NOT EXISTS(SELECT 1 FROM public.publication_approvals a
      WHERE a.user_id=NEW.user_id AND a.project_id=NEW.project_id AND a.asset_id=NEW.asset_id AND a.approved)) THEN
    NEW.status:='review_required';
  END IF;
  PERFORM set_config('milo.approved_queue_id','',true);
  IF NEW.status='review_required' THEN
    NEW.last_error:='publication_approval_required';
    UPDATE public.workspace_entities e SET data=e.data||jsonb_build_object(
      'scheduledPublishStatus','review_required','scheduledPublishAt',NEW.publish_at,
      'scheduledPublishError','publication_approval_required')
      WHERE e.user_id=NEW.user_id AND e.collection='content' AND e.entity_id=NEW.asset_id AND e.data->>'projectId'=NEW.project_id;
    IF FOUND THEN UPDATE public.workspace_meta SET rev=rev+1 WHERE user_id=NEW.user_id; END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hold_unapproved_scheduled_publish() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER hold_unapproved_scheduled_publish BEFORE INSERT OR UPDATE OF status ON public.scheduled_publishes
  FOR EACH ROW EXECUTE FUNCTION public.hold_unapproved_scheduled_publish();
UPDATE public.scheduled_publishes SET status='review_required',updated_at=clock_timestamp() WHERE status='pending';

-- A stale pre-deploy tab/runner cannot relabel a held queue as armed in the
-- workspace mirror. Content edits remain intact; cancelling/resuming the real
-- queue removes this override before the normal mirror write.
CREATE FUNCTION public.preserve_schedule_review_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE held_at timestamptz;
BEGIN
  IF NEW.collection='content' THEN
    SELECT publish_at INTO held_at FROM public.scheduled_publishes
      WHERE user_id=NEW.user_id AND project_id=NEW.data->>'projectId' AND asset_id=NEW.entity_id AND status='review_required' LIMIT 1;
    IF held_at IS NOT NULL THEN
      NEW.data:=NEW.data||jsonb_build_object('scheduledPublishStatus','review_required',
        'scheduledPublishAt',held_at,'scheduledPublishError','publication_approval_required');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.preserve_schedule_review_hold() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER preserve_schedule_review_hold BEFORE INSERT OR UPDATE OF data ON public.workspace_entities
  FOR EACH ROW EXECUTE FUNCTION public.preserve_schedule_review_hold();

-- Deletion remains safe even when a stale client has no queue mirror or its
-- best-effort cancellation request failed. Never alter in-flight/live history.
CREATE FUNCTION public.cancel_deleted_workspace_schedules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.collection='content' THEN
    UPDATE public.scheduled_publishes SET status='cancelled',updated_at=clock_timestamp()
      WHERE user_id=OLD.user_id AND project_id=OLD.data->>'projectId' AND asset_id=OLD.entity_id AND status IN ('pending','review_required');
  ELSIF OLD.collection='projects' THEN
    UPDATE public.scheduled_publishes SET status='cancelled',updated_at=clock_timestamp()
      WHERE user_id=OLD.user_id AND project_id=OLD.entity_id AND status IN ('pending','review_required');
  END IF;
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.cancel_deleted_workspace_schedules() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancel_deleted_workspace_schedules AFTER DELETE ON public.workspace_entities
  FOR EACH ROW EXECUTE FUNCTION public.cancel_deleted_workspace_schedules();
