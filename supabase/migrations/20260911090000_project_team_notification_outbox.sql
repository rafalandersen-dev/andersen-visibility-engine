-- UNRELEASED. Scoped collaborator digests; no transport or timer is enabled here.
CREATE TABLE public.project_team_notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 settings_revision bigint NOT NULL,
 membership_revision bigint NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','sending','accepted','unknown','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 finished_at timestamptz,
 FOREIGN KEY(owner_id,project_id,recipient_id) REFERENCES public.project_team_members(owner_id,project_id,actor_id) ON DELETE CASCADE
);
CREATE TABLE public.project_team_notification_items (
 notification_id uuid NOT NULL REFERENCES public.operational_notifications(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 outbox_id uuid NOT NULL REFERENCES public.project_team_notification_outbox(id) ON DELETE CASCADE,
 PRIMARY KEY(notification_id,recipient_id)
);
CREATE INDEX project_team_notification_active_capacity ON public.project_team_notification_outbox(owner_id,project_id) WHERE status IN ('pending','leased','sending');
CREATE INDEX project_team_notification_claim ON public.project_team_notification_outbox(status,available_at);
CREATE INDEX project_team_notification_recipient_history ON public.project_team_notification_outbox(owner_id,project_id,recipient_id,created_at DESC);
ALTER TABLE public.project_team_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_notification_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_notification_outbox,public.project_team_notification_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_team_notification_outbox,public.project_team_notification_items TO service_role;
CREATE FUNCTION public.queue_project_team_notification_digest(p_owner uuid,p_project text,p_recipient uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE settings public.project_team_notification_recipients%ROWTYPE; rev bigint; result uuid; ids uuid[];
BEGIN
 SELECT m.rev INTO rev FROM public.workspace_meta m WHERE user_id=p_owner FOR UPDATE;
 SELECT * INTO settings FROM public.project_team_notification_recipients WHERE owner_id=p_owner AND project_id=p_project AND recipient_id=p_recipient;
 IF settings.recipient_id IS NULL OR NOT public.project_team_notification_recipient_eligible(p_owner,p_project,p_recipient,settings.revision,settings.membership_revision) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_notification_scans WHERE user_id=p_owner AND workspace_rev=rev AND scanned_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'team_notification_source_stale'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_team_notification_outbox WHERE owner_id=p_owner AND project_id=p_project AND recipient_id=p_recipient AND (created_at>clock_timestamp()-interval '1 hour' OR status IN ('pending','leased','sending'))) THEN RETURN NULL; END IF;
 SELECT array_agg(id) INTO ids FROM (SELECT n.id FROM public.operational_notifications n
 WHERE n.user_id=p_owner AND n.project_id=p_project AND n.active
 AND n.kind IN ('approval_due','publication_failed','manual_overdue','cadence_gap','scheduler_recovery')
 AND NOT EXISTS(SELECT 1 FROM public.project_team_notification_items i JOIN public.project_team_notification_outbox old ON old.id=i.outbox_id WHERE i.notification_id=n.id AND i.recipient_id=p_recipient AND old.status<>'failed')
 ORDER BY n.created_at,n.id LIMIT 50) eligible;
 IF coalesce(cardinality(ids),0)=0 THEN RETURN NULL; END IF;
 -- Bound outstanding work, retaining terminal history and its once-only item identities.
 IF (SELECT count(*) FROM public.project_team_notification_outbox WHERE owner_id=p_owner AND project_id=p_project AND status IN ('pending','leased','sending'))>=10000 THEN RAISE EXCEPTION 'team_notification_capacity'; END IF;
 INSERT INTO public.project_team_notification_outbox(owner_id,project_id,recipient_id,settings_revision,membership_revision) VALUES(p_owner,p_project,p_recipient,settings.revision,settings.membership_revision) RETURNING id INTO result;
 INSERT INTO public.project_team_notification_items(notification_id,recipient_id,outbox_id) SELECT unnest(ids),p_recipient,result
 ON CONFLICT(notification_id,recipient_id) DO UPDATE SET outbox_id=EXCLUDED.outbox_id
 WHERE EXISTS(SELECT 1 FROM public.project_team_notification_outbox old WHERE old.id=project_team_notification_items.outbox_id AND old.status='failed' AND old.owner_id=p_owner AND old.project_id=p_project AND old.recipient_id=p_recipient);
 RETURN result;
END; $$;
CREATE FUNCTION public.claim_project_team_notification_digest()
RETURNS TABLE(id uuid,owner_id uuid,project_id text,recipient_id uuid,lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.project_team_notification_outbox o SET status='unknown',finished_at=clock_timestamp() WHERE status='sending' AND lease_until<clock_timestamp();
 UPDATE public.project_team_notification_outbox o SET status='failed',finished_at=clock_timestamp() WHERE status='leased' AND lease_until<clock_timestamp() AND attempts>=3;
 RETURN QUERY WITH picked AS (SELECT o.id FROM public.project_team_notification_outbox o WHERE ((o.status='pending' AND o.available_at<=clock_timestamp()) OR (o.status='leased' AND o.lease_until<clock_timestamp())) AND o.attempts<3 ORDER BY o.available_at,o.id LIMIT 1 FOR UPDATE SKIP LOCKED)
 UPDATE public.project_team_notification_outbox o SET status='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=o.attempts+1 FROM picked WHERE o.id=picked.id RETURNING o.id,o.owner_id,o.project_id,o.recipient_id,o.lease_token;
END; $$;
CREATE FUNCTION public.begin_project_team_notification_delivery(p_id uuid,p_lease uuid,p_email_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.project_team_notification_outbox%ROWTYPE; rev bigint; items jsonb; language text;
BEGIN
 -- Lock workspace before outbox, matching enqueue and membership mutation order.
 SELECT * INTO o FROM public.project_team_notification_outbox WHERE id=p_id;
 IF o.id IS NULL THEN RETURN NULL; END IF;
 SELECT m.rev INTO rev FROM public.workspace_meta m WHERE user_id=o.owner_id FOR UPDATE;
 SELECT * INTO o FROM public.project_team_notification_outbox WHERE id=p_id FOR UPDATE;
 IF o.status<>'leased' OR o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
 IF p_email_hash IS NULL OR p_email_hash !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=o.recipient_id AND encode(sha256(convert_to(lower(u.email),'UTF8')),'hex')=p_email_hash) OR NOT public.project_team_notification_recipient_eligible(o.owner_id,o.project_id,o.recipient_id,o.settings_revision,o.membership_revision) THEN
 UPDATE public.project_team_notification_outbox SET status='cancelled',finished_at=clock_timestamp() WHERE id=p_id; RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_notification_scans WHERE user_id=o.owner_id AND workspace_rev=rev AND scanned_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'team_notification_source_stale'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',n.id,'projectId',n.project_id,'targetId',n.target_id,'title',n.target_title,'kind',n.kind,'dueAt',n.due_at,'detail',jsonb_build_object('timeZone',coalesce(n.detail->>'timeZone','UTC'))) ORDER BY n.created_at,n.id) INTO items
 FROM public.operational_notifications n JOIN public.project_team_notification_items i ON i.notification_id=n.id
 WHERE i.outbox_id=o.id AND i.recipient_id=o.recipient_id AND n.user_id=o.owner_id AND n.project_id=o.project_id AND n.active AND n.kind IN ('approval_due','publication_failed','manual_overdue','cadence_gap','scheduler_recovery');
 IF items IS NULL THEN UPDATE public.project_team_notification_outbox SET status='cancelled',finished_at=clock_timestamp() WHERE id=p_id; RETURN NULL; END IF;
 SELECT locale INTO language FROM public.operational_email_preferences WHERE user_id=o.recipient_id;
 UPDATE public.project_team_notification_outbox SET status='sending' WHERE id=p_id;
 RETURN jsonb_build_object('locale',coalesce(language,'en'),'items',items);
END; $$;
CREATE FUNCTION public.finish_project_team_notification_delivery(p_id uuid,p_lease uuid,p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.project_team_notification_outbox%ROWTYPE;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','unknown','preflight_unavailable') THEN RAISE EXCEPTION 'invalid_team_notification_outcome'; END IF;
 SELECT * INTO o FROM public.project_team_notification_outbox WHERE id=p_id FOR UPDATE;
 IF o.id IS NULL OR o.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF o.status=p_outcome AND p_outcome IN ('accepted','unknown') THEN RETURN true; END IF;
 IF p_outcome='preflight_unavailable' AND o.status='leased' THEN
 UPDATE public.project_team_notification_outbox SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,available_at=clock_timestamp()+interval '15 minutes',lease_token=NULL,lease_until=NULL,finished_at=CASE WHEN attempts>=3 THEN clock_timestamp() ELSE NULL END WHERE id=p_id; RETURN true; END IF;
 IF o.status<>'sending' OR p_outcome='preflight_unavailable' THEN RETURN false; END IF;
 UPDATE public.project_team_notification_outbox SET status=p_outcome,finished_at=clock_timestamp() WHERE id=p_id; RETURN true;
END; $$;
CREATE FUNCTION public.read_project_team_notification_history(p_actor uuid,p_owner uuid,p_project text,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE settings jsonb; deliveries jsonb;
BEGIN
 settings:=public.read_project_team_notification_recipient(p_actor,p_owner,p_project,p_recipient);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'createdAt',created_at,'finishedAt',finished_at) ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO deliveries FROM (SELECT * FROM public.project_team_notification_outbox WHERE owner_id=p_owner AND project_id=p_project AND recipient_id=p_recipient ORDER BY created_at DESC,id DESC LIMIT 20) recent;
 RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'recipientId',p_recipient,'deliveries',deliveries);
END; $$;
REVOKE ALL ON FUNCTION public.queue_project_team_notification_digest(uuid,text,uuid),public.claim_project_team_notification_digest(),public.begin_project_team_notification_delivery(uuid,uuid,text),public.finish_project_team_notification_delivery(uuid,uuid,text),public.read_project_team_notification_history(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_project_team_notification_digest(uuid,text,uuid),public.claim_project_team_notification_digest(),public.begin_project_team_notification_delivery(uuid,uuid,text),public.finish_project_team_notification_delivery(uuid,uuid,text),public.read_project_team_notification_history(uuid,uuid,text,uuid) TO service_role;
ALTER TABLE public.project_team_notification_recipients ADD COLUMN last_scan_at timestamptz;
CREATE INDEX project_team_notification_scan_order ON public.project_team_notification_recipients
(last_scan_at ASC NULLS FIRST,owner_id,project_id,recipient_id) WHERE assigned AND opted_in;
CREATE FUNCTION public.project_team_notification_scan_targets()
RETURNS TABLE(owner_id uuid,project_id text,recipient_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN QUERY WITH targets AS (SELECT s.owner_id,s.project_id,s.recipient_id FROM public.project_team_notification_recipients s
 JOIN public.project_team_members m ON m.owner_id=s.owner_id AND m.project_id=s.project_id AND m.actor_id=s.recipient_id
 WHERE s.assigned AND s.opted_in AND s.membership_revision=m.revision AND m.active AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ORDER BY s.last_scan_at ASC NULLS FIRST,s.owner_id,s.project_id,s.recipient_id LIMIT 20 FOR UPDATE OF s SKIP LOCKED)
 UPDATE public.project_team_notification_recipients s SET last_scan_at=clock_timestamp() FROM targets t WHERE s.owner_id=t.owner_id AND s.project_id=t.project_id AND s.recipient_id=t.recipient_id RETURNING s.owner_id,s.project_id,s.recipient_id;
END; $$;
REVOKE ALL ON FUNCTION public.project_team_notification_scan_targets() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_team_notification_scan_targets() TO service_role;
