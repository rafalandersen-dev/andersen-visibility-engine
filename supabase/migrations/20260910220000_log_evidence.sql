-- Private, explicitly unverified owner-supplied server/edge request evidence.
-- No vendor access, collectors, timers, browser-beacon changes or verification claims.
CREATE TABLE public.project_log_evidence (
 user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 document_hash text NOT NULL, document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=200000),
 supersedes_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,project_id,id), UNIQUE(user_id,project_id,document_hash), UNIQUE(user_id,project_id,supersedes_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,project_id,supersedes_id) REFERENCES public.project_log_evidence(user_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE public.project_log_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_log_evidence FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.save_project_log_evidence(p_user uuid,p_project text,p_document jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE digest text; result uuid; replaced uuid; r jsonb; i jsonb;
BEGIN
 PERFORM public.assert_knowledge_project(p_user,p_project,true);
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>200000
 OR p_document->'verified' IS DISTINCT FROM 'false'::jsonb OR p_document->>'classifier' IS DISTINCT FROM 'ua-token-claim-v1'
 OR (p_document - ARRAY['input','verified','classifier','submittedRows','duplicateRows'])<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_log_document'; END IF;
 i:=p_document->'input';
 IF i IS NULL OR jsonb_typeof(i)<>'object' OR i->>'format' IS DISTINCT FROM 'milo-log-evidence-v1'
 OR i->'publicPathsConfirmed' IS DISTINCT FROM 'true'::jsonb
 OR (i - ARRAY['format','source','layer','method','hostname','windowStart','windowEnd','completeness','publicPathsConfirmed','supersedesId','rows'])<>'{}'::jsonb
 OR jsonb_typeof(i->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_log_input'; END IF;
 IF jsonb_array_length(i->'rows')>500 THEN RAISE EXCEPTION 'log_row_capacity'; END IF;
 -- Enforce durable allowlist even if a future service caller skips the application schema.
 FOR r IN SELECT value FROM jsonb_array_elements(i->'rows') LOOP
   IF jsonb_typeof(r)<>'object' OR (r - ARRAY['time','page','status','method','claimedAgent'])<>'{}'::jsonb
   OR r->>'page' IS NULL OR r->>'page' !~ '^/[^?%@#[:cntrl:]]*$'
   OR r->>'claimedAgent' IS NULL OR r->>'claimedAgent' NOT IN ('GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-User','Claude-SearchBot','PerplexityBot','Perplexity-User','Googlebot','bingbot','unknown')
   THEN RAISE EXCEPTION 'invalid_safe_log_row'; END IF;
 END LOOP;
 replaced:=(i->>'supersedesId')::uuid;
 -- Canonical safe input identity ignores transient import counters and original UA text.
 digest:=encode(sha256(convert_to(i::text,'UTF8')),'hex');
 SELECT id INTO result FROM public.project_log_evidence WHERE user_id=p_user AND project_id=p_project AND document_hash=digest;
 IF FOUND THEN RETURN result; END IF;
 IF replaced IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_log_evidence WHERE user_id=p_user AND project_id=p_project AND id=replaced) THEN RAISE EXCEPTION 'log_correction_missing'; END IF;
 IF (SELECT count(*) FROM public.project_log_evidence WHERE user_id=p_user AND project_id=p_project)>=50 THEN RAISE EXCEPTION 'log_history_capacity'; END IF;
 INSERT INTO public.project_log_evidence(user_id,project_id,document_hash,document,supersedes_id) VALUES(p_user,p_project,digest,p_document,replaced) RETURNING id INTO result;
 RETURN result;
END; $$;
CREATE FUNCTION public.read_project_log_evidence(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_knowledge_project(p_user,p_project);
 RETURN coalesce((SELECT jsonb_agg(document||jsonb_build_object('id',id,'createdAt',created_at,'hash',document_hash) ORDER BY created_at DESC,id) FROM public.project_log_evidence WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb);
END; $$;
CREATE FUNCTION public.remove_project_log_evidence(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_knowledge_project(p_user,p_project,true);
 IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_log_removal'; END IF;
 DELETE FROM public.project_log_evidence WHERE user_id=p_user AND project_id=p_project AND id=p_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.save_project_log_evidence(uuid,text,jsonb),public.read_project_log_evidence(uuid,text),public.remove_project_log_evidence(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_log_evidence(uuid,text,jsonb),public.read_project_log_evidence(uuid,text),public.remove_project_log_evidence(uuid,text,uuid) TO service_role;
