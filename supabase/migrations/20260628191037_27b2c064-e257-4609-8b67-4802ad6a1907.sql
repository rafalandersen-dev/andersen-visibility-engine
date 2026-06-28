-- Server-side enforcement of project cap on workspaces.
-- Non-owner users may not persist a workspace JSON blob whose
-- projects array exceeds MAX_PROJECTS_PER_USER (5). Owners bypass.

CREATE OR REPLACE FUNCTION public.enforce_workspace_project_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_count int;
  max_allowed   int := 5;
BEGIN
  IF NEW.data IS NULL OR jsonb_typeof(NEW.data->'projects') IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  project_count := jsonb_array_length(NEW.data->'projects');

  IF public.has_role(NEW.user_id, 'owner') THEN
    RETURN NEW;
  END IF;

  IF project_count > max_allowed THEN
    RAISE EXCEPTION 'Project limit reached (%). Upgrade your plan to add more projects.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_workspace_project_cap_ins ON public.workspaces;
DROP TRIGGER IF EXISTS enforce_workspace_project_cap_upd ON public.workspaces;

CREATE TRIGGER enforce_workspace_project_cap_ins
BEFORE INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_project_cap();

CREATE TRIGGER enforce_workspace_project_cap_upd
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_project_cap();