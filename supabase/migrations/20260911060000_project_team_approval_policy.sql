-- UNRELEASED. Delegated approval defaults to inactive (no policy row). The
-- trusted review handler must derive publication hash from the exact saved
-- deliverable shown to the reviewer before invoking the grant RPC.
CREATE TABLE public.project_team_approval_policy (
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  mode text NOT NULL CHECK(mode IN ('disabled','separate_reviewers','editors_can_approve')),
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  PRIMARY KEY(owner_id,project_id),
  FOREIGN KEY(owner_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.project_team_approval_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_approval_policy FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.publication_approvals
  ADD COLUMN delegate_actor_id uuid,
  ADD COLUMN delegate_membership_revision bigint,
  ADD COLUMN delegate_policy_revision bigint,
  ADD CONSTRAINT publication_delegate_complete CHECK(
    (delegate_actor_id IS NULL AND delegate_membership_revision IS NULL AND delegate_policy_revision IS NULL)
    OR (delegate_actor_id IS NOT NULL AND delegate_membership_revision IS NOT NULL AND delegate_policy_revision IS NOT NULL AND delegate_membership_revision>0 AND delegate_policy_revision>0)
  );
CREATE TABLE public.project_team_approval_history (
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  review_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  membership_revision bigint NOT NULL,
  policy_revision bigint NOT NULL,
  version_hash text NOT NULL,
  approved boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  asset_collection text NOT NULL DEFAULT 'content' CHECK(asset_collection='content'),
  PRIMARY KEY(owner_id,review_id),
  FOREIGN KEY(owner_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,asset_collection,asset_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.project_team_approval_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_approval_history FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.set_project_team_approval_policy(p_actor uuid,p_owner uuid,p_project text,p_expected bigint,p_mode text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous bigint;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_owner OR p_expected IS NULL OR p_expected<0
    OR p_mode IS NULL OR p_mode NOT IN ('disabled','separate_reviewers','editors_can_approve') THEN RAISE EXCEPTION 'team_policy_unavailable'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  SELECT revision INTO previous FROM public.project_team_approval_policy WHERE owner_id=p_owner AND project_id=p_project;
  IF coalesce(previous,0)<>p_expected THEN RAISE EXCEPTION 'team_policy_changed' USING ERRCODE='40001'; END IF;
  INSERT INTO public.project_team_approval_policy(owner_id,project_id,mode,revision) VALUES(p_owner,p_project,p_mode,p_expected+1)
    ON CONFLICT(owner_id,project_id) DO UPDATE SET mode=EXCLUDED.mode,revision=EXCLUDED.revision;
  RETURN p_expected+1;
END; $$;

-- Read-time eligibility protects expiry even without a background sweep.
CREATE OR REPLACE FUNCTION public.read_publication_approval(p_user uuid,p_project text,p_asset text,p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    THEN RAISE EXCEPTION 'publication_asset_unavailable' USING ERRCODE='42501'; END IF;
  RETURN EXISTS(SELECT 1 FROM public.publication_approvals a WHERE a.user_id=p_user AND a.project_id=p_project AND a.asset_id=p_asset
    AND a.algorithm='milo-publication-v1' AND a.version_hash=p_hash AND a.approved
    AND (a.delegate_actor_id IS NULL OR EXISTS(
      SELECT 1 FROM public.project_team_members m JOIN public.project_team_approval_policy p ON p.owner_id=m.owner_id AND p.project_id=m.project_id
      WHERE m.owner_id=p_user AND m.project_id=p_project AND m.actor_id=a.delegate_actor_id AND m.active
        AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND m.revision=a.delegate_membership_revision
        AND p.revision=a.delegate_policy_revision
        AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=m.actor_id AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()))
        AND ((p.mode IN ('separate_reviewers','editors_can_approve') AND m.role='reviewer') OR (p.mode='editors_can_approve' AND m.role='editor'))
    )));
END; $$;

-- Owner approval always supersedes prior delegation. Membership revocation must
-- never withdraw a later independent approval by the owner.
CREATE OR REPLACE FUNCTION public.set_publication_approval(p_user uuid,p_project text,p_asset text,p_expected bigint,p_hash text,p_approved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_expected IS NULL OR p_expected<0 OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user)
    THEN RAISE EXCEPTION 'publication_workspace_changed' USING ERRCODE='40001'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_approved IS NULL THEN RAISE EXCEPTION 'invalid_publication_approval' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    THEN RAISE EXCEPTION 'publication_asset_unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.publication_approvals WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset)
    AND (SELECT count(*) FROM public.publication_approvals WHERE user_id=p_user AND project_id=p_project)>=1000 THEN RAISE EXCEPTION 'publication_approval_capacity'; END IF;
  INSERT INTO public.publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved)
    VALUES(p_user,p_project,p_asset,'milo-publication-v1',p_hash,p_approved)
    ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=p_hash,approved=p_approved,updated_at=clock_timestamp(),
      delegate_actor_id=NULL,delegate_membership_revision=NULL,delegate_policy_revision=NULL;
  RETURN true;
END; $$;

CREATE FUNCTION public.invalidate_project_team_approvals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account uuid; project text; member uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  account:=OLD.owner_id; project:=OLD.project_id;
  IF TG_TABLE_NAME='project_team_members' THEN member:=OLD.actor_id; END IF;
  UPDATE public.publication_approvals SET approved=false,updated_at=clock_timestamp()
    WHERE user_id=account AND project_id=project AND delegate_actor_id IS NOT NULL AND (member IS NULL OR delegate_actor_id=member);
  UPDATE public.scheduled_publishes q SET status='review_required',updated_at=clock_timestamp()
    WHERE q.user_id=account AND q.project_id=project AND q.status='pending' AND EXISTS(
      SELECT 1 FROM public.publication_approvals a WHERE a.user_id=account AND a.project_id=project AND a.asset_id=q.asset_id
        AND a.delegate_actor_id IS NOT NULL AND NOT a.approved AND (member IS NULL OR a.delegate_actor_id=member));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invalidate_project_team_approvals AFTER UPDATE OR DELETE ON public.project_team_members FOR EACH ROW EXECUTE FUNCTION public.invalidate_project_team_approvals();
CREATE TRIGGER invalidate_project_team_approvals AFTER UPDATE OR DELETE ON public.project_team_approval_policy FOR EACH ROW EXECUTE FUNCTION public.invalidate_project_team_approvals();
REVOKE ALL ON FUNCTION public.invalidate_project_team_approvals() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.save_project_team_approval(p_actor uuid,p_owner uuid,p_project text,p_asset text,p_review uuid,p_expected bigint,p_draft_hash text,p_version text,p_membership bigint,p_policy bigint,p_approved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; membership public.project_team_members%ROWTYPE; policy public.project_team_approval_policy%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_review IS NULL OR p_expected IS NULL OR p_expected<0 OR p_approved IS NULL
    OR p_draft_hash IS NULL OR p_draft_hash !~ '^[a-f0-9]{64}$' OR p_version IS NULL OR p_version !~ '^[a-f0-9]{64}$'
    OR p_membership IS NULL OR p_policy IS NULL THEN RAISE EXCEPTION 'team_approval_unavailable'; END IF;
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0);
  IF p_asset IS NULL OR (snapshot->>'workspaceRevision')::bigint<>p_expected OR snapshot->>'draftHash' IS DISTINCT FROM p_draft_hash THEN RAISE EXCEPTION 'team_approval_draft_changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO membership FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor;
  SELECT * INTO policy FROM public.project_team_approval_policy WHERE owner_id=p_owner AND project_id=p_project;
  IF coalesce(policy.revision,0)<>p_policy OR (snapshot->>'membershipRevision')::bigint<>p_membership
    OR (p_actor<>p_owner AND (policy.revision IS NULL OR NOT ((policy.mode IN ('separate_reviewers','editors_can_approve') AND membership.role='reviewer') OR (policy.mode='editors_can_approve' AND membership.role='editor')))) THEN RAISE EXCEPTION 'team_approval_policy_changed'; END IF;
  IF p_actor<>p_owner AND policy.mode='separate_reviewers' AND (SELECT actor_id FROM public.project_team_edits WHERE owner_id=p_owner AND project_id=p_project AND asset_id=p_asset ORDER BY created_at DESC,edit_id DESC LIMIT 1)=p_actor THEN RAISE EXCEPTION 'team_independent_reviewer_required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'team_approval_unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.publication_approvals WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset)
    AND (SELECT count(*) FROM public.publication_approvals WHERE user_id=p_owner AND project_id=p_project)>=1000 THEN RAISE EXCEPTION 'publication_approval_capacity'; END IF;
  IF EXISTS(SELECT 1 FROM public.project_team_approval_history WHERE owner_id=p_owner AND review_id=p_review) THEN RAISE EXCEPTION 'team_approval_replay'; END IF;
  IF (SELECT count(*) FROM public.project_team_approval_history WHERE owner_id=p_owner AND project_id=p_project)>=10000 THEN RAISE EXCEPTION 'team_approval_capacity'; END IF;
  PERFORM 1 FROM public.scheduled_publishes WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset AND status='publishing') THEN RAISE EXCEPTION 'team_publication_in_flight'; END IF;
  -- Rejection also holds pending work. Approval never arms a held queue.
  IF NOT p_approved THEN UPDATE public.scheduled_publishes SET status='review_required',updated_at=clock_timestamp() WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset AND status='pending'; END IF;
  UPDATE public.workspace_entities SET data=data || jsonb_build_object('status',CASE WHEN p_approved THEN 'Approved' ELSE 'Rejected' END,'updatedAt',clock_timestamp()),updated_at=clock_timestamp()
    WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset;
  UPDATE public.workspace_meta SET rev=rev+1 WHERE user_id=p_owner;
  INSERT INTO public.publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved,delegate_actor_id,delegate_membership_revision,delegate_policy_revision)
    VALUES(p_owner,p_project,p_asset,'milo-publication-v1',p_version,p_approved,CASE WHEN p_actor=p_owner THEN NULL ELSE p_actor END,CASE WHEN p_actor=p_owner THEN NULL ELSE p_membership END,CASE WHEN p_actor=p_owner THEN NULL ELSE p_policy END)
    ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=p_version,approved=p_approved,updated_at=clock_timestamp(),delegate_actor_id=EXCLUDED.delegate_actor_id,delegate_membership_revision=EXCLUDED.delegate_membership_revision,delegate_policy_revision=EXCLUDED.delegate_policy_revision;
  INSERT INTO public.project_team_approval_history(owner_id,project_id,asset_id,review_id,actor_id,membership_revision,policy_revision,version_hash,approved)
    VALUES(p_owner,p_project,p_asset,p_review,p_actor,p_membership,p_policy,p_version,p_approved);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.set_project_team_approval_policy(uuid,uuid,text,bigint,text),public.save_project_team_approval(uuid,uuid,text,text,uuid,bigint,text,text,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_team_approval_policy(uuid,uuid,text,bigint,text),public.save_project_team_approval(uuid,uuid,text,text,uuid,bigint,text,text,bigint,bigint,boolean) TO service_role;
CREATE FUNCTION public.read_project_team_approval_policy(p_actor uuid,p_owner uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; policy public.project_team_approval_policy%ROWTYPE;
BEGIN
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,NULL,0);
  SELECT * INTO policy FROM public.project_team_approval_policy WHERE owner_id=p_owner AND project_id=p_project;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'mode',policy.mode,'revision',coalesce(policy.revision,0));
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_approval_policy(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_approval_policy(uuid,uuid,text) TO service_role;
