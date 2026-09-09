-- Preserve server-authored replay history through stale/ordinary browser saves.
-- The signed service-role caller may append receipts with the workspace mutation.
-- This does not prohibit the owner from deleting a project; receipts share its lifetime.
CREATE OR REPLACE FUNCTION public.preserve_mcp_project_receipts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE receipt_field text;
BEGIN
  IF NEW.collection <> 'projects' OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  FOREACH receipt_field IN ARRAY ARRAY['mcpProfileFillRequests', 'mcpOpportunityBatches', 'mcpImageRequests'] LOOP
    NEW.data := NEW.data - receipt_field;
    IF TG_OP = 'UPDATE' AND OLD.collection = 'projects' AND OLD.data ? receipt_field THEN
      NEW.data := jsonb_set(NEW.data, ARRAY[receipt_field], OLD.data -> receipt_field, true);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_mcp_project_receipts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_mcp_project_receipts() TO service_role;

-- Existing trigger uses this replaced function. No content, images or receipts are created.
