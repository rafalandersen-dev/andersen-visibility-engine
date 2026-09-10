-- P5 immutable publication/observation provenance. No historical success is inferred.
CREATE TABLE public.publication_evidence (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  asset_id text NOT NULL, version_hash text NOT NULL CHECK(version_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=2000000),
  action_snapshot jsonb, stage_references jsonb NOT NULL DEFAULT '[]',
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text NOT NULL DEFAULT 'started' CHECK(outcome IN ('started','published','rejected','unknown')),
  outcome_data jsonb, finished_at timestamptz,
  PRIMARY KEY(user_id,project_id,id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE TABLE public.publication_observations (
  user_id uuid NOT NULL, project_id text NOT NULL, publication_id uuid NOT NULL,
  import_id text NOT NULL, import_hash text NOT NULL,
  observation jsonb NOT NULL CHECK(jsonb_typeof(observation)='object' AND octet_length(observation::text)<=12000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,publication_id,import_id),
  FOREIGN KEY(user_id,project_id,publication_id) REFERENCES public.publication_evidence(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.publication_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_evidence,public.publication_observations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_publication_evidence(p_user uuid,p_project text,p_asset text,p_id uuid,p_hash text,p_snapshot jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE action jsonb; stages jsonb; existing public.publication_evidence%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_id IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_snapshot IS NULL
    OR jsonb_typeof(p_snapshot)<>'object' OR octet_length(p_snapshot::text)>2000000
    OR p_snapshot->>'assetId' IS DISTINCT FROM p_asset OR p_snapshot->>'projectId' IS DISTINCT FROM p_project
    OR p_snapshot->'version'->>'hash' IS DISTINCT FROM p_hash
    OR NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    OR NOT public.read_publication_approval(p_user,p_project,p_asset,p_hash) THEN RAISE EXCEPTION 'publication_evidence_not_approved'; END IF;
  SELECT * INTO existing FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  -- A reused attempt never authorizes another connector call, even if identical.
  IF FOUND THEN RAISE EXCEPTION 'publication_evidence_attempt_exists'; END IF;
  IF (SELECT count(*) FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project)>=1000 THEN RAISE EXCEPTION 'publication_evidence_capacity'; END IF;
  SELECT jsonb_build_object('id',entity_id,'title',data->>'title','businessValue',data->>'businessValue','source',data->>'source','capturedAt',clock_timestamp()) INTO action
    FROM public.workspace_entities WHERE user_id=p_user AND collection='opportunities' AND entity_id=p_snapshot->>'actionId' AND data->>'projectId'=p_project;
  SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',s.request_id,'outputId',s.output_id,'stage',s.stage,'inputHash',s.input_hash,'publishAt',s.publish_at,'state',s.state)),'[]'::jsonb) INTO stages
    FROM public.weekly_preparation_stages s WHERE s.user_id=p_user AND s.project_id=p_project
      AND s.publish_at IN (SELECT publish_at FROM public.weekly_preparation_stages WHERE user_id=p_user AND project_id=p_project AND stage='content' AND output_id::text=p_asset);
  INSERT INTO public.publication_evidence(user_id,project_id,id,asset_id,version_hash,snapshot,action_snapshot,stage_references)
    VALUES(p_user,p_project,p_id,p_asset,p_hash,p_snapshot,action,stages);
  RETURN true;
END; $$;

CREATE FUNCTION public.finish_publication_evidence(p_user uuid,p_project text,p_id uuid,p_outcome text,p_data jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.publication_evidence%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_outcome IS NULL OR p_outcome NOT IN ('published','rejected','unknown') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>8000 THEN RAISE EXCEPTION 'invalid_publication_outcome'; END IF;
  SELECT * INTO existing FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication_evidence_missing'; END IF;
  IF existing.outcome<>'started' THEN
    IF existing.outcome=p_outcome AND existing.outcome_data=p_data THEN RETURN true; END IF;
    RAISE EXCEPTION 'publication_outcome_immutable';
  END IF;
  UPDATE public.publication_evidence SET outcome=p_outcome,outcome_data=p_data,finished_at=clock_timestamp() WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

CREATE FUNCTION public.read_publication_evidence(p_user uuid,p_project text,p_page integer,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_page IS NULL OR p_page<0 OR p_page>19 THEN RAISE EXCEPTION 'invalid_evidence_page'; END IF;
  SELECT coalesce(jsonb_agg(item ORDER BY started_at DESC,id DESC),'[]'::jsonb) INTO items FROM (
    SELECT e.id,e.started_at,jsonb_build_object('id',e.id,'assetId',e.asset_id,'versionHash',e.version_hash,'title',e.snapshot->>'title','startedAt',e.started_at,'finishedAt',e.finished_at,'outcome',e.outcome,'outcomeData',e.outcome_data,'action',e.action_snapshot,'stages',e.stage_references,
      'otherPublicationAttemptsAt',(SELECT coalesce(jsonb_agg(coalesce(nullif(other.outcome_data->'publishedAt','null'::jsonb),to_jsonb(other.started_at))),'[]'::jsonb) FROM public.publication_evidence other WHERE other.user_id=e.user_id AND other.project_id=e.project_id AND other.id<>e.id AND other.outcome<>'rejected' AND (other.asset_id=e.asset_id OR (coalesce(e.outcome_data->>'liveUrl','')<>'' AND other.outcome_data->>'liveUrl'=e.outcome_data->>'liveUrl'))),
      'sourceCount',jsonb_array_length(coalesce(e.snapshot->'sources','[]')),
      'knowledgeCount',jsonb_array_length(coalesce(e.snapshot->'knowledgeReferences','[]')),
      'observations',(SELECT coalesce(jsonb_agg(jsonb_build_object('importId',o.import_id,'importHash',o.import_hash,'recordedAt',o.recorded_at,'data',o.observation) ORDER BY o.recorded_at),'[]'::jsonb) FROM public.publication_observations o WHERE o.user_id=e.user_id AND o.project_id=e.project_id AND o.publication_id=e.id)) AS item
    FROM public.publication_evidence e WHERE e.user_id=p_user AND e.project_id=p_project AND (p_id IS NULL OR e.id=p_id) ORDER BY e.started_at DESC,e.id DESC LIMIT 50 OFFSET p_page*50
  ) q;
  RETURN jsonb_build_object('items',items,'total',(SELECT count(*) FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project));
END; $$;
CREATE FUNCTION public.read_publication_snapshot(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN (SELECT snapshot FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id);
END; $$;

CREATE FUNCTION public.link_publication_observation(p_user uuid,p_project text,p_id uuid,p_import jsonb,p_observation jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_import_id text; digest text; old public.publication_observations%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  v_import_id:=p_import->>'id';
  IF v_import_id IS NULL OR length(v_import_id)>100 OR p_import IS NULL OR octet_length(p_import::text)>2000000
    OR p_observation IS NULL OR jsonb_typeof(p_observation)<>'object' OR octet_length(p_observation::text)>12000
    OR NOT EXISTS(SELECT 1 FROM public.workspace_entities e, LATERAL jsonb_array_elements(coalesce(e.data->'gscLite'->'imports','[]')) i WHERE e.user_id=p_user AND e.collection='projects' AND e.entity_id=p_project AND i=p_import)
    OR NOT EXISTS(SELECT 1 FROM public.publication_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id AND outcome='published')
    THEN RAISE EXCEPTION 'observation_source_changed'; END IF;
  digest:=encode(sha256(convert_to(p_import::text,'UTF8')),'hex');
  SELECT * INTO old FROM public.publication_observations WHERE user_id=p_user AND project_id=p_project AND publication_id=p_id AND publication_observations.import_id=v_import_id;
  IF FOUND THEN
    IF old.import_hash=digest AND old.observation=p_observation THEN RETURN true; END IF;
    RAISE EXCEPTION 'observation_immutable';
  END IF;
  IF (SELECT count(*) FROM public.publication_observations WHERE user_id=p_user AND project_id=p_project AND publication_id=p_id)>=20 THEN RAISE EXCEPTION 'observation_capacity'; END IF;
  INSERT INTO public.publication_observations(user_id,project_id,publication_id,import_id,import_hash,observation) VALUES(p_user,p_project,p_id,v_import_id,digest,p_observation);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.begin_publication_evidence(uuid,text,text,uuid,text,jsonb),public.finish_publication_evidence(uuid,text,uuid,text,jsonb),public.read_publication_evidence(uuid,text,integer,uuid),public.read_publication_snapshot(uuid,text,uuid),public.link_publication_observation(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_publication_evidence(uuid,text,text,uuid,text,jsonb),public.finish_publication_evidence(uuid,text,uuid,text,jsonb),public.read_publication_evidence(uuid,text,integer,uuid),public.read_publication_snapshot(uuid,text,uuid),public.link_publication_observation(uuid,text,uuid,jsonb,jsonb) TO service_role;

-- Reviewed fixed-brief comparisons are immutable project records, not live workflow updates.
CREATE TABLE public.workflow_evaluations (
  user_id uuid NOT NULL,project_id text NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  document_hash text NOT NULL,document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=300000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id),UNIQUE(user_id,project_id,document_hash),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.workflow_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_evaluations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.save_workflow_evaluation(p_user uuid,p_project text,p_document jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; result uuid;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>300000 OR p_document->'input'->>'projectId' IS DISTINCT FROM p_project THEN RAISE EXCEPTION 'invalid_workflow_evaluation'; END IF;
  digest:=encode(sha256(convert_to(p_document::text,'UTF8')),'hex');
  SELECT id INTO result FROM public.workflow_evaluations WHERE user_id=p_user AND project_id=p_project AND document_hash=digest;
  IF FOUND THEN RETURN result; END IF;
  IF (SELECT count(*) FROM public.workflow_evaluations WHERE user_id=p_user AND project_id=p_project)>=100 THEN RAISE EXCEPTION 'workflow_evaluation_capacity'; END IF;
  -- The account lock above serializes normal writers. Also handle the unique
  -- constraint atomically so an identical winner is returned without rewriting it.
  INSERT INTO public.workflow_evaluations(user_id,project_id,document_hash,document) VALUES(p_user,p_project,digest,p_document)
    ON CONFLICT (user_id,project_id,document_hash) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN
    SELECT id INTO result FROM public.workflow_evaluations WHERE user_id=p_user AND project_id=p_project AND document_hash=digest;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'workflow_evaluation_unavailable'; END IF;
  RETURN result;
END; $$;
CREATE FUNCTION public.read_workflow_evaluations(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'documentHash',document_hash,'suiteName',document->'input'->>'suiteName','baselineVersion',document->'input'->>'baselineVersion','candidateVersion',document->'input'->>'candidateVersion','fixedBriefHash',document->>'fixedBriefHash','verdict',document->>'verdict','baselineCost',document->'baselineCost','candidateCost',document->'candidateCost','caseCount',jsonb_array_length(document->'input'->'cases'),'independentlyVerified',false,'autoRelease',false) ORDER BY created_at DESC) FROM public.workflow_evaluations WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.save_workflow_evaluation(uuid,text,jsonb),public.read_workflow_evaluations(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_workflow_evaluation(uuid,text,jsonb),public.read_workflow_evaluations(uuid,text) TO service_role;
