-- Owner-supplied, unverified answer evidence. No collectors, cron or provider calls.
CREATE TABLE public.ai_visibility_prompts (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL, revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=30000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id,revision),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
CREATE TABLE public.ai_answer_evidence (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL, prompt_revision integer NOT NULL, document_hash text NOT NULL,
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=100000),
  supersedes_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id), UNIQUE(user_id,project_id,document_hash), UNIQUE(user_id,project_id,supersedes_id),
  FOREIGN KEY(user_id,project_id,prompt_id,prompt_revision) REFERENCES public.ai_visibility_prompts(user_id,project_id,id,revision) ON DELETE CASCADE,
  FOREIGN KEY(user_id,project_id,supersedes_id) REFERENCES public.ai_answer_evidence(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.ai_visibility_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_answer_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_visibility_prompts,public.ai_answer_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.save_ai_visibility_prompt(p_user uuid,p_project text,p_id uuid,p_expected integer,p_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision integer;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_id IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected>=1000 OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>30000 THEN RAISE EXCEPTION 'invalid_evidence_prompt'; END IF;
  SELECT coalesce(max(revision),0) INTO current_revision FROM public.ai_visibility_prompts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF current_revision<>p_expected THEN RAISE EXCEPTION 'evidence_prompt_changed'; END IF;
  IF (SELECT count(*) FROM public.ai_visibility_prompts WHERE user_id=p_user AND project_id=p_project)>=200 THEN RAISE EXCEPTION 'evidence_prompt_capacity'; END IF;
  INSERT INTO public.ai_visibility_prompts(user_id,project_id,id,revision,data) VALUES(p_user,p_project,p_id,p_expected+1,p_data);
  RETURN p_expected+1;
END; $$;

CREATE FUNCTION public.save_ai_answer_evidence(p_user uuid,p_project text,p_document jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; result uuid; prompt uuid; rev integer; replaced uuid; saved jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>100000 OR p_document->'analysis'->'verified' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'invalid_answer_evidence'; END IF;
  prompt:=(p_document->'input'->>'promptId')::uuid; rev:=(p_document->'input'->>'promptRevision')::integer;
  replaced:=(p_document->'input'->>'supersedesId')::uuid;
  SELECT jsonb_build_object('id',id,'revision',revision,'createdAt',created_at,'data',data) INTO saved FROM public.ai_visibility_prompts WHERE user_id=p_user AND project_id=p_project AND id=prompt AND revision=rev;
  IF saved IS NULL OR saved IS DISTINCT FROM p_document->'prompt' THEN RAISE EXCEPTION 'evidence_prompt_changed'; END IF;
  digest:=encode(sha256(convert_to((p_document->'input')::text,'UTF8')),'hex');
  SELECT id INTO result FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND document_hash=digest;
  IF FOUND THEN RETURN result; END IF;
  IF replaced IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=replaced AND prompt_id=prompt AND prompt_revision=rev) THEN RAISE EXCEPTION 'evidence_correction_missing'; END IF;
  IF (SELECT count(*) FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project)>=100 THEN RAISE EXCEPTION 'answer_evidence_capacity'; END IF;
  INSERT INTO public.ai_answer_evidence(user_id,project_id,prompt_id,prompt_revision,document_hash,document,supersedes_id)
    VALUES(p_user,p_project,prompt,rev,digest,p_document,replaced)
    ON CONFLICT(user_id,project_id,document_hash) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND document_hash=digest; END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.read_ai_answer_evidence(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object(
    'prompts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'createdAt',created_at,'data',data) ORDER BY created_at DESC,id,revision DESC) FROM public.ai_visibility_prompts WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb),
    'answers',coalesce((SELECT jsonb_agg(document||jsonb_build_object('id',id,'createdAt',created_at,'hash',document_hash) ORDER BY created_at DESC,id DESC) FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb));
END; $$;

CREATE FUNCTION public.remove_ai_answer_evidence(p_user uuid,p_project text,p_kind text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('prompt','answer') THEN RAISE EXCEPTION 'invalid_evidence_removal'; END IF;
  -- Erasure intentionally removes dependent correction chains; ordinary edits never rewrite originals.
  IF p_kind='prompt' THEN DELETE FROM public.ai_visibility_prompts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  ELSE DELETE FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.save_ai_visibility_prompt(uuid,text,uuid,integer,jsonb),public.save_ai_answer_evidence(uuid,text,jsonb),public.read_ai_answer_evidence(uuid,text),public.remove_ai_answer_evidence(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_visibility_prompt(uuid,text,uuid,integer,jsonb),public.save_ai_answer_evidence(uuid,text,jsonb),public.read_ai_answer_evidence(uuid,text),public.remove_ai_answer_evidence(uuid,text,text,uuid) TO service_role;
