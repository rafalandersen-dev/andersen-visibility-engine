-- Explicit, expiring single-recipient rollout. Existing eligibility/final-send guards remain unchanged.
CREATE FUNCTION public.claim_project_team_notification_digest_scoped(p_owner uuid,p_project text,p_recipient uuid,p_until timestamptz)
RETURNS TABLE(id uuid,owner_id uuid,project_id text,recipient_id uuid,lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_owner IS NULL OR p_project IS NULL OR p_recipient IS NULL OR p_until IS NULL OR p_until<=clock_timestamp() OR p_until>clock_timestamp()+interval '24 hours' THEN RETURN; END IF;
 UPDATE public.project_team_notification_outbox o SET status='unknown',finished_at=clock_timestamp() WHERE o.owner_id=p_owner AND o.project_id=p_project AND o.recipient_id=p_recipient AND status='sending' AND lease_until<clock_timestamp();
 UPDATE public.project_team_notification_outbox o SET status='failed',finished_at=clock_timestamp() WHERE o.owner_id=p_owner AND o.project_id=p_project AND o.recipient_id=p_recipient AND status='leased' AND lease_until<clock_timestamp() AND attempts>=3;
 RETURN QUERY WITH picked AS (SELECT o.id FROM public.project_team_notification_outbox o WHERE o.owner_id=p_owner AND o.project_id=p_project AND o.recipient_id=p_recipient AND ((o.status='pending' AND o.available_at<=clock_timestamp()) OR (o.status='leased' AND o.lease_until<clock_timestamp())) AND o.attempts<3 ORDER BY o.available_at,o.id LIMIT 1 FOR UPDATE SKIP LOCKED)
 UPDATE public.project_team_notification_outbox o SET status='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=o.attempts+1 FROM picked WHERE o.id=picked.id RETURNING o.id,o.owner_id,o.project_id,o.recipient_id,o.lease_token;
END; $$;

CREATE FUNCTION public.project_team_notification_scan_target_scoped(p_owner uuid,p_project text,p_recipient uuid,p_until timestamptz)
RETURNS TABLE(owner_id uuid,project_id text,recipient_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_owner IS NULL OR p_project IS NULL OR p_recipient IS NULL OR p_until IS NULL OR p_until<=clock_timestamp() OR p_until>clock_timestamp()+interval '24 hours' THEN RETURN; END IF;
 RETURN QUERY WITH targets AS (SELECT s.owner_id,s.project_id,s.recipient_id FROM public.project_team_notification_recipients s
 JOIN public.project_team_members m ON m.owner_id=s.owner_id AND m.project_id=s.project_id AND m.actor_id=s.recipient_id
 WHERE s.owner_id=p_owner AND s.project_id=p_project AND s.recipient_id=p_recipient AND s.assigned AND s.opted_in AND s.membership_revision=m.revision AND m.active AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ORDER BY s.last_scan_at ASC NULLS FIRST,s.owner_id,s.project_id,s.recipient_id LIMIT 1 FOR UPDATE OF s SKIP LOCKED)
 UPDATE public.project_team_notification_recipients s SET last_scan_at=clock_timestamp() FROM targets t WHERE s.owner_id=t.owner_id AND s.project_id=t.project_id AND s.recipient_id=t.recipient_id RETURNING s.owner_id,s.project_id,s.recipient_id;
END; $$;

REVOKE ALL ON FUNCTION public.claim_project_team_notification_digest_scoped(uuid,text,uuid,timestamptz), public.project_team_notification_scan_target_scoped(uuid,text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_project_team_notification_digest_scoped(uuid,text,uuid,timestamptz), public.project_team_notification_scan_target_scoped(uuid,text,uuid,timestamptz) TO service_role;
