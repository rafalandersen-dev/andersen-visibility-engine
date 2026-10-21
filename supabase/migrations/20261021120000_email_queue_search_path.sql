-- Pin a fixed search_path on the four SECURITY DEFINER email queue wrappers
-- (21 October 2026).
--
-- Live metadata (pgmq 1.5.1) showed proconfig NULL for all four although
-- 20260628223554 pinned "public, pgmq". An unpinned SECURITY DEFINER function,
-- and the unpinned pgmq functions it calls, resolve names with the CALLER's
-- search_path: a caller schema placed ahead of pg_catalog can shadow functions
-- such as clock_timestamp() used inside pgmq.send/read, and the session temp
-- schema (searched first for relations unless listed) can shadow the
-- unqualified catalog relations pgmq reads for its extension bookkeeping.
--
-- "pg_catalog, pg_temp" excludes public and caller schemas and puts the catalog
-- before temp objects. Signatures and bodies are unchanged (ALTER FUNCTION
-- only); the bodies already qualify every pgmq call. A missing function makes
-- ALTER fail, so drift stops the migration instead of being skipped.

ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = pg_catalog, pg_temp;

-- Reassert least privilege: callable only by service_role (the queue worker).
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Rollback note: if a live pgmq build needs a name outside pg_catalog for one
-- wrapper, pin that wrapper only to an explicit list with temp last, e.g.
--   ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = pg_catalog, pgmq, pg_temp;
-- Never RESET the search_path (that restores caller control) and never grant
-- EXECUTE to anon or authenticated.
