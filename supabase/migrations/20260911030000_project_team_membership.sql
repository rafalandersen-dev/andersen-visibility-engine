-- UNRELEASED. Service-only membership lifecycle; no email transport or delegated
-- editing/approval grant. p_actor always comes from verified authentication.
CREATE TABLE public.project_team_invitations (
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  invite_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  recipient_email text NOT NULL CHECK(length(recipient_email) BETWEEN 3 AND 254 AND recipient_email=lower(btrim(recipient_email))),
  role text NOT NULL CHECK(role IN ('viewer','editor','reviewer')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','revoked')),
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY(owner_id,invite_id),
  FOREIGN KEY(owner_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX project_team_invite_pending ON public.project_team_invitations(owner_id,project_id,recipient_email) WHERE state='pending';
CREATE TABLE public.project_team_audit (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  actor_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('invited','invite_revoked','accepted','role_changed','removed')),
  revision bigint,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.project_team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_invitations,public.project_team_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.project_team_audit_event_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_project_team_invitation(p_actor uuid,p_owner uuid,p_project text,p_invite uuid,p_email text,p_role text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.project_team_invitations%ROWTYPE; recipient text;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_owner OR p_invite IS NULL
    OR p_email IS NULL OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_role IS NULL OR p_role NOT IN ('viewer','editor','reviewer') THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.assert_project_team_account(p_owner);
  recipient:=lower(btrim(p_email));
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND lower(btrim(auth.users.email))=recipient)
    THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
  -- Membership is scoped to this project and the account's current address.
  -- The owner workspace lock above serializes invitation and membership changes.
  IF EXISTS(SELECT 1 FROM public.project_team_members m JOIN auth.users u ON u.id=m.actor_id
    WHERE m.owner_id=p_owner AND m.project_id=p_project AND m.active
      AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
      AND lower(btrim(u.email))=recipient)
    THEN RAISE EXCEPTION 'team_membership_exists'; END IF;
  SELECT * INTO previous FROM public.project_team_invitations WHERE owner_id=p_owner AND invite_id=p_invite;
  IF FOUND THEN
    IF previous.project_id=p_project AND previous.recipient_email=recipient AND previous.role=p_role AND previous.state='pending' AND previous.expires_at>clock_timestamp() THEN RETURN true; END IF;
    RAISE EXCEPTION 'team_invitation_replay';
  END IF;
  IF (SELECT count(*) FROM public.project_team_invitations WHERE owner_id=p_owner AND project_id=p_project AND state='pending' AND expires_at>clock_timestamp())>=1000
    THEN RAISE EXCEPTION 'team_invitation_capacity'; END IF;
  -- Expired invitations are terminal; creating a new invitation never revives
  -- a previously accepted/revoked link or silently changes an existing role.
  UPDATE public.project_team_invitations SET state='revoked'
    WHERE owner_id=p_owner AND project_id=p_project AND recipient_email=recipient AND state='pending' AND expires_at<=clock_timestamp();
  IF EXISTS(SELECT 1 FROM public.project_team_invitations WHERE owner_id=p_owner AND project_id=p_project AND recipient_email=recipient AND state='pending')
    THEN RAISE EXCEPTION 'team_invitation_exists'; END IF;
  INSERT INTO public.project_team_invitations(owner_id,project_id,invite_id,recipient_email,role,expires_at)
    VALUES(p_owner,p_project,p_invite,recipient,p_role,clock_timestamp()+interval '7 days');
  INSERT INTO public.project_team_audit(owner_id,project_id,actor_id,subject_id,action) VALUES(p_owner,p_project,p_actor,p_invite,'invited');
  RETURN true;
END; $$;

CREATE FUNCTION public.revoke_project_team_invitation(p_actor uuid,p_owner uuid,p_project text,p_invite uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.assert_project_team_account(p_owner);
  UPDATE public.project_team_invitations SET state='revoked'
    WHERE owner_id=p_owner AND project_id=p_project AND invite_id=p_invite AND state='pending';
  IF FOUND THEN
    INSERT INTO public.project_team_audit(owner_id,project_id,actor_id,subject_id,action) VALUES(p_owner,p_project,p_actor,p_invite,'invite_revoked');
    RETURN true;
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_team_invitations WHERE owner_id=p_owner AND project_id=p_project AND invite_id=p_invite AND state='revoked') THEN RETURN true; END IF;
  RAISE EXCEPTION 'team_invitation_unavailable';
END; $$;

CREATE FUNCTION public.accept_project_team_invitation(p_actor uuid,p_owner uuid,p_project text,p_invite uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation public.project_team_invitations%ROWTYPE; recipient text; member_revision bigint;
BEGIN
  IF p_actor IS NULL OR p_actor=p_owner THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.assert_project_team_account(p_owner);
  -- Use authoritative current auth state; JWT/browser email is not evidence.
  SELECT lower(btrim(u.email)) INTO recipient FROM auth.users u
    JOIN auth.identities i ON i.user_id=u.id
      AND lower(btrim(i.identity_data->>'email'))=lower(btrim(u.email))
      AND i.identity_data->>'email_verified'='true'
    WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) LIMIT 1 FOR SHARE OF u,i;
  IF NOT FOUND OR recipient IS NULL THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
  SELECT * INTO invitation FROM public.project_team_invitations
    WHERE owner_id=p_owner AND project_id=p_project AND invite_id=p_invite FOR UPDATE;
  IF NOT FOUND OR invitation.recipient_email<>recipient OR invitation.state<>'pending' OR invitation.expires_at<=clock_timestamp()
    THEN RAISE EXCEPTION 'team_invitation_unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor AND active AND (expires_at IS NULL OR expires_at>clock_timestamp()))
    THEN RAISE EXCEPTION 'team_membership_exists'; END IF;
  IF (SELECT count(*) FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project)>=1000
    AND NOT EXISTS(SELECT 1 FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor)
    THEN RAISE EXCEPTION 'team_membership_capacity'; END IF;
  INSERT INTO public.project_team_members(owner_id,project_id,actor_id,role)
    VALUES(p_owner,p_project,p_actor,invitation.role)
    ON CONFLICT(owner_id,project_id,actor_id) DO UPDATE SET role=EXCLUDED.role,active=true,expires_at=NULL,revision=project_team_members.revision+1
    RETURNING revision INTO member_revision;
  UPDATE public.project_team_invitations SET state='accepted',accepted_by=p_actor WHERE owner_id=p_owner AND invite_id=p_invite;
  INSERT INTO public.project_team_audit(owner_id,project_id,actor_id,subject_id,action,revision) VALUES(p_owner,p_project,p_actor,p_invite,'accepted',member_revision);
  RETURN member_revision;
END; $$;

CREATE FUNCTION public.change_project_team_member(p_actor uuid,p_owner uuid,p_project text,p_member uuid,p_expected bigint,p_role text,p_remove boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE next_revision bigint;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_owner OR p_member IS NULL OR p_member=p_owner
    OR p_expected IS NULL OR p_expected<1 OR p_remove IS NULL
    OR (NOT p_remove AND (p_role IS NULL OR p_role NOT IN ('viewer','editor','reviewer')))
    THEN RAISE EXCEPTION 'team_membership_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.assert_project_team_account(p_owner);
  UPDATE public.project_team_members SET role=CASE WHEN p_remove THEN role ELSE p_role END,
    active=NOT p_remove,revision=revision+1
    WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_member AND revision=p_expected AND active
    RETURNING revision INTO next_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_membership_changed' USING ERRCODE='40001'; END IF;
  -- Removal also invalidates any pending invitations to the current account,
  -- preventing an older invitation from silently restoring removed access.
  IF p_remove THEN
    UPDATE public.project_team_invitations SET state='revoked' WHERE owner_id=p_owner AND project_id=p_project AND state='pending'
      AND recipient_email=(SELECT lower(btrim(email)) FROM auth.users WHERE id=p_member);
  END IF;
  INSERT INTO public.project_team_audit(owner_id,project_id,actor_id,subject_id,action,revision)
    VALUES(p_owner,p_project,p_actor,p_member,CASE WHEN p_remove THEN 'removed' ELSE 'role_changed' END,next_revision);
  RETURN next_revision;
END; $$;
REVOKE ALL ON FUNCTION public.create_project_team_invitation(uuid,uuid,text,uuid,text,text),public.revoke_project_team_invitation(uuid,uuid,text,uuid),public.accept_project_team_invitation(uuid,uuid,text,uuid),public.change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_team_invitation(uuid,uuid,text,uuid,text,text),public.revoke_project_team_invitation(uuid,uuid,text,uuid),public.accept_project_team_invitation(uuid,uuid,text,uuid),public.change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean) TO service_role;

CREATE FUNCTION public.read_project_team_roster(p_actor uuid,p_owner uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE members jsonb; invitations jsonb; audit jsonb;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.assert_project_team_account(p_owner);
  SELECT coalesce(jsonb_agg(jsonb_build_object('actorId',m.actor_id,'email',u.email,'role',m.role,'revision',m.revision,'active',m.active,'expiresAt',m.expires_at) ORDER BY m.actor_id),'[]'::jsonb)
    INTO members FROM public.project_team_members m LEFT JOIN auth.users u ON u.id=m.actor_id WHERE m.owner_id=p_owner AND m.project_id=p_project;
  SELECT coalesce(jsonb_agg(jsonb_build_object('inviteId',invite_id,'email',recipient_email,'role',role,'state',state,'expiresAt',expires_at,'createdAt',created_at) ORDER BY created_at DESC,invite_id),'[]'::jsonb)
    INTO invitations FROM (SELECT * FROM public.project_team_invitations WHERE owner_id=p_owner AND project_id=p_project ORDER BY (state='pending' AND expires_at>clock_timestamp()) DESC,created_at DESC,invite_id LIMIT 1000) recent;
  SELECT coalesce(jsonb_agg(jsonb_build_object('actorId',actor_id,'subjectId',subject_id,'action',action,'revision',revision,'occurredAt',occurred_at) ORDER BY event_id DESC),'[]'::jsonb)
    INTO audit FROM (SELECT * FROM public.project_team_audit WHERE owner_id=p_owner AND project_id=p_project ORDER BY event_id DESC LIMIT 100) recent;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'members',members,'invitations',invitations,'audit',audit);
END; $$;

-- Discovery includes only current memberships and invitations for a verified
-- current email. The invitation UUID is an identifier, never a bearer grant.
CREATE FUNCTION public.list_my_project_teams(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE projects jsonb; invitations jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    THEN RAISE EXCEPTION 'team_project_unavailable'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('ownerId',owner_id,'projectId',project_id,'name',name,'role',role,'revision',revision) ORDER BY owner_id,project_id),'[]'::jsonb)
    INTO projects FROM (
      SELECT m.owner_id,m.project_id,p.data->>'name' name,m.role,m.revision FROM public.project_team_members m
        JOIN public.workspace_entities p ON p.user_id=m.owner_id AND p.collection='projects' AND p.entity_id=m.project_id
        WHERE EXISTS(SELECT 1 FROM auth.users u WHERE u.id=m.owner_id AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) AND m.actor_id=p_actor AND m.active AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
        ORDER BY m.owner_id,m.project_id LIMIT 1001
    ) assigned;
  IF jsonb_array_length(projects)>1000 THEN RAISE EXCEPTION 'team_project_capacity'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('ownerId',owner_id,'projectId',project_id,'name',name,'role',role,'inviteId',invite_id,'expiresAt',expires_at) ORDER BY owner_id,invite_id),'[]'::jsonb)
    INTO invitations FROM (
      SELECT inv.owner_id,inv.project_id,p.data->>'name' name,inv.role,inv.invite_id,inv.expires_at FROM public.project_team_invitations inv
        JOIN public.workspace_entities p ON p.user_id=inv.owner_id AND p.collection='projects' AND p.entity_id=inv.project_id
        WHERE EXISTS(SELECT 1 FROM auth.users owner_account WHERE owner_account.id=inv.owner_id AND owner_account.deleted_at IS NULL AND (owner_account.banned_until IS NULL OR owner_account.banned_until<=clock_timestamp())) AND inv.state='pending' AND inv.expires_at>clock_timestamp() AND EXISTS(
          SELECT 1 FROM auth.users u JOIN auth.identities i ON i.user_id=u.id
            WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL
              AND lower(btrim(u.email))=inv.recipient_email
              AND lower(btrim(i.identity_data->>'email'))=inv.recipient_email AND i.identity_data->>'email_verified'='true')
        ORDER BY inv.owner_id,inv.invite_id LIMIT 1001
    ) pending;
  IF jsonb_array_length(invitations)>1000 THEN RAISE EXCEPTION 'team_project_capacity'; END IF;
  RETURN jsonb_build_object('actorId',p_actor,'projects',projects,'invitations',invitations);
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_roster(uuid,uuid,text),public.list_my_project_teams(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_roster(uuid,uuid,text),public.list_my_project_teams(uuid) TO service_role;
