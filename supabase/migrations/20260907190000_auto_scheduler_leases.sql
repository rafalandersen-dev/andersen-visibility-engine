-- Serialize paid monthly preparation per account/project. Expiry never grants a blind takeover.
CREATE TABLE public.auto_scheduler_leases (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 project_id text NOT NULL,
 planned_period text NOT NULL CHECK(planned_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 token uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL CHECK(status IN ('active','released','unknown')),
 acquired_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 finished_at timestamptz,
 PRIMARY KEY(user_id,project_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE
);
ALTER TABLE public.auto_scheduler_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auto_scheduler_leases FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.auto_scheduler_leases TO service_role;
CREATE FUNCTION public.claim_auto_scheduler_lease(p_user uuid,p_project text,p_period text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.auto_scheduler_leases%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF p_user IS NULL OR p_project IS NULL OR length(p_project) NOT BETWEEN 1 AND 200 OR p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'invalid_scheduler_lease'; END IF;
 INSERT INTO public.auto_scheduler_leases(user_id,project_id,planned_period,token,status) VALUES(p_user,p_project,p_period,v_token,'active') ON CONFLICT(user_id,project_id) DO NOTHING;
 SELECT * INTO v FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project FOR UPDATE;
 IF v.token=v_token THEN RETURN v_token; END IF;
 IF v.status='released' THEN
  UPDATE public.auto_scheduler_leases SET token=v_token,planned_period=p_period,status='active',acquired_at=now(),lease_until=now()+interval '15 minutes',finished_at=NULL WHERE user_id=p_user AND project_id=p_project;
  RETURN v_token;
 END IF;
 IF v.status='active' AND v.lease_until<=now() THEN UPDATE public.auto_scheduler_leases SET status='unknown' WHERE user_id=p_user AND project_id=p_project; END IF;
 RETURN NULL;
END; $$;
CREATE FUNCTION public.check_auto_scheduler_lease(p_user uuid,p_project text,p_token uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.auto_scheduler_leases WHERE user_id=p_user AND project_id=p_project AND token=p_token AND status='active' AND lease_until>now());
$$;
CREATE FUNCTION public.release_auto_scheduler_lease(p_user uuid,p_project text,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- A still-running original owner may confirm completion after expiry; a different token cannot.
 UPDATE public.auto_scheduler_leases SET status='released',finished_at=coalesce(finished_at,now())
 WHERE user_id=p_user AND project_id=p_project AND token=p_token AND status IN ('active','unknown','released');
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.claim_auto_scheduler_lease(uuid,text,text),public.check_auto_scheduler_lease(uuid,text,uuid),public.release_auto_scheduler_lease(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_scheduler_lease(uuid,text,text),public.check_auto_scheduler_lease(uuid,text,uuid),public.release_auto_scheduler_lease(uuid,text,uuid) TO service_role;
