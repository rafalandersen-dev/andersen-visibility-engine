-- Service-owned, once-only outreach admission. No provider work or schedules.
-- Tombstones survive project/draft deletion: recreating editable IDs must not replay.
CREATE TABLE public.outreach_delivery_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 draft_id text NOT NULL CHECK(length(draft_id) BETWEEN 1 AND 200),
 project_id text NOT NULL CHECK(length(project_id) BETWEEN 1 AND 200),
 step text NOT NULL CHECK(step IN ('initial','followup-0','followup-1')),
 version_hash text NOT NULL CHECK(version_hash ~ '^[a-f0-9]{64}$'),
 recipient text NOT NULL CHECK(length(recipient) BETWEEN 3 AND 254 AND recipient=lower(btrim(recipient))),
 state text NOT NULL CHECK(state IN ('reserved','dispatching','accepted','unknown','blocked')),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 provider_message_id text CHECK(provider_message_id ~ '^[A-Za-z0-9_-]{1,200}$'),
 PRIMARY KEY(user_id,draft_id,step)
);
ALTER TABLE public.outreach_delivery_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_delivery_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX outreach_legacy_log_owner ON public.email_send_log((metadata->>'user_id'),created_at) WHERE template_name='outreach';
CREATE INDEX outreach_delivery_recipient ON public.outreach_delivery_receipts(user_id,recipient,reserved_at);

CREATE FUNCTION public.reserve_outreach_delivery(p_user uuid,p_project text,p_draft text,p_step text,p_expected bigint,p_hash text,p_recipient text,p_limit integer,p_delay integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rev bigint; v_now timestamptz:=clock_timestamp(); v_initial public.outreach_delivery_receipts; v_draft jsonb;
BEGIN
 -- Same per-owner lock as workspace writes serializes distinct draft admissions.
 SELECT rev INTO v_rev FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
 IF v_rev IS NULL OR p_expected IS DISTINCT FROM v_rev THEN RAISE EXCEPTION 'outreach_workspace_changed'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_delay IS NULL OR p_delay NOT BETWEEN 2 AND 365
  THEN RAISE EXCEPTION 'outreach_invalid_admission'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project)
  THEN RAISE EXCEPTION 'outreach_project_unavailable'; END IF;
 SELECT data INTO v_draft FROM public.workspace_entities WHERE user_id=p_user AND collection='outreachDrafts' AND entity_id=p_draft AND data->>'projectId'=p_project;
 IF v_draft IS NULL THEN RAISE EXCEPTION 'outreach_draft_not_found'; END IF;
 IF (p_step='initial' AND v_draft->>'status' IS DISTINCT FROM 'Approved') OR (p_step<>'initial' AND coalesce(v_draft->>'status','') NOT IN ('Sent','Failed'))
  THEN RAISE EXCEPTION 'outreach_approval_required'; END IF;
 IF EXISTS(SELECT 1 FROM public.outreach_delivery_receipts WHERE user_id=p_user AND draft_id=p_draft AND step=p_step)
  THEN RAISE EXCEPTION 'outreach_step_reserved'; END IF;
 -- Historical log entries are evidence of an attempt, never replay permission.
 IF EXISTS(SELECT 1 FROM public.email_send_log WHERE template_name='outreach' AND metadata->>'user_id'=p_user::text AND metadata->>'draft_id'=p_draft AND metadata->>'step'=p_step)
 THEN RAISE EXCEPTION 'outreach_legacy_attempt_held'; END IF;
 IF EXISTS(SELECT 1 FROM public.email_send_log l WHERE template_name='outreach' AND metadata->>'user_id'=p_user::text AND lower(btrim(recipient_email))=p_recipient
 AND status<>'suppressed' AND (created_at>=v_now-interval '30 days' OR status NOT IN ('sent','bounced','complained'))
 AND NOT EXISTS(SELECT 1 FROM public.outreach_delivery_receipts r WHERE r.user_id=p_user AND r.draft_id=l.metadata->>'draft_id' AND r.step=l.metadata->>'step'))
 THEN RAISE EXCEPTION 'outreach_legacy_attempt_held'; END IF;
 IF (SELECT count(*) FROM public.outreach_delivery_receipts WHERE user_id=p_user)>=3000
  THEN RAISE EXCEPTION 'outreach_history_capacity'; END IF;
 -- Unknown and interrupted attempts retain capacity even after 24 hours.
 IF (SELECT count(*) FROM public.outreach_delivery_receipts WHERE user_id=p_user AND state<>'blocked' AND (reserved_at>=v_now-interval '24 hours' OR state IN ('reserved','dispatching','unknown')))
 + (SELECT count(*) FROM public.email_send_log l WHERE template_name='outreach' AND metadata->>'user_id'=p_user::text AND status<>'suppressed' AND created_at>=v_now-interval '24 hours'
 AND NOT EXISTS(SELECT 1 FROM public.outreach_delivery_receipts r WHERE r.user_id=p_user AND r.draft_id=l.metadata->>'draft_id' AND r.step=l.metadata->>'step'))>=p_limit
  THEN RAISE EXCEPTION 'outreach_daily_limit_reached'; END IF;
 IF p_step='initial' THEN
  IF EXISTS(SELECT 1 FROM public.outreach_delivery_receipts WHERE user_id=p_user AND recipient=p_recipient AND state<>'blocked' AND (reserved_at>=v_now-interval '30 days' OR state IN ('reserved','dispatching','unknown')))
   THEN RAISE EXCEPTION 'outreach_recipient_cooldown'; END IF;
 ELSE
  SELECT * INTO v_initial FROM public.outreach_delivery_receipts WHERE user_id=p_user AND draft_id=p_draft AND step='initial';
  IF v_initial.state IS DISTINCT FROM 'accepted' OR v_initial.recipient IS DISTINCT FROM p_recipient OR v_initial.project_id IS DISTINCT FROM p_project
   THEN RAISE EXCEPTION 'outreach_initial_not_sent'; END IF;
  IF v_initial.updated_at+make_interval(days=>p_delay)>v_now THEN RAISE EXCEPTION 'outreach_followup_not_due'; END IF;
  IF EXISTS(SELECT 1 FROM public.outreach_delivery_receipts WHERE user_id=p_user AND recipient=p_recipient AND (state IN ('reserved','dispatching','unknown') OR (draft_id<>p_draft AND state='accepted' AND reserved_at>=v_now-interval '30 days')))
   THEN RAISE EXCEPTION 'outreach_recipient_cooldown'; END IF;
 END IF;
 INSERT INTO public.outreach_delivery_receipts(user_id,project_id,draft_id,step,version_hash,recipient,state)
 VALUES(p_user,p_project,p_draft,p_step,p_hash,p_recipient,'reserved');
 RETURN true;
END; $$;

-- Final pre-I/O gate: revision and current suppression checked together. Only
-- this transition authorizes a single fetch; a lost response never authorizes it.
CREATE FUNCTION public.dispatch_outreach_delivery(p_user uuid,p_draft text,p_step text,p_hash text,p_expected bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rev bigint; r public.outreach_delivery_receipts;
BEGIN
 SELECT rev INTO v_rev FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
 SELECT * INTO r FROM public.outreach_delivery_receipts WHERE user_id=p_user AND draft_id=p_draft AND step=p_step FOR UPDATE;
 IF r.state IS DISTINCT FROM 'reserved' OR r.version_hash IS DISTINCT FROM p_hash THEN RETURN false; END IF;
 IF v_rev IS NULL OR v_rev IS DISTINCT FROM p_expected
 OR NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='outreachDrafts' AND entity_id=p_draft AND data->>'projectId'=r.project_id)
 OR EXISTS(SELECT 1 FROM public.suppressed_emails WHERE email=r.recipient)
 OR NOT EXISTS(SELECT 1 FROM public.email_unsubscribe_tokens WHERE email=r.recipient AND used_at IS NULL)
 THEN
  UPDATE public.outreach_delivery_receipts SET state='blocked',updated_at=clock_timestamp() WHERE user_id=p_user AND draft_id=p_draft AND step=p_step;
  RETURN false;
 END IF;
 UPDATE public.outreach_delivery_receipts SET state='dispatching',updated_at=clock_timestamp() WHERE user_id=p_user AND draft_id=p_draft AND step=p_step;
 RETURN true;
END; $$;
CREATE FUNCTION public.finish_outreach_delivery(p_user uuid,p_draft text,p_step text,p_hash text,p_state text,p_message text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('accepted','unknown') OR (p_state='accepted' AND (p_message IS NULL OR p_message !~ '^[A-Za-z0-9_-]{1,200}$')) OR (p_state='unknown' AND p_message IS NOT NULL)
 THEN RAISE EXCEPTION 'outreach_invalid_receipt'; END IF;
 UPDATE public.outreach_delivery_receipts SET state=p_state,provider_message_id=p_message,updated_at=clock_timestamp()
 WHERE user_id=p_user AND draft_id=p_draft AND step=p_step AND version_hash=p_hash AND state='dispatching';
 RETURN FOUND;
END; $$;
CREATE FUNCTION public.read_outreach_deliveries(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project)
 THEN RAISE EXCEPTION 'outreach_project_unavailable'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) - 'user_id' ORDER BY reserved_at DESC,draft_id,step) FROM public.outreach_delivery_receipts r WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_outreach_delivery(uuid,text,text,text,bigint,text,text,integer,integer),public.dispatch_outreach_delivery(uuid,text,text,text,bigint),public.finish_outreach_delivery(uuid,text,text,text,text,text),public.read_outreach_deliveries(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_outreach_delivery(uuid,text,text,text,bigint,text,text,integer,integer),public.dispatch_outreach_delivery(uuid,text,text,text,bigint),public.finish_outreach_delivery(uuid,text,text,text,text,text),public.read_outreach_deliveries(uuid,text) TO service_role;
