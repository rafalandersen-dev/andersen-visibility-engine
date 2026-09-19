-- Candidate only: apply after the conversation foundation. Both switches start
-- disabled. Enable only after the exact /api/milo/run runtime is verified.
-- pg_net owns each HTTP request after the submission transaction commits; no
-- browser connection, detached promise, or retry of an acquired AI attempt.
CREATE TABLE public.milo_conversation_dispatch_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.milo_conversation_dispatch_control DEFAULT VALUES;
CREATE TABLE public.milo_conversation_dispatch_attempts (
  request_id bigint PRIMARY KEY,
  actor_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX milo_dispatch_recent ON public.milo_conversation_dispatch_attempts(requested_at);
ALTER TABLE public.milo_conversation_dispatch_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milo_conversation_dispatch_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milo_conversation_dispatch_control,public.milo_conversation_dispatch_attempts FROM PUBLIC,anon,authenticated,service_role;
-- Existing pending tasks deliberately receive no start window. Only a new
-- submission or an explicit authenticated resume may authorize a fresh window.
ALTER TABLE public.milo_conversation_turns ADD COLUMN dispatch_until timestamptz;
ALTER TABLE public.milo_conversation_turns ALTER COLUMN dispatch_until SET DEFAULT (clock_timestamp()+interval '15 minutes');
ALTER TABLE public.milo_conversation_turns ADD COLUMN dispatch_last_at timestamptz;
CREATE INDEX milo_dispatch_pending ON public.milo_conversation_turns(dispatch_until,dispatch_last_at,created_at) WHERE state='pending';
CREATE INDEX milo_execution_capacity ON public.milo_conversation_turns(lease_until,actor_id) WHERE state='running';

CREATE FUNCTION public.enqueue_milo_conversation_turn(p_turn uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task record; current_turn public.milo_conversation_turns%ROWTYPE; current_revision bigint; credential text; request_id bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.milo_conversation_dispatch_control WHERE singleton AND enabled) THEN RETURN false; END IF;
  SELECT c.actor_id,c.owner_id,c.project_id,c.conversation_id INTO task
    FROM public.milo_conversation_turns t JOIN public.milo_conversations c USING(conversation_id) WHERE t.turn_id=p_turn;
  IF NOT FOUND THEN RETURN false; END IF;
  current_revision:=public.assert_milo_conversation_access(task.actor_id,task.owner_id,task.project_id);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=task.conversation_id FOR UPDATE NOWAIT;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE turn_id=p_turn FOR UPDATE NOWAIT;
  IF NOT FOUND OR current_turn.state<>'pending' OR current_turn.membership_revision<>current_revision
    OR current_turn.dispatch_until IS NULL OR current_turn.dispatch_until<=clock_timestamp()
    OR current_turn.dispatch_last_at>clock_timestamp()-interval '1 minute' THEN RETURN false; END IF;
  -- Nonblocking global admission serializes count+insert across actors. A busy
  -- enqueue stays pending for the next minute; it does not lose the saved task.
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-dispatch-capacity'),0) THEN RETURN false; END IF;
  DELETE FROM public.milo_conversation_dispatch_attempts WHERE requested_at<=clock_timestamp()-interval '1 hour';
  IF (SELECT count(*) FROM public.milo_conversation_dispatch_attempts WHERE requested_at>clock_timestamp()-interval '1 minute')>=20
    OR (SELECT count(*) FROM public.milo_conversation_dispatch_attempts WHERE actor_id=task.actor_id AND requested_at>clock_timestamp()-interval '1 minute')>=4 THEN RETURN false; END IF;
  SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='auto_scheduler_secret';
  IF credential IS NULL OR length(credential)=0 THEN RETURN false; END IF;
  request_id:=net.http_post(
    url:='https://milogrowth.com/api/milo/run',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
    body:=jsonb_build_object('actorId',task.actor_id,'ownerId',task.owner_id,'projectId',task.project_id,'conversationId',task.conversation_id,'turnId',p_turn),
    timeout_milliseconds:=290000
  );
  IF request_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.milo_conversation_dispatch_attempts(request_id,actor_id,turn_id) VALUES(request_id,task.actor_id,p_turn);
  UPDATE public.milo_conversation_turns SET dispatch_last_at=clock_timestamp() WHERE turn_id=p_turn;
  RETURN true;
END; $$;

CREATE FUNCTION public.trigger_milo_conversation_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.enqueue_milo_conversation_turn(NEW.turn_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Enqueue failure must not erase an accepted message or leak a vault/net error.
  -- The cron path may retry only if the turn has never been claimed.
  RETURN NEW;
END; $$;
CREATE TRIGGER milo_conversation_dispatch AFTER INSERT ON public.milo_conversation_turns FOR EACH ROW EXECUTE FUNCTION public.trigger_milo_conversation_dispatch();

CREATE FUNCTION public.resume_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE; current_revision bigint;
BEGIN
  current_revision:=public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE turn_id=p_turn AND conversation_id=p_conversation AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND OR current_turn.membership_revision<>current_revision THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF current_turn.state='pending' THEN
    UPDATE public.milo_conversation_turns SET dispatch_until=clock_timestamp()+interval '15 minutes' WHERE turn_id=p_turn RETURNING * INTO current_turn;
    BEGIN
      PERFORM public.enqueue_milo_conversation_turn(p_turn);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN public.milo_conversation_turn_view(current_turn);
END; $$;

CREATE FUNCTION public.dispatch_pending_milo_turns()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task record; dispatched integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.milo_conversation_dispatch_control WHERE singleton AND enabled) THEN RETURN 0; END IF;
  -- At most two per actor in each batch; expired/unavailable tasks cannot fill
  -- the queue indefinitely. Reauthorization still occurs for every enqueue.
  FOR task IN SELECT turn_id FROM (
    SELECT t.turn_id,t.created_at,row_number() OVER(PARTITION BY t.actor_id ORDER BY t.created_at,t.turn_id) position
    FROM public.milo_conversation_turns t JOIN public.milo_conversations c USING(conversation_id)
    JOIN auth.users a ON a.id=t.actor_id JOIN auth.users o ON o.id=c.owner_id
    WHERE t.state='pending' AND t.dispatch_until>clock_timestamp()
      AND (t.dispatch_last_at IS NULL OR t.dispatch_last_at<=clock_timestamp()-interval '1 minute')
      AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())
      AND o.deleted_at IS NULL AND (o.banned_until IS NULL OR o.banned_until<=clock_timestamp())
      AND (t.actor_id=c.owner_id OR EXISTS(SELECT 1 FROM public.project_team_members m WHERE m.actor_id=t.actor_id AND m.owner_id=c.owner_id AND m.project_id=c.project_id AND m.active AND m.revision=t.membership_revision AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())))
  ) candidates WHERE position<=2 ORDER BY position,created_at,turn_id LIMIT 20 LOOP
    BEGIN
      IF public.enqueue_milo_conversation_turn(task.turn_id) THEN dispatched:=dispatched+1; END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN dispatched;
END; $$;

-- Preserve the exact existing authority/attempt contract while adding global
-- and actor concurrency admission plus the bounded, release-gated start window.
CREATE OR REPLACE FUNCTION public.claim_milo_conversation_turn(p_actor uuid,p_owner uuid,p_project text,p_conversation uuid,p_turn uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_turn public.milo_conversation_turns%ROWTYPE; membership_revision bigint;
BEGIN
  membership_revision:=public.assert_milo_conversation_access(p_actor,p_owner,p_project);
  PERFORM 1 FROM public.milo_conversations WHERE conversation_id=p_conversation AND actor_id=p_actor AND owner_id=p_owner AND project_id=p_project FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  SELECT * INTO current_turn FROM public.milo_conversation_turns WHERE conversation_id=p_conversation AND turn_id=p_turn AND actor_id=p_actor FOR UPDATE NOWAIT;
  IF NOT FOUND OR current_turn.membership_revision<>membership_revision THEN RAISE EXCEPTION 'milo_conversation_unavailable'; END IF;
  IF current_turn.state<>'pending' OR current_turn.dispatch_until IS NULL OR current_turn.dispatch_until<=clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM public.milo_conversation_dispatch_control WHERE singleton AND enabled)
    THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  -- Separate statements are intentional: count with a fresh READ COMMITTED
  -- snapshot after acquiring admission, never from the lock expression's snapshot.
  IF NOT pg_try_advisory_xact_lock(hashtext('milo-execution-capacity'),0)
    THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  IF (SELECT count(*) FROM public.milo_conversation_turns WHERE state='running' AND lease_until>clock_timestamp())>=8
    OR (SELECT count(*) FROM public.milo_conversation_turns WHERE actor_id=p_actor AND state='running' AND lease_until>clock_timestamp())>=2
    THEN RETURN jsonb_build_object('acquired',false,'attemptId',NULL,'turn',public.milo_conversation_turn_view(current_turn)); END IF;
  UPDATE public.milo_conversation_turns SET state='running',attempt_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
    WHERE turn_id=p_turn RETURNING * INTO current_turn;
  RETURN jsonb_build_object('acquired',true,'attemptId',current_turn.attempt_id,'turn',public.milo_conversation_turn_view(current_turn));
END; $$;

REVOKE ALL ON FUNCTION public.enqueue_milo_conversation_turn(uuid),public.trigger_milo_conversation_dispatch(),public.dispatch_pending_milo_turns() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.resume_milo_conversation_turn(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resume_milo_conversation_turn(uuid,uuid,text,uuid,uuid) TO service_role;
DO $$
DECLARE job bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='milo-conversation-dispatch') THEN RAISE EXCEPTION 'milo_dispatch_already_exists'; END IF;
  job:=cron.schedule('milo-conversation-dispatch','* * * * *','SELECT public.dispatch_pending_milo_turns();');
  PERFORM cron.alter_job(job,active:=false);
END $$;
