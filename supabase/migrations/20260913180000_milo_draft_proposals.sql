-- Candidate. Requires conversation storage and the released team-edit pipeline.
-- Immutable actor-private metadata proposals. Only an explicit authenticated
-- apply may call the existing exact-version draft editor. Never publishes.
CREATE TABLE public.milo_draft_proposals (
  proposal_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.milo_conversations(conversation_id) ON DELETE CASCADE,
  turn_id uuid NOT NULL UNIQUE REFERENCES public.milo_conversation_turns(turn_id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  asset_collection text NOT NULL DEFAULT 'content' CHECK(asset_collection='content'),
  draft_hash text NOT NULL CHECK(draft_hash ~ '^[a-f0-9]{64}$'),
  membership_revision bigint NOT NULL CHECK(membership_revision BETWEEN 1 AND 9007199254740991),
  before_fields jsonb NOT NULL,
  patch jsonb NOT NULL,
  explanation text NOT NULL CHECK(length(btrim(explanation)) BETWEEN 1 AND 1500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz,
  after_hash text CHECK(after_hash ~ '^[a-f0-9]{64}$'),
  CHECK((applied_at IS NULL)=(after_hash IS NULL)),
  FOREIGN KEY(owner_id,asset_collection,asset_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.milo_draft_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milo_draft_proposals FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.retain_milo_draft_proposal(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_attempt uuid,p_proposal uuid,p_asset text,p_hash text,p_membership bigint,p_patch jsonb,p_explanation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; field text; before_fields jsonb:='{}'; previous public.milo_draft_proposals%ROWTYPE;
BEGIN
  IF p_proposal IS NULL OR p_asset IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR p_membership IS NULL OR p_membership<1 OR p_explanation IS NULL OR length(btrim(p_explanation)) NOT BETWEEN 1 AND 1500
    OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR octet_length(p_patch::text)>16000
    THEN RAISE EXCEPTION 'milo_proposal_invalid'; END IF;
  FOR field IN SELECT jsonb_object_keys(p_patch) LOOP
    IF field NOT IN ('title','h1','metaTitle','metaDescription') OR jsonb_typeof(p_patch->field)<>'string'
      OR length(p_patch->>field)>(CASE WHEN field='metaDescription' THEN 4000 ELSE 1000 END)
      OR (field='title' AND length(btrim(p_patch->>field))=0) THEN RAISE EXCEPTION 'milo_proposal_invalid'; END IF;
  END LOOP;
  -- Workspace first, then conversation/turn: same lock order as editing and cancellation.
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,p_asset,0,true);
  PERFORM public.check_milo_conversation_execution(p_actor,p_owner,p_project,p_conversation,p_turn,p_attempt);
  IF NOT(snapshot->>'canEdit')::boolean OR (snapshot->>'membershipRevision')::bigint<>p_membership
    THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  -- A model cannot manufacture its own operation receipt or specialist authority.
  IF NOT EXISTS(SELECT 1 FROM public.milo_conversation_turns t, jsonb_array_elements(t.events) e
    WHERE t.turn_id=p_turn AND e->>'kind'='tool' AND e->>'tool'='draft_metadata_proposal'
      AND e->>'code'='tool_started' AND e->>'state'='running' AND e->>'operationId'=p_proposal::text
      AND e->>'role' IN ('seo','content')) THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  SELECT * INTO previous FROM public.milo_draft_proposals WHERE proposal_id=p_proposal;
  IF FOUND THEN
    IF previous.actor_id=p_actor AND previous.owner_id=p_owner AND previous.project_id=p_project
      AND previous.conversation_id=p_conversation AND previous.turn_id=p_turn AND previous.asset_id=p_asset
      AND previous.draft_hash=p_hash AND previous.membership_revision=p_membership AND previous.patch=p_patch
      AND previous.explanation=p_explanation THEN RETURN previous.proposal_id; END IF;
    RAISE EXCEPTION 'milo_proposal_conflict';
  END IF;
  IF snapshot->>'draftHash' IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'milo_proposal_changed' USING ERRCODE='40001'; END IF;
  FOR field IN SELECT jsonb_object_keys(p_patch) LOOP
    before_fields:=before_fields||jsonb_build_object(field,snapshot->'draft'->field);
  END LOOP;
  IF before_fields=p_patch THEN RAISE EXCEPTION 'milo_proposal_unchanged'; END IF;
  INSERT INTO public.milo_draft_proposals(proposal_id,conversation_id,turn_id,actor_id,owner_id,project_id,asset_id,draft_hash,membership_revision,before_fields,patch,explanation)
    VALUES(p_proposal,p_conversation,p_turn,p_actor,p_owner,p_project,p_asset,p_hash,p_membership,before_fields,p_patch,p_explanation);
  RETURN p_proposal;
END; $$;

CREATE FUNCTION public.read_milo_draft_proposal(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_proposal uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal public.milo_draft_proposals%ROWTYPE; snapshot jsonb; turn_state text; turn_lease timestamptz; proposal_state text;
BEGIN
  PERFORM public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  SELECT * INTO proposal FROM public.milo_draft_proposals
    WHERE proposal_id=p_proposal AND conversation_id=p_conversation AND turn_id=p_turn
      AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,proposal.asset_id,0);
  SELECT state,lease_until INTO turn_state,turn_lease FROM public.milo_conversation_turns WHERE turn_id=p_turn AND conversation_id=p_conversation AND actor_id=p_actor;
  proposal_state:=CASE
    WHEN proposal.applied_at IS NOT NULL THEN 'applied'
    WHEN NOT(snapshot->>'canEdit')::boolean OR (snapshot->>'membershipRevision')::bigint<>proposal.membership_revision
      OR snapshot->>'draftHash' IS DISTINCT FROM proposal.draft_hash
      OR proposal.created_at<=clock_timestamp()-interval '7 days' OR turn_state NOT IN ('running','completed')
      OR (turn_state='running' AND turn_lease<=clock_timestamp()) THEN 'unavailable'
    WHEN turn_state='completed' THEN 'ready' ELSE 'waiting' END;
  RETURN jsonb_build_object('proposalId',proposal.proposal_id,'conversationId',proposal.conversation_id,'turnId',proposal.turn_id,
    'actorId',proposal.actor_id,'ownerId',proposal.owner_id,'projectId',proposal.project_id,'assetId',proposal.asset_id,
    'explanation',proposal.explanation,'before',proposal.before_fields,'fields',proposal.patch,
    'state',proposal_state,'createdAt',proposal.created_at,'appliedAt',proposal.applied_at);
END; $$;

CREATE FUNCTION public.apply_milo_draft_proposal(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid,p_proposal uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal public.milo_draft_proposals%ROWTYPE; snapshot jsonb; turn_state text; saved_hash text;
BEGIN
  -- Acquire exclusive workspace lock before all subordinate locks; no share-lock upgrade.
  snapshot:=public.read_project_team_snapshot(p_actor,p_owner,p_project,NULL,0,true);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  SELECT state INTO turn_state FROM public.milo_conversation_turns WHERE turn_id=p_turn AND conversation_id=p_conversation AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  SELECT * INTO proposal FROM public.milo_draft_proposals
    WHERE proposal_id=p_proposal AND conversation_id=p_conversation AND turn_id=p_turn
      AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND OR NOT(snapshot->>'canEdit')::boolean OR (snapshot->>'membershipRevision')::bigint<>proposal.membership_revision
    THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  IF proposal.applied_at IS NOT NULL THEN
    RETURN public.read_milo_draft_proposal(p_actor,p_owner,p_project,p_conversation,p_turn,p_proposal);
  END IF;
  IF turn_state<>'completed' OR proposal.created_at<=clock_timestamp()-interval '7 days'
    THEN RAISE EXCEPTION 'milo_proposal_unavailable'; END IF;
  saved_hash:=public.save_project_team_draft(p_actor,p_owner,p_project,proposal.asset_id,proposal.proposal_id,
    proposal.draft_hash,proposal.membership_revision,proposal.patch);
  UPDATE public.milo_draft_proposals SET applied_at=clock_timestamp(),after_hash=saved_hash WHERE proposal_id=p_proposal;
  -- Append the user's save receipt in the same transaction as the edit. Later
  -- specialists must not mistake an applied proposal for a pending review.
  -- The existing event bounds remain enforced; a failed checkpoint rolls the
  -- entire edit back. An exact apply replay returns above without another event.
  UPDATE public.milo_conversation_turns SET events=events||jsonb_build_array(jsonb_build_object(
    'kind','tool','role','lead','tool','draft_metadata_proposal','code','tool_result','state','completed',
    'operationId',p_proposal::text,'reference',jsonb_build_object('kind','draft_proposal','id',p_proposal::text),
    'text',jsonb_build_object('action','user_applied_metadata','assetId',proposal.asset_id,'contentSaved',true,'publicationApproved',false,'draftHash',saved_hash)::text
  )),updated_at=clock_timestamp() WHERE turn_id=p_turn;
  UPDATE public.milo_conversations SET updated_at=clock_timestamp() WHERE conversation_id=p_conversation;
  RETURN public.read_milo_draft_proposal(p_actor,p_owner,p_project,p_conversation,p_turn,p_proposal);
END; $$;
REVOKE ALL ON FUNCTION public.retain_milo_draft_proposal(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text),public.read_milo_draft_proposal(uuid,uuid,text,uuid,uuid,uuid),public.apply_milo_draft_proposal(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retain_milo_draft_proposal(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text),public.read_milo_draft_proposal(uuid,uuid,text,uuid,uuid,uuid),public.apply_milo_draft_proposal(uuid,uuid,text,uuid,uuid,uuid) TO service_role;
