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
