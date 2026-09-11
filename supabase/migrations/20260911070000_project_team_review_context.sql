-- UNRELEASED. PRIVATE service context, never return this raw payload to a
-- browser: project configuration contains owner-only connector credentials.
CREATE FUNCTION public.read_project_team_review_context(p_actor uuid,p_owner uuid,p_project text,p_asset text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; project jsonb; asset jsonb; links jsonb; result jsonb;
BEGIN
  IF p_asset IS NULL THEN RAISE EXCEPTION 'team_review_unavailable'; END IF;
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0);
  SELECT data || jsonb_build_object('id',entity_id) INTO project FROM public.workspace_entities WHERE user_id=p_owner AND collection='projects' AND entity_id=p_project;
  SELECT data || jsonb_build_object('id',entity_id) INTO asset FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project;
  SELECT coalesce(jsonb_agg(jsonb_build_object('liveUrl',data->>'liveUrl')),'[]'::jsonb) INTO links FROM (
    SELECT data FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND data->>'projectId'=p_project AND coalesce(data->>'liveUrl','')<>'' ORDER BY entity_id LIMIT 5001
  ) linked;
  IF jsonb_array_length(links)>5000 THEN RAISE EXCEPTION 'team_review_capacity'; END IF;
  result:=jsonb_build_object('actorId',p_actor,'ownerId',p_owner,'projectId',p_project,'assetId',p_asset,
    'workspaceRevision',snapshot->'workspaceRevision','membershipRevision',snapshot->'membershipRevision','draftHash',snapshot->'draftHash',
    'project',project,'asset',asset,'links',links);
  IF octet_length(result::text)>4000000 THEN RAISE EXCEPTION 'team_review_capacity'; END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_review_context(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_review_context(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.read_project_team_review_authority(p_actor uuid,p_owner uuid,p_project text,p_asset text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; policy public.project_team_approval_policy%ROWTYPE; member_role text; allowed boolean;
BEGIN
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0);
  IF p_asset IS NULL THEN RAISE EXCEPTION 'team_review_unavailable'; END IF;
  SELECT * INTO policy FROM public.project_team_approval_policy WHERE owner_id=p_owner AND project_id=p_project;
  SELECT role INTO member_role FROM public.project_team_members WHERE owner_id=p_owner AND project_id=p_project AND actor_id=p_actor;
  allowed:=p_actor=p_owner OR coalesce((policy.mode IN ('separate_reviewers','editors_can_approve') AND member_role='reviewer') OR (policy.mode='editors_can_approve' AND member_role='editor'),false);
  IF p_actor<>p_owner AND policy.mode='separate_reviewers' AND (SELECT actor_id FROM public.project_team_edits WHERE owner_id=p_owner AND project_id=p_project AND asset_id=p_asset AND content_hash=(SELECT public.project_team_authorship_hash(data) FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset) AND before_hash<>after_hash ORDER BY created_at DESC,edit_id DESC LIMIT 1)=p_actor THEN allowed:=false; END IF;
  RETURN jsonb_build_object('actorId',p_actor,'ownerId',p_owner,'projectId',p_project,'assetId',p_asset,'policyRevision',coalesce(policy.revision,0),'canReview',allowed);
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_review_authority(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_review_authority(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.read_project_team_review_history(p_actor uuid,p_owner uuid,p_project text,p_asset text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; reviews jsonb;
BEGIN
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0);
  IF p_asset IS NULL THEN RAISE EXCEPTION 'team_review_unavailable'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('reviewId',review_id,'mine',actor_id=p_actor,'owner',actor_id=p_owner,'approved',approved,'versionHash',version_hash,'createdAt',created_at) ORDER BY created_at DESC,review_id DESC),'[]'::jsonb)
    INTO reviews FROM (SELECT * FROM public.project_team_approval_history WHERE owner_id=p_owner AND project_id=p_project AND asset_id=p_asset ORDER BY created_at DESC,review_id DESC LIMIT 20) recent;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'assetId',p_asset,'reviews',reviews);
END; $$;
REVOKE ALL ON FUNCTION public.read_project_team_review_history(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_team_review_history(uuid,uuid,text,text) TO service_role;
