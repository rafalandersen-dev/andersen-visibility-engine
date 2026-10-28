-- Recover owner digest items stranded by exhausted preflight retries or
-- expired pre-transport leases (28 October 2026).
--
-- finish_operational_email_delivery marks an outbox row 'failed' with
-- reason='attempts_exhausted' once attempts reaches 3 (three
-- preflight_unavailable outcomes, or three expired pre-transport leases
-- retired by claim_operational_email_digest). queue_operational_email_digest
-- only ever inserted a notification once: any notification already linked to
-- an operational_email_items row, in ANY outbox status, was excluded forever
-- by "NOT EXISTS(... i.notification_id=n.id)". A rescan of the same incident
-- (same workspace revision, same unread notification) could therefore never
-- recover: the notification stayed permanently unqueued even though delivery
-- service recovered and later sweeps are otherwise healthy.
--
-- This replaces queue_operational_email_digest(uuid) only. The eligibility
-- set is unchanged except that a notification whose only existing item links
-- to a terminally exhausted outbox row (status='failed',
-- reason='attempts_exhausted', attempts=3, finished_at IS NOT NULL, same
-- owner) is eligible again. The matching operational_email_items row is
-- repointed to the new outbox via ON CONFLICT(notification_id) DO UPDATE,
-- re-validated against the same exhausted-row guard at conflict time so a
-- concurrent change cannot silently repoint an active item. The old outbox
-- row itself is never updated, reset or deleted: it remains a retained,
-- auditable failed row. No other outbox status (pending, leased, sending,
-- accepted, unknown, cancelled) is reassigned or otherwise touched.
CREATE OR REPLACE FUNCTION public.queue_operational_email_digest(p_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rev bigint; v_id uuid; v_ids uuid[];
BEGIN
 SELECT rev INTO v_rev FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
 IF v_rev IS NULL OR NOT EXISTS(SELECT 1 FROM public.operational_email_preferences WHERE user_id=p_user AND enabled)
 OR NOT EXISTS(SELECT 1 FROM public.operational_notification_scans WHERE user_id=p_user AND workspace_rev=v_rev AND scanned_at>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.operational_email_outbox WHERE user_id=p_user AND (created_at>now()-interval '1 hour' OR status IN ('pending','leased','sending'))) THEN RETURN NULL; END IF;
 SELECT array_agg(id) INTO v_ids FROM (
  SELECT n.id FROM public.operational_notifications n WHERE n.user_id=p_user AND n.active AND n.read_at IS NULL
   AND (
    NOT EXISTS(SELECT 1 FROM public.operational_email_items i WHERE i.notification_id=n.id)
    OR EXISTS(
     SELECT 1 FROM public.operational_email_items i JOIN public.operational_email_outbox o ON o.id=i.outbox_id
     WHERE i.notification_id=n.id AND o.user_id=p_user AND o.status='failed' AND o.reason='attempts_exhausted' AND o.attempts=3 AND o.finished_at IS NOT NULL
    )
   )
  ORDER BY n.created_at,n.id LIMIT 50
 ) eligible;
 IF coalesce(cardinality(v_ids),0)=0 THEN RETURN NULL; END IF;
 INSERT INTO public.operational_email_outbox(user_id) VALUES(p_user) RETURNING id INTO v_id;
 INSERT INTO public.operational_email_items(notification_id,outbox_id) SELECT unnest(v_ids),v_id
 ON CONFLICT(notification_id) DO UPDATE SET outbox_id=excluded.outbox_id WHERE EXISTS(
  SELECT 1 FROM public.operational_email_outbox oo WHERE oo.id=public.operational_email_items.outbox_id
   AND oo.user_id=p_user AND oo.status='failed' AND oo.reason='attempts_exhausted' AND oo.attempts=3 AND oo.finished_at IS NOT NULL
 );
 RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.queue_operational_email_digest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_operational_email_digest(uuid) TO service_role;
