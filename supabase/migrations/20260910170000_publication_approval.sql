-- P3 version-bound approval storage. No existing approval is inferred or migrated.
CREATE TABLE public.publication_approvals (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  asset_collection text NOT NULL DEFAULT 'content' CHECK(asset_collection='content'),
  algorithm text NOT NULL CHECK(algorithm='milo-publication-v1'),
  version_hash text NOT NULL CHECK(version_hash ~ '^[a-f0-9]{64}$'),
  approved boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,project_id,asset_id),
  FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,asset_collection,asset_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.publication_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_approvals FROM PUBLIC,anon,authenticated,service_role;

-- Only trusted server code derives p_hash from the saved workspace and compares
-- it with the version reviewed by the authenticated owner. The locked revision
-- closes the read/hash/write race; a stale acknowledgement cannot approve edits.
CREATE FUNCTION public.set_publication_approval(p_user uuid,p_project text,p_asset text,p_expected bigint,p_hash text,p_approved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project,true);
  IF p_expected IS NULL OR p_expected<0 OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user)
    THEN RAISE EXCEPTION 'publication_workspace_changed' USING ERRCODE='40001'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_approved IS NULL
    THEN RAISE EXCEPTION 'invalid_publication_approval' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    THEN RAISE EXCEPTION 'publication_asset_unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.publication_approvals WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset)
    AND (SELECT count(*) FROM public.publication_approvals WHERE user_id=p_user AND project_id=p_project)>=1000
    THEN RAISE EXCEPTION 'publication_approval_capacity'; END IF;
  INSERT INTO public.publication_approvals(user_id,project_id,asset_id,algorithm,version_hash,approved)
    VALUES(p_user,p_project,p_asset,'milo-publication-v1',p_hash,p_approved)
    ON CONFLICT(user_id,project_id,asset_id) DO UPDATE SET version_hash=p_hash,approved=p_approved,updated_at=clock_timestamp();
  RETURN true;
END; $$;
CREATE FUNCTION public.read_publication_approval(p_user uuid,p_project text,p_asset text,p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_knowledge_project(p_user,p_project);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project)
    THEN RAISE EXCEPTION 'publication_asset_unavailable' USING ERRCODE='42501'; END IF;
  RETURN EXISTS(SELECT 1 FROM public.publication_approvals WHERE user_id=p_user AND project_id=p_project AND asset_id=p_asset
    AND algorithm='milo-publication-v1' AND version_hash=p_hash AND approved);
END; $$;
REVOKE ALL ON FUNCTION public.set_publication_approval(uuid,text,text,bigint,text,boolean),public.read_publication_approval(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_publication_approval(uuid,text,text,bigint,text,boolean),public.read_publication_approval(uuid,text,text,text) TO service_role;
