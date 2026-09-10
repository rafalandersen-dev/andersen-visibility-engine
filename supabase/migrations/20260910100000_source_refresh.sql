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
    'snapshot',r.snapshot,'accepted',r.accepted
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
  SELECT * INTO source FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=p_source;
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
  IF (SELECT count(*) FROM jsonb_array_elements(p_snapshot->'facts'))<>(SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_snapshot->'facts')) THEN
    RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_snapshot->'facts') LOOP
    IF jsonb_typeof(entry)<>'object' OR coalesce(entry->>'key','')='' OR length(entry->>'key')>200
      OR coalesce(entry->>'fingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(entry->>'value','')='' OR length(entry->>'value')>2000 THEN
      RAISE EXCEPTION 'invalid_source_snapshot' USING ERRCODE='22023';
    END IF;
  END LOOP;
  UPDATE public.project_source_refresh SET snapshot=p_snapshot,revision=current.revision+1,last_status='ok',lease_token=NULL,lease_until=NULL,
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
  UPDATE public.project_source_refresh SET accepted=CASE WHEN p_accept THEN accepted||jsonb_build_object(p_key,p_fingerprint) ELSE accepted-p_key END
    WHERE user_id=p_user AND project_id=p_project AND source_id=p_source;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.read_project_source_refresh(uuid,text),public.begin_project_source_refresh(uuid,text,uuid,integer,uuid),public.finish_project_source_refresh(uuid,text,uuid,uuid,jsonb),public.review_project_source_fact(uuid,text,uuid,integer,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_source_refresh(uuid,text),public.begin_project_source_refresh(uuid,text,uuid,integer,uuid),public.finish_project_source_refresh(uuid,text,uuid,uuid,jsonb),public.review_project_source_fact(uuid,text,uuid,integer,text,text,boolean,boolean) TO service_role;
