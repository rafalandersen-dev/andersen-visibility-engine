-- Citation Intelligence v1, P1 — raw native-report artifact STAGING. No parser exists yet, so
-- this stores owner-supplied opaque export bytes with server-derived hash/id/time/actor under
-- an explicit pending_parser status. A staged artifact contributes NO rows, metrics, presence,
-- comparability or verified claims; parsed snapshots arrive only in P5 from a genuine export.
-- No collectors, cron, provider calls or archive/file-format interpretation of the bytes.
CREATE TABLE public.ai_native_report_artifacts (
  user_id uuid NOT NULL, project_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  -- DB-derived canonical scope identity (sha256 over source/property/reportKind/dimension/
  -- AGGREGATION/period/timezone/market/filters). Derived here from strictly validated metadata,
  -- never supplied by a caller. Different scope never collapses even with byte-identical bytes.
  scope_key text NOT NULL CHECK(octet_length(scope_key) BETWEEN 1 AND 4000),
  -- Server-derived from the decoded bytes; a caller-claimed hash is never trusted or stored.
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 2097152),
  bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 2097152 AND octet_length(bytes)=byte_length),
  -- Owner-declared metadata only; parsed interpretation and review receipts are absent by design.
  metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8000),
  status text NOT NULL DEFAULT 'pending_parser' CHECK(status IN ('pending_parser','unsupported')),
  supersedes_id uuid,
  -- Server-derived history marker: set true ONLY by remove_* when this row's actual direct
  -- predecessor is deleted, so a NULL supersedes_id from an orphaned successor is distinguishable
  -- from a genuine first version. It retains no deleted id/metadata/bytes and is never caller-writable
  -- (save never sets it; the INSERT below omits it so a fresh row is false). It flags a partial-history
  -- gap for a later chain to detect; it is NOT a claim of complete lineage proof.
  predecessor_deleted boolean NOT NULL DEFAULT false,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,id),
  -- Same bytes under the same derived scope is idempotent; the scope key separates lineages.
  UNIQUE(user_id,project_id,scope_key,artifact_sha256),
  -- One successor per predecessor: guards forged/concurrent competing supersession.
  UNIQUE(user_id,project_id,supersedes_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  -- Self-reference is NO ACTION, NOT cascade: deleting a predecessor must never erase a distinct
  -- later version the owner kept. remove_* atomically unlinks any direct successor before deleting,
  -- so the successor survives as a lineage root; a project delete still removes the whole set via
  -- the workspace cascade above (all rows go together, satisfying the deferred check).
  FOREIGN KEY(user_id,project_id,supersedes_id) REFERENCES public.ai_native_report_artifacts(user_id,project_id,id)
);
ALTER TABLE public.ai_native_report_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_native_report_artifacts FROM PUBLIC,anon,authenticated,service_role;

-- UTF-16 code-unit length, matching JS String.length — the exact semantics Zod's `.min`/`.max` and
-- every strict read/list parse use to bound these free-text fields. Postgres char_length counts
-- Unicode CODE POINTS, but a supplementary (astral, > U+FFFF) character is one code point yet TWO
-- UTF-16 units, so a value in-bounds by code points can be over the Zod cap by units. Without this a
-- direct RPC could persist such a value (e.g. 150 emoji in a <=200 filter value: 150 code points but
-- JS length 300) that then fails the whole project's strict read/list parse. An astral character is
-- exactly a 4-byte UTF-8 code point, so units = code points + (count of 4-byte code points); this is
-- byte-exact and needs no regex \\U class. char_length('')=0 keeps the empty string at 0 units, so the
-- existing 1..N lower bounds still reject an empty key/property. Internal-only: EXECUTE is revoked from
-- every client role and the SECURITY DEFINER callers reach it as the function owner; search_path is
-- pinned empty, and it exposes no new caller-facing capability.
CREATE FUNCTION public.native_artifact_utf16_length(s text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT char_length(s)
    + (SELECT count(*) FROM regexp_split_to_table(s,'') ch WHERE octet_length(ch)=4)::int
$$;
REVOKE ALL ON FUNCTION public.native_artifact_utf16_length(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.save_ai_native_report_artifact(p_user uuid,p_project text,p_metadata jsonb,p_base64 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  original bytea; digest text; scope text; existing uuid; head uuid; new_id uuid; total bigint;
  prop text; norm text; grp text[]; period jsonb; market jsonb; filters jsonb; tz text; ctry text;
  d_start date; d_end date;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  -- STRICT owner-declared metadata. The DB — never a caller-supplied key — derives the canonical
  -- scope identity from these validated values (there is no scope-key parameter to forge). EXACTLY
  -- these ten declared keys are allowed; any other key (a parsed/server field OR an arbitrary extra)
  -- is refused, so neither a browser nor a direct SQL caller can smuggle server attribution or
  -- off-contract data past the boundary. Every server-derived/parsed fact (hash, id, status, times,
  -- actor, scope, supersession, interpreted rows/cells/values, verification, review) stays absent.
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object' OR octet_length(p_metadata::text)>8000 THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  IF NOT (p_metadata ?& ARRAY['source','declaredProperty','reportKind','dimension','aggregation','period','marketScope','filters','capturedAt','filename'])
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_metadata) k
       WHERE k <> ALL(ARRAY['source','declaredProperty','reportKind','dimension','aggregation','period','marketScope','filters','capturedAt','filename'])) THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  period := p_metadata->'period'; market := p_metadata->'marketScope'; filters := p_metadata->'filters';
  IF jsonb_typeof(period)<>'object' OR jsonb_typeof(market)<>'object' OR jsonb_typeof(filters)<>'object' THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  -- Enumerations, bounded strings and strict sub-object shapes, mirroring the client validators.
  -- Each required enum must be a JSON *string* drawn from its allowlist. `x ->> k` yields SQL NULL
  -- for a JSON null value, and `NULL NOT IN (...)` is UNKNOWN (not TRUE), so a bare `NOT IN` would
  -- leave a null/missing/wrong-typed enum unrejected and persist an off-contract row that later
  -- breaks the strict read/list parse for the whole project. The explicit `jsonb_typeof(...)='string'`
  -- guard closes that three-valued-logic gap; a non-null wrong scalar/object is already refused because
  -- its text is not in the set, but a JSON null needs this guard. (declaredProperty/capturedAt use the
  -- same jsonb_typeof='string' check below; the nullable timezone/country/filename keep their explicit
  -- null-or-string handling, and period/marketScope/filters are already required to be objects above.)
  IF jsonb_typeof(p_metadata->'source')<>'string' OR p_metadata->>'source' NOT IN ('gsc_generative_ai_search','bing_ai_performance')
     OR jsonb_typeof(p_metadata->'declaredProperty')<>'string'
     OR jsonb_typeof(p_metadata->'reportKind')<>'string' OR p_metadata->>'reportKind' NOT IN ('chart','table')
     OR jsonb_typeof(p_metadata->'dimension')<>'string' OR p_metadata->>'dimension' NOT IN ('property','page','country','device','date','grounding_query','unknown')
     OR jsonb_typeof(p_metadata->'aggregation')<>'string' OR p_metadata->>'aggregation' NOT IN ('property','page','query','unknown')
     OR jsonb_typeof(p_metadata->'capturedAt')<>'string'
     OR NOT (jsonb_typeof(p_metadata->'filename')='null'
             OR jsonb_typeof(p_metadata->'filename')='string' AND public.native_artifact_utf16_length(p_metadata->>'filename')<=255)
     OR NOT (period ?& ARRAY['start','end','timezone'])
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(period) k WHERE k <> ALL(ARRAY['start','end','timezone']))
     OR NOT (market ?& ARRAY['country','exposed'])
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(market) k WHERE k <> ALL(ARRAY['country','exposed']))
     OR (SELECT count(*) FROM jsonb_object_keys(filters))>20 THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  -- declaredProperty: trimmed 1..500; scheme+authority are canonically lowercased while the path,
  -- query and fragment stay case-significant, so `/Shop` and `/shop` are distinct scope identities.
  prop := regexp_replace(p_metadata->>'declaredProperty','^[[:space:]]+|[[:space:]]+$','','g');
  IF public.native_artifact_utf16_length(prop) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023'; END IF;
  grp := regexp_match(prop,'^([A-Za-z][A-Za-z0-9+.-]*://)([^/?#]*)(.*)$');
  norm := CASE WHEN grp IS NULL THEN prop ELSE lower(grp[1])||lower(grp[2])||grp[3] END;
  -- period: real ordered Gregorian dates in strict YYYY-MM-DD form; a wrong day boundary would
  -- mis-scope every date row, so an impossible (2026-02-30, 2027-02-29, 2026-13-01) or reversed
  -- period is refused, exactly as the shared nativePeriodSchema does. The date cast rejects any
  -- impossible calendar day; ISO year-first parsing is DateStyle-independent.
  IF jsonb_typeof(period->'start')<>'string' OR period->>'start' !~ '^\d{4}-\d{2}-\d{2}$'
     OR jsonb_typeof(period->'end')<>'string' OR period->>'end' !~ '^\d{4}-\d{2}-\d{2}$'
     OR NOT (jsonb_typeof(period->'timezone')='null'
             OR jsonb_typeof(period->'timezone')='string' AND public.native_artifact_utf16_length(period->>'timezone') BETWEEN 1 AND 64) THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  BEGIN d_start := (period->>'start')::date; d_end := (period->>'end')::date;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023'; END;
  tz := CASE WHEN jsonb_typeof(period->'timezone')='null' THEN NULL ELSE period->>'timezone' END;
  -- GSC dates its reports in Pacific Time; a forged GSC artifact cannot enter with an assumed or
  -- missing timezone. Bing's export timezone is unknown, so it is preserved as declared (incl. null).
  IF d_start > d_end OR (p_metadata->>'source'='gsc_generative_ai_search' AND tz IS DISTINCT FROM 'America/Los_Angeles') THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  -- marketScope: ISO-3166-1 alpha-3 country or null; a country cannot be claimed with no exposed scope.
  ctry := CASE WHEN jsonb_typeof(market->'country')='null' THEN NULL ELSE market->>'country' END;
  IF jsonb_typeof(market->'exposed')<>'boolean'
     OR NOT (jsonb_typeof(market->'country')='null' OR jsonb_typeof(market->'country')='string' AND ctry ~ '^[A-Za-z]{3}$')
     OR (ctry IS NOT NULL AND (market->>'exposed')<>'true') THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  -- filters: a flat map of bounded string keys (1..64) and string values (<=200); order is irrelevant.
  IF EXISTS(SELECT 1 FROM jsonb_each(filters) f
       WHERE jsonb_typeof(f.value)<>'string' OR public.native_artifact_utf16_length(f.key) NOT BETWEEN 1 AND 64 OR public.native_artifact_utf16_length(f.value #>> '{}')>200) THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  -- capturedAt: an actual offset-aware ISO-8601 download timestamp from 2020-01-01 through now. The time
  -- components are bounded to the SAME ranges the read-back Zod `.datetime({offset:true})` enforces —
  -- hour 00-23, minute/second 00-59, uppercase T and Z, an offset with its colon — because PG's
  -- ::timestamptz cast is lenient (it rolls 24:00:00 over to the next midnight, and tolerates 60/case/
  -- spacing) and would otherwise store an original string the reader then rejects, poisoning the list.
  -- The ::timestamptz cast below still enforces the real calendar and the 2020..now instant, and the
  -- original valid string is stored verbatim (no coercion); a stricter offset than the reader only
  -- refuses writes, it never persists a value the reader cannot read.
  IF p_metadata->>'capturedAt' !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  BEGIN
    IF (p_metadata->>'capturedAt')::timestamptz > clock_timestamp()
       OR (p_metadata->>'capturedAt')::timestamptz < '2020-01-01 00:00:00+00'::timestamptz THEN
      RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
    END IF;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023'; END;
  -- STRICT base64 at the DB boundary, not only the JS regex. Bound the encoded length BEFORE decode
  -- (2796204 = base64 length of the 2 MiB cap), reject any non-alphabet character, embedded whitespace,
  -- misplaced padding or a length that is not a multiple of four, then decode and require a canonical
  -- round-trip so non-canonical trailing-bit encodings are refused, never coerced or partially stored.
  IF p_base64 IS NULL OR length(p_base64) NOT BETWEEN 1 AND 2796204
     OR p_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' OR length(p_base64) % 4 <> 0 THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  original := decode(p_base64,'base64');
  IF replace(encode(original,'base64'),E'\n','') <> p_base64 THEN
    RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023';
  END IF;
  IF octet_length(original) NOT BETWEEN 1 AND 2097152 THEN
    RAISE EXCEPTION 'native_artifact_too_large' USING ERRCODE='22023';
  END IF;
  digest := encode(sha256(original),'hex');
  -- Canonical DB-derived scope identity: a sha256 over the ordered, canonicalized declared fields
  -- (normalized property, uppercased country, source timezone) with filters embedded as a jsonb
  -- object so filter key order is irrelevant while different keys/values stay distinct. Same canonical
  -- identity => same key => one lineage; any different meaning => a different key => a separate lineage.
  scope := encode(sha256(convert_to(jsonb_build_array(
    p_metadata->>'source', norm, p_metadata->>'reportKind', p_metadata->>'dimension', p_metadata->>'aggregation',
    period->>'start', period->>'end', tz,
    CASE WHEN ctry IS NULL THEN NULL ELSE upper(ctry) END, (market->>'exposed')='true', filters
  )::text,'UTF8')),'hex');
  SELECT id INTO existing FROM public.ai_native_report_artifacts
    WHERE user_id=p_user AND project_id=p_project AND scope_key=scope AND artifact_sha256=digest;
  IF existing IS NOT NULL THEN
    RETURN (SELECT jsonb_build_object('id',id,'scopeKey',scope_key,'sha256',artifact_sha256,'byteLength',byte_length,
      'status',status,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,'metadata',metadata,'createdAt',created_at,'actorId',actor_id)
      FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=existing);
  END IF;
  -- Conservative per-project bound: count includes versions AND corrections; no eviction, no raise.
  IF (SELECT count(*) FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project)>=20 THEN
    RAISE EXCEPTION 'native_artifact_capacity' USING ERRCODE='22023';
  END IF;
  -- 40 MiB raw bytes/project. At the 2 MiB per-artifact cap this coincides with the 20-count bound
  -- (20*2 MiB); it is kept as a defensive expression of the same conservative provisional limit.
  SELECT coalesce(sum(byte_length),0) INTO total FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project;
  IF total+octet_length(original)>41943040 THEN
    RAISE EXCEPTION 'native_artifact_byte_capacity' USING ERRCODE='22023';
  END IF;
  -- A same-scope reimport supersedes the latest current head of that lineage; append-only, never
  -- rewrites. A predecessor deletion can orphan a successor into a second root, so the head is the
  -- most-recent unsuperseded row, with a stable id tie-break (matching the list ordering).
  SELECT a.id INTO head FROM public.ai_native_report_artifacts a
    WHERE a.user_id=p_user AND a.project_id=p_project AND a.scope_key=scope
      AND NOT EXISTS(SELECT 1 FROM public.ai_native_report_artifacts b
        WHERE b.user_id=p_user AND b.project_id=p_project AND b.supersedes_id=a.id)
    ORDER BY a.created_at DESC,a.id DESC LIMIT 1;
  INSERT INTO public.ai_native_report_artifacts
    (user_id,project_id,scope_key,artifact_sha256,byte_length,bytes,metadata,status,supersedes_id,actor_id)
    VALUES(p_user,p_project,scope,digest,octet_length(original),original,p_metadata,'pending_parser',head,p_user)
    RETURNING id INTO new_id;
  RETURN (SELECT jsonb_build_object('id',id,'scopeKey',scope_key,'sha256',artifact_sha256,'byteLength',byte_length,
    'status',status,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,'metadata',metadata,'createdAt',created_at,'actorId',actor_id)
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=new_id);
END; $$;

-- List: bounded metadata ONLY, never the raw bytes (no 20x2 MiB read).
CREATE FUNCTION public.read_ai_native_report_artifacts(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  RETURN jsonb_build_object('artifacts',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'scopeKey',scope_key,'sha256',artifact_sha256,'byteLength',byte_length,'status',status,
    'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,'metadata',metadata,'createdAt',created_at,'actorId',actor_id)
    ORDER BY created_at DESC,id DESC)
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project),'[]'::jsonb));
END; $$;

-- Single artifact incl. exact raw bytes (JSON export retains the bytes verbatim as base64).
CREATE FUNCTION public.read_ai_native_report_artifact(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('id',id,'scopeKey',scope_key,'sha256',artifact_sha256,'byteLength',byte_length,
    'status',status,'supersedesId',supersedes_id,'predecessorDeleted',predecessor_deleted,'metadata',metadata,'createdAt',created_at,'actorId',actor_id,
    'base64',replace(encode(bytes,'base64'),E'\n','')) INTO result
    FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF result IS NULL THEN RAISE EXCEPTION 'native_artifact_unavailable' USING ERRCODE='22023'; END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.remove_ai_native_report_artifact(p_user uuid,p_project text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_native_artifact' USING ERRCODE='22023'; END IF;
  -- Delete ONLY this artifact's row and raw bytes. First atomically unlink any direct successor so
  -- erasing a predecessor never removes a distinct later version the owner did not select: the
  -- successor survives as a lineage root. The deleted predecessor's id/metadata/bytes are not retained,
  -- but the successor records a server-derived `predecessor_deleted=true` marker so the history gap is
  -- visible in the data itself (a genuine first version stays false), distinguishing an orphaned root
  -- from a true lineage root. It is a partial-history flag, never a claim of complete lineage proof.
  -- The UNIQUE(user,project,supersedes_id) guard means at most one such direct successor exists. Only
  -- the deleted artifact's bytes leave and only its quota is freed.
  UPDATE public.ai_native_report_artifacts SET supersedes_id=NULL, predecessor_deleted=true
    WHERE user_id=p_user AND project_id=p_project AND supersedes_id=p_id;
  DELETE FROM public.ai_native_report_artifacts WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.save_ai_native_report_artifact(uuid,text,jsonb,text),public.read_ai_native_report_artifacts(uuid,text),public.read_ai_native_report_artifact(uuid,text,uuid),public.remove_ai_native_report_artifact(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_native_report_artifact(uuid,text,jsonb,text),public.read_ai_native_report_artifacts(uuid,text),public.read_ai_native_report_artifact(uuid,text,uuid),public.remove_ai_native_report_artifact(uuid,text,uuid) TO service_role;
