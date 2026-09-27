-- Citation Intelligence — improvement authoring concurrency parity (27 September 2026). CANDIDATE, UNAPPLIED
-- until reviewed. Additive only: no table, column, policy or existing function changes.
--
-- Mirrors the released finding/fact expected-head guard (20260926190000 §4/§5) for improvement corrections,
-- inspections and removals now that improvements have an owner UI: `p_expected_version` + `p_expected_head` name
-- the head ROW of the logical improvement id the caller inspected (0/NULL + NULL for a brand-new improvement id).
-- Under the account lock: read the current head row (highest version; its immutable id), delegate to the
-- UNCHANGED v2 save (P3 semantics, scope-binding provenance stamp), then refuse a NEWLY minted version whose
-- pre-save head differed from the inspected (version, row id) — the RAISE aborts the statement, so the new row is
-- rolled back atomically and nothing is written. An idempotent return (version <= pre-save head: same digest
-- under the same dependency state) is never a conflict, so a lost-response retry of the identical frozen payload
-- resolves to the SAME row. The row id makes the check ABA-proof: remove_ai_citation_improvement deletes a head
-- row and the next correction reuses its number, so a numeric version alone is not a concurrency token.
--
-- Codex N1/R1: the released P3 save resolves each referenced finding to its CURRENT head row at write time. The
-- owner reviews a frozen payload against exact finding rows; if another tab mints a new finding version between
-- review and save, the write would silently pin the unreviewed head. `p_expected_findings` (a JSON array of the
-- finding ROW ids the owner reviewed; NULL for legacy callers) is compared, under the same lock and in the same
-- statement, with the row ids the v2 save actually bound for a NEWLY minted version: any difference raises
-- `citation_improvement_finding_stale` and the row is rolled back. Idempotent returns are exempt (nothing new was
-- pinned by a retry, but the rows are re-checked on idempotent returns too — see the N2/S1 note below), so an
-- identical lost-response retry with the same frozen rows still resolves to the same row. The check is
-- set-based (order and duplicates ignored) and applies equally to first saves, corrections and inspections.
CREATE FUNCTION public.save_ai_citation_improvement_v3(p_user uuid,p_project text,p_record jsonb,p_scope jsonb,p_binding jsonb,p_expected_version integer,p_expected_head uuid,p_expected_findings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE iid uuid; current_version integer := 0; current_head uuid; saved jsonb;
        expected uuid[] := NULL; actual uuid[]; e text;
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  PERFORM public.citation_lock_account(p_user);
  IF p_record IS NULL OR jsonb_typeof(p_record)<>'object'
     OR jsonb_typeof(p_record->'improvementId') IS DISTINCT FROM 'string'
     OR (p_record->>'improvementId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  IF p_expected_version IS NOT NULL AND (p_expected_version<0 OR p_expected_version>10000) THEN
    RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
  END IF;
  IF p_expected_findings IS NOT NULL THEN
    IF jsonb_typeof(p_expected_findings)<>'array' OR jsonb_array_length(p_expected_findings)>20 THEN
      RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
    END IF;
    expected := '{}'::uuid[];
    FOR e IN SELECT jsonb_array_elements_text(p_expected_findings) LOOP
      IF e !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'invalid_citation_improvement' USING ERRCODE='22023';
      END IF;
      expected := array_append(expected,e::uuid);
    END LOOP;
  END IF;
  iid := (p_record->>'improvementId')::uuid;
  SELECT id,version INTO current_head,current_version FROM public.ai_citation_improvements
    WHERE user_id=p_user AND project_id=p_project AND improvement_id=iid
    ORDER BY version DESC,created_at DESC,id DESC LIMIT 1;
  IF current_head IS NULL THEN current_version := 0; END IF;
  saved := public.save_ai_citation_improvement_v2(p_user,p_project,p_record,p_scope,p_binding);
  IF (saved->>'version')::integer > current_version THEN
    IF coalesce(p_expected_version,0) <> current_version OR p_expected_head IS DISTINCT FROM current_head THEN
      RAISE EXCEPTION 'citation_improvement_version_conflict' USING ERRCODE='40001';
    END IF;
  END IF;
  -- Codex N2/S1: the reviewed finding rows are part of the binding's semantic identity, so they are checked for
  -- BOTH a newly minted row and an idempotent return. The released digest covers the record text and the
  -- structured binding, not the resolved rows: after another finding version was accepted, the same frozen text
  -- resolves to a different row set and v2 returns the existing row bound to that newer set. The owner reviewed
  -- the earlier pin, so such a return is refused here rather than presented as a successful retry. A genuine
  -- lost-response retry carries the SAME frozen rows and still resolves to the same stored row; a new row that
  -- fails the check is rolled back by the RAISE. Legacy callers (NULL) keep the released resolution.
  IF expected IS NOT NULL THEN
    SELECT bound_finding_row_ids INTO actual FROM public.ai_citation_improvements
      WHERE user_id=p_user AND project_id=p_project AND id=(saved->>'id')::uuid;
    IF actual IS NULL OR NOT (actual <@ expected AND expected <@ actual) THEN
      RAISE EXCEPTION 'citation_improvement_finding_stale' USING ERRCODE='40001';
    END IF;
  END IF;
  RETURN saved;
END; $$;

-- Privileges exactly like the v2 wrappers: a service RPC (the server middleware supplies the authenticated
-- owner); never callable by anon/authenticated directly. The v1/v2 RPCs keep their grants.
REVOKE ALL ON FUNCTION public.save_ai_citation_improvement_v3(uuid,text,jsonb,jsonb,jsonb,integer,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_citation_improvement_v3(uuid,text,jsonb,jsonb,jsonb,integer,uuid,jsonb)
  TO service_role;

-- Codex N2/S3: human-readable approval provenance for the improvement author. The released improvement save
-- (20260920200000) rightly requires `change.approvedBy` to name the ACTUAL approver — the owner, or the delegate
-- reviewer recorded on the approval — and the released `read_publication_approval` exposes only a boolean, so the
-- owner would otherwise have to type an internal actor id. This owner-scoped read returns, for one exact asset
-- version, whether that version is CURRENTLY approved (the unchanged released predicate: delegate membership,
-- policy and account validity re-checked live) and, only when it is, who approved it and when. Nothing is
-- inferred from a hash or from roster membership: a revoked, superseded or differently versioned approval yields
-- approved=false and no approver. Owner-only (assert_knowledge_project), never callable by anon/authenticated.
CREATE FUNCTION public.read_publication_approval_provenance_v1(p_user uuid,p_project text,p_asset text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ok boolean; a record;
BEGIN
  ok := public.read_publication_approval(p_user,p_project,p_asset,p_hash);
  SELECT delegate_actor_id,updated_at,version_hash INTO a FROM public.publication_approvals
    WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset AND algorithm='milo-publication-v1';
  IF NOT ok OR a IS NULL OR a.version_hash IS DISTINCT FROM p_hash THEN
    RETURN jsonb_build_object('approved',false,'approverKind',NULL,'approverId',NULL,'approvedAt',NULL);
  END IF;
  RETURN jsonb_build_object(
    'approved',true,
    'approverKind',CASE WHEN a.delegate_actor_id IS NULL THEN 'owner' ELSE 'delegate' END,
    'approverId',coalesce(a.delegate_actor_id,p_user),
    'approvedAt',to_char(a.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END; $$;
REVOKE ALL ON FUNCTION public.read_publication_approval_provenance_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_publication_approval_provenance_v1(uuid,text,text,text) TO service_role;
