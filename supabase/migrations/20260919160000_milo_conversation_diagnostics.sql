-- CANDIDATE ONLY — not part of the applied release set until integration applies it.
-- Service-only, bounded diagnostic receipts for Milo conversation-turn failures.
--
-- WHY: a failed turn currently persists a single sanitised `execution_unknown`
-- event with no indication of WHERE it stopped or WHY, so a real production
-- failure cannot be diagnosed. This table lets a failed turn record its execution
-- STAGE (a constrained enum) and a SAFE error class, correlated by turn/operation
-- id, so the next production failure is inspectable via the admin DB connector.
--
-- SAFETY: it NEVER stores message bodies, prompts, model output, tokens,
-- credentials, raw exception text/stacks, provider payloads or URLs, and it does
-- NOT store the owner/actor/project identity or any user content. Every column is
-- an opaque correlation id, a fixed enum, an allowlisted SQLSTATE, a validated
-- HTTP status or a timestamp — all safe to read directly.
--
-- ISOLATION/RETENTION/DELETION:
--   * Reads are service-only (SELECT granted to service_role; browser roles get
--     nothing, RLS enabled with no policy).
--   * Writes go only through the SECURITY DEFINER writer below; service_role has
--     no direct INSERT/UPDATE/DELETE on the table.
--   * At most ONE receipt per turn: `turn_id` is UNIQUE and the writer is
--     first-receipt-wins (`ON CONFLICT DO NOTHING`), so a concurrent or repeated
--     write can never overwrite the original failure's stage/time.
--   * Erasing a conversation/turn cascades (FK ON DELETE CASCADE), so a user erase
--     removes its diagnostics immediately.
--   * Ordinary retention is bounded to 30 days: a receipt older than 30 days is
--     removed by the service-only `prune_milo_conversation_diagnostics`, run DAILY
--     by the `milo-conversation-diagnostics-prune` cron below. Because the sweep
--     runs once a day absent a backlog a receipt is removed within the next daily
--     interval. Each run deletes a bounded batch; a backlog can extend retention
--     over further runs, so this is not a hard 31-day maximum. That maintenance is independent
--     of the conversation dispatcher: the prune cron stays active even while
--     `milo_conversation_dispatch_control` is disabled.
CREATE TABLE public.milo_conversation_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id uuid NOT NULL UNIQUE REFERENCES public.milo_conversation_turns(turn_id) ON DELETE CASCADE,
  operation_id uuid,
  stage text NOT NULL CHECK(stage IN (
    'assert_live','continuity_read','continuity_check','brief_start','brief_dispatch',
    'brief_result','plan_model','plan_parse','handoff_save','tool_start','tool_dispatch',
    'tool_result','reply_model','reply_save','unknown')),
  outcome text NOT NULL CHECK(outcome IN ('failed','unknown')),
  outcome_code text NOT NULL CHECK(outcome_code IN (
    'provider_unavailable','usage_limit','budget_unavailable','execution_unknown')),
  error_class text NOT NULL CHECK(error_class IN (
    'rate_limit','quota_billing','auth_rejected','model_unavailable','bad_request',
    'response_format','provider_server_error','network','timeout','malformed_credential','unknown')),
  name_category text NOT NULL CHECK(name_category IN (
    'AI_APICallError','AiSdkError','MiloAiError','TypeError','ReferenceError','SyntaxError',
    'RangeError','AbortError','TimeoutError','other','none')),
  http_status integer CHECK(http_status IS NULL OR (http_status BETWEEN 400 AND 599)),
  sql_state text CHECK(sql_state IS NULL OR sql_state IN ('55P03','40001','40P01','57014')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- `turn_id` is already UNIQUE (its implicit index serves per-turn inspection). The
-- recent index supports the retention sweep's created_at scan/order.
CREATE INDEX milo_conversation_diagnostics_recent ON public.milo_conversation_diagnostics(created_at,id);
ALTER TABLE public.milo_conversation_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milo_conversation_diagnostics FROM PUBLIC,anon,authenticated,service_role;
-- Direct read for inspection only (every column is non-sensitive); writes stay
-- function-only. No RLS policy is defined, so non-BYPASSRLS roles are denied.
GRANT SELECT ON public.milo_conversation_diagnostics TO service_role;

-- Bounded, service-only writer. Stores nothing beyond the constrained inputs; the
-- table CHECKs are the backstop for the fixed enums/allowlists. A missing turn is a
-- silent no-op: diagnostics never raise a new error path back to the executor.
-- First-receipt-wins: a turn that already has a receipt keeps its ORIGINAL stage,
-- SQLSTATE and time, so a duplicate or racing write is idempotent, never a rewrite.
CREATE FUNCTION public.record_milo_conversation_diagnostic(
  p_turn uuid,p_operation uuid,p_stage text,p_outcome text,p_outcome_code text,
  p_error_class text,p_name_category text,p_http_status integer,p_sql_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_turn IS NULL OR NOT EXISTS(SELECT 1 FROM public.milo_conversation_turns WHERE turn_id=p_turn) THEN RETURN; END IF;
  INSERT INTO public.milo_conversation_diagnostics(
    turn_id,operation_id,stage,outcome,outcome_code,error_class,name_category,http_status,sql_state)
  VALUES(p_turn,p_operation,p_stage,p_outcome,p_outcome_code,p_error_class,p_name_category,p_http_status,p_sql_state)
  ON CONFLICT (turn_id) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.record_milo_conversation_diagnostic(uuid,uuid,text,text,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_milo_conversation_diagnostic(uuid,uuid,text,text,text,text,text,integer,text) TO service_role;

-- Service-only retention prune. Erase cascades handle user deletion; this bounds
-- ordinary retention to 30 days. A single call removes at most `p_limit` of the
-- oldest expired receipts so one sweep can never fan out into an unbounded delete;
-- a rare backlog simply drains over subsequent daily runs. Returns the rows removed.
CREATE FUNCTION public.prune_milo_conversation_diagnostics(
  p_before timestamptz DEFAULT clock_timestamp()-interval '30 days',
  p_limit integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removed integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM public.milo_conversation_diagnostics
    WHERE created_at<p_before ORDER BY created_at LIMIT greatest(coalesce(p_limit,0),0)
  ), deleted AS (
    DELETE FROM public.milo_conversation_diagnostics d USING doomed WHERE d.id=doomed.id RETURNING 1
  )
  SELECT count(*)::int INTO removed FROM deleted;
  RETURN removed;
END; $$;
REVOKE ALL ON FUNCTION public.prune_milo_conversation_diagnostics(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_milo_conversation_diagnostics(timestamptz,integer) TO service_role;

-- Wire the actual daily maintenance using the existing pg_cron convention (see the
-- released dispatch migration). Unlike the dispatcher this job is ACTIVE on apply:
-- data retention must keep running even while conversation dispatch is disabled. It
-- alters no existing job and reads no dispatch control. The guard keeps re-apply
-- from stacking duplicate jobs.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='milo-conversation-diagnostics-prune') THEN
    RAISE EXCEPTION 'milo_diagnostics_prune_already_exists';
  END IF;
  PERFORM cron.schedule('milo-conversation-diagnostics-prune','23 4 * * *','SELECT public.prune_milo_conversation_diagnostics();');
END $$;
