-- UNRELEASED. Recipient controls only: no email is queued or sent by this migration.
CREATE TABLE public.project_team_notification_recipients (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 assigned boolean NOT NULL DEFAULT false,
 opted_in boolean NOT NULL DEFAULT false,
 membership_revision bigint NOT NULL CHECK(membership_revision>0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,project_id,recipient_id),
 FOREIGN KEY(owner_id,project_id,recipient_id) REFERENCES public.project_team_members(owner_id,project_id,actor_id) ON DELETE CASCADE
);
CREATE TABLE public.project_team_notification_recipient_audit (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('assign','opt_in')),
 enabled boolean NOT NULL,
 revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_team_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_notification_recipient_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_notification_recipients,public.project_team_notification_recipient_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_team_notification_recipients,public.project_team_notification_recipient_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.project_team_notification_recipient_audit_event_id_seq TO service_role;
CREATE INDEX project_team_notification_recipient_audit_recent_activity ON public.project_team_notification_recipient_audit(owner_id,project_id,created_at);
CREATE FUNCTION public.read_project_team_notification_recipient(p_actor uuid,p_owner uuid,p_project text,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; member public.project_team_members%ROWTYPE; settings public.project_team_notification_recipients%ROWTYPE; current_binding boolean;
BEGIN
 IF p_actor IS NULL OR p_recipient IS NULL OR p_recipient=p_owner OR (p_actor<>p_owner AND p_actor<>p_recipient) THEN RAISE EXCEPTION 'team_recipient_unavailable'; END IF;
 snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,NULL,0);
 SELECT * INTO member FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_recipient;
 IF member.actor_id IS NULL THEN RAISE EXCEPTION 'team_recipient_unavailable'; END IF;
 SELECT * INTO settings FROM public.project_team_notification_recipients WHERE owner_id=p_owner AND project_id=p_project AND recipient_id=p_recipient;
 current_binding:=coalesce(settings.membership_revision=member.revision,false) AND member.active AND (member.expires_at IS NULL OR member.expires_at>clock_timestamp());
 RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'recipientId',p_recipient,'revision',coalesce(settings.revision,0),'membershipRevision',member.revision,
 'assigned',current_binding AND coalesce(settings.assigned,false),'optedIn',current_binding AND coalesce(settings.opted_in,false));
END; $$;
CREATE FUNCTION public.set_project_team_notification_recipient(p_actor uuid,p_owner uuid,p_project text,p_recipient uuid,p_action text,p_enabled boolean,p_expected bigint,p_membership bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; member public.project_team_members%ROWTYPE; settings public.project_team_notification_recipients%ROWTYPE; next_revision bigint;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('assign','opt_in') OR p_enabled IS NULL OR p_expected IS NULL OR p_expected<0 OR p_membership IS NULL
 OR p_actor IS NULL OR p_recipient IS NULL OR p_recipient=p_owner OR (p_action='assign' AND p_actor<>p_owner) OR (p_action='opt_in' AND p_actor<>p_recipient) THEN RAISE EXCEPTION 'team_recipient_unavailable'; END IF;
 snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,NULL,0);
 SELECT * INTO member FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_recipient;
 IF member.actor_id IS NULL OR NOT member.active OR (member.expires_at IS NOT NULL AND member.expires_at<=clock_timestamp()) OR member.revision<>p_membership THEN RAISE EXCEPTION 'team_recipient_changed'; END IF;
 SELECT * INTO settings FROM public.project_team_notification_recipients WHERE owner_id=p_owner AND project_id=p_project AND recipient_id=p_recipient;
 IF coalesce(settings.revision,0)<>p_expected THEN RAISE EXCEPTION 'team_recipient_changed' USING ERRCODE='40001'; END IF;
 IF p_enabled AND (SELECT count(*) FROM public.project_team_notification_recipient_audit WHERE owner_id=p_owner AND project_id=p_project AND created_at>clock_timestamp()-interval '1 hour')>=10000 THEN RAISE EXCEPTION 'team_recipient_capacity'; END IF;
 next_revision:=p_expected+1;
 INSERT INTO public.project_team_notification_recipients(owner_id,project_id,recipient_id,assigned,opted_in,membership_revision,revision)
 VALUES(p_owner,p_project,p_recipient,
 CASE WHEN p_action='assign' THEN p_enabled ELSE coalesce(settings.assigned AND settings.membership_revision=member.revision,false) END,
 CASE WHEN p_action='opt_in' THEN p_enabled ELSE coalesce(settings.opted_in AND settings.membership_revision=member.revision,false) END,member.revision,next_revision)
 ON CONFLICT(owner_id,project_id,recipient_id) DO UPDATE SET assigned=EXCLUDED.assigned,opted_in=EXCLUDED.opted_in,membership_revision=EXCLUDED.membership_revision,revision=EXCLUDED.revision,updated_at=clock_timestamp();
 INSERT INTO public.project_team_notification_recipient_audit(owner_id,project_id,recipient_id,actor_id,action,enabled,revision) VALUES(p_owner,p_project,p_recipient,p_actor,p_action,p_enabled,next_revision);
 RETURN next_revision;
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_notification_recipient(uuid,uuid,text,uuid),public.set_project_team_notification_recipient(uuid,uuid,text,uuid,text,boolean,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_notification_recipient(uuid,uuid,text,uuid),public.set_project_team_notification_recipient(uuid,uuid,text,uuid,text,boolean,bigint,bigint) TO service_role;
-- Delivery admission must match the settings and membership recorded when queued.
-- This read-only check neither resolves an email address nor invokes transport.
CREATE FUNCTION public.project_team_notification_recipient_eligible(p_owner uuid,p_project text,p_recipient uuid,p_revision bigint,p_membership bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE settings jsonb;
BEGIN
 settings:=public.read_project_team_notification_recipient(p_owner,p_owner,p_project,p_recipient);
 RETURN coalesce((settings->>'assigned')::boolean AND (settings->>'optedIn')::boolean
 AND (settings->>'revision')::bigint=p_revision AND (settings->>'membershipRevision')::bigint=p_membership
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_recipient AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND u.email_confirmed_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND lower(i.identity_data->>'email')=lower(u.email) AND i.identity_data->>'email_verified'='true')),false);
END; $$;
REVOKE ALL ON FUNCTION public.project_team_notification_recipient_eligible(uuid,text,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_team_notification_recipient_eligible(uuid,text,uuid,bigint,bigint) TO service_role;
