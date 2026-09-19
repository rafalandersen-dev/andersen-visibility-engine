-- UNRELEASED candidate. Team seats per business account (owner decision 2026-09-14).
-- Working seats are the owner plus every distinct person who holds an editor or reviewer
-- role, or a pending working invitation, anywhere in the owner's account. Viewer seats
-- are distinct people who only view. The server supplies the allowance from the owner's
-- entitlement; NULL limits keep the previous behaviour, so existing callers are unchanged.
-- Reaching the limit refuses the invitation or role change; nothing is billed here.
-- A role change is refused only when it GROWS a full seat category for a distinct
-- person: promoting a viewer to a working role, or demoting a person's last working
-- role to viewer when no viewer seat is free. A neutral editor<->reviewer change, a
-- demotion of a person who still works elsewhere in the account, and any removal are
-- always allowed -- even over an already-exceeded allowance -- because they add no
-- seat. The classification is prospective and account-wide, so capacity never silently
-- keeps the stronger role while reporting the change as done.

CREATE FUNCTION public.count_project_team_seats(p_owner uuid,p_exclude_email text DEFAULT NULL)
RETURNS TABLE(working integer,viewer integer) LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
  WITH people AS (
    SELECT lower(btrim(u.email)) AS email,m.role FROM public.project_team_members m JOIN auth.users u ON u.id=m.actor_id
      WHERE m.owner_id=p_owner AND m.active AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND u.email IS NOT NULL
    UNION ALL
    SELECT recipient_email,role FROM public.project_team_invitations
      WHERE owner_id=p_owner AND state='pending' AND expires_at>clock_timestamp()
  ), classified AS (
    SELECT email,bool_or(role IN ('editor','reviewer')) AS works FROM people
      WHERE p_exclude_email IS NULL OR email<>p_exclude_email GROUP BY email
  )
  SELECT (1+count(*) FILTER (WHERE works))::integer,(count(*) FILTER (WHERE NOT works))::integer FROM classified;
$$;

-- Raises team_seat_limit only when giving this one distinct person the prospective role
-- p_role on p_project would move them INTO a seat category that is already full, or add a
-- brand-new person to a full category. Their holdings on OTHER projects and any pending
-- invitation are counted, so a person who still works elsewhere keeps their working seat
-- (no viewer seat) and a neutral working<->working change needs none. p_project names the
-- membership row being changed, so its pre-change role can never mask a demotion; an
-- invitation has no such row (the caller has already refused an existing membership).
-- count_project_team_seats excludes this person, so their prospective category grows by
-- exactly one and is checked against that category's allowance.
CREATE FUNCTION public.assert_project_team_seat(p_owner uuid,p_project text,p_email text,p_role text,p_working_seats integer,p_viewer_seats integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE works boolean; has_current boolean; current_works boolean;
  retains_working boolean; retains_viewing boolean; prior_present boolean; prior_working boolean;
  will_work boolean; used record;
BEGIN
  IF p_working_seats IS NULL AND p_viewer_seats IS NULL THEN RETURN; END IF;
  IF p_email IS NULL OR p_role IS NULL OR p_role NOT IN ('viewer','editor','reviewer')
    OR (p_working_seats IS NOT NULL AND p_working_seats<1) OR (p_viewer_seats IS NOT NULL AND p_viewer_seats<0)
    THEN RAISE EXCEPTION 'team_seat_unavailable'; END IF;
  works:=p_role IN ('editor','reviewer');
  -- The row being changed on THIS project, and whether it currently works. Absent (false)
  -- for a fresh invitation, whose recipient has no membership on the project.
  SELECT coalesce(bool_or(true),false),coalesce(bool_or(m.role IN ('editor','reviewer')),false)
    INTO has_current,current_works FROM public.project_team_members m JOIN auth.users u ON u.id=m.actor_id
      WHERE m.owner_id=p_owner AND m.project_id=p_project AND m.active
        AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND lower(btrim(u.email))=p_email;
  -- What the person still holds regardless of this change: memberships on OTHER projects
  -- and any pending invitation. A demotion on this project cannot take these away.
  SELECT coalesce(bool_or(role IN ('editor','reviewer')),false),coalesce(bool_or(role='viewer'),false)
    INTO retains_working,retains_viewing FROM (
      SELECT m.role FROM public.project_team_members m JOIN auth.users u ON u.id=m.actor_id
        WHERE m.owner_id=p_owner AND m.active AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
          AND m.project_id<>p_project AND lower(btrim(u.email))=p_email
      UNION ALL
      SELECT role FROM public.project_team_invitations
        WHERE owner_id=p_owner AND state='pending' AND expires_at>clock_timestamp() AND recipient_email=p_email) held;
  will_work:=works OR retains_working;
  prior_working:=(has_current AND current_works) OR retains_working;
  prior_present:=has_current OR retains_working OR retains_viewing;
  -- A seat is needed only when the person moves INTO a category they were not already in
  -- (or is brand new to the account). Staying in the same category -- editor<->reviewer, a
  -- demotion while still working elsewhere, or re-viewing an existing viewer -- grows
  -- nothing and is allowed even past an exceeded allowance.
  IF will_work THEN
    IF NOT prior_working AND p_working_seats IS NOT NULL THEN
      SELECT * INTO used FROM public.count_project_team_seats(p_owner,p_email);
      IF used.working>=p_working_seats THEN RAISE EXCEPTION 'team_seat_limit'; END IF;
    END IF;
  ELSIF NOT (prior_present AND NOT prior_working) AND p_viewer_seats IS NOT NULL THEN
    SELECT * INTO used FROM public.count_project_team_seats(p_owner,p_email);
    IF used.viewer>=p_viewer_seats THEN RAISE EXCEPTION 'team_seat_limit'; END IF;
  END IF;
END; $$;

-- Same bodies as 20260911030000 plus the seat check inside the existing owner lock. The
-- old signatures are dropped so calls with six or seven arguments resolve to the new
-- functions with NULL limits.
DROP FUNCTION public.create_project_team_invitation(uuid,uuid,text,uuid,text,text);
CREATE FUNCTION public.create_project_team_invitation(p_actor uuid,p_owner uuid,p_project text,p_invite uuid,p_email text,p_role text,p_working_seats integer DEFAULT NULL,p_viewer_seats integer DEFAULT NULL)
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
  PERFORM public.assert_project_team_seat(p_owner,p_project,recipient,p_role,p_working_seats,p_viewer_seats);
  INSERT INTO public.project_team_invitations(owner_id,project_id,invite_id,recipient_email,role,expires_at)
    VALUES(p_owner,p_project,p_invite,recipient,p_role,clock_timestamp()+interval '7 days');
  INSERT INTO public.project_team_audit(owner_id,project_id,actor_id,subject_id,action) VALUES(p_owner,p_project,p_actor,p_invite,'invited');
  RETURN true;
END; $$;

DROP FUNCTION public.change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean);
CREATE FUNCTION public.change_project_team_member(p_actor uuid,p_owner uuid,p_project text,p_member uuid,p_expected bigint,p_role text,p_remove boolean,p_working_seats integer DEFAULT NULL,p_viewer_seats integer DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE next_revision bigint; member_email text;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_owner OR p_member IS NULL OR p_member=p_owner
    OR p_expected IS NULL OR p_expected<1 OR p_remove IS NULL
    OR (NOT p_remove AND (p_role IS NULL OR p_role NOT IN ('viewer','editor','reviewer')))
    THEN RAISE EXCEPTION 'team_membership_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.assert_project_team_account(p_owner);
  IF NOT p_remove THEN
    -- The seat check is prospective and is told which project row is changing (p_project),
    -- so the pre-change role never masks a demotion: dropping the last working role to
    -- viewer needs a free viewer seat, viewer -> working needs a working seat, and a
    -- working<->working change or a demotion while the person still works elsewhere in the
    -- account needs none.
    SELECT lower(btrim(email)) INTO member_email FROM auth.users WHERE id=p_member;
    IF member_email IS NOT NULL AND EXISTS(SELECT 1 FROM public.project_team_members
        WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_member AND revision=p_expected AND active)
      THEN PERFORM public.assert_project_team_seat(p_owner,p_project,member_email,p_role,p_working_seats,p_viewer_seats); END IF;
  END IF;
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

REVOKE ALL ON FUNCTION public.count_project_team_seats(uuid,text),public.assert_project_team_seat(uuid,text,text,text,integer,integer),
  public.create_project_team_invitation(uuid,uuid,text,uuid,text,text,integer,integer),
  public.change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.count_project_team_seats(uuid,text),
  public.create_project_team_invitation(uuid,uuid,text,uuid,text,text,integer,integer),
  public.change_project_team_member(uuid,uuid,text,uuid,bigint,text,boolean,integer,integer) TO service_role;
