-- Milo conversation diagnostics: record a confirmed unreadable model reply.
--
-- WHY: the coordinator's plan reply is now parsed by a bounded extractor plus the
-- strict plan schema. When that settled reply is not one readable plan, nothing
-- further is dispatched, so the turn is a CONFIRMED failure (`response_unreadable`),
-- not supplier uncertainty (`execution_unknown`). The user-facing event code needs no
-- SQL change (events are validated by the server schema). Only this service-only
-- receipt table constrains outcome codes, so without this migration that one
-- best-effort diagnostic insert would be refused and silently dropped; the turn's
-- own outcome would still be saved.
--
-- Additive and narrow: the existing outcome_code CHECK is replaced by the same list
-- plus one value. No row, column, grant, function, cron job or other constraint is
-- touched; existing rows already satisfy the wider check.
ALTER TABLE public.milo_conversation_diagnostics
  DROP CONSTRAINT milo_conversation_diagnostics_outcome_code_check;
ALTER TABLE public.milo_conversation_diagnostics
  ADD CONSTRAINT milo_conversation_diagnostics_outcome_code_check CHECK(outcome_code IN (
    'provider_unavailable','usage_limit','budget_unavailable','execution_unknown',
    'response_unreadable'));
