-- Add shared preparation-capacity alerts; preserve recipient isolation and sync semantics.
ALTER TABLE public.operational_notifications DROP CONSTRAINT IF EXISTS operational_notifications_kind_check;
ALTER TABLE public.operational_notifications ADD CONSTRAINT operational_notifications_kind_check
  CHECK (kind IN ('approval_due','publication_failed','manual_overdue','cadence_gap','scheduler_recovery','generation_capacity_low','generation_capacity_unavailable'));
CREATE OR REPLACE FUNCTION public.sync_operational_notifications(
  p_user uuid,p_workspace_rev bigint,p_scanned_at timestamptz,p_events jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rev bigint; v_last timestamptz; e jsonb;
BEGIN
  IF p_user IS NULL OR p_workspace_rev IS NULL OR p_workspace_rev<0 OR p_scanned_at IS NULL
     OR p_scanned_at>now()+interval '5 minutes' OR p_events IS NULL
     OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>500 THEN
    RAISE EXCEPTION 'invalid_notification_scan' USING ERRCODE='22023';
  END IF;
  -- Serialize scans with workspace writes and reject stale source snapshots.
  SELECT rev INTO v_rev FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  IF v_rev IS NULL OR v_rev<>p_workspace_rev THEN RETURN false; END IF;
  SELECT scanned_at INTO v_last FROM public.operational_notification_scans WHERE user_id=p_user;
  IF v_last IS NOT NULL AND v_last>=p_scanned_at THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(e)<>'object' OR e->>'projectId' IS NULL OR e->>'targetId' IS NULL
       OR e->>'key' IS NULL OR e->>'kind' IS NULL OR e->>'title' IS NULL
       OR e->>'kind' NOT IN ('approval_due','publication_failed','manual_overdue','cadence_gap','scheduler_recovery','generation_capacity_low','generation_capacity_unavailable')
       OR length(e->>'projectId') NOT BETWEEN 1 AND 200 OR length(e->>'targetId') NOT BETWEEN 1 AND 200
       OR length(e->>'key') NOT BETWEEN 1 AND 1000 OR length(e->>'title')>300
       OR (e->'detail' IS NOT NULL AND jsonb_typeof(e->'detail')<>'object') THEN
      RAISE EXCEPTION 'invalid_notification_event' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.operational_notifications AS n(user_id,project_id,event_key,kind,target_id,target_title,due_at,detail)
      VALUES(p_user,e->>'projectId',e->>'key',e->>'kind',e->>'targetId',e->>'title',(e->>'dueAt')::timestamptz,coalesce(e->'detail','{}'::jsonb))
      ON CONFLICT(user_id,event_key) DO UPDATE SET active=true,
        read_at=CASE WHEN n.active THEN n.read_at ELSE NULL END,
        target_title=excluded.target_title,due_at=excluded.due_at,detail=excluded.detail,updated_at=now();
  END LOOP;
  UPDATE public.operational_notifications n SET active=false,updated_at=now()
    WHERE n.user_id=p_user AND n.active
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_events) AS incoming(value) WHERE incoming.value->>'key'=n.event_key);
  INSERT INTO public.operational_notification_scans(user_id,scanned_at,workspace_rev)
    VALUES(p_user,p_scanned_at,p_workspace_rev)
    ON CONFLICT(user_id) DO UPDATE SET scanned_at=excluded.scanned_at,workspace_rev=excluded.workspace_rev;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_operational_notifications(uuid,bigint,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_operational_notifications(uuid,bigint,timestamptz,jsonb) TO service_role;
