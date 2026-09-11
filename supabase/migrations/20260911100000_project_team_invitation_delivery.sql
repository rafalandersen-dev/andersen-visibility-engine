-- UNRELEASED. An owner explicitly requests delivery of one saved invitation.
CREATE TABLE public.project_team_invitation_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 invite_id uuid NOT NULL,
 project_id text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','sending','accepted','unknown','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid,lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 finished_at timestamptz,
 UNIQUE(owner_id,invite_id),
 FOREIGN KEY(owner_id,invite_id) REFERENCES public.project_team_invitations(owner_id,invite_id) ON DELETE CASCADE
);
ALTER TABLE public.project_team_invitation_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_invitation_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_team_invitation_deliveries TO service_role;
CREATE INDEX project_team_invitation_delivery_claim ON public.project_team_invitation_deliveries(status,available_at);
CREATE FUNCTION public.request_project_team_invitation_delivery(p_actor uuid,p_project text,p_invite uuid,p_email text,p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation public.project_team_invitations%ROWTYPE; result uuid;
BEGIN
 PERFORM public.read_project_team_snapshot(p_actor,p_actor,p_project,NULL,0);
 SELECT * INTO invitation FROM public.project_team_invitations WHERE owner_id=p_actor AND project_id=p_project AND invite_id=p_invite;
 IF invitation.invite_id IS NULL OR invitation.state<>'pending' OR invitation.expires_at<=clock_timestamp() OR invitation.recipient_email IS DISTINCT FROM lower(btrim(p_email)) OR invitation.role IS DISTINCT FROM p_role THEN RAISE EXCEPTION 'team_invitation_delivery_changed'; END IF;
 SELECT id INTO result FROM public.project_team_invitation_deliveries WHERE owner_id=p_actor AND invite_id=p_invite;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF (SELECT count(*) FROM public.project_team_invitation_deliveries WHERE owner_id=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'team_invitation_delivery_capacity'; END IF;
 INSERT INTO public.project_team_invitation_deliveries(owner_id,invite_id,project_id) VALUES(p_actor,p_invite,p_project) RETURNING id INTO result;
 RETURN result;
END; $$;
CREATE FUNCTION public.claim_project_team_invitation_delivery()
RETURNS TABLE(id uuid,owner_id uuid,project_id text,invite_id uuid,lease_token uuid,email text,role text,locale text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.project_team_invitation_deliveries d SET status='unknown',finished_at=clock_timestamp() WHERE d.status='sending' AND d.lease_until<clock_timestamp();
 UPDATE public.project_team_invitation_deliveries d SET status='failed',finished_at=clock_timestamp() WHERE d.status='leased' AND d.lease_until<clock_timestamp() AND d.attempts>=3;
 RETURN QUERY WITH picked AS (SELECT d.id FROM public.project_team_invitation_deliveries d WHERE ((d.status='pending' AND d.available_at<=clock_timestamp()) OR (d.status='leased' AND d.lease_until<clock_timestamp())) AND d.attempts<3 ORDER BY d.available_at,d.id LIMIT 1 FOR UPDATE SKIP LOCKED), leased AS (
 UPDATE public.project_team_invitation_deliveries d SET status='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=d.attempts+1 FROM picked WHERE d.id=picked.id RETURNING d.*)
 SELECT d.id,d.owner_id,d.project_id,d.invite_id,d.lease_token,i.recipient_email,i.role,coalesce((SELECT pref.locale FROM public.operational_email_preferences pref WHERE pref.user_id=d.owner_id),'en') FROM leased d JOIN public.project_team_invitations i ON i.owner_id=d.owner_id AND i.invite_id=d.invite_id;
END; $$;
CREATE FUNCTION public.begin_project_team_invitation_delivery(p_id uuid,p_lease uuid,p_email_hash text,p_role text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delivery public.project_team_invitation_deliveries%ROWTYPE; invitation public.project_team_invitations%ROWTYPE;
BEGIN
 SELECT * INTO delivery FROM public.project_team_invitation_deliveries WHERE id=p_id;
 IF delivery.id IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.workspace_meta WHERE user_id=delivery.owner_id FOR UPDATE;
 SELECT * INTO delivery FROM public.project_team_invitation_deliveries WHERE id=p_id FOR UPDATE;
 IF delivery.status<>'leased' OR delivery.lease_token IS DISTINCT FROM p_lease OR delivery.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 SELECT * INTO invitation FROM public.project_team_invitations WHERE owner_id=delivery.owner_id AND invite_id=delivery.invite_id AND project_id=delivery.project_id;
 IF invitation.invite_id IS NULL OR invitation.state<>'pending' OR invitation.expires_at<=clock_timestamp()
 OR encode(sha256(convert_to(invitation.recipient_email,'UTF8')),'hex') IS DISTINCT FROM p_email_hash OR invitation.role IS DISTINCT FROM p_role
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=delivery.owner_id AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
 UPDATE public.project_team_invitation_deliveries SET status='cancelled',finished_at=clock_timestamp() WHERE id=p_id;RETURN false;END IF;
 UPDATE public.project_team_invitation_deliveries SET status='sending' WHERE id=p_id;RETURN true;
END; $$;
CREATE FUNCTION public.finish_project_team_invitation_delivery(p_id uuid,p_lease uuid,p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.project_team_invitation_deliveries%ROWTYPE;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','unknown','preflight_unavailable') THEN RAISE EXCEPTION 'invalid_invitation_outcome'; END IF;
 SELECT * INTO d FROM public.project_team_invitation_deliveries WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR d.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF d.status=p_outcome AND p_outcome IN ('accepted','unknown') THEN RETURN true; END IF;
 IF p_outcome='preflight_unavailable' AND d.status='leased' THEN
 UPDATE public.project_team_invitation_deliveries SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,available_at=clock_timestamp()+interval '15 minutes',lease_token=NULL,lease_until=NULL,finished_at=CASE WHEN attempts>=3 THEN clock_timestamp() ELSE NULL END WHERE id=p_id;RETURN true;END IF;
 IF d.status<>'sending' OR p_outcome='preflight_unavailable' THEN RETURN false;END IF;
 UPDATE public.project_team_invitation_deliveries SET status=p_outcome,finished_at=clock_timestamp() WHERE id=p_id;RETURN true;
END; $$;
CREATE FUNCTION public.read_project_team_invitation_delivery(p_actor uuid,p_project text,p_invite uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.read_project_team_snapshot(p_actor,p_actor,p_project,NULL,0);
 IF NOT EXISTS(SELECT 1 FROM public.project_team_invitations WHERE owner_id=p_actor AND project_id=p_project AND invite_id=p_invite) THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
 SELECT jsonb_build_object('id',id,'status',status,'createdAt',created_at,'finishedAt',finished_at) INTO result FROM public.project_team_invitation_deliveries WHERE owner_id=p_actor AND project_id=p_project AND invite_id=p_invite;
 RETURN jsonb_build_object('ownerId',p_actor,'projectId',p_project,'inviteId',p_invite,'delivery',result);
END; $$;
REVOKE ALL ON FUNCTION public.request_project_team_invitation_delivery(uuid,text,uuid,text,text),public.claim_project_team_invitation_delivery(),public.begin_project_team_invitation_delivery(uuid,uuid,text,text),public.finish_project_team_invitation_delivery(uuid,uuid,text),public.read_project_team_invitation_delivery(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_project_team_invitation_delivery(uuid,text,uuid,text,text),public.claim_project_team_invitation_delivery(),public.begin_project_team_invitation_delivery(uuid,uuid,text,text),public.finish_project_team_invitation_delivery(uuid,uuid,text),public.read_project_team_invitation_delivery(uuid,text,uuid) TO service_role;
