-- Citation Intelligence — native-report finding review binding (ADDITIVE). A NEW immutable finding
-- version may bind the EXACT parsed interpretation it cites (binding embedded in the finding content, so
-- record_sha256 already carries it). That makes a bound native evidence item independently inspectable,
-- gated by an EXPLICIT owner consent over the finding's ENTIRE cited native set. Strictly additive:
-- new nullable assignment columns + new helper/RPC functions + in-place CREATE OR REPLACE of the review
-- reads/save and the actorless inspectability predicate. Historical migrations are untouched; the frozen
-- 5-key read_ai_native_report_parsed/save_ai_native_report_parsed response shapes are NOT changed (a new
-- narrow binding RPC supplies the authoritative binding). Privileges/search_path/RLS preserved.
--
-- Invariants:
--   * Legacy/bare native evidence ({kind,id}, no binding) stays GLOBALLY uninspectable and its improvement
--     cap is never lifted by installing this migration, parsing an artifact, reading or re-granting — only
--     a conscious NEW fully-bound version enters the inspectable path.
--   * The binding is verified LIVE per field against the artifact + the central parsed digest; a
--     deleted/recreated artifact or a numeric-version re-creation never resurrects old binding/consent.
--   * Every native-bearing finding (INCLUDING legacy/unbound) is gated at every reviewer surface (detail,
--     standalone receipts, notes, digests, optimistic + locked save) before any oracle/idempotency return.
--   * All-UNKNOWN cells are NOT all-withheld: an intact report with unknown/invalid statuses is inspectable.

ALTER TABLE public.ai_citation_review_assignments
  -- Native-material consent, SEPARATE from the generic assignment (which alone never exposes native
  -- material). native_scope is a version token (exactly 'native_v1'); consented_set_sha256 is the canonical
  -- digest of the finding's ENTIRE bound native set the owner consented to; consent_at records the actual
  -- acceptance; consented_membership_revision / consented_policy_revision pin the EXACT live authority epoch
  -- that accepted it (NS05) — a member removal+restoration or policy disable+restoration bumps these
  -- revisions, so the original consent no longer matches and an explicit new grant is required.
  ADD COLUMN native_scope text CHECK(native_scope IS NULL OR native_scope='native_v1'),
  ADD COLUMN consented_set_sha256 text CHECK(consented_set_sha256 IS NULL OR consented_set_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN consent_at timestamptz,
  ADD COLUMN consented_membership_revision bigint,
  ADD COLUMN consented_policy_revision bigint,
  -- All native-consent fields move together: either all NULL (no native consent) or all set.
  ADD CONSTRAINT ai_citation_review_native_consent_presence
    CHECK((native_scope IS NULL)=(consented_set_sha256 IS NULL)
      AND (native_scope IS NULL)=(consent_at IS NULL)
      AND (native_scope IS NULL)=(consented_membership_revision IS NULL)
      AND (native_scope IS NULL)=(consented_policy_revision IS NULL));

-- Versioned CANONICAL digest over the ENTIRE persisted parsed interpretation (note + metadata + every
-- row/cell/status + withheld/partial + parser + artifact identity inside `parsed`). jsonb::text is
-- Postgres's deterministic normalized form (sorted keys, no insignificant whitespace), so the digest is
-- reproducible regardless of original serialization. A fixed domain marker prevents cross-payload
-- collision. This SINGLE digest is reused by the binding read, inspectability and consent.
CREATE FUNCTION public.citation_native_parsed_digest(p_parsed jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT encode(sha256(convert_to('native_review_binding_v1'||p_parsed::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION public.citation_native_parsed_digest(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- JS String.prototype.trim() semantics (the exact set Zod `.trim()`, parseNumber and isBingCountLexeme use):
-- strip the leading/trailing ECMAScript WhiteSpace + LineTerminator code points — tab/LF/VT/FF/CR/space,
-- NBSP, the Unicode space separators (U+1680, U+2000..U+200A, U+202F, U+205F, U+3000), the line/para
-- separators (U+2028/U+2029) and the BOM (U+FEFF). Postgres `btrim`/`\s` strip only ASCII spaces, so a
-- tab- or NBSP-padded genuine value would be rejected here while TS accepts it; this closes that gap. The
-- E'' literal expands each \uXXXX to its actual character (PG regex has no \u class), BMP-only so one code
-- point each.
CREATE FUNCTION public.citation_native_js_trim(s text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT regexp_replace(
           regexp_replace(s, E'^[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+', ''),
           E'[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '');
$$;
REVOKE ALL ON FUNCTION public.citation_native_js_trim(text) FROM PUBLIC,anon,authenticated,service_role;

-- True iff `p` is a JSON object whose key set is EXACTLY `keys` (every required key present, no extra key) —
-- the SQL mirror of a Zod `.strict()` object with no optional members. Used at every object level of the
-- parsed record so an extra/forged key (or a forbidden one, e.g. a cell `review` the import contract bans)
-- or a missing required key fails closed. CASE-guards jsonb_object_keys so a non-object never raises.
CREATE FUNCTION public.citation_native_exact_keys(p jsonb, keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN jsonb_typeof(p) IS DISTINCT FROM 'object' THEN false
    ELSE p ?& keys AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k <> ALL(keys)) END;
$$;
REVOKE ALL ON FUNCTION public.citation_native_exact_keys(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;

-- A real Gregorian calendar date in YYYY-MM-DD (mirrors native-ai-report.isRealCalendarDate). Regex-gated
-- then a date cast inside a controlled sub-block so an impossible but syntactically-ISO date
-- (2026-13-01, 2026-02-30) fails CLOSED instead of raising; the round-trip rejects any normalization.
CREATE FUNCTION public.citation_native_is_civil_date(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d date;
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
  BEGIN d := p::date; EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false; END;
  RETURN to_char(d,'YYYY-MM-DD')=p;
END; $$;
REVOKE ALL ON FUNCTION public.citation_native_is_civil_date(text) FROM PUBLIC,anon,authenticated,service_role;

-- A genuine Bing whole-event count lexeme (mirrors native-bing-ai-csv.isBingCountLexeme): a nonnegative run
-- of decimal digits whose value is a JS safe integer and round-trips to the same digits (no leading zeros,
-- no fraction/sign/scientific/comma, <= 2^53-1). Only Bing value-bearing count cells are constrained;
-- Google keeps its shared numeric semantics (fractions allowed).
CREATE FUNCTION public.citation_native_is_bing_count_lexeme(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t text; n numeric;
BEGIN
  IF p IS NULL THEN RETURN false; END IF;
  t := public.citation_native_js_trim(p);
  IF t !~ '^\d+$' THEN RETURN false; END IF;
  n := t::numeric;
  IF n > 9007199254740991 THEN RETURN false; END IF;       -- past JS MAX_SAFE_INTEGER
  RETURN n::bigint::text = t;                               -- round-trips (rejects leading zeros)
END; $$;
REVOKE ALL ON FUNCTION public.citation_native_is_bing_count_lexeme(text) FROM PUBLIC,anon,authenticated,service_role;

-- JS Number() of a PG-parseable numeric lexeme as the SAME finite IEEE-754 double the strict reader/parser
-- use (R3-V-01). The stored contract numbers are JS `Number`s (finite float64), NOT arbitrary-precision: a
-- raw like `12.50000000000000001` and its parsed value `12.5` are EQUAL under Number, `9007199254740993`
-- rounds to `...992`, and a tiny subnormal survives — so comparing with PG `numeric` both wrongly REJECTS
-- those genuine parser outputs and wrongly ACCEPTS a JSON number that JS reads as Infinity (overflow) or 0
-- (underflow). This mirrors Number exactly: a `::float8` cast rounds to the nearest double (subnormals
-- included) and raises 22003 only on overflow-to-inf or underflow-to-zero; we map those to +Infinity / 0 by
-- magnitude (the input is nonnegative-or-signed numeric text, so `::numeric` never raises). NULL only for a
-- NULL/non-numeric input. Never raises.
CREATE FUNCTION public.citation_native_js_number(p text)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d double precision;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  BEGIN
    d := p::double precision;                                 -- nearest double (gradual underflow kept)
  EXCEPTION
    WHEN numeric_value_out_of_range THEN
      BEGIN
        -- overflow (|x|>=1) -> JS Infinity; underflow-to-zero (|x|<1) -> JS 0.
        IF abs(p::numeric) >= 1 THEN RETURN 'Infinity'::double precision; ELSE RETURN 0::double precision; END IF;
      EXCEPTION WHEN others THEN RETURN NULL; END;
    WHEN others THEN RETURN NULL;
  END;
  RETURN d;
END; $$;
REVOKE ALL ON FUNCTION public.citation_native_js_number(text) FROM PUBLIC,anon,authenticated,service_role;

-- Central NULL-SAFE validation of a COMPLETE supported stored parsed interpretation (NS01/R1-01). A genuine
-- record persisted via save_ai_native_report_parsed already passed nativeReportParsedRecordSchema; this
-- re-asserts the WHOLE contract in SQL so a malformed/forged/corrupted stored row fails CLOSED at every
-- binding/inspectability/consent/review boundary. It mirrors nativeReportParsedRecordSchema +
-- nativeReportImportInputSchema + nativeCellSchema + the Google/Bing descriptors: presence/type/strict
-- key-set/bounds are checked BEFORE any comparison or cast (IS DISTINCT FROM, so a missing key fails
-- closed); source/file/parser pair + descriptor; civil-date period ordered with the source timezone; market
-- scope/filters per source; required metadata/timestamps; note/row-key/cell bounds; the exact metric key
-- set per file; each cell's status/unit and value↔status relationship (non-negative, percent<=100, Bing
-- whole-count lexeme); and complete Bing-overview day coverage. Positive Google (4 files) + Bing (2 files) +
-- unknown/partial controls pass; an all-UNKNOWN retained report is valid material. Defensive only — never
-- raises raw SQL on a malformed field (casts are guarded).
CREATE FUNCTION public.citation_native_parsed_supported(p_parsed jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE inp jsonb; art jsonb; period jsonb; mkt jsonb; src text; parser text; file text;
  exp_dim text; exp_rk text; exp_agg text; page_file text; is_bing boolean;
  pstart text; pend text; cap text; n integer; rw jsonb; k text; cl jsonb; cstatus text; cunit text;
  rawj jsonb; t text; stripped text; jsval double precision; vval double precision; wval double precision;
  isodt constant text := '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})$';
BEGIN
  -- STRICT key sets at every object level (mirrors the Zod `.strict()` objects): the record, its input, and
  -- the artifact/period/marketScope/row/cell sub-objects carry EXACTLY their contract keys — no missing
  -- required key, no extra/forged key. `filters` is REQUIRED here even though Zod defaults an omitted filters
  -- to {} (a parser-generated record always includes it); that stronger canonical-object requirement is
  -- deliberate, not a divergence.
  IF NOT public.citation_native_exact_keys(p_parsed, ARRAY['artifactId','artifactSha256','parserVersion','file','withheldPageRows','partial','limitationNote','input']) THEN RETURN false; END IF;
  inp := p_parsed->'input';
  IF NOT public.citation_native_exact_keys(inp, ARRAY['source','declaredProperty','reportKind','dimension','aggregation','period','marketScope','filters','completeness','capturedAt','artifact','rows']) THEN RETURN false; END IF;
  -- Top-level record identity.
  IF jsonb_typeof(p_parsed->'artifactId') IS DISTINCT FROM 'string' OR (p_parsed->>'artifactId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
  IF jsonb_typeof(p_parsed->'artifactSha256') IS DISTINCT FROM 'string' OR (p_parsed->>'artifactSha256') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  parser := p_parsed->>'parserVersion'; file := p_parsed->>'file'; src := inp->>'source';
  is_bing := (src='bing_ai_performance');
  IF is_bing THEN
    IF parser IS DISTINCT FROM 'native-bing-ai-csv-v1' THEN RETURN false; END IF;
    IF file='bing_overview' THEN exp_dim:='date'; exp_rk:='table'; exp_agg:='property';
    ELSIF file='bing_pages' THEN exp_dim:='page'; exp_rk:='table'; exp_agg:='page';
    ELSE RETURN false; END IF;
    page_file:='bing_pages';
  ELSIF src='gsc_generative_ai_search' THEN
    IF parser IS DISTINCT FROM 'native-google-ai-csv-v1' THEN RETURN false; END IF;
    IF file='chart' THEN exp_dim:='date'; exp_rk:='chart'; exp_agg:='property';
    ELSIF file='pages' THEN exp_dim:='page'; exp_rk:='table'; exp_agg:='page';
    ELSIF file='countries' THEN exp_dim:='country'; exp_rk:='table'; exp_agg:='property';
    ELSIF file='devices' THEN exp_dim:='device'; exp_rk:='table'; exp_agg:='property';
    ELSE RETURN false; END IF;
    page_file:='pages';
  ELSE
    RETURN false;                                           -- unsupported/missing/mistyped source
  END IF;
  -- artifactSha256 == input.artifact.sha256 (self-consistency).
  IF (p_parsed->>'artifactSha256') IS DISTINCT FROM (inp#>>'{artifact,sha256}') THEN RETURN false; END IF;
  -- Descriptor must match the file (IS DISTINCT FROM: a missing/null/mistyped field fails closed).
  IF (inp->>'dimension') IS DISTINCT FROM exp_dim OR (inp->>'reportKind') IS DISTINCT FROM exp_rk
     OR (inp->>'aggregation') IS DISTINCT FROM exp_agg THEN RETURN false; END IF;
  -- withheldPageRows: a FINITE (JS Number) nonnegative integer (z.number().int().min(0), NO upper bound) —
  -- interpreted as the finite double the reader uses, so a JSON number JS reads as Infinity (e.g. 1e400) is
  -- refused rather than silently treated as a huge integer. partial boolean; only the page file may withhold;
  -- partial <=> >0.
  IF jsonb_typeof(p_parsed->'withheldPageRows') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  wval := public.citation_native_js_number(p_parsed->>'withheldPageRows');
  IF wval IS NULL OR wval = 'Infinity'::double precision OR wval < 0 OR wval <> trunc(wval) THEN RETURN false; END IF;
  IF jsonb_typeof(p_parsed->'partial') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
  IF file <> page_file AND wval <> 0 THEN RETURN false; END IF;
  IF (p_parsed->>'partial')::boolean <> (wval > 0) THEN RETURN false; END IF;
  -- limitationNote: string within the UTF-16 (JS String.length) bound the Zod `.max(2000)` uses.
  IF jsonb_typeof(p_parsed->'limitationNote') IS DISTINCT FROM 'string' OR public.native_artifact_utf16_length(p_parsed->>'limitationNote') > 2000 THEN RETURN false; END IF;
  -- declaredProperty: JS-trimmed, then 1..500 UTF-16 units (Zod `.trim().min(1).max(500)`); completeness
  -- enum (null-safe); capturedAt an offset-aware ISO-8601 instant with the EXACT grammar the reader enforces
  -- (hour 00-23, minute/second 00-59, colon offset) so PG's lenient cast cannot normalize 24:00:00 / :60.
  IF jsonb_typeof(inp->'declaredProperty') IS DISTINCT FROM 'string'
     OR public.native_artifact_utf16_length(public.citation_native_js_trim(inp->>'declaredProperty')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
  IF jsonb_typeof(inp->'completeness') IS DISTINCT FROM 'string'
     OR (inp->>'completeness') NOT IN ('complete','preliminary','partial','unknown') THEN RETURN false; END IF;
  cap := inp->>'capturedAt';
  IF cap IS NULL OR cap !~ isodt THEN RETURN false; END IF;
  BEGIN PERFORM cap::timestamptz; EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format OR invalid_time_zone_displacement_value THEN RETURN false; END;
  -- artifact {sha256, bytes 1..2MiB integer, filename string<=255 UTF-16 units or null}.
  art := inp->'artifact';
  IF NOT public.citation_native_exact_keys(art, ARRAY['sha256','bytes','filename']) THEN RETURN false; END IF;
  IF jsonb_typeof(art->'sha256') IS DISTINCT FROM 'string' OR (art->>'sha256') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  IF jsonb_typeof(art->'bytes') IS DISTINCT FROM 'number' OR (art->>'bytes')::numeric < 1 OR (art->>'bytes')::numeric > 2097152
     OR (art->>'bytes')::numeric <> trunc((art->>'bytes')::numeric) THEN RETURN false; END IF;
  IF NOT (jsonb_typeof(art->'filename')='null' OR (jsonb_typeof(art->'filename')='string' AND public.native_artifact_utf16_length(art->>'filename')<=255)) THEN RETURN false; END IF;
  -- period: two civil dates, ordered; timezone is the exact source contract (GSC Pacific, Bing null).
  period := inp->'period';
  IF NOT public.citation_native_exact_keys(period, ARRAY['start','end','timezone']) THEN RETURN false; END IF;
  pstart := period->>'start'; pend := period->>'end';
  IF NOT public.citation_native_is_civil_date(pstart) OR NOT public.citation_native_is_civil_date(pend) OR pstart > pend THEN RETURN false; END IF;
  IF is_bing THEN
    IF jsonb_typeof(period->'timezone') IS DISTINCT FROM 'null' THEN RETURN false; END IF;
  ELSIF (period->>'timezone') IS DISTINCT FROM 'America/Los_Angeles' THEN
    RETURN false;
  END IF;
  -- marketScope {country alpha-3|null, exposed bool, country=>exposed}; filters a flat string map (key<=64,
  -- value<=200 UTF-16 units) with NO lower key bound (Zod `z.record(z.string().max(64), z.string().max(200))`).
  -- Bing exposes neither a geographic scope nor a filter.
  mkt := inp->'marketScope';
  IF NOT public.citation_native_exact_keys(mkt, ARRAY['country','exposed']) THEN RETURN false; END IF;
  IF jsonb_typeof(mkt->'exposed') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
  IF NOT (jsonb_typeof(mkt->'country')='null' OR (jsonb_typeof(mkt->'country')='string' AND (mkt->>'country') ~ '^[A-Za-z]{3}$')) THEN RETURN false; END IF;
  IF jsonb_typeof(mkt->'country') IS DISTINCT FROM 'null' AND (mkt->>'exposed')::boolean = false THEN RETURN false; END IF;
  IF jsonb_typeof(inp->'filters') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(inp->'filters') f
       WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string'
          OR public.native_artifact_utf16_length(f.key) > 64
          OR public.native_artifact_utf16_length(f.value #>> '{}') > 200) THEN RETURN false; END IF;
  IF is_bing THEN
    IF jsonb_typeof(mkt->'country') IS DISTINCT FROM 'null' OR (mkt->>'exposed')::boolean <> false THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(inp->'filters')) <> 0 THEN RETURN false; END IF;
  END IF;
  -- rows: 1..5000 non-empty array.
  IF jsonb_typeof(inp->'rows') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(inp->'rows');
  IF n < 1 OR n > 5000 THEN RETURN false; END IF;
  FOR rw IN SELECT jsonb_array_elements(inp->'rows') LOOP
    IF NOT public.citation_native_exact_keys(rw, ARRAY['key','cells']) THEN RETURN false; END IF;
    IF jsonb_typeof(rw->'key') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    k := rw->>'key';
    IF public.native_artifact_utf16_length(k) NOT BETWEEN 1 AND 2048 OR jsonb_typeof(rw->'cells') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    -- Exact metric key set per file; Bing overview rows are keyed by a real in-period calendar date.
    IF is_bing AND file='bing_overview' THEN
      IF NOT ((rw->'cells' ? 'citations') AND (rw->'cells' ? 'cited_pages') AND (SELECT count(*) FROM jsonb_object_keys(rw->'cells'))=2) THEN RETURN false; END IF;
      IF NOT public.citation_native_is_civil_date(k) OR k < pstart OR k > pend THEN RETURN false; END IF;
    ELSIF is_bing THEN
      IF NOT ((rw->'cells' ? 'citations') AND (SELECT count(*) FROM jsonb_object_keys(rw->'cells'))=1) THEN RETURN false; END IF;
    ELSE
      IF NOT ((rw->'cells' ? 'impressions') AND (SELECT count(*) FROM jsonb_object_keys(rw->'cells'))=1) THEN RETURN false; END IF;
    END IF;
    FOR cl IN SELECT value FROM jsonb_each(rw->'cells') LOOP
      -- A cell is EXACTLY {raw,value,status,unit}: the import contract bans a `review` receipt (so a
      -- `known_zero`, which would require one, can never be a stored cell) and any extra/forged key.
      IF NOT public.citation_native_exact_keys(cl, ARRAY['raw','value','status','unit']) THEN RETURN false; END IF;
      IF jsonb_typeof(cl->'status') IS DISTINCT FROM 'string'
         OR (cl->>'status') NOT IN ('known_value','known_zero','unknown_source','unknown_export_zero','unavailable','preliminary','invalid') THEN RETURN false; END IF;
      IF jsonb_typeof(cl->'unit') IS DISTINCT FROM 'string' OR (cl->>'unit') NOT IN ('count','percent') THEN RETURN false; END IF;
      cstatus := cl->>'status'; cunit := cl->>'unit'; rawj := cl->'raw';
      -- raw: null or a UTF-16-bounded string (the Zod `.max(MAX_NATIVE_CELL_CHARS)` cap).
      IF NOT (jsonb_typeof(rawj)='null' OR (jsonb_typeof(rawj)='string' AND public.native_artifact_utf16_length(cl->>'raw')<=2048)) THEN RETURN false; END IF;
      IF NOT (jsonb_typeof(cl->'value')='null' OR jsonb_typeof(cl->'value')='number') THEN RETURN false; END IF;
      -- Every Bing measure is a whole-event COUNT; a percent (or any non-count) Bing cell is never observed.
      IF is_bing AND cunit IS DISTINCT FROM 'count' THEN RETURN false; END IF;
      IF cstatus='known_zero' THEN RETURN false; END IF;
      IF cstatus IN ('unknown_source','unavailable','invalid') THEN
        -- Soft statuses: value null; raw text unconstrained (the shared schema does not pin it).
        IF jsonb_typeof(cl->'value') IS DISTINCT FROM 'null' THEN RETURN false; END IF;
      ELSIF cstatus='unknown_export_zero' THEN
        -- A bare exported zero: value null; a Bing count additionally requires a whole-integer lexeme raw.
        IF jsonb_typeof(cl->'value') IS DISTINCT FROM 'null' THEN RETURN false; END IF;
        IF is_bing AND NOT public.citation_native_is_bing_count_lexeme(cl->>'raw') THEN RETURN false; END IF;
      ELSE
        -- known_value / preliminary: the value MUST equal the deterministic interpretation of its raw export
        -- cell (interpretExportCell) — JS-trim, reject an unavailable marker, parse plain integer/decimal
        -- digits only (NO formula/scientific/grouping), percent<=100, and a bare zero reads as
        -- unknown_export_zero (never a known value). Bing additionally requires a whole-event integer lexeme;
        -- Google keeps the shared fractional-count semantics.
        IF jsonb_typeof(cl->'value') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
        IF jsonb_typeof(rawj) IS DISTINCT FROM 'string' THEN RETURN false; END IF;   -- a null raw reads as unavailable
        t := public.citation_native_js_trim(cl->>'raw');
        IF t IN ('~','-',E'\u2013',E'\u2014','') THEN RETURN false; END IF;  -- '~','-',en-dash,em-dash,'' unavailable markers
        stripped := CASE WHEN cunit='percent' THEN regexp_replace(t,'%$','') ELSE t END;
        IF stripped !~ '^\d+(\.\d+)?$' THEN RETURN false; END IF;
        -- interpretExportCell uses JS Number: parse the raw digits to the finite double, reject non-finite
        -- (overflow -> Infinity, i.e. parseNumber returns null), percent>100, and a value that rounds to 0
        -- (reads as unknown_export_zero, never a known value). The stored value must be the SAME finite double
        -- (JS === , so 12.50000000000000001 == 12.5 and a safe-integer-exceeding raw matches its rounded value),
        -- and must itself be finite (a JSON number the reader reads as Infinity is refused).
        jsval := public.citation_native_js_number(stripped);
        IF jsval IS NULL OR jsval = 'Infinity'::double precision THEN RETURN false; END IF;
        IF cunit='percent' AND jsval > 100 THEN RETURN false; END IF;
        IF jsval = 0 THEN RETURN false; END IF;
        vval := public.citation_native_js_number(cl->>'value');
        IF vval IS NULL OR vval = 'Infinity'::double precision OR vval IS DISTINCT FROM jsval THEN RETURN false; END IF;
        IF is_bing AND NOT public.citation_native_is_bing_count_lexeme(cl->>'raw') THEN RETURN false; END IF;
      END IF;
    END LOOP;
  END LOOP;
  -- A COMPLETE Bing overview claim must cover every calendar day of the inclusive period (bounded arithmetic).
  IF is_bing AND file='bing_overview' AND (inp->>'completeness')='complete'
     AND (SELECT count(DISTINCT (r->>'key')) FROM jsonb_array_elements(inp->'rows') r
            WHERE public.citation_native_is_civil_date(r->>'key') AND (r->>'key')>=pstart AND (r->>'key')<=pend)
         <> ((pend::date - pstart::date) + 1) THEN RETURN false; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_native_parsed_supported(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Whether ONE native evidence item independently resolves. It carries the full strict binding; the live
-- artifact exists, is parsed, is NOT tombstoned (ai_citation_native_erasures — a delete-and-recreate of the
-- same id never revives disclosure, NS06), and its stored parsed is a COMPLETE supported interpretation
-- (citation_native_parsed_supported); and every binding field matches the LIVE record exactly: the raw hash
-- (record + parsed input + the parsed's own artifactSha256), the artifactId, source, parserVersion, and the
-- central parsed digest == parsedSha256. Bare/legacy, unparsed, tombstoned, unsupported/malformed, or any
-- drift -> false (all NULL-safe via IS DISTINCT FROM). Internal.
CREATE FUNCTION public.citation_native_binding_resolves(p_user uuid,p_project text,p_ev jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb; art_sha text; prs jsonb; nid uuid;
BEGIN
  b := p_ev->'nativeBinding';
  IF b IS NULL OR jsonb_typeof(b)<>'object' THEN RETURN false; END IF;
  IF (p_ev->>'id') IS NULL OR (p_ev->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
  IF (b->>'rawSha256') IS NULL OR (b->>'rawSha256') !~ '^[a-f0-9]{64}$'
     OR (b->>'parsedSha256') IS NULL OR (b->>'parsedSha256') !~ '^[a-f0-9]{64}$'
     OR (b->>'source') IS NULL OR (b->>'parserVersion') IS NULL THEN RETURN false; END IF;
  nid := (p_ev->>'id')::uuid;
  -- Tombstoned native identity can never resolve again (NS06).
  IF EXISTS(SELECT 1 FROM public.ai_citation_native_erasures
       WHERE user_id=p_user AND project_id=p_project AND native_id=nid) THEN RETURN false; END IF;
  SELECT artifact_sha256,parsed INTO art_sha,prs FROM public.ai_native_report_artifacts
    WHERE user_id=p_user AND project_id=p_project AND id=nid;
  IF art_sha IS NULL OR prs IS NULL THEN RETURN false; END IF;              -- missing or unparsed
  IF NOT public.citation_native_parsed_supported(prs) THEN RETURN false; END IF;
  -- Artifact identity: the parsed record's own identity must match THIS live artifact.
  IF lower(prs->>'artifactId') IS DISTINCT FROM lower(p_ev->>'id') THEN RETURN false; END IF;
  IF (prs->>'artifactSha256') IS DISTINCT FROM art_sha THEN RETURN false; END IF;
  IF (prs#>>'{input,artifact,sha256}') IS DISTINCT FROM art_sha THEN RETURN false; END IF;
  -- Binding fields match the live record.
  IF (b->>'rawSha256') IS DISTINCT FROM art_sha THEN RETURN false; END IF;
  IF (b->>'source') IS DISTINCT FROM (prs#>>'{input,source}') THEN RETURN false; END IF;
  IF (b->>'parserVersion') IS DISTINCT FROM (prs->>'parserVersion') THEN RETURN false; END IF;
  IF (b->>'parsedSha256') IS DISTINCT FROM public.citation_native_parsed_digest(prs) THEN RETURN false; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.citation_native_binding_resolves(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- NEW narrow OWNER read supplying the AUTHORITATIVE binding the owner embeds into a NEW finding version.
-- Returns ONLY identity + binding (no rows, no bytes, no base64); SEPARATE from the frozen 5-key
-- read_ai_native_report_parsed (whose response shape is unchanged for deployment compatibility). An
-- unparsed artifact yields binding:null, so a later parse never silently authorizes anything.
CREATE FUNCTION public.read_ai_native_report_binding(p_user uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE art_sha text; prs jsonb; cand jsonb;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid_native_parsed' USING ERRCODE='22023'; END IF;
  SELECT artifact_sha256,parsed INTO art_sha,prs FROM public.ai_native_report_artifacts
    WHERE user_id=p_user AND project_id=p_project AND id=p_id;
  IF art_sha IS NULL THEN RAISE EXCEPTION 'native_parsed_unavailable' USING ERRCODE='22023'; END IF;
  IF prs IS NULL THEN
    RETURN jsonb_build_object('id',p_id,'available',true,'parseState','unparsed','binding',NULL);
  END IF;
  -- R1-02: construct the candidate binding, then resolve it through the SAME full resolver (supported +
  -- tombstone + artifactId/artifactSha256/input.sha256 vs the live row + source/parser + digest). A binding
  -- is emitted ONLY if it resolves; otherwise parseState 'parsed' with binding:null (parsed-but-unbindable:
  -- unsupported/corrupt/tombstoned or an artifact-identity contradiction). parseState/binding stay coherent.
  cand := jsonb_build_object('rawSha256',art_sha,'source',prs#>>'{input,source}',
    'parserVersion',prs->>'parserVersion','parsedSha256',public.citation_native_parsed_digest(prs));
  IF NOT public.citation_native_binding_resolves(p_user,p_project,
        jsonb_build_object('kind','native','id',p_id::text,'nativeBinding',cand)) THEN
    RETURN jsonb_build_object('id',p_id,'available',true,'parseState','parsed','binding',NULL);
  END IF;
  RETURN jsonb_build_object('id',p_id,'available',true,'parseState','parsed','binding',cand);
END; $$;
REVOKE ALL ON FUNCTION public.read_ai_native_report_binding(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_ai_native_report_binding(uuid,text,uuid) TO service_role;

-- Whether a finding cites ANY native evidence (bound OR bare). Drives "which findings require native
-- consent at the reviewer surfaces" — legacy/unbound native-bearing findings are gated too.
CREATE FUNCTION public.citation_finding_is_native_bearing(p_user uuid,p_project text,p_finding uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.ai_citation_findings f,
      jsonb_array_elements(CASE WHEN jsonb_typeof(f.record->'evidence')='array' THEN f.record->'evidence' ELSE '[]'::jsonb END) e
    WHERE f.user_id=p_user AND f.project_id=p_project AND f.id=p_finding AND e->>'kind'='native');
$$;
REVOKE ALL ON FUNCTION public.citation_finding_is_native_bearing(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Canonical digest over a finding's ENTIRE cited BOUND native set: sorted `id:parsedSha256` of every
-- native item, each verified to RESOLVE live. Returns NULL when the finding cites NO native, or when ANY
-- native item is bare/unbound or does not resolve (an unconsentable set — the owner cannot consent to a
-- set that is not fully bound and present). Reused by the v2 grant and the consent check so they agree.
CREATE FUNCTION public.citation_review_native_set_digest(p_user uuid,p_project text,p_record jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb; items text[] := '{}'; has_native boolean := false;
BEGIN
  IF jsonb_typeof(p_record->'evidence')<>'array' THEN RETURN NULL; END IF;
  FOR e IN SELECT jsonb_array_elements(p_record->'evidence') LOOP
    IF e->>'kind'='native' THEN
      has_native := true;
      IF NOT public.citation_native_binding_resolves(p_user,p_project,e) THEN RETURN NULL; END IF;
      items := array_append(items, lower(e->>'id')||':'||(e->'nativeBinding'->>'parsedSha256'));
    END IF;
  END LOOP;
  IF NOT has_native THEN RETURN NULL; END IF;
  -- COLLATE "C" = bytewise ASCII order, matching the client helper's JS default sort over the restricted
  -- lower-hex/':' alphabet (citation-review-ui.nativeConsentSetString), so the owner's declared digest and
  -- this server digest agree deterministically regardless of the database's default collation.
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO items FROM unnest(items) x;
  RETURN encode(sha256(convert_to('native_review_set_v1'||array_to_string(items,'|'),'UTF8')),'hex');
END; $$;
REVOKE ALL ON FUNCTION public.citation_review_native_set_digest(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- LIVE native-material consent: an ACTIVE assignment to THIS reviewer whose recorded native consent
-- (native_scope='native_v1' + consented_set_sha256 + the accepted authority epoch) equals the finding's
-- CURRENT bound-set digest AND the reviewer's CURRENT live authority revisions. Fails closed when:
-- unassigned/revoked; no native consent (legacy 4-arg grant leaves it NULL); the finding is erased; the set
-- drifted / no longer resolves live (digest NULL); or the membership/policy authority that accepted the
-- consent changed (NS05) — a remove+restore or policy disable+restore bumps those revisions, so the old
-- consent no longer matches and an explicit new grant is required. Non-'native_v1' scope is not honoured.
CREATE FUNCTION public.citation_review_native_consented(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a_active boolean; a_revoked timestamptz; a_scope text; a_sha text; a_mrev bigint; a_prev bigint;
  frec jsonb; f_erased timestamptz; setd text; auth record;
BEGIN
  SELECT active,revoked_at,native_scope,consented_set_sha256,consented_membership_revision,consented_policy_revision
    INTO a_active,a_revoked,a_scope,a_sha,a_mrev,a_prev
    FROM public.ai_citation_review_assignments
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding AND reviewer_id=p_reviewer;
  IF NOT FOUND OR NOT a_active OR a_revoked IS NOT NULL OR a_scope IS DISTINCT FROM 'native_v1'
     OR a_sha IS NULL OR a_mrev IS NULL OR a_prev IS NULL THEN RETURN false; END IF;
  SELECT record,evidence_erased_at INTO frec,f_erased FROM public.ai_citation_findings
    WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF frec IS NULL OR f_erased IS NOT NULL THEN RETURN false; END IF;        -- erased finding: no native disclosure
  -- The CURRENT live authority epoch must equal the one that accepted the consent.
  SELECT * INTO auth FROM public.citation_review_authorized(p_reviewer,p_owner,p_project);
  IF NOT auth.allowed OR auth.membership_revision IS DISTINCT FROM a_mrev OR auth.policy_revision IS DISTINCT FROM a_prev THEN RETURN false; END IF;
  setd := public.citation_review_native_set_digest(p_owner,p_project,frec);
  RETURN setd IS NOT NULL AND setd = a_sha;
END; $$;
REVOKE ALL ON FUNCTION public.citation_review_native_consented(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- The reviewer-surface native gate: a non-native-bearing finding is unaffected; a native-bearing finding
-- (incl legacy/unbound) requires current full-set native consent. Added IN ADDITION to the existing
-- generic citation_review_assigned gate, never replacing it.
CREATE FUNCTION public.citation_review_native_gate_ok(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT public.citation_finding_is_native_bearing(p_owner,p_project,p_finding)
      OR public.citation_review_native_consented(p_owner,p_project,p_finding,p_reviewer);
$$;
REVOKE ALL ON FUNCTION public.citation_review_native_gate_ok(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- ======================================================================================================
-- NEW-FINDING SAVE authoritative binding check (NS02). A BEFORE INSERT trigger on ai_citation_findings
-- fires inside the existing save account-lock/transaction for EVERY insert path (v1 save, the v2
-- expected-head wrapper, any future path), so a new immutable finding can carry a native BINDING only when
-- it resolves against the current scoped live material (the central resolver: supported parsed, matching
-- artifact id/raw-hash/source/parser/digest, not tombstoned, present). A fabricated/stale/foreign/deleted/
-- tombstoned bound native is rejected and the whole statement rolls back. BARE legacy native refs (no
-- binding) are skipped — explicitly preserved on edit, never auto-promoted. The P3 idempotency path returns
-- BEFORE any INSERT, so an identical lost-ack retry never re-triggers; answer/source-only and non-native
-- findings iterate no native bindings and pass unchanged. Independent of the scope-binding trigger.
CREATE FUNCTION public.citation_findings_native_binding_enforce()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb;
BEGIN
  IF jsonb_typeof(NEW.record->'evidence')='array' THEN
    FOR e IN SELECT jsonb_array_elements(NEW.record->'evidence') LOOP
      IF e->>'kind'='native' AND (e->'nativeBinding') IS NOT NULL THEN
        IF NOT public.citation_native_binding_resolves(NEW.user_id,NEW.project_id,e) THEN
          RAISE EXCEPTION 'citation_native_binding_invalid' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.citation_findings_native_binding_enforce() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER citation_findings_native_binding BEFORE INSERT ON public.ai_citation_findings
  FOR EACH ROW EXECUTE FUNCTION public.citation_findings_native_binding_enforce();

-- ======================================================================================================
-- CREATE OR REPLACE of the actorless inspectability predicate: the ONLY behavioral change is the native
-- arm. A native item is now inspectable iff its binding resolves live (citation_native_binding_resolves);
-- a bare/legacy native still returns false, so legacy findings stay globally uninspectable and the
-- improvement gate cap is unchanged. Everything else (answer/source/accuracy/support completeness) is
-- byte-identical to 20260920200000.
CREATE OR REPLACE FUNCTION public.citation_finding_inspectable(p_user uuid,p_project text,p_record jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb; ref uuid; ra text; ratype text; ssrc jsonb; srev integer;
BEGIN
  IF jsonb_typeof(p_record->'evidence')<>'array' OR jsonb_array_length(p_record->'evidence')=0 THEN RETURN false; END IF;
  FOR e IN SELECT jsonb_array_elements(p_record->'evidence') LOOP
    IF (e->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
    ref := (e->>'id')::uuid;
    IF e->>'kind'='answer' THEN
      SELECT document->'input'->>'rawAnswer', jsonb_typeof(document->'input'->'rawAnswer') INTO ra,ratype
        FROM public.ai_answer_evidence WHERE user_id=p_user AND project_id=p_project AND id=ref;
      IF ratype IS DISTINCT FROM 'string' OR ra IS NULL OR btrim(ra, E' \t\n\r\f\v')='' OR char_length(ra) > 50000 THEN RETURN false; END IF;
    ELSIF e->>'kind'='source' THEN
      SELECT payload,revision INTO ssrc,srev FROM public.project_knowledge_sources
        WHERE user_id=p_user AND project_id=p_project AND id=ref;
      IF ssrc IS NULL OR (ssrc->>'status') IS DISTINCT FROM 'active' THEN RETURN false; END IF;
      IF NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p_record->'support')='array' THEN p_record->'support' ELSE '[]'::jsonb END) s
          JOIN public.project_knowledge_records r
            ON r.user_id=p_user AND r.project_id=p_project AND r.source_id=ref
           AND lower(s->'selectedRecord'->>'sourceId')=ref::text
           AND lower(s->'selectedRecord'->>'recordId')=r.id::text
           AND (s->'selectedRecord'->>'sourceRevision')=srev::text
           AND (r.payload->>'sourceRevision')=srev::text
           AND (s->'selectedRecord'->>'recordRevision')=r.revision::text
           AND public.citation_knowledge_selectable(ssrc,r.payload,now())
        WHERE s->>'status' <> 'not_checked') THEN
        RETURN false;
      END IF;
    ELSIF e->>'kind'='native' THEN
      -- NEW native arm: inspectable only when the binding resolves live; bare/legacy -> false (unchanged
      -- global uninspectability of legacy native findings and their improvement cap).
      IF NOT public.citation_native_binding_resolves(p_user,p_project,e) THEN RETURN false; END IF;
    ELSE
      RETURN false; -- unknown kind: never a completed independent inspection
    END IF;
  END LOOP;
  -- Support-completeness across EVERY assessed support entry (identical to 20260920200000).
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_record->'support')='array' THEN p_record->'support' ELSE '[]'::jsonb END) s
    WHERE s->>'status' <> 'not_checked'
      AND NOT EXISTS(
        SELECT 1 FROM public.project_knowledge_sources src
          JOIN public.project_knowledge_records r
            ON r.user_id=src.user_id AND r.project_id=src.project_id AND r.source_id=src.id
          WHERE src.user_id=p_user AND src.project_id=p_project
            AND lower(s->'selectedRecord'->>'sourceId')=src.id::text
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p_record->'evidence')='array' THEN p_record->'evidence' ELSE '[]'::jsonb END) ev
                WHERE ev->>'kind'='source' AND lower(ev->>'id')=src.id::text)
            AND lower(s->'selectedRecord'->>'recordId')=r.id::text
            AND (s->'selectedRecord'->>'sourceRevision')=src.revision::text
            AND (r.payload->>'sourceRevision')=src.revision::text
            AND (s->'selectedRecord'->>'recordRevision')=r.revision::text
            AND public.citation_knowledge_selectable(src.payload,r.payload,now()))
  ) THEN RETURN false; END IF;
  IF jsonb_typeof(p_record->'accuracy')='array' THEN
    FOR e IN SELECT jsonb_array_elements(p_record->'accuracy') LOOP
      IF (public.citation_accuracy_resolve(p_user,p_project,p_record,e))->>'resolution'
         NOT IN ('resolved','not_assessed') THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END; $$;

-- ======================================================================================================
-- CREATE OR REPLACE the 4-argument grant: a generic assignment grant/reactivation that ALWAYS CLEARS any
-- native consent (on both INSERT and the ON CONFLICT reactivation). Without this, calling the old 4-arg
-- grant after a v2 native grant+revoke would resurrect the stale native consent via the unchanged conflict
-- path. The old caller signature/behaviour is otherwise preserved (deployment compatibility). Body is
-- identical to 20260920200000 except the two consent-clearing columns.
CREATE OR REPLACE FUNCTION public.grant_ai_citation_review_assignment(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record;
BEGIN
  IF p_owner IS NULL OR p_project IS NULL OR p_finding IS NULL OR p_reviewer IS NULL OR p_owner=p_reviewer THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_reviewer);
  SELECT * INTO auth FROM public.citation_review_authorized(p_reviewer,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ai_citation_review_assignments(user_id,project_id,finding_row_id,reviewer_id,active,granted_at,revoked_at,native_scope,consented_set_sha256,consent_at,consented_membership_revision,consented_policy_revision)
    VALUES(p_owner,p_project,p_finding,p_reviewer,true,clock_timestamp(),NULL,NULL,NULL,NULL,NULL,NULL)
    ON CONFLICT(user_id,project_id,finding_row_id,reviewer_id)
    DO UPDATE SET active=true, revoked_at=NULL, native_scope=NULL, consented_set_sha256=NULL, consent_at=NULL,
      consented_membership_revision=NULL, consented_policy_revision=NULL;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'findingRowId',p_finding,'reviewerId',p_reviewer,'active',true);
END; $$;

-- NEW owner-only grant that records EXPLICIT native-material consent over the finding's ENTIRE cited set.
-- Same owner-authority model/locks/eligibility as the 4-arg grant, PLUS: the finding must be
-- native-bearing with every native item bound and resolving live, and the owner's declared full-set digest
-- (p_set_sha, from the narrow binding read composed client-side) must equal the server-computed set
-- digest — so consent can never cover unknown/future or unbound material. consent_at records the actual
-- acceptance time (not a stale granted_at). Idempotent reactivation refreshes scope/digest/consent_at.
CREATE FUNCTION public.grant_ai_citation_review_assignment_v2(p_owner uuid,p_project text,p_finding uuid,p_reviewer uuid,p_set_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record; frec jsonb; f_erased timestamptz; setd text;
BEGIN
  IF p_owner IS NULL OR p_project IS NULL OR p_finding IS NULL OR p_reviewer IS NULL OR p_owner=p_reviewer
     OR p_set_sha IS NULL OR p_set_sha !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_reviewer);
  SELECT * INTO auth FROM public.citation_review_authorized(p_reviewer,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  SELECT record,evidence_erased_at INTO frec,f_erased FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF frec IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  -- An erased finding never gains native consent (NS06).
  IF f_erased IS NOT NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  -- Refuse a native-material grant unless EVERY cited native resolves to supported current material, and
  -- the owner's declared set digest matches exactly (no consent to unbound/legacy or unknown material).
  setd := public.citation_review_native_set_digest(p_owner,p_project,frec);
  IF setd IS NULL OR setd IS DISTINCT FROM p_set_sha THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  -- Bind the EXACT live authority epoch (NS05): a later remove+restore / policy disable+restore bumps these
  -- revisions, invalidating this consent until an explicit new grant.
  INSERT INTO public.ai_citation_review_assignments(user_id,project_id,finding_row_id,reviewer_id,active,granted_at,revoked_at,native_scope,consented_set_sha256,consent_at,consented_membership_revision,consented_policy_revision)
    VALUES(p_owner,p_project,p_finding,p_reviewer,true,clock_timestamp(),NULL,'native_v1',setd,clock_timestamp(),auth.membership_revision,auth.policy_revision)
    ON CONFLICT(user_id,project_id,finding_row_id,reviewer_id)
    DO UPDATE SET active=true, revoked_at=NULL, native_scope='native_v1', consented_set_sha256=setd, consent_at=clock_timestamp(),
      consented_membership_revision=auth.membership_revision, consented_policy_revision=auth.policy_revision;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'findingRowId',p_finding,'reviewerId',p_reviewer,'active',true,'nativeScope','native_v1');
END; $$;
REVOKE ALL ON FUNCTION public.grant_ai_citation_review_assignment_v2(uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grant_ai_citation_review_assignment_v2(uuid,text,uuid,uuid,text) TO service_role;

-- ======================================================================================================
-- CREATE OR REPLACE the standalone receipts read: ADD the native gate for a non-owner reviewer (after the
-- existing finding-scoped assignment gate). A native-bearing finding (incl legacy) without current
-- full-set consent fails closed with the SAME citation_finding_unavailable — so notes/digests that could
-- quote native values are never served without consent. Body otherwise identical to 20260920200000.
CREATE OR REPLACE FUNCTION public.read_ai_citation_finding_reviews(p_actor uuid,p_owner uuid,p_project text,p_finding uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE auth record; reviews jsonb; total integer; active_dissent integer; active_approved integer; v_masked boolean;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_finding IS NULL THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project);
  PERFORM public.assert_project_team_account(p_owner);
  IF p_actor<>p_owner THEN
    PERFORM public.assert_project_team_account(p_actor);
    SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
    IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
    IF NOT public.citation_review_assigned(p_owner,p_project,p_finding,p_actor) THEN
      RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
    END IF;
    -- NEW native gate (finding native-review binding): a native-bearing finding needs current full-set
    -- consent before ANY receipt/note/digest is served to a reviewer; same unavailable error, no oracle.
    IF NOT public.citation_review_native_gate_ok(p_owner,p_project,p_finding,p_actor) THEN
      RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  v_masked := (p_actor<>p_owner AND public.citation_finding_review_digest_masked(p_owner,p_project,p_finding));
  SELECT count(*),
    count(*) FILTER (WHERE NOT withdrawn AND decision IN ('rejected','needs_changes') AND reviewer_id<>p_owner),
    count(*) FILTER (WHERE NOT withdrawn AND decision='approved' AND reviewer_id<>p_owner)
    INTO total,active_dissent,active_approved
    FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reviewerId',reviewer_id,'mine',reviewer_id=p_actor,
    'owner',reviewer_id=p_owner,'reviewerRole',reviewer_role,'decision',decision,'note',CASE WHEN v_masked THEN NULL ELSE note END,
    'inspectionComplete',inspection_complete,'withdrawn',withdrawn,'withdrawnAt',withdrawn_at,
    'findingVersion',finding_version,'recordSha256',CASE WHEN v_masked THEN NULL ELSE record_sha256 END,'createdAt',created_at)
    ORDER BY created_at DESC,id DESC),'[]'::jsonb)
    INTO reviews FROM (SELECT * FROM public.ai_citation_finding_reviews
      WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding ORDER BY created_at DESC,id DESC LIMIT 100) recent;
  RETURN jsonb_build_object('ownerId',p_owner,'projectId',p_project,'findingRowId',p_finding,'reviews',reviews,
    'reviewTotal',total,'reviewsTruncated',total>100,'activeDissent',active_dissent,'activeApproved',active_approved,
    'reviewStatus',public.citation_finding_review_status(p_owner,p_project,p_finding));
END; $$;

-- ======================================================================================================
-- CREATE OR REPLACE the review SAVE: ADD the native gate at BOTH the optimistic point (after the generic
-- assignment check, before any hash/idempotency) and the authoritative under-lock re-check (after the
-- locked assignment re-check), so a native-bearing finding without current full-set consent fails closed
-- with the SAME citation_finding_unavailable before any oracle/idempotent return, and a consent cleared
-- concurrently (old 4-arg grant / revoke) is caught under the owner lock. Body otherwise identical to
-- 20260920200000.
CREATE OR REPLACE FUNCTION public.save_ai_citation_finding_review(p_actor uuid,p_owner uuid,p_project text,p_finding uuid,p_expected_sha text,p_decision text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1500ms' AS $$
DECLARE auth record; f_sha text; f_id uuid; f_ver integer; f_reviewer uuid; frec jsonb; insp boolean; new_id uuid; f_erased timestamptz;
  existing public.ai_citation_finding_reviews%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_actor=p_owner OR p_finding IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected','needs_changes')
     OR p_expected_sha IS NULL OR p_expected_sha !~ '^[a-f0-9]{64}$'
     OR (p_note IS NOT NULL AND octet_length(p_note) NOT BETWEEN 1 AND 6000) THEN
    RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  IF NOT public.citation_review_assigned(p_owner,p_project,p_finding,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  -- NEW native gate (optimistic, lock-free), BEFORE the finding/hash/idempotency reads below: a
  -- native-bearing finding (incl legacy) needs current full-set consent, same unavailable error, no oracle.
  IF NOT public.citation_review_native_gate_ok(p_owner,p_project,p_finding,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  SELECT record_sha256,finding_id,version,reviewer_id,record,evidence_erased_at INTO f_sha,f_id,f_ver,f_reviewer,frec,f_erased
    FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF f_sha IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  IF public.citation_finding_review_digest_masked(p_owner,p_project,p_finding) THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  IF f_reviewer = p_actor THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  IF f_sha <> p_expected_sha THEN RAISE EXCEPTION 'citation_review_stale' USING ERRCODE='22023'; END IF;
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO existing FROM public.ai_citation_finding_reviews
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding AND reviewer_id=p_actor;
  IF existing.id IS NOT NULL AND NOT existing.withdrawn
     AND existing.record_sha256=p_expected_sha AND existing.decision=p_decision AND existing.note IS NOT DISTINCT FROM p_note THEN
    RETURN (SELECT jsonb_build_object('id',id,'findingRowId',finding_row_id,'findingId',finding_id,
      'findingVersion',finding_version,'recordSha256',record_sha256,'reviewerId',reviewer_id,
      'reviewerRole',reviewer_role,'decision',decision,'note',note,'inspectionComplete',inspection_complete,
      'withdrawn',withdrawn,'createdAt',created_at)
      FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND id=existing.id);
  END IF;
  PERFORM public.assert_knowledge_project(p_owner,p_project,true);
  PERFORM public.citation_lock_account(p_owner);
  PERFORM public.assert_project_team_account(p_owner);
  PERFORM public.assert_project_team_account(p_actor);
  SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
  IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  IF NOT public.citation_review_assigned(p_owner,p_project,p_finding,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  -- NEW native gate, AUTHORITATIVE under the owner lock: a concurrent revoke OR an old 4-arg grant that
  -- cleared native consent after the optimistic check is caught here, before the write.
  IF NOT public.citation_review_native_gate_ok(p_owner,p_project,p_finding,p_actor) THEN
    RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
  END IF;
  SELECT record_sha256,finding_id,version,reviewer_id,record,evidence_erased_at INTO f_sha,f_id,f_ver,f_reviewer,frec,f_erased
    FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_finding;
  IF f_sha IS NULL THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  IF public.citation_finding_review_digest_masked(p_owner,p_project,p_finding) THEN RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023'; END IF;
  IF f_reviewer = p_actor THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
  IF f_sha <> p_expected_sha THEN RAISE EXCEPTION 'citation_review_stale' USING ERRCODE='22023'; END IF;
  insp := public.citation_finding_inspectable(p_owner,p_project,frec);
  SELECT * INTO existing FROM public.ai_citation_finding_reviews
    WHERE user_id=p_owner AND project_id=p_project AND finding_row_id=p_finding AND reviewer_id=p_actor;
  IF existing.id IS NOT NULL THEN
    IF existing.withdrawn THEN
      UPDATE public.ai_citation_finding_reviews SET decision=p_decision,note=p_note,inspection_complete=insp,
        record_sha256=f_sha,finding_version=f_ver,reviewer_role=auth.member_role,policy_mode=auth.policy_mode,
        policy_revision=auth.policy_revision,membership_revision=auth.membership_revision,
        withdrawn=false,withdrawn_at=NULL,created_at=clock_timestamp()
        WHERE user_id=p_owner AND project_id=p_project AND id=existing.id;
      new_id := existing.id;
    ELSIF existing.record_sha256=p_expected_sha AND existing.decision=p_decision AND existing.note IS NOT DISTINCT FROM p_note THEN
      new_id := existing.id;
    ELSE
      RAISE EXCEPTION 'citation_review_conflict' USING ERRCODE='22023';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project)>=2000 THEN
      RAISE EXCEPTION 'citation_review_capacity' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.ai_citation_finding_reviews
      (user_id,project_id,finding_row_id,finding_id,finding_version,record_sha256,reviewer_id,reviewer_role,policy_mode,policy_revision,membership_revision,decision,note,inspection_complete)
      VALUES(p_owner,p_project,p_finding,f_id,f_ver,f_sha,p_actor,auth.member_role,auth.policy_mode,auth.policy_revision,auth.membership_revision,p_decision,p_note,insp)
      RETURNING id INTO new_id;
  END IF;
  RETURN (SELECT jsonb_build_object('id',id,'findingRowId',finding_row_id,'findingId',finding_id,
    'findingVersion',finding_version,'recordSha256',record_sha256,'reviewerId',reviewer_id,
    'reviewerRole',reviewer_role,'decision',decision,'note',note,'inspectionComplete',inspection_complete,
    'withdrawn',withdrawn,'createdAt',created_at)
    FROM public.ai_citation_finding_reviews WHERE user_id=p_owner AND project_id=p_project AND id=new_id);
END; $$;

-- ======================================================================================================
-- CREATE OR REPLACE the reviewer DETAIL wrapper (v2). The base read_ai_citation_finding_for_review is made
-- INTERNAL-ONLY below (REVOKEd from service_role) so there is NO ungated service-callable detail path
-- (NS03); it is called here as the owner/definer. R1-03: the SAME narrow account/authority/assignment
-- admission the base performs runs FIRST, then the native consent gate, and ONLY THEN the internal base read
-- that builds the protected record/hash/receipts — so an unauthorized/unassigned/absent target (or a
-- native-bearing finding without current full-set consent) raises the SAME authority/unavailable error with
-- NO native-existence oracle before admission (NS04). For a consented native-bearing finding, the FULL stored
-- parsed interpretation (the exact
-- NativeReportParsedRecord — artifact byte SIZE only, never raw bytes/base64) is served under
-- nativeMaterial. Material is NEVER injected onto a masked/erased base (record null / evidenceErased true,
-- NS06), so a deleted-and-recreated native cannot revive disclosure through the new field.
CREATE OR REPLACE FUNCTION public.read_ai_citation_finding_for_review_v2(p_actor uuid,p_owner uuid,p_project text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb; frec jsonb; e jsonb; b jsonb; prs jsonb; newev jsonb := '[]'::jsonb; auth record;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'citation_review_invalid' USING ERRCODE='22023'; END IF;
  -- R1-03: run the SAME narrow account/authority/assignment admission the base uses FIRST, then the native
  -- consent gate, and ONLY THEN the internal base read that builds the protected record/hash/receipts.
  -- Unauthorized/unassigned/absent targets raise the SAME authority/unavailable error BEFORE any material
  -- work, and a native-bearing finding (incl legacy/unbound) without current full-set consent is withheld —
  -- with no native-existence oracle. (The base re-checks these admissions idempotently; the owner branch is
  -- left to the base, which refuses the owner via citation_review_authorized exactly as before.)
  IF p_actor<>p_owner THEN
    PERFORM public.assert_knowledge_project(p_owner,p_project);
    PERFORM public.assert_project_team_account(p_owner);
    PERFORM public.assert_project_team_account(p_actor);
    SELECT * INTO auth FROM public.citation_review_authorized(p_actor,p_owner,p_project);
    IF NOT auth.allowed THEN RAISE EXCEPTION 'citation_review_forbidden' USING ERRCODE='22023'; END IF;
    IF NOT public.citation_review_assigned(p_owner,p_project,p_id,p_actor) THEN
      RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
    END IF;
    IF NOT public.citation_review_native_gate_ok(p_owner,p_project,p_id,p_actor) THEN
      RAISE EXCEPTION 'citation_finding_unavailable' USING ERRCODE='22023';
    END IF;
  END IF;
  base := public.read_ai_citation_finding_for_review(p_actor,p_owner,p_project,p_id);
  -- Only inject material when the base did NOT mask the record (erased/withheld bases carry record:null and
  -- evidenceErased:true and must never gain nativeMaterial).
  IF jsonb_typeof(base->'record')='object' AND coalesce((base->>'evidenceErased')::boolean,false)=false
     AND jsonb_typeof(base->'evidence')='array' THEN
    SELECT record INTO frec FROM public.ai_citation_findings WHERE user_id=p_owner AND project_id=p_project AND id=p_id;
    FOR e IN SELECT jsonb_array_elements(base->'evidence') LOOP
      IF e->>'kind'='native' THEN
        SELECT ev->'nativeBinding' INTO b FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(frec->'evidence')='array' THEN frec->'evidence' ELSE '[]'::jsonb END) ev
          WHERE ev->>'kind'='native' AND lower(ev->>'id')=lower(e->>'id') LIMIT 1;
        IF b IS NOT NULL AND public.citation_native_binding_resolves(p_owner,p_project,
              jsonb_build_object('kind','native','id',e->>'id','nativeBinding',b)) THEN
          SELECT parsed INTO prs FROM public.ai_native_report_artifacts
            WHERE user_id=p_owner AND project_id=p_project AND id=(e->>'id')::uuid;
          -- The exact stored NativeReportParsedRecord (reused by the strict TS nativeReportParsedRecordSchema
          -- on the read boundary). Partial source / unknown market+timezone / exported-zero uncertainty and
          -- all retained rows/statuses are preserved verbatim — a complete INSPECTION is not complete source
          -- coverage. Contains artifact byte SIZE metadata only; no raw file bytes/base64.
          newev := newev || jsonb_build_array(jsonb_build_object('kind','native','id',e->>'id','available',true,'inspectable',true,'nativeMaterial',prs));
        ELSE
          newev := newev || jsonb_build_array(e);
        END IF;
      ELSE
        newev := newev || jsonb_build_array(e);
      END IF;
    END LOOP;
    base := jsonb_set(base,'{evidence}',newev);
  END IF;
  RETURN base || jsonb_build_object('scopeEnforcedAt',(SELECT scope_enforced_at FROM public.ai_citation_findings
    WHERE user_id=p_owner AND project_id=p_project AND id=p_id));
END; $$;
-- Make the retained original detail RPC INTERNAL-ONLY (NS03): no service-callable ungated native path. It
-- stays callable by the SECURITY DEFINER owner (so v2 above can delegate) but not by service_role directly.
REVOKE EXECUTE ON FUNCTION public.read_ai_citation_finding_for_review(uuid,uuid,text,uuid) FROM service_role;
