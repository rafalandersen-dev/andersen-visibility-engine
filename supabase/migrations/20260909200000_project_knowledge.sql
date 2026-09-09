-- P1 source and editorial-knowledge records. Private, versioned, no provider
-- calls, no publication authority, and no automatic acceptance of proposals.
CREATE TABLE public.project_knowledge_sources (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8000),
  PRIMARY KEY(user_id,project_id,id)
);
CREATE TABLE public.project_knowledge_records (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  id uuid NOT NULL,
  source_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16000),
  PRIMARY KEY(user_id,project_id,id),
  FOREIGN KEY(user_id,project_id,source_id) REFERENCES public.project_knowledge_sources(user_id,project_id,id) ON DELETE CASCADE
);
CREATE TABLE public.project_knowledge_history (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('source','record')),
  id uuid NOT NULL,
  revision integer NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(user_id,project_id,kind,id,revision)
);
CREATE TABLE public.project_knowledge_tombstones (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('source','record')),
  id uuid NOT NULL,
  PRIMARY KEY(user_id,project_id,kind,id)
);
ALTER TABLE public.project_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_knowledge_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_knowledge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_knowledge_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_knowledge_sources,public.project_knowledge_records,public.project_knowledge_history,public.project_knowledge_tombstones FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.project_knowledge_sources,public.project_knowledge_records,public.project_knowledge_history,public.project_knowledge_tombstones TO service_role;

CREATE FUNCTION public.assert_knowledge_project(p_user uuid,p_project text,p_lock boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_user IS NULL OR p_project IS NULL OR p_project !~ '^[A-Za-z0-9_-]{1,64}$' THEN
    RAISE EXCEPTION 'knowledge_project_unavailable' USING ERRCODE='22023';
  END IF;
  IF p_lock THEN
    -- Use the same lock order as ordinary workspace batches; serializes caps,
    -- source replacement/revocation and record saves for this account.
    PERFORM 1 FROM public.workspace_meta WHERE user_id=p_user FOR UPDATE;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project) THEN
    RAISE EXCEPTION 'knowledge_project_unavailable' USING ERRCODE='22023';
  END IF;
END;
$$;

CREATE FUNCTION public.read_project_knowledge(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  -- One statement snapshot: never combine old active-source metadata with
  -- records read after a concurrent source replacement.
  SELECT jsonb_build_object(
    'sources',coalesce((SELECT jsonb_agg(payload ORDER BY id) FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb),
    'records',coalesce((SELECT jsonb_agg(payload ORDER BY id) FROM public.project_knowledge_records WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.save_project_knowledge(p_user uuid,p_project text,p_kind text,p_id uuid,p_expected integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb; current_revision integer; source public.project_knowledge_sources%ROWTYPE;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_kind NOT IN ('source','record') OR p_kind IS NULL OR p_id IS NULL OR p_expected IS NULL OR p_expected<0
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>16000
    OR p_payload->>'ownerId' IS DISTINCT FROM p_user::text OR p_payload->>'projectId' IS DISTINCT FROM p_project
    OR p_payload->>'id' IS DISTINCT FROM p_id::text OR p_payload->>'revision' IS DISTINCT FROM (p_expected+1)::text THEN
    RAISE EXCEPTION 'invalid_project_knowledge' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_knowledge_tombstones WHERE user_id=p_user AND project_id=p_project AND kind=p_kind AND id=p_id) THEN
    RAISE EXCEPTION 'knowledge_forgotten' USING ERRCODE='22023';
  END IF;
  IF p_kind='source' THEN
    SELECT revision,payload INTO current_revision,previous FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  ELSE
    SELECT revision,payload INTO current_revision,previous FROM public.project_knowledge_records WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  END IF;
  -- A byte-identical replay after a lost acknowledgement is safe. Changed
  -- replay or stale edits fail; no automatic overwrite/reapplication.
  IF current_revision=p_expected+1 AND previous=p_payload THEN RETURN previous; END IF;
  IF coalesce(current_revision,0)<>p_expected THEN RAISE EXCEPTION 'knowledge_changed' USING ERRCODE='40001'; END IF;
  IF (SELECT count(*) FROM public.project_knowledge_history WHERE user_id=p_user AND project_id=p_project)>=10000 THEN
    RAISE EXCEPTION 'knowledge_history_capacity' USING ERRCODE='22023';
  END IF;
  IF p_kind='source' THEN
    IF previous IS NOT NULL AND previous->>'kind' IS DISTINCT FROM p_payload->>'kind' THEN RAISE EXCEPTION 'knowledge_identity_conflict' USING ERRCODE='22023'; END IF;
    IF coalesce(p_payload->>'kind','') NOT IN ('owner','website','document') OR coalesce(p_payload->>'status','') NOT IN ('active','revoked')
      OR coalesce(p_payload->>'fingerprint','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'invalid_project_knowledge' USING ERRCODE='22023';
    END IF;
    IF current_revision IS NULL AND (SELECT count(*) FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project)>=100 THEN
      RAISE EXCEPTION 'knowledge_capacity' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.project_knowledge_sources VALUES(p_user,p_project,p_id,p_expected+1,p_payload)
    ON CONFLICT(user_id,project_id,id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload;
  ELSE
    IF previous IS NOT NULL AND previous->>'sourceId' IS DISTINCT FROM p_payload->>'sourceId' THEN RAISE EXCEPTION 'knowledge_identity_conflict' USING ERRCODE='22023'; END IF;
    SELECT * INTO source FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=(p_payload->>'sourceId')::uuid;
    IF source.id IS NULL OR source.payload->>'status'<>'active' OR source.revision::text IS DISTINCT FROM p_payload->>'sourceRevision' THEN
      RAISE EXCEPTION 'knowledge_source_changed' USING ERRCODE='40001';
    END IF;
    IF coalesce(p_payload->>'status','') NOT IN ('proposed','accepted','disputed','expired','rejected')
      OR (p_payload->>'status'='accepted' AND coalesce(p_payload->>'reviewedAt','')='') THEN
      RAISE EXCEPTION 'invalid_project_knowledge' USING ERRCODE='22023';
    END IF;
    IF current_revision IS NULL AND (SELECT count(*) FROM public.project_knowledge_records WHERE user_id=p_user AND project_id=p_project)>=300 THEN
      RAISE EXCEPTION 'knowledge_capacity' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.project_knowledge_records VALUES(p_user,p_project,p_id,source.id,p_expected+1,p_payload)
    ON CONFLICT(user_id,project_id,id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload,source_id=EXCLUDED.source_id;
  END IF;
  INSERT INTO public.project_knowledge_history VALUES(p_user,p_project,p_kind,p_id,p_expected+1,p_payload);
  RETURN p_payload;
END;
$$;

CREATE FUNCTION public.forget_project_knowledge(p_user uuid,p_project text,p_kind text,p_id uuid,p_expected integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision integer;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_kind IS NULL OR p_kind NOT IN ('source','record') OR p_id IS NULL OR p_expected IS NULL OR p_expected<1 THEN
    RAISE EXCEPTION 'invalid_project_knowledge' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_knowledge_tombstones WHERE user_id=p_user AND project_id=p_project AND kind=p_kind AND id=p_id) THEN RETURN; END IF;
  IF p_kind='source' THEN
    SELECT revision INTO current_revision FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  ELSE
    SELECT revision INTO current_revision FROM public.project_knowledge_records WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  END IF;
  IF current_revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'knowledge_changed' USING ERRCODE='40001'; END IF;
  IF p_kind='source' THEN
    INSERT INTO public.project_knowledge_tombstones SELECT user_id,project_id,'record',id FROM public.project_knowledge_records
      WHERE user_id=p_user AND project_id=p_project AND source_id=p_id ON CONFLICT DO NOTHING;
    -- History from any past revision of this source also stops retaining text.
    DELETE FROM public.project_knowledge_history WHERE user_id=p_user AND project_id=p_project
      AND (kind='source' AND id=p_id OR kind='record' AND (payload->>'sourceId'=p_id::text OR id IN
        (SELECT id FROM public.project_knowledge_records WHERE user_id=p_user AND project_id=p_project AND source_id=p_id)));
    DELETE FROM public.project_knowledge_sources WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  ELSE
    DELETE FROM public.project_knowledge_records WHERE user_id=p_user AND project_id=p_project AND id=p_id;
    DELETE FROM public.project_knowledge_history WHERE user_id=p_user AND project_id=p_project AND kind='record' AND id=p_id;
  END IF;
  INSERT INTO public.project_knowledge_tombstones VALUES(p_user,p_project,p_kind,p_id) ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_knowledge_project(uuid,text,boolean),public.read_project_knowledge(uuid,text),public.save_project_knowledge(uuid,text,text,uuid,integer,jsonb),public.forget_project_knowledge(uuid,text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_knowledge_project(uuid,text,boolean),public.read_project_knowledge(uuid,text),public.save_project_knowledge(uuid,text,text,uuid,integer,jsonb),public.forget_project_knowledge(uuid,text,text,uuid,integer) TO service_role;


CREATE FUNCTION public.read_project_knowledge_history(p_user uuid,p_project text,p_kind text,p_id uuid,p_before integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_kind IS NULL OR p_kind NOT IN ('source','record') OR p_id IS NULL OR (p_before IS NOT NULL AND p_before<1) THEN
    RAISE EXCEPTION 'invalid_project_knowledge' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(payload ORDER BY revision DESC),'[]'::jsonb) INTO result FROM (
    SELECT revision,payload FROM public.project_knowledge_history
    WHERE user_id=p_user AND project_id=p_project AND kind=p_kind AND id=p_id AND (p_before IS NULL OR revision<p_before)
    ORDER BY revision DESC LIMIT 20
  ) h;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.read_project_knowledge_history(uuid,text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_project_knowledge_history(uuid,text,text,uuid,integer) TO service_role;
