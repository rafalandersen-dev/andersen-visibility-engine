-- Citation Intelligence — Google native-report intake: ADDITIVE typed parser interpretation on the
-- existing raw-staging table. Strictly additive: nullable columns + new service-only RPCs. The
-- 10-key owner-declared staging metadata and the pending_parser/unsupported status contract are
-- UNCHANGED. Parse state is SEPARATE from staging status; a pending_parser row is not a verified
-- metric. The interpretation is re-derived server-side from the exact stored bytes and bound to the
-- row's server-derived artifact hash; a browser-claimed hash/aggregation/market is never trusted.
ALTER TABLE public.ai_native_report_artifacts
  -- The typed parser result (input rows + per-cell value statuses, withheldPageRows, partial,
  -- limitation note, parser version), hard-bounded. 4 MiB: raw bytes are <=2 MiB and the parsed
  -- JSON (raw keys + per-cell statuses) is larger; raise only against a genuine larger export.
  ADD COLUMN parsed jsonb
    CHECK(parsed IS NULL OR (jsonb_typeof(parsed)='object' AND octet_length(parsed::text)<=4194304)),
  ADD COLUMN parsed_at timestamptz,
  ADD COLUMN parsed_actor_id uuid,
  -- The three parsed fields move together: either all null (unparsed) or all set (parsed).
  ADD CONSTRAINT ai_native_report_parsed_presence
    CHECK((parsed IS NULL)=(parsed_at IS NULL) AND (parsed IS NULL)=(parsed_actor_id IS NULL));

-- Persist the interpretation onto an EXISTING row. Binds to the exact raw artifact (the record's own
-- hash AND the parser's input hash must equal the server-derived artifact_sha256) and attributes
-- time/actor server-side. Idempotent on a byte-identical re-parse; a different interpretation
-- (changed completeness/note/output) is an explicit conflict, never a silent overwrite. The row's
-- existence and scope are enforced by the owner match + assert_knowledge_project.
CREATE FUNCTION public.save_ai_native_report_parsed(p_user uuid,p_project text,p_id uuid,p_parsed jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE art_sha text; existing jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_id IS NULL OR p_parsed IS NULL OR jsonb_typeof(p_parsed)<>'object' OR octet_length(p_parsed::text)>4194304 THEN
    RAISE EXCEPTION 'invalid_native_parsed' USING ERRCODE='22023';
  END IF;
  SELECT artifact_sha256, parsed INTO art_sha, existing
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF art_sha IS NULL THEN RAISE EXCEPTION 'native_parsed_unavailable' USING ERRCODE='22023'; END IF;
  -- A browser-claimed hash is never trusted: both the record hash and the parser's input artifact
  -- hash must equal the server-derived artifact_sha256 of THIS row.
  IF p_parsed->>'artifactSha256' IS DISTINCT FROM art_sha
     OR p_parsed#>>'{input,artifact,sha256}' IS DISTINCT FROM art_sha THEN
    RAISE EXCEPTION 'native_parsed_hash_mismatch' USING ERRCODE='22023';
  END IF;
  -- Minimal DB shape guard; the authenticated server already validated the full strict shape.
  IF p_parsed->>'parserVersion' IS NULL OR jsonb_typeof(p_parsed->'input')<>'object' THEN
    RAISE EXCEPTION 'invalid_native_parsed' USING ERRCODE='22023';
  END IF;
  IF existing IS NOT NULL THEN
    -- Deterministic retry returns the stored interpretation; any difference is an explicit conflict.
    IF existing = p_parsed THEN
      RETURN (SELECT jsonb_build_object('id',id,'parseState','parsed','parsed',parsed,'parsedAt',parsed_at,'parsedActorId',parsed_actor_id)
        FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id);
    END IF;
    RAISE EXCEPTION 'native_parsed_conflict' USING ERRCODE='22023';
  END IF;
  UPDATE public.ai_native_report_artifacts
    SET parsed=p_parsed, parsed_at=clock_timestamp(), parsed_actor_id=p_user
    WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN (SELECT jsonb_build_object('id',id,'parseState','parsed','parsed',parsed,'parsedAt',parsed_at,'parsedActorId',parsed_actor_id)
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id);
END; $$;

-- Read ONE artifact's parse state + full interpretation (null when unparsed). No raw bytes.
CREATE FUNCTION public.read_ai_native_report_parsed(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_native_parsed' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('id',id,'parseState',CASE WHEN parsed IS NULL THEN 'unparsed' ELSE 'parsed' END,
    'parsed',parsed,'parsedAt',parsed_at,'parsedActorId',parsed_actor_id) INTO result
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF result IS NULL THEN RAISE EXCEPTION 'native_parsed_unavailable' USING ERRCODE='22023'; END IF;
  RETURN result;
END; $$;

-- Lightweight per-artifact parse-state overview for the list — no rows, no bytes.
CREATE FUNCTION public.read_ai_native_report_parse_states(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object('states',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',id,
    'parseState',CASE WHEN parsed IS NULL THEN 'unparsed' ELSE 'parsed' END,
    'parserVersion',parsed->>'parserVersion',
    'completeness',parsed#>>'{input,completeness}',
    'partial',CASE WHEN parsed IS NULL THEN NULL ELSE (parsed->>'partial')::boolean END,
    'withheldPageRows',CASE WHEN parsed IS NULL THEN NULL ELSE (parsed->>'withheldPageRows')::int END,
    'rowCount',CASE WHEN parsed IS NULL THEN NULL ELSE jsonb_array_length(parsed->'input'->'rows') END,
    'parsedAt',parsed_at)
    ORDER BY created_at DESC,id DESC)
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.save_ai_native_report_parsed(uuid,text,uuid,jsonb),public.read_ai_native_report_parsed(uuid,text,uuid),public.read_ai_native_report_parse_states(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_native_report_parsed(uuid,text,uuid,jsonb),public.read_ai_native_report_parsed(uuid,text,uuid),public.read_ai_native_report_parse_states(uuid,text) TO service_role;
