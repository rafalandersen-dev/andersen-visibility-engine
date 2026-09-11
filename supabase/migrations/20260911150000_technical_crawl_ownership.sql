-- UNRELEASED. Durable DNS ownership lifecycle; no automatic DNS or crawl request.
ALTER TABLE public.technical_crawls ADD COLUMN admission_hold text CHECK(admission_hold IN ('capacity','ownership'));
ALTER TABLE public.technical_crawls ADD COLUMN resume_status text CHECK(resume_status IN ('preparing','running'));
ALTER TABLE public.technical_crawls ADD COLUMN retry_after timestamptz;
CREATE TABLE public.technical_crawl_ownership (
 user_id uuid NOT NULL,
 project_id text NOT NULL,
 project_collection text NOT NULL DEFAULT 'projects' CHECK(project_collection='projects'),
 website_value text NOT NULL CHECK(length(website_value) BETWEEN 1 AND 8192),
 origin text NOT NULL CHECK(origin ~ '^https?://[^/?#@[:space:]]+$' AND length(origin)<=8192),
 token text NOT NULL CHECK(token ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 verified_until timestamptz,
 revoked_at timestamptz,
 attempt_token uuid,
 attempt_until timestamptz,
 PRIMARY KEY(user_id,project_id),
 FOREIGN KEY(user_id,project_collection,project_id) REFERENCES public.workspace_entities(user_id,collection,entity_id) ON DELETE CASCADE,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '24 hours'),
 CHECK(verified_until IS NULL OR verified_until<=expires_at)
);
CREATE TABLE public.technical_ownership_limits (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 hour_start timestamptz NOT NULL,
 issue_count integer NOT NULL CHECK(issue_count BETWEEN 0 AND 20),
 verify_count integer NOT NULL CHECK(verify_count BETWEEN 0 AND 60),
 active_token uuid,
 active_until timestamptz
);
ALTER TABLE public.technical_crawl_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_ownership_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_crawl_ownership,public.technical_ownership_limits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_technical_crawl_ownership(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; proof public.technical_crawl_ownership%ROWTYPE;
BEGIN
 website:=public.read_technical_crawl_owner(p_user,p_project);
 SELECT * INTO proof FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project;
 IF NOT FOUND OR proof.website_value IS DISTINCT FROM website THEN RETURN NULL; END IF;
 RETURN to_jsonb(proof)-ARRAY['attempt_token','attempt_until'];
END; $$;

CREATE FUNCTION public.issue_technical_crawl_ownership(p_user uuid,p_project text,p_website text,p_origin text,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; proof public.technical_crawl_ownership%ROWTYPE; budget public.technical_ownership_limits%ROWTYPE; stamp timestamptz:=clock_timestamp();
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 IF website IS DISTINCT FROM p_website OR p_website IS NULL OR p_origin IS NULL OR p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'technical_ownership_unavailable'; END IF;
 SELECT * INTO proof FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project FOR UPDATE NOWAIT;
 -- Repeated explicit requests preserve an unexpired challenge and any active attempt.
 IF FOUND AND proof.website_value=p_website AND proof.origin=p_origin AND proof.revoked_at IS NULL AND proof.expires_at>stamp THEN RETURN to_jsonb(proof)-ARRAY['attempt_token','attempt_until']; END IF;
 INSERT INTO public.technical_ownership_limits VALUES(p_user,stamp,0,0,NULL,NULL) ON CONFLICT DO NOTHING;
 SELECT * INTO budget FROM public.technical_ownership_limits WHERE user_id=p_user FOR UPDATE NOWAIT;
 IF budget.hour_start<=stamp-interval '1 hour' THEN budget.hour_start:=stamp;budget.issue_count:=0;budget.verify_count:=0; END IF;
 IF budget.issue_count>=20 THEN RAISE EXCEPTION 'technical_ownership_capacity'; END IF;
 UPDATE public.technical_ownership_limits SET hour_start=budget.hour_start,issue_count=budget.issue_count+1,verify_count=budget.verify_count WHERE user_id=p_user;
 INSERT INTO public.technical_crawl_ownership(user_id,project_id,website_value,origin,token,issued_at,expires_at)
 VALUES(p_user,p_project,p_website,p_origin,p_token,stamp,stamp+interval '24 hours')
 ON CONFLICT(user_id,project_id) DO UPDATE SET website_value=EXCLUDED.website_value,origin=EXCLUDED.origin,token=EXCLUDED.token,issued_at=stamp,expires_at=EXCLUDED.expires_at,verified_until=NULL,revoked_at=NULL,attempt_token=NULL,attempt_until=NULL
 RETURNING * INTO proof;
 RETURN to_jsonb(proof)-ARRAY['attempt_token','attempt_until'];
END; $$;

CREATE FUNCTION public.begin_technical_ownership_verification(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; proof public.technical_crawl_ownership%ROWTYPE; budget public.technical_ownership_limits%ROWTYPE; stamp timestamptz:=clock_timestamp(); attempt uuid:=gen_random_uuid();
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO proof FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project FOR UPDATE NOWAIT;
 IF NOT FOUND OR proof.website_value IS DISTINCT FROM website OR proof.revoked_at IS NOT NULL OR proof.expires_at<=stamp THEN RAISE EXCEPTION 'technical_ownership_unavailable'; END IF;
 SELECT * INTO budget FROM public.technical_ownership_limits WHERE user_id=p_user FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'technical_ownership_unavailable'; END IF;
 IF budget.active_until>stamp THEN RAISE EXCEPTION 'technical_ownership_capacity'; END IF;
 IF budget.hour_start<=stamp-interval '1 hour' THEN budget.hour_start:=stamp;budget.issue_count:=0;budget.verify_count:=0; END IF;
 IF budget.verify_count>=60 THEN RAISE EXCEPTION 'technical_ownership_capacity'; END IF;
 UPDATE public.technical_ownership_limits SET hour_start=budget.hour_start,issue_count=budget.issue_count,verify_count=budget.verify_count+1,active_token=attempt,active_until=stamp+interval '15 seconds' WHERE user_id=p_user;
 UPDATE public.technical_crawl_ownership SET attempt_token=attempt,attempt_until=stamp+interval '15 seconds' WHERE user_id=p_user AND project_id=p_project RETURNING * INTO proof;
 RETURN to_jsonb(proof);
END; $$;

CREATE FUNCTION public.finish_technical_ownership_verification(p_user uuid,p_project text,p_attempt uuid,p_verified boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; proof public.technical_crawl_ownership%ROWTYPE; budget public.technical_ownership_limits%ROWTYPE; stamp timestamptz:=clock_timestamp(); valid boolean;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO proof FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO budget FROM public.technical_ownership_limits WHERE user_id=p_user FOR UPDATE NOWAIT;
 IF NOT FOUND OR p_attempt IS NULL OR proof.attempt_token IS DISTINCT FROM p_attempt OR budget.active_token IS DISTINCT FROM p_attempt THEN RETURN false; END IF;
 valid:=proof.website_value IS NOT DISTINCT FROM website AND proof.revoked_at IS NULL AND proof.expires_at>stamp AND proof.attempt_until>stamp AND budget.active_until>stamp AND p_verified IS TRUE;
 UPDATE public.technical_ownership_limits SET active_token=NULL,active_until=NULL WHERE user_id=p_user;
 UPDATE public.technical_crawl_ownership SET attempt_token=NULL,attempt_until=NULL,verified_until=CASE WHEN valid THEN expires_at ELSE NULL END WHERE user_id=p_user AND project_id=p_project;
 RETURN valid;
END; $$;

CREATE FUNCTION public.revoke_technical_crawl_ownership(p_user uuid,p_project text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt uuid;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 SELECT attempt_token INTO attempt FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project FOR UPDATE NOWAIT;
 UPDATE public.technical_crawl_ownership SET revoked_at=clock_timestamp(),verified_until=NULL,attempt_token=NULL,attempt_until=NULL WHERE user_id=p_user AND project_id=p_project;
 -- Revocation does not release a possibly still-running DNS request. Its account lease expires.
END; $$;

CREATE FUNCTION public.assert_technical_crawl_ownership(p_user uuid,p_project text,p_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 PERFORM 1 FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project AND website_value=website AND origin=p_origin AND revoked_at IS NULL AND expires_at>clock_timestamp() AND verified_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'technical_ownership_required'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_technical_crawl_ownership(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_technical_crawl_ownership(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_technical_crawl_ownership(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.issue_technical_crawl_ownership(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_technical_crawl_ownership(uuid,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.begin_technical_ownership_verification(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_technical_ownership_verification(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_technical_ownership_verification(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_technical_ownership_verification(uuid,text,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_technical_crawl_ownership(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_technical_crawl_ownership(uuid,text) TO service_role;


CREATE OR REPLACE FUNCTION public.start_technical_crawl(p_user uuid,p_project text,p_run uuid,p_expected bigint,p_website text,p_origin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; previous public.technical_crawls%ROWTYPE;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 PERFORM public.assert_technical_crawl_ownership(p_user,p_project,p_origin);
 IF p_run IS NULL OR p_website IS NULL OR length(btrim(p_website))=0 OR website IS DISTINCT FROM p_website THEN RAISE EXCEPTION 'technical_crawl_website_changed'; END IF;
 SELECT * INTO previous FROM public.technical_crawls WHERE user_id=p_user AND run_id=p_run;
 IF FOUND THEN
   IF previous.project_id=p_project AND previous.website_value=p_website AND previous.origin=p_origin THEN RETURN to_jsonb(previous)-ARRAY['lease_token','lease_until']; END IF;
   RAISE EXCEPTION 'technical_crawl_replay';
 END IF;
 IF p_expected IS NULL OR p_expected IS DISTINCT FROM (SELECT rev FROM public.workspace_meta WHERE user_id=p_user) THEN RAISE EXCEPTION 'technical_crawl_workspace_changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND status IN ('preparing','running')) THEN RAISE EXCEPTION 'technical_crawl_active'; END IF;
 IF (SELECT count(*) FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND created_at>clock_timestamp()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'technical_crawl_rate_limit'; END IF;
 INSERT INTO public.technical_crawls(user_id,project_id,run_id,website_value,origin) VALUES(p_user,p_project,p_run,p_website,p_origin) RETURNING * INTO previous;
 RETURN to_jsonb(previous)-ARRAY['lease_token','lease_until'];
END; $$;


CREATE OR REPLACE FUNCTION public.claim_technical_crawl(p_user uuid,p_project text,p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.technical_crawls%ROWTYPE;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO current FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR UPDATE;
 IF NOT FOUND OR current.status NOT IN ('preparing','running') THEN RETURN NULL; END IF;
 IF current.website_value IS DISTINCT FROM website OR NOT EXISTS(SELECT 1 FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project AND website_value=website AND origin=current.origin AND revoked_at IS NULL AND expires_at>clock_timestamp() AND verified_until>clock_timestamp()) THEN
   UPDATE public.technical_crawls SET status='held',admission_hold='ownership',resume_status=status,retry_after=NULL,revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
   RETURN NULL;
 END IF;
 IF current.lease_until>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE public.technical_crawls SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '45 seconds',updated_at=clock_timestamp()
 WHERE user_id=p_user AND run_id=p_run RETURNING * INTO current;
 RETURN to_jsonb(current);
END; $$;


CREATE OR REPLACE FUNCTION public.save_technical_crawl_step(p_user uuid,p_project text,p_run uuid,p_lease uuid,p_revision bigint,p_state jsonb,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; current public.technical_crawls%ROWTYPE;
BEGIN
 website:=public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO current FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR UPDATE;
 IF NOT FOUND OR current.status NOT IN ('preparing','running') OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease OR current.lease_until IS NULL OR current.lease_until<=clock_timestamp() OR current.revision IS DISTINCT FROM p_revision THEN RETURN false; END IF;
 IF current.website_value IS DISTINCT FROM website OR NOT EXISTS(SELECT 1 FROM public.technical_crawl_ownership WHERE user_id=p_user AND project_id=p_project AND website_value=website AND origin=current.origin AND revoked_at IS NULL AND expires_at>clock_timestamp() AND verified_until>clock_timestamp()) THEN
   UPDATE public.technical_crawls SET status='held',admission_hold='ownership',resume_status=status,retry_after=NULL,revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
   RETURN false;
 END IF;
 IF p_status IS NULL OR p_status NOT IN ('running','completed','failed','held') OR p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR p_state->>'origin' IS DISTINCT FROM current.origin OR octet_length(p_state::text)>4000000 THEN RAISE EXCEPTION 'technical_crawl_state_invalid'; END IF;
 UPDATE public.technical_crawls SET state=p_state,status=p_status,revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=p_user AND run_id=p_run;
 RETURN true;
END; $$;
