-- UNRELEASED: explicit knowledge review history. No existing approval is adopted.
CREATE TABLE public.output_knowledge_reviews (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  review_id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  asset_collection text NOT NULL DEFAULT 'content' CHECK(asset_collection='content'),
  version_hash text NOT NULL CHECK(version_hash ~ '^[a-f0-9]{64}$'),
  context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),
  active boolean NOT NULL DEFAULT true,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_at timestamptz,
  PRIMARY KEY(user_id,review_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,asset_collection,asset_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE INDEX output_knowledge_reviews_asset ON public.output_knowledge_reviews(user_id,project_id,asset_id,reviewed_at DESC);
CREATE UNIQUE INDEX output_knowledge_reviews_active ON public.output_knowledge_reviews(user_id,project_id,asset_id) WHERE active;
ALTER TABLE public.output_knowledge_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.output_knowledge_reviews FROM PUBLIC,anon,authenticated,service_role;

-- One account lock and snapshot for workspace-derived brand, current knowledge,
-- and retained provenance. Only opaque hashes are retained in review history.
CREATE FUNCTION public.read_output_knowledge_review_context(p_user uuid,p_project text,p_asset text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; registry jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    THEN RAISE EXCEPTION 'knowledge_output_unavailable'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'outputId',output_id,'kind',kind,'references',knowledge_references,'forgotten',knowledge_forgotten) ORDER BY kind,output_id),'[]'::jsonb)
    INTO registry FROM public.project_output_source_dependencies WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset
      AND (knowledge_references<>'[]'::jsonb OR knowledge_forgotten);
  result:=jsonb_build_object('knowledge',public.read_project_knowledge(p_user,p_project),'brand',public.read_project_knowledge_brand(p_user,p_project),'registry',registry);
  RETURN result || jsonb_build_object('contextHash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END; $$;

-- Trusted server computes publication hash from saved content and verifies the
-- explicit reviewed snapshot before calling. Workspace revision and context hash
-- close the read/write race under the same lock used by knowledge mutations.
CREATE FUNCTION public.save_output_knowledge_review(p_user uuid,p_project text,p_asset text,p_review uuid,p_expected bigint,p_version text,p_context text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_context jsonb; previous public.output_knowledge_reviews%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_review IS NULL OR p_version IS NULL OR p_version !~ '^[a-f0-9]{64}$' OR p_context IS NULL OR p_context !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'invalid_knowledge_review'; END IF;
  IF p_expected IS NULL OR p_expected<0 OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user)
    THEN RAISE EXCEPTION 'knowledge_output_changed' USING ERRCODE='40001'; END IF;
  current_context:=public.read_output_knowledge_review_context(p_user,p_project,p_asset);
  IF current_context->>'contextHash' IS DISTINCT FROM p_context THEN RAISE EXCEPTION 'knowledge_review_context_changed' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_context->'registry') r WHERE (r->>'forgotten')::boolean)
    THEN RAISE EXCEPTION 'knowledge_review_forgotten'; END IF;
  SELECT * INTO previous FROM public.output_knowledge_reviews WHERE user_id=p_user AND review_id=p_review;
  IF FOUND THEN
    IF previous.project_id=p_project AND previous.asset_id=p_asset AND previous.version_hash=p_version AND previous.context_hash=p_context AND previous.active THEN RETURN true; END IF;
    RAISE EXCEPTION 'knowledge_review_replay_conflict';
  END IF;
  IF (SELECT count(*) FROM public.output_knowledge_reviews WHERE user_id=p_user AND project_id=p_project)>=10000 THEN RAISE EXCEPTION 'knowledge_review_capacity'; END IF;
  UPDATE public.output_knowledge_reviews SET active=false,withdrawn_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset AND active;
  INSERT INTO public.output_knowledge_reviews(user_id,project_id,asset_id,review_id,version_hash,context_hash) VALUES(p_user,p_project,p_asset,p_review,p_version,p_context);
  RETURN true;
END; $$;

CREATE FUNCTION public.withdraw_output_knowledge_review(p_user uuid,p_project text,p_asset text,p_review uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  UPDATE public.output_knowledge_reviews SET active=false,withdrawn_at=coalesce(withdrawn_at,clock_timestamp())
    WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset AND review_id=p_review;
  RETURN FOUND;
END; $$;

-- Bounded history is metadata only: no copied facts, content, documents or URLs.
CREATE FUNCTION public.read_output_knowledge_reviews(p_user uuid,p_project text,p_asset text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    THEN RAISE EXCEPTION 'knowledge_output_unavailable'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('reviewId',review_id,'versionHash',version_hash,'contextHash',context_hash,'active',active,'reviewedAt',reviewed_at,'withdrawnAt',withdrawn_at) ORDER BY reviewed_at DESC,review_id)
    FROM (SELECT * FROM public.output_knowledge_reviews WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset ORDER BY reviewed_at DESC,review_id LIMIT 100) recent),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.read_output_knowledge_review_context(uuid,text,text),public.save_output_knowledge_review(uuid,text,text,uuid,bigint,text,text),public.withdraw_output_knowledge_review(uuid,text,text,uuid),public.read_output_knowledge_reviews(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_output_knowledge_review_context(uuid,text,text),public.save_output_knowledge_review(uuid,text,text,uuid,bigint,text,text),public.withdraw_output_knowledge_review(uuid,text,text,uuid),public.read_output_knowledge_reviews(uuid,text,text) TO service_role;

-- A later edit must not revive old authority even if its text is reverted.
-- Review is performed after saving and is separate from publication approval.
CREATE FUNCTION public.invalidate_output_knowledge_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.data IS NOT DISTINCT FROM OLD.data THEN RETURN NEW; END IF;
  IF OLD.collection='content' THEN
    -- These fields are excluded by publicationVersion and cannot change the
    -- reviewed deliverable. Scheduling or granting separate publication
    -- approval must not immediately invalidate a completed knowledge review.
    IF (NEW.data - ARRAY['status','updatedAt','scheduledPublishAt','sourceHeldPublishAt'])
       IS NOT DISTINCT FROM (OLD.data - ARRAY['status','updatedAt','scheduledPublishAt','sourceHeldPublishAt']) THEN RETURN NEW; END IF;
    UPDATE public.output_knowledge_reviews SET active=false,withdrawn_at=clock_timestamp()
      WHERE user_id=OLD.user_id AND asset_id=OLD.entity_id AND active;
  ELSIF OLD.collection='projects' THEN
    IF (NEW.data - 'updatedAt') IS NOT DISTINCT FROM (OLD.data - 'updatedAt') THEN RETURN NEW; END IF;
    UPDATE public.output_knowledge_reviews SET active=false,withdrawn_at=clock_timestamp()
      WHERE user_id=OLD.user_id AND project_id=OLD.entity_id AND active;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invalidate_output_knowledge_review AFTER UPDATE ON public.workspace_entities
FOR EACH ROW EXECUTE FUNCTION public.invalidate_output_knowledge_review();
REVOKE ALL ON FUNCTION public.invalidate_output_knowledge_review() FROM PUBLIC,anon,authenticated,service_role;

-- Evidence changes withdraw existing reviews immediately as well as changing
-- the context hash. This also prevents a stale read followed by a newer history
-- read from treating changed knowledge as an active old review.
CREATE FUNCTION public.invalidate_knowledge_review_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; project text; output_asset text;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' THEN owner_id:=OLD.user_id; project:=OLD.project_id;
  ELSE owner_id:=NEW.user_id; project:=NEW.project_id; END IF;
  IF TG_TABLE_NAME='project_output_source_dependencies' THEN
    IF TG_OP='DELETE' THEN output_asset:=OLD.asset_id; ELSE output_asset:=NEW.asset_id; END IF;
  END IF;
  UPDATE public.output_knowledge_reviews SET active=false,withdrawn_at=clock_timestamp()
    WHERE user_id=owner_id AND project_id=project AND active AND (output_asset IS NULL OR asset_id=output_asset);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invalidate_knowledge_review_evidence AFTER INSERT OR UPDATE OR DELETE ON public.project_knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.invalidate_knowledge_review_evidence();
CREATE TRIGGER invalidate_knowledge_review_evidence AFTER INSERT OR UPDATE OR DELETE ON public.project_knowledge_records
FOR EACH ROW EXECUTE FUNCTION public.invalidate_knowledge_review_evidence();
CREATE TRIGGER invalidate_knowledge_review_evidence AFTER INSERT OR UPDATE OR DELETE ON public.project_output_source_dependencies
FOR EACH ROW EXECUTE FUNCTION public.invalidate_knowledge_review_evidence();
REVOKE ALL ON FUNCTION public.invalidate_knowledge_review_evidence() FROM PUBLIC,anon,authenticated,service_role;
