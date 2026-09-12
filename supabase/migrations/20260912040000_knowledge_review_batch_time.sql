-- Candidate-only: align bulk review eligibility with individual publication checks.
-- Preserve review history and the existing RPC response shape.
CREATE OR REPLACE FUNCTION public.read_output_knowledge_review_batch(p_user uuid,p_project text,p_assets text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset text; context jsonb; outputs jsonb:='[]'::jsonb; active_review jsonb; has_history boolean;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_assets IS NULL OR cardinality(p_assets)>100 OR array_position(p_assets,NULL) IS NOT NULL
    OR EXISTS(SELECT 1 FROM unnest(p_assets) a WHERE a !~ '^[A-Za-z0-9_-]{1,64}$')
    OR cardinality(p_assets)<>(SELECT count(DISTINCT a) FROM unnest(p_assets) a) THEN RAISE EXCEPTION 'invalid_review_asset_filter'; END IF;
  FOREACH asset IN ARRAY p_assets LOOP
    context:=public.read_output_knowledge_review_context(p_user,p_project,asset);
    SELECT jsonb_build_object('versionHash',version_hash,'contextHash',context_hash) INTO active_review
      FROM public.output_knowledge_reviews WHERE user_id=p_user AND project_id=p_project AND asset_id=asset AND active
        AND withdrawn_at IS NULL AND reviewed_at<=clock_timestamp();
    SELECT EXISTS(SELECT 1 FROM public.output_knowledge_reviews WHERE user_id=p_user AND project_id=p_project AND asset_id=asset) INTO has_history;
    outputs:=outputs || jsonb_build_array(jsonb_build_object('assetId',asset,'registry',context->'registry','contextHash',context->>'contextHash','activeReview',active_review,'hasHistory',has_history));
  END LOOP;
  RETURN jsonb_build_object('knowledge',public.read_project_knowledge(p_user,p_project),'brand',public.read_project_knowledge_brand(p_user,p_project),'outputs',outputs);
END; $$;
REVOKE ALL ON FUNCTION public.read_output_knowledge_review_batch(uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_output_knowledge_review_batch(uuid,text,text[]) TO service_role;
