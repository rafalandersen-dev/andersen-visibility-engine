-- Owner-account digests. Default off; this migration neither sends nor schedules email.
CREATE TABLE public.operational_email_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 locale text NOT NULL DEFAULT 'en' CHECK(locale IN ('en','pl','sv','da')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.operational_email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','sending','accepted','unknown','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 finished_at timestamptz,
 reason text CHECK(reason IN ('resolved','disabled','preflight_unavailable','transport_unknown','accepted','attempts_exhausted'))
);
CREATE TABLE public.operational_email_items (
 notification_id uuid PRIMARY KEY REFERENCES public.operational_notifications(id) ON DELETE CASCADE,
 outbox_id uuid NOT NULL REFERENCES public.operational_email_outbox(id) ON DELETE CASCADE
);
CREATE INDEX operational_email_claim ON public.operational_email_outbox(status,available_at);
CREATE INDEX operational_email_recipient ON public.operational_email_outbox(user_id,created_at DESC);
ALTER TABLE public.operational_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_email_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_email_preferences,public.operational_email_outbox,public.operational_email_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.operational_email_preferences,public.operational_email_outbox,public.operational_email_items TO service_role;
GRANT SELECT ON public.operational_email_preferences TO authenticated;
GRANT SELECT(id,user_id,status,created_at,finished_at) ON public.operational_email_outbox TO authenticated;
CREATE POLICY email_preferences_owner ON public.operational_email_preferences FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY email_outbox_owner ON public.operational_email_outbox FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.set_operational_email_preference(p_enabled boolean,p_locale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR p_enabled IS NULL OR p_locale IS NULL OR p_locale NOT IN ('en','pl','sv','da') THEN RAISE EXCEPTION 'invalid_email_preference'; END IF;
 INSERT INTO public.operational_email_preferences(user_id,enabled,locale) VALUES(u,p_enabled,p_locale)
 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,locale=excluded.locale,updated_at=now();
 IF NOT p_enabled THEN
  UPDATE public.operational_email_outbox SET status='cancelled',reason='disabled',finished_at=now(),lease_token=NULL,lease_until=NULL
   WHERE user_id=u AND status IN ('pending','leased');
 END IF;
 RETURN true;
END; $$;
-- One aggregate per account per hour; each incident is included at most once.
CREATE FUNCTION public.queue_operational_email_digest(p_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rev bigint; v_id uuid; v_ids uuid[];
BEGIN
 SELECT rev INTO v_rev FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
 IF v_rev IS NULL OR NOT EXISTS(SELECT 1 FROM public.operational_email_preferences WHERE user_id=p_user AND enabled)
 OR NOT EXISTS(SELECT 1 FROM public.operational_notification_scans WHERE user_id=p_user AND workspace_rev=v_rev AND scanned_at>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.operational_email_outbox WHERE user_id=p_user AND (created_at>now()-interval '1 hour' OR status IN ('pending','leased','sending'))) THEN RETURN NULL; END IF;
 SELECT array_agg(id) INTO v_ids FROM (
  SELECT n.id FROM public.operational_notifications n WHERE n.user_id=p_user AND n.active AND n.read_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.operational_email_items i WHERE i.notification_id=n.id)
  ORDER BY n.created_at,n.id LIMIT 50
 ) eligible;
 IF coalesce(cardinality(v_ids),0)=0 THEN RETURN NULL; END IF;
 INSERT INTO public.operational_email_outbox(user_id) VALUES(p_user) RETURNING id INTO v_id;
 INSERT INTO public.operational_email_items(notification_id,outbox_id) SELECT unnest(v_ids),v_id;
 RETURN v_id;
END; $$;
CREATE FUNCTION public.claim_operational_email_digest()
RETURNS TABLE(id uuid,user_id uuid,lease_token uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- A process that died after entering transport has an uncertain outcome: never blind retry.
 UPDATE public.operational_email_outbox o SET status='unknown',reason='transport_unknown',finished_at=now()
 WHERE o.status='sending' AND o.lease_until<now();
 UPDATE public.operational_email_outbox o SET status='failed',reason='attempts_exhausted',finished_at=now() WHERE o.status='leased' AND o.lease_until<now() AND o.attempts>=3;
 RETURN QUERY WITH picked AS (
  SELECT o.id FROM public.operational_email_outbox o WHERE
   ((o.status='pending' AND o.available_at<=now()) OR (o.status='leased' AND o.lease_until<now())) AND o.attempts<3
  ORDER BY o.available_at,o.id LIMIT 1 FOR UPDATE SKIP LOCKED
 ) UPDATE public.operational_email_outbox o SET status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=o.attempts+1
 FROM picked WHERE o.id=picked.id RETURNING o.id,o.user_id,o.lease_token;
END; $$;
-- Called after a fresh source scan and immediately before the transport call.
CREATE FUNCTION public.begin_operational_email_delivery(p_id uuid,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.operational_email_outbox%ROWTYPE; v_locale text; v_items jsonb; v_rev bigint;
BEGIN
 SELECT * INTO o FROM public.operational_email_outbox WHERE id=p_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'leased' OR o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<=now() THEN RETURN NULL; END IF;
 SELECT locale INTO v_locale FROM public.operational_email_preferences WHERE user_id=o.user_id AND enabled;
 IF v_locale IS NULL THEN
  UPDATE public.operational_email_outbox SET status='cancelled',reason='disabled',finished_at=now() WHERE id=p_id; RETURN NULL;
 END IF;
 SELECT rev INTO v_rev FROM public.workspace_meta WHERE user_id=o.user_id;
 IF NOT EXISTS(SELECT 1 FROM public.operational_notification_scans WHERE user_id=o.user_id AND workspace_rev=v_rev AND scanned_at>now()-interval '5 minutes') THEN RAISE EXCEPTION 'notification_source_stale'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',n.id,'projectId',n.project_id,'kind',n.kind,'targetId',n.target_id,'title',n.target_title,'dueAt',n.due_at,'detail',n.detail) ORDER BY n.created_at,n.id) INTO v_items
 FROM public.operational_notifications n JOIN public.operational_email_items i ON i.notification_id=n.id
 WHERE i.outbox_id=p_id AND n.user_id=o.user_id AND n.active AND n.read_at IS NULL;
 IF v_items IS NULL THEN
  UPDATE public.operational_email_outbox SET status='cancelled',reason='resolved',finished_at=now() WHERE id=p_id; RETURN NULL;
 END IF;
 UPDATE public.operational_email_outbox SET status='sending' WHERE id=p_id;
 RETURN jsonb_build_object('locale',v_locale,'items',v_items);
END; $$;
CREATE FUNCTION public.finish_operational_email_delivery(p_id uuid,p_lease uuid,p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.operational_email_outbox%ROWTYPE;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','unknown','preflight_unavailable') THEN RAISE EXCEPTION 'invalid_email_outcome'; END IF;
 SELECT * INTO o FROM public.operational_email_outbox WHERE id=p_id FOR UPDATE;
 IF o.id IS NULL OR o.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF o.status=p_outcome AND p_outcome IN ('accepted','unknown') THEN RETURN true; END IF;
 IF p_outcome='preflight_unavailable' AND o.status='leased' THEN
  UPDATE public.operational_email_outbox SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
   reason=CASE WHEN attempts>=3 THEN 'attempts_exhausted' ELSE 'preflight_unavailable' END,
   available_at=now()+interval '15 minutes',lease_token=NULL,lease_until=NULL,
   finished_at=CASE WHEN attempts>=3 THEN now() ELSE NULL END WHERE id=p_id;
  RETURN true;
 END IF;
 IF o.status<>'sending' OR p_outcome='preflight_unavailable' THEN RETURN false; END IF;
 UPDATE public.operational_email_outbox SET status=p_outcome,reason=CASE WHEN p_outcome='accepted' THEN 'accepted' ELSE 'transport_unknown' END,finished_at=now() WHERE id=p_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.set_operational_email_preference(boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_operational_email_preference(boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.queue_operational_email_digest(uuid),public.claim_operational_email_digest(),public.begin_operational_email_delivery(uuid,uuid),public.finish_operational_email_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_operational_email_digest(uuid),public.claim_operational_email_digest(),public.begin_operational_email_delivery(uuid,uuid),public.finish_operational_email_delivery(uuid,uuid,text) TO service_role;
