-- Knowledge provenance shares the existing private output registry.
-- No facts, prompts, source documents, generation, approvals or schedule changes.
ALTER TABLE public.project_output_source_dependencies
  ADD COLUMN knowledge_references jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK(jsonb_typeof(knowledge_references)='array' AND jsonb_array_length(knowledge_references)<=300 AND octet_length(knowledge_references::text)<=100000),
  ADD COLUMN knowledge_forgotten boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.retain_output_knowledge_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE refs jsonb:=NEW.payload->'output'->'knowledgeReferences'; ref jsonb; sanitized jsonb; forgotten boolean;
BEGIN
  IF refs IS NULL OR refs='[]'::jsonb THEN RETURN NEW; END IF;
  IF jsonb_typeof(refs)<>'array' OR jsonb_array_length(refs)>300 OR octet_length(refs::text)>100000
    OR coalesce(NEW.payload->>'kind','') NOT IN ('content','image')
    OR coalesce(NEW.payload->>'assetId','') !~ '^[A-Za-z0-9_-]{1,64}$'
    OR (NEW.payload->>'kind'='image' AND coalesce(NEW.payload->>'imageId','') !~ '^[A-Za-z0-9_-]{1,64}$') THEN
    RAISE EXCEPTION 'invalid_output_knowledge_dependencies';
  END IF;
  PERFORM public.assert_knowledge_project(NEW.user_id,NEW.payload->>'projectId',true);
  FOR ref IN SELECT value FROM jsonb_array_elements(refs) LOOP
    IF jsonb_typeof(ref)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(ref))<>5
      OR coalesce(ref->>'recordId','') !~ '^[a-f0-9-]{36}$'
      OR coalesce(ref->>'sourceId','') !~ '^[a-f0-9-]{36}$'
      OR coalesce(ref->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$'
      OR coalesce(ref->>'recordRevision','') !~ '^[1-9][0-9]{0,9}$'
      OR coalesce(ref->>'sourceRevision','') !~ '^[1-9][0-9]{0,9}$' THEN
      RAISE EXCEPTION 'invalid_output_knowledge_dependencies';
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO sanitized FROM jsonb_array_elements(refs) r
    WHERE NOT EXISTS(SELECT 1 FROM public.project_knowledge_tombstones t WHERE t.user_id=NEW.user_id AND t.project_id=NEW.payload->>'projectId'
      AND ((t.kind='source' AND t.id::text=r->>'sourceId') OR (t.kind='record' AND t.id::text=r->>'recordId')));
  forgotten:=jsonb_array_length(sanitized)<>jsonb_array_length(refs);
  IF NOT EXISTS(SELECT 1 FROM public.project_output_source_dependencies WHERE user_id=NEW.user_id AND project_id=NEW.payload->>'projectId' AND asset_id=NEW.payload->>'assetId' AND kind=NEW.payload->>'kind' AND output_id=CASE WHEN NEW.payload->>'kind'='image' THEN NEW.payload->>'imageId' ELSE NEW.payload->>'assetId' END)
    AND (SELECT count(*) FROM public.project_output_source_dependencies WHERE user_id=NEW.user_id AND project_id=NEW.payload->>'projectId')>=1000 THEN
    RAISE EXCEPTION 'output_source_capacity';
  END IF;
  INSERT INTO public.project_output_source_dependencies(user_id,project_id,asset_id,output_id,kind,dependencies,knowledge_references,knowledge_forgotten)
    VALUES(NEW.user_id,NEW.payload->>'projectId',NEW.payload->>'assetId',CASE WHEN NEW.payload->>'kind'='image' THEN NEW.payload->>'imageId' ELSE NEW.payload->>'assetId' END,NEW.payload->>'kind','[]',sanitized,forgotten)
    ON CONFLICT(user_id,project_id,asset_id,kind,output_id) DO UPDATE SET
      knowledge_references=EXCLUDED.knowledge_references,
      knowledge_forgotten=project_output_source_dependencies.knowledge_forgotten OR EXCLUDED.knowledge_forgotten;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_output_knowledge_dependencies AFTER INSERT ON public.ai_generation_results
FOR EACH ROW EXECUTE FUNCTION public.retain_output_knowledge_dependencies();
REVOKE ALL ON FUNCTION public.retain_output_knowledge_dependencies() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_output_knowledge_dependencies(p_user uuid,p_project text,p_assets text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_assets IS NULL OR cardinality(p_assets)>100 OR array_position(p_assets,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_asset_filter'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('assetId',asset_id,'outputId',output_id,'kind',kind,'references',knowledge_references,'forgotten',knowledge_forgotten))
    FROM public.project_output_source_dependencies WHERE user_id=p_user AND project_id=p_project AND asset_id=ANY(p_assets)
      AND (knowledge_references<>'[]'::jsonb OR knowledge_forgotten)),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.read_output_knowledge_dependencies(uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_output_knowledge_dependencies(uuid,text,text[]) TO service_role;

CREATE FUNCTION public.forget_output_knowledge_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref_key text:=CASE WHEN TG_TABLE_NAME='project_knowledge_sources' THEN 'sourceId' ELSE 'recordId' END;
BEGIN
  UPDATE public.project_output_source_dependencies r SET
    knowledge_references=coalesce((SELECT jsonb_agg(d) FROM jsonb_array_elements(r.knowledge_references) d WHERE d->>ref_key<>OLD.id::text),'[]'::jsonb),knowledge_forgotten=true
    WHERE r.user_id=OLD.user_id AND r.project_id=OLD.project_id
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.knowledge_references) d WHERE d->>ref_key=OLD.id::text);
  RETURN OLD;
END;
$$;
CREATE TRIGGER forget_output_knowledge_dependencies AFTER DELETE ON public.project_knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.forget_output_knowledge_dependencies();
CREATE TRIGGER forget_output_knowledge_dependencies AFTER DELETE ON public.project_knowledge_records
FOR EACH ROW EXECUTE FUNCTION public.forget_output_knowledge_dependencies();
REVOKE ALL ON FUNCTION public.forget_output_knowledge_dependencies() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_image_source_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE image jsonb; refs jsonb; knowledge_forgotten boolean; deps jsonb; forgotten boolean; matches integer; removed_count integer:=0; project text:=NEW.data->>'projectId';
BEGIN
  IF NEW.collection<>'content' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    SELECT count(*) INTO removed_count FROM public.project_output_source_dependencies r WHERE r.user_id=OLD.user_id AND r.project_id=project AND r.asset_id=OLD.entity_id AND r.kind='image'
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.data->'images')='array' THEN OLD.data->'images' ELSE '[]'::jsonb END) old_image WHERE old_image->>'id'=r.output_id)
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'images')='array' THEN NEW.data->'images' ELSE '[]'::jsonb END) kept WHERE kept->>'id'=r.output_id);
  END IF;
  FOR image IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'images')='array' THEN NEW.data->'images' ELSE '[]'::jsonb END) LOOP
    IF coalesce(image->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' OR coalesce(image->>'url','')='' THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.project_output_source_dependencies WHERE user_id=NEW.user_id AND project_id=project AND asset_id=NEW.entity_id AND kind='image' AND output_id=image->>'id') THEN CONTINUE; END IF;
    SELECT coalesce(jsonb_agg(DISTINCT dependency) FILTER(WHERE dependency IS NOT NULL),'[]'::jsonb),coalesce(bool_or(r.source_forgotten),false),count(DISTINCT r.output_id),coalesce(jsonb_agg(DISTINCT knowledge_ref) FILTER(WHERE knowledge_ref IS NOT NULL),'[]'::jsonb),coalesce(bool_or(r.knowledge_forgotten),false)
      INTO deps,forgotten,matches,refs,knowledge_forgotten
      FROM public.workspace_entities e
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.data->'images')='array' THEN e.data->'images' ELSE '[]'::jsonb END) original
      JOIN public.project_output_source_dependencies r ON r.user_id=e.user_id AND r.project_id=project AND r.asset_id=e.entity_id AND r.kind='image' AND r.output_id=original->>'id'
      LEFT JOIN LATERAL (
        SELECT d AS dependency, NULL::jsonb AS knowledge_ref FROM jsonb_array_elements(r.dependencies) d
        UNION ALL
        SELECT NULL::jsonb, k FROM jsonb_array_elements(r.knowledge_references) k
      ) evidence ON true
      WHERE e.user_id=NEW.user_id AND e.collection='content' AND e.data->>'projectId'=project
        AND original->>'status'='accepted' AND original->>'url'=image->>'url';
    IF matches=0 THEN CONTINUE; END IF;
    IF jsonb_array_length(refs)>300 OR octet_length(refs::text)>100000 OR jsonb_array_length(deps)>100 OR octet_length(deps::text)>100000 THEN RAISE EXCEPTION 'output_source_capacity'; END IF;
    IF (SELECT count(*) FROM public.project_output_source_dependencies WHERE user_id=NEW.user_id AND project_id=project)-removed_count>=1000 THEN RAISE EXCEPTION 'output_source_capacity'; END IF;
    INSERT INTO public.project_output_source_dependencies(user_id,project_id,asset_id,output_id,kind,dependencies,source_forgotten,knowledge_references,knowledge_forgotten)
      VALUES(NEW.user_id,project,NEW.entity_id,image->>'id','image',deps,forgotten,refs,knowledge_forgotten);
  END LOOP;
  IF TG_OP='UPDATE' THEN
    DELETE FROM public.project_output_source_dependencies r WHERE r.user_id=OLD.user_id AND r.asset_id=OLD.entity_id AND r.kind='image'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.data->'images')='array' THEN OLD.data->'images' ELSE '[]'::jsonb END) old_image WHERE old_image->>'id'=r.output_id)
      AND (OLD.data->>'projectId' IS DISTINCT FROM project OR NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.data->'images')='array' THEN NEW.data->'images' ELSE '[]'::jsonb END) kept WHERE kept->>'id'=r.output_id
      ));
  END IF;
  RETURN NEW;
END;
$$;

-- This rollout is deliberately refused when old archives contain knowledge.
-- A populated installation needs a separately reviewed provenance backfill.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.ai_generation_results WHERE payload->'output'->'knowledgeReferences' IS NOT NULL AND payload->'output'->'knowledgeReferences'<>'[]'::jsonb) THEN
    RAISE EXCEPTION 'knowledge_provenance_backfill_required';
  END IF;
END $$;

-- Discarded unattached results must not consume registry capacity. Retain only
-- their minimal output identity on the existing archive tombstone, so a late
-- browser save cannot reattach that output after its authority was removed.
ALTER TABLE public.ai_generation_results ADD COLUMN discarded_output_identity jsonb;
CREATE INDEX ai_generation_discarded_output_project ON public.ai_generation_results
  (user_id,(discarded_output_identity->>'projectId')) WHERE discarded_output_identity IS NOT NULL;
CREATE FUNCTION public.discard_orphan_output_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb:=OLD.payload; target_output_id text;
BEGIN
  IF OLD.payload IS NULL OR NEW.payload IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.workspace_meta WHERE user_id=OLD.user_id FOR UPDATE;
  target_output_id:=CASE WHEN target->>'kind'='image' THEN target->>'imageId' ELSE target->>'assetId' END;
  IF EXISTS(SELECT 1 FROM public.workspace_entities e WHERE e.user_id=OLD.user_id AND e.collection='content'
    AND e.entity_id=target->>'assetId' AND e.data->>'projectId'=target->>'projectId'
    AND (target->>'kind'='content' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(e.data->'images','[]'::jsonb)) im WHERE im->>'id'=target_output_id))) THEN
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_output_source_dependencies r WHERE r.user_id=OLD.user_id AND r.project_id=target->>'projectId' AND r.asset_id=target->>'assetId' AND r.output_id=target_output_id AND r.kind=target->>'kind') THEN
    NEW.discarded_output_identity:=jsonb_build_object('projectId',target->>'projectId','assetId',target->>'assetId','outputId',target_output_id,'kind',target->>'kind','path',CASE WHEN target->>'kind'='image' THEN target->'output'->>'path' ELSE NULL END);
    DELETE FROM public.project_output_source_dependencies r WHERE r.user_id=OLD.user_id AND r.project_id=target->>'projectId' AND r.asset_id=target->>'assetId' AND r.output_id=target_output_id AND r.kind=target->>'kind';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER discard_orphan_output_dependencies BEFORE UPDATE ON public.ai_generation_results
FOR EACH ROW EXECUTE FUNCTION public.discard_orphan_output_dependencies();
REVOKE ALL ON FUNCTION public.discard_orphan_output_dependencies() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reject_discarded_output_attachment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE image jsonb; prior jsonb:='[]'::jsonb;
BEGIN
  IF NEW.collection<>'content' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN prior:=coalesce(OLD.data->'images','[]'::jsonb); END IF;
  IF EXISTS(SELECT 1 FROM public.ai_generation_results r WHERE r.user_id=NEW.user_id
    AND r.discarded_output_identity->>'projectId'=NEW.data->>'projectId'
    AND r.discarded_output_identity->>'kind'='content' AND r.discarded_output_identity->>'assetId'=NEW.entity_id) THEN
    RAISE EXCEPTION 'discarded_output_cannot_be_attached';
  END IF;
  FOR image IN SELECT value FROM jsonb_array_elements(coalesce(NEW.data->'images','[]'::jsonb)) LOOP
    IF TG_OP='UPDATE' AND OLD.data->>'projectId'=NEW.data->>'projectId' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(prior) im WHERE im->>'id'=image->>'id'
        AND im->>'storagePath' IS NOT DISTINCT FROM image->>'storagePath' AND im->>'url' IS NOT DISTINCT FROM image->>'url') THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.ai_generation_results r WHERE r.user_id=NEW.user_id
      AND r.discarded_output_identity->>'projectId'=NEW.data->>'projectId' AND r.discarded_output_identity->>'kind'='image'
      AND ((r.discarded_output_identity->>'assetId'=NEW.entity_id AND r.discarded_output_identity->>'outputId'=image->>'id')
        OR (r.discarded_output_identity->>'path' IS NOT NULL AND (r.discarded_output_identity->>'path'=image->>'storagePath'
          OR right(image->>'url',length('/article-assets-public/'||(r.discarded_output_identity->>'path')))='/article-assets-public/'||(r.discarded_output_identity->>'path'))))) THEN
      RAISE EXCEPTION 'discarded_output_cannot_be_attached';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_discarded_output_attachment BEFORE INSERT OR UPDATE ON public.workspace_entities
FOR EACH ROW EXECUTE FUNCTION public.reject_discarded_output_attachment();
REVOKE ALL ON FUNCTION public.reject_discarded_output_attachment() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.purge_discarded_output_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.collection='projects' THEN
    UPDATE public.ai_generation_results SET discarded_output_identity=NULL WHERE user_id=OLD.user_id AND discarded_output_identity->>'projectId'=OLD.entity_id;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER purge_discarded_output_identity AFTER DELETE ON public.workspace_entities
FOR EACH ROW EXECUTE FUNCTION public.purge_discarded_output_identity();
REVOKE ALL ON FUNCTION public.purge_discarded_output_identity() FROM PUBLIC,anon,authenticated,service_role;
