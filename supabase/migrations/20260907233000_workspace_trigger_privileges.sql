-- Trigger functions are invoked by their installed triggers, not by browser RPCs.
-- Keep the existing function bodies, ownership and trigger bindings unchanged.
ALTER FUNCTION public.workspace_entities_project_cap() SET search_path = '';
ALTER FUNCTION public.tg_workspace_meta_updated_at() SET search_path = '';

REVOKE ALL ON FUNCTION public.workspace_entities_project_cap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_workspace_meta_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_entities_project_cap() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_workspace_meta_updated_at() TO service_role;
