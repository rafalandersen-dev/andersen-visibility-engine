-- UNRELEASED. Scoped editor writes; no delegated approval or external action.
CREATE TABLE public.project_team_edits (
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  edit_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  before_hash text NOT NULL,
  after_hash text NOT NULL,
  patch_hash text NOT NULL,
  membership_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
  asset_collection text NOT NULL DEFAULT 'content' CHECK(asset_collection='content'),
  PRIMARY KEY(owner_id,edit_id),
  FOREIGN KEY(owner_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,asset_collection,asset_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.project_team_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_team_edits FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.save_project_team_draft(p_actor uuid,p_owner uuid,p_project text,p_asset text,p_edit uuid,p_hash text,p_membership bigint,p_patch jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; original jsonb; changed jsonb; next_hash text; patch_hash text; field text;
  previous public.project_team_edits%ROWTYPE;
BEGIN
  IF p_edit IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_membership IS NULL OR p_membership<1
    OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR octet_length(p_patch::text)>1500000
    THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
  FOR field IN SELECT jsonb_object_keys(p_patch) LOOP
    IF field NOT IN ('title','markdown','h1','metaTitle','metaDescription','cta','outline','faq') THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
    IF field IN ('title','markdown','h1','metaTitle','metaDescription','cta') THEN
      IF jsonb_typeof(p_patch->field)<>'string' OR length(p_patch->>field)>(CASE field WHEN 'markdown' THEN 1000000 WHEN 'cta' THEN 16000 WHEN 'metaDescription' THEN 4000 ELSE 1000 END)
        OR (field='title' AND length(btrim(p_patch->>field))=0) THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
    ELSIF field='outline' THEN
      IF jsonb_typeof(p_patch->field)<>'array' OR jsonb_array_length(p_patch->field)>100 THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_patch->field) v WHERE jsonb_typeof(v)<>'string' OR length(v#>>'{}')>1000) THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
    ELSIF field='faq' THEN
      IF jsonb_typeof(p_patch->field)<>'array' OR jsonb_array_length(p_patch->field)>100 THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_patch->field) v WHERE jsonb_typeof(v)<>'object' OR NOT(v ? 'q' AND v ? 'a') OR v-ARRAY['q','a']<>'{}'::jsonb OR jsonb_typeof(v->'q')<>'string' OR jsonb_typeof(v->'a')<>'string' OR length(v->>'q')>1000 OR length(v->>'a')>16000) THEN RAISE EXCEPTION 'team_edit_invalid'; END IF;
    END IF;
  END LOOP;
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0);
  IF p_asset IS NULL OR NOT(snapshot->>'canEdit')::boolean OR (snapshot->>'membershipRevision')::bigint<>p_membership THEN RAISE EXCEPTION 'team_edit_permission_changed'; END IF;
  patch_hash:=encode(sha256(convert_to(p_patch::text,'UTF8')),'hex');
  SELECT * INTO previous FROM public.project_team_edits WHERE owner_id=p_owner AND edit_id=p_edit;
  IF FOUND THEN
    IF previous.project_id=p_project AND previous.asset_id=p_asset AND previous.actor_id=p_actor AND previous.before_hash=p_hash AND previous.patch_hash=patch_hash AND previous.membership_revision=p_membership THEN RETURN previous.after_hash; END IF;
    RAISE EXCEPTION 'team_edit_replay';
  END IF;
  IF snapshot->>'draftHash' IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'team_draft_changed' USING ERRCODE='40001'; END IF;
  -- Lock existing queue rows before checking status: a runner cannot claim an
  -- already queued publication while this edit is being saved.
  PERFORM 1 FROM public.scheduled_publishes WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.scheduled_publishes WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset AND status='publishing') THEN RAISE EXCEPTION 'team_publication_in_flight'; END IF;
  IF (SELECT count(*) FROM public.project_team_edits WHERE owner_id=p_owner AND project_id=p_project)>=10000 THEN RAISE EXCEPTION 'team_edit_capacity'; END IF;
  SELECT data INTO original FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset AND data->>'projectId'=p_project;
  changed:=original || p_patch || jsonb_build_object('status','In Review','updatedAt',clock_timestamp());
  -- Hold queued work first so the existing mirror trigger preserves the hold.
  UPDATE public.scheduled_publishes SET status='review_required',updated_at=clock_timestamp()
    WHERE user_id=p_owner AND project_id=p_project AND asset_id=p_asset AND status='pending';
  UPDATE public.workspace_entities SET data=changed,updated_at=clock_timestamp() WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset;
  -- Existing content triggers withdraw exact publication/knowledge review.
  UPDATE public.workspace_meta SET rev=rev+1 WHERE user_id=p_owner;
  SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') INTO next_hash FROM public.workspace_entities WHERE user_id=p_owner AND collection='content' AND entity_id=p_asset;
  INSERT INTO public.project_team_edits(owner_id,project_id,asset_id,edit_id,actor_id,before_hash,after_hash,patch_hash,membership_revision)
    VALUES(p_owner,p_project,p_asset,p_edit,p_actor,p_hash,next_hash,patch_hash,p_membership);
  RETURN next_hash;
END; $$;
REVOKE ALL ON FUNCTION public.save_project_team_draft(uuid,uuid,text,text,uuid,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_team_draft(uuid,uuid,text,text,uuid,text,bigint,jsonb) TO service_role;
