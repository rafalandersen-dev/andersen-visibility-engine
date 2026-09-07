-- Persistent in-app operational alerts. Does not send email or provision a cron.
CREATE TABLE IF NOT EXISTS public.operational_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK (project_collection='projects'),
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 1000),
  kind text NOT NULL CHECK (kind IN ('approval_due','publication_failed','manual_overdue','cadence_gap')),
  target_id text NOT NULL,
  target_title text NOT NULL CHECK (length(target_title)<=300),
  due_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,event_key),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.operational_notification_scans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL,
  workspace_rev bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.operational_notification_scan_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL
);
ALTER TABLE public.operational_notification_scan_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_notification_scan_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.operational_notification_scan_attempts TO service_role;
CREATE INDEX IF NOT EXISTS operational_notifications_inbox ON public.operational_notifications(user_id,active,created_at DESC);
ALTER TABLE public.operational_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_notification_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_notifications,public.operational_notification_scans FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.operational_notifications TO authenticated;
GRANT ALL ON public.operational_notifications,public.operational_notification_scans TO service_role;
DROP POLICY IF EXISTS notification_recipient_read ON public.operational_notifications;
CREATE POLICY notification_recipient_read ON public.operational_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());

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
       OR e->>'kind' NOT IN ('approval_due','publication_failed','manual_overdue','cadence_gap')
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
CREATE OR REPLACE FUNCTION public.mark_operational_notification_read(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.operational_notifications SET read_at=coalesce(read_at,now()) WHERE id=p_id AND user_id=auth.uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_operational_notifications(uuid,bigint,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_operational_notifications(uuid,bigint,timestamptz,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.mark_operational_notification_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_operational_notification_read(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.operational_notification_scan_targets(p_limit integer DEFAULT 20)
RETURNS TABLE(user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  WITH picked AS (
    SELECT m.user_id FROM public.workspace_meta m
    LEFT JOIN public.operational_notification_scans s ON s.user_id=m.user_id
    LEFT JOIN public.operational_notification_scan_attempts a ON a.user_id=m.user_id
    ORDER BY coalesce(a.attempted_at,s.scanned_at) ASC NULLS FIRST,m.user_id
    LIMIT greatest(0,least(coalesce(p_limit,20),20))
  ), attempted AS (
    INSERT INTO public.operational_notification_scan_attempts(user_id,attempted_at)
      SELECT picked.user_id,clock_timestamp() FROM picked
      ON CONFLICT(user_id) DO UPDATE SET attempted_at=excluded.attempted_at
      RETURNING user_id
  ) SELECT attempted.user_id FROM attempted;
$$;
REVOKE ALL ON FUNCTION public.operational_notification_scan_targets(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operational_notification_scan_targets(integer) TO service_role;
