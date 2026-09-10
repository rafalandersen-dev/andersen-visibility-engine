-- P2 bounded source observations. Additive; apply after project knowledge.
-- No provider calls, acceptance, generation, or publication from this migration.
CREATE TABLE public.project_source_refresh (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  source_id uuid NOT NULL,
  source_revision integer NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  last_attempt timestamptz NOT NULL,
  last_status text NOT NULL CHECK(last_status IN ('running','ok','unknown')),
  lease_token uuid,
  lease_until timestamptz,
  snapshot jsonb CHECK(snapshot IS NULL OR (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=300000)),
  history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array' AND jsonb_array_length(history)<=5 AND octet_length(history::text)<=1600000),
  review_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(review_history)='array' AND jsonb_array_length(review_history)<=20 AND octet_length(review_history::text)<=20000),
  accepted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(accepted)='object' AND octet_length(accepted::text)<=18000),
  PRIMARY KEY(user_id,project_id,source_id),
  FOREIGN KEY(user_id,project_id,source_id) REFERENCES public.project_knowledge_sources(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.project_source_refresh ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_source_refresh FROM PUBLIC,anon,authenticated,service_role;
-- Reads also go through the function, so revoked/replaced sources cannot leak
-- stale usable observations through a direct service-role table read.

CREATE FUNCTION public.read_project_source_refresh(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sourceId',r.source_id,'sourceRevision',r.source_revision,'revision',r.revision,
    'lastAttempt',r.last_attempt,'status',CASE WHEN r.last_status='running' AND r.lease_until<=clock_timestamp() THEN 'unknown' ELSE r.last_status END,
    'snapshot',r.snapshot,'accepted',r.accepted,'history',r.history,'reviewHistory',r.review_history
  ) ORDER BY r.source_id),'[]'::jsonb) INTO result
  FROM public.project_source_refresh r JOIN public.project_knowledge_sources s
    ON s.user_id=r.user_id AND s.project_id=r.project_id AND s.id=r.source_id
  WHERE r.user_id=p_user AND r.project_id=p_project AND s.revision=r.source_revision
    AND s.payload->>'status'='active' AND s.payload->>'kind'='website';
  RETURN result;
END;
$$;

CREATE FUNCTION public.begin_project_source_refresh(p_user uuid,p_project text,p_source uuid,p_expected integer,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.project_knowledge_sources%ROWTYPE; current public.project_source_refresh%ROWTYPE; instant timestamptz:=clock_timestamp();
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_source IS NULL OR p_expected IS NULL OR p_expected<1 OR p_token IS NULL THEN RAISE EXCEPTION 'invalid_source_refresh' USING ERRCODE='22023'; END IF;
  -- The account lock above already serializes ordinary workspace requests.
  -- Lock the existing source as well before reading/upserting its refresh row.
  SELECT * INTO source FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=p_source FOR UPDATE;
  instant:=clock_timestamp();
  IF source.id IS NULL OR source.revision<>p_expected OR source.payload->>'kind'<>'website' OR source.payload->>'status'<>'active' THEN
    RAISE EXCEPTION 'knowledge_source_changed' USING ERRCODE='40001';
  END IF;
  SELECT * INTO current FROM public.project_source_refresh WHERE user_id=p_user AND project_id=p_project AND source_id=p_source;
  IF current.source_id IS NOT NULL AND (current.lease_until>instant OR current.last_attempt>instant-interval '10 minutes') THEN
    RETURN jsonb_build_object('acquired',false);
  END IF;
  IF current.source_id IS NULL AND (SELECT count(*) FROM public.project_source_refresh WHERE user_id=p_user AND project_id=p_project)>=10 THEN
    RAISE EXCEPTION 'source_refresh_capacity' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.project_source_refresh(user_id,project_id,source_id,source_revision,last_attempt,last_status,lease_token,lease_until)
    VALUES(p_user,p_project,p_source,p_expected,instant,'running',p_token,instant+interval '2 minutes')
  ON CONFLICT(user_id,project_id,source_id) DO UPDATE SET
    source_revision=p_expected,last_attempt=instant,last_status='running',lease_token=p_token,lease_until=instant+interval '2 minutes',
    snapshot=CASE WHEN project_source_refresh.source_revision=p_expected THEN project_source_refresh.snapshot ELSE NULL END,
    review_history=CASE WHEN project_source_refresh.source_revision=p_expected THEN project_source_refresh.review_history ELSE '[]'::jsonb END,
    history=CASE WHEN project_source_refresh.source_revision=p_expected THEN project_source_refresh.history ELSE '[]'::jsonb END,
    accepted=CASE WHEN project_source_refresh.source_revision=p_expected THEN project_source_refresh.accepted ELSE '{}'::jsonb END;
  RETURN jsonb_build_object('acquired',true,'revision',coalesce(current.revision,0),'source',source.payload);
END;
$$;

CREATE FUNCTION public.finish_project_source_refresh(p_user uuid,p_project text,p_source uuid,p_token uuid,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.project_source_refresh%ROWTYPE; source public.project_knowledge_sources%ROWTYPE; entry jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  SELECT * INTO current FROM public.project_source_refresh WHERE user_id=p_user AND project_id=p_project AND source_id=p_source;
  SELECT * INTO source FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=p_source;
  IF current.source_id IS NULL OR p_token IS NULL OR current.lease_token IS DISTINCT FROM p_token OR current.last_status<>'running'
    OR current.lease_until<=clock_timestamp() OR source.revision IS DISTINCT FROM current.source_revision OR source.payload->>'status' IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'source_refresh_changed' USING ERRCODE='40001';
  END IF;
  IF p_snapshot IS NULL THEN
    UPDATE public.project_source_refresh SET last_status='unknown',lease_token=NULL,lease_until=NULL
      WHERE user_id=p_user AND project_id=p_project AND source_id=p_source;
    RETURN jsonb_build_object('status','unknown','revision',current.revision);
  END IF;
  IF jsonb_typeof(p_snapshot)<>'object' OR octet_length(p_snapshot::text)>300000
    OR p_snapshot->>'ownerId' IS DISTINCT FROM p_user::text OR p_snapshot->>'projectId' IS DISTINCT FROM p_project
    OR p_snapshot->>'sourceId' IS DISTINCT FROM p_source::text OR p_snapshot->>'revision' IS DISTINCT FROM (current.revision+1)::text
    OR coalesce(p_snapshot->>'coverage','') NOT IN ('public-page','catalog-partial','catalog-complete')
    OR jsonb_typeof(p_snapshot->'facts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'facts')>100
    OR (p_snapshot->>'observedAt') IS NULL OR (p_snapshot->>'observedAt')::timestamptz<current.last_attempt OR (p_snapshot->>'observedAt')::timestamptz>clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
  END IF;
  IF (p_snapshot ? 'conflicts' AND (jsonb_typeof(p_snapshot->'conflicts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'conflicts')>100))
    OR (p_snapshot ? 'warnings' AND (jsonb_typeof(p_snapshot->'warnings') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'warnings')>9)) THEN
    RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_snapshot->'conflicts','[]'::jsonb)) LOOP
    IF jsonb_typeof(entry)<>'string' OR entry#>>'{}' !~ '^[a-f0-9]{64}$' OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_snapshot->'facts') f WHERE f->>'key'=entry#>>'{}'
    ) THEN RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_snapshot->'warnings','[]'::jsonb)) LOOP
    IF jsonb_typeof(entry)<>'string' OR entry#>>'{}' NOT IN ('fact_limit','limited_readable_text','structured_data_limit','invalid_structured_data','missing_product_identity','unsupported_offer','unsupported_market','offer_expiry_unknown','unresolved_price') THEN
      RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'facts'))<>(SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_snapshot->'facts')) THEN
    RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_snapshot->'facts') LOOP
    IF jsonb_typeof(entry)<>'object' OR coalesce(entry->>'key','')='' OR length(entry->>'key')>200
      OR coalesce(entry->>'fingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(entry->>'value','')='' OR length(entry->>'value')>2000 THEN
      RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
    END IF;
  END LOOP;
  UPDATE public.project_source_refresh SET
    history=coalesce((SELECT jsonb_agg(item ORDER BY ordinal) FROM (
      SELECT value AS item, ordinality AS ordinal FROM jsonb_array_elements(
        CASE WHEN current.snapshot IS NULL THEN current.history ELSE jsonb_build_array(current.snapshot)||current.history END
      ) WITH ORDINALITY WHERE ordinality<=5
    ) recent),'[]'::jsonb),
    snapshot=p_snapshot,revision=current.revision+1,last_status='ok',lease_token=NULL,lease_until=NULL,
    accepted=coalesce((SELECT jsonb_object_agg(a.key,a.value) FROM jsonb_each(current.accepted) a
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'facts') f WHERE f->>'key'=a.key AND f->>'fingerprint'=a.value#>>'{}')),'{}'::jsonb)
    WHERE user_id=p_user AND project_id=p_project AND source_id=p_source;
  RETURN jsonb_build_object('status','ok','revision',current.revision+1);
END;
$$;

CREATE FUNCTION public.review_project_source_fact(p_user uuid,p_project text,p_source uuid,p_expected integer,p_key text,p_fingerprint text,p_accept boolean,p_previous boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.project_source_refresh%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  SELECT r.* INTO current FROM public.project_source_refresh r JOIN public.project_knowledge_sources s
    ON s.user_id=r.user_id AND s.project_id=r.project_id AND s.id=r.source_id
    WHERE r.user_id=p_user AND r.project_id=p_project AND r.source_id=p_source AND s.revision=r.source_revision AND s.payload->>'status'='active';
  IF current.source_id IS NULL OR p_expected IS NULL OR current.revision<>p_expected OR current.last_status<>'ok'
    OR p_accept IS NULL OR p_previous IS NULL OR p_key IS NULL OR p_fingerprint IS NULL
    OR coalesce(current.accepted->>p_key=p_fingerprint,false) IS DISTINCT FROM p_previous OR NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(current.snapshot->'facts') f WHERE f->>'key'=p_key AND f->>'fingerprint'=p_fingerprint
    ) THEN RAISE EXCEPTION 'source_refresh_changed' USING ERRCODE='40001'; END IF;
  IF p_accept=p_previous THEN RETURN true; END IF;
  UPDATE public.project_source_refresh SET
    review_history=(SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(
      jsonb_build_array(jsonb_build_object('revision',p_expected,'key',p_key,'fingerprint',p_fingerprint,'accepted',p_accept,'reviewedAt',clock_timestamp()))||current.review_history
    ) WITH ORDINALITY WHERE ordinality<=20),
    accepted=CASE WHEN p_accept THEN accepted||jsonb_build_object(p_key,p_fingerprint) ELSE accepted-p_key END
    WHERE user_id=p_user AND project_id=p_project AND source_id=p_source;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.read_project_source_refresh(uuid,text),public.begin_project_source_refresh(uuid,text,uuid,integer,uuid),public.finish_project_source_refresh(uuid,text,uuid,uuid,jsonb),public.review_project_source_fact(uuid,text,uuid,integer,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_source_refresh(uuid,text),public.begin_project_source_refresh(uuid,text,uuid,integer,uuid),public.finish_project_source_refresh(uuid,text,uuid,uuid,jsonb),public.review_project_source_fact(uuid,text,uuid,integer,text,text,boolean,boolean) TO service_role;

-- Exact generated input dependencies survive client saves and archive discard.
-- This contains identities/hashes only, never source values or credentials.
CREATE TABLE public.project_output_source_dependencies (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  output_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('content','image')),
  source_forgotten boolean NOT NULL DEFAULT false,
  dependencies jsonb NOT NULL CHECK(jsonb_typeof(dependencies)='array' AND jsonb_array_length(dependencies)<=100 AND octet_length(dependencies::text)<=100000),
  PRIMARY KEY(user_id,project_id,asset_id,kind,output_id)
);
ALTER TABLE public.project_output_source_dependencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_output_source_dependencies FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.retain_output_source_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deps jsonb:=NEW.payload->'output'->'sourceDependencies'; entry jsonb; sanitized jsonb; forgotten boolean:=false;
BEGIN
  IF deps IS NULL OR deps='[]'::jsonb THEN RETURN NEW; END IF;
  IF jsonb_typeof(deps)<>'array' OR jsonb_array_length(deps)>100 OR octet_length(deps::text)>100000
    OR NEW.payload->>'kind' NOT IN ('content','image')
    OR coalesce(NEW.payload->>'projectId','') !~ '^[A-Za-z0-9_-]{1,64}$'
    OR coalesce(NEW.payload->>'assetId','') !~ '^[A-Za-z0-9_-]{1,64}$'
    OR (NEW.payload->>'kind'='image' AND coalesce(NEW.payload->>'imageId','') !~ '^[A-Za-z0-9_-]{1,64}$') THEN
    RAISE EXCEPTION 'invalid_output_source_dependencies' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(NEW.user_id,NEW.payload->>'projectId',true);
  FOR entry IN SELECT value FROM jsonb_array_elements(deps) LOOP
    IF entry->>'ownerId' IS DISTINCT FROM NEW.user_id::text OR entry->>'projectId' IS DISTINCT FROM NEW.payload->>'projectId'
      OR coalesce(entry->>'sourceId','') !~ '^[a-f0-9-]{36}$' OR coalesce(entry->>'fingerprint','') !~ '^[a-f0-9]{64}$'
      OR coalesce(entry->>'key','')='' OR length(entry->>'key')>200 THEN
      RAISE EXCEPTION 'invalid_output_source_dependencies' USING ERRCODE='22023';
    END IF;
  END LOOP;
  -- A generation may finish after the source was forgotten. Never reintroduce
  -- its identifiers from that late archive; keep the same minimal output hold.
  SELECT coalesce(jsonb_agg(d),'[]'::jsonb) INTO sanitized FROM jsonb_array_elements(deps) d
    WHERE NOT EXISTS(SELECT 1 FROM public.project_knowledge_tombstones t WHERE t.user_id=NEW.user_id AND t.project_id=NEW.payload->>'projectId' AND t.kind='source' AND t.id::text=d->>'sourceId');
  forgotten:=jsonb_array_length(sanitized)<>jsonb_array_length(deps);
  deps:=sanitized;
  IF NOT EXISTS(SELECT 1 FROM public.project_output_source_dependencies WHERE user_id=NEW.user_id AND project_id=NEW.payload->>'projectId' AND asset_id=NEW.payload->>'assetId' AND kind=NEW.payload->>'kind' AND output_id=CASE WHEN NEW.payload->>'kind'='image' THEN NEW.payload->>'imageId' ELSE NEW.payload->>'assetId' END)
    AND (SELECT count(*) FROM public.project_output_source_dependencies WHERE user_id=NEW.user_id AND project_id=NEW.payload->>'projectId')>=1000 THEN
    RAISE EXCEPTION 'output_source_capacity' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.project_output_source_dependencies(user_id,project_id,asset_id,output_id,kind,dependencies,source_forgotten)
  VALUES(NEW.user_id,NEW.payload->>'projectId',NEW.payload->>'assetId',CASE WHEN NEW.payload->>'kind'='image' THEN NEW.payload->>'imageId' ELSE NEW.payload->>'assetId' END,NEW.payload->>'kind',deps,forgotten)
  ON CONFLICT(user_id,project_id,asset_id,kind,output_id) DO UPDATE SET dependencies=EXCLUDED.dependencies,source_forgotten=project_output_source_dependencies.source_forgotten OR EXCLUDED.source_forgotten;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_output_source_dependencies AFTER INSERT ON public.ai_generation_results
FOR EACH ROW EXECUTE FUNCTION public.retain_output_source_dependencies();
REVOKE ALL ON FUNCTION public.retain_output_source_dependencies() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_output_source_dependencies(p_user uuid,p_project text,p_asset text DEFAULT NULL,p_assets text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_assets IS NOT NULL AND (cardinality(p_assets)>100 OR array_position(p_assets,NULL) IS NOT NULL) THEN RAISE EXCEPTION 'invalid_asset_filter'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('assetId',asset_id,'outputId',output_id,'kind',kind,'dependencies',dependencies,'sourceForgotten',source_forgotten)) FROM public.project_output_source_dependencies WHERE user_id=p_user AND project_id=p_project AND (p_asset IS NULL OR asset_id=p_asset) AND (p_assets IS NULL OR asset_id=ANY(p_assets))),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.read_output_source_dependencies(uuid,text,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_output_source_dependencies(uuid,text,text,text[]) TO service_role;

CREATE FUNCTION public.purge_output_source_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.collection='projects' THEN
    DELETE FROM public.project_output_source_dependencies WHERE user_id=OLD.user_id AND project_id=OLD.entity_id;
  ELSIF OLD.collection='content' THEN
    DELETE FROM public.project_output_source_dependencies WHERE user_id=OLD.user_id AND asset_id=OLD.entity_id;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER purge_output_source_dependencies AFTER DELETE ON public.workspace_entities
FOR EACH ROW EXECUTE FUNCTION public.purge_output_source_dependencies();
REVOKE ALL ON FUNCTION public.purge_output_source_dependencies() FROM PUBLIC,anon,authenticated,service_role;

-- Forget private source identities/hashes while retaining only output-level
-- evidence-loss markers. These markers cannot authorize publication or be
-- erased by a browser save; deleting the output/project removes them normally.
CREATE FUNCTION public.forget_output_source_dependencies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.project_output_source_dependencies r SET
    dependencies=coalesce((SELECT jsonb_agg(d) FROM jsonb_array_elements(r.dependencies) d WHERE d->>'sourceId'<>OLD.id::text),'[]'::jsonb),
    source_forgotten=true
    WHERE r.user_id=OLD.user_id AND r.project_id=OLD.project_id AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(r.dependencies) d WHERE d->>'sourceId'=OLD.id::text
    );
  RETURN OLD;
END;
$$;
CREATE TRIGGER forget_output_source_dependencies AFTER DELETE ON public.project_knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.forget_output_source_dependencies();
REVOKE ALL ON FUNCTION public.forget_output_source_dependencies() FROM PUBLIC,anon,authenticated,service_role;
