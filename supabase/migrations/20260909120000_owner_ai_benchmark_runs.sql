-- Durable, service-provisioned plans for an explicitly approved three-attempt
-- benchmark. Installation creates no plan, permit, budget, schedule or AI call.
CREATE TABLE IF NOT EXISTS public.owner_ai_benchmark_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id text NOT NULL CHECK (length(project_id) BETWEEN 1 AND 200),
  opportunity_id text NOT NULL CHECK (length(opportunity_id) BETWEEN 1 AND 200),
  asset_id uuid NOT NULL UNIQUE,
  image_id uuid NOT NULL UNIQUE,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=65536),
  scan_request uuid NOT NULL UNIQUE REFERENCES public.ai_expense_permits(request_id),
  article_request uuid NOT NULL UNIQUE REFERENCES public.ai_expense_permits(request_id),
  image_request uuid NOT NULL UNIQUE REFERENCES public.ai_expense_permits(request_id),
  stage text NOT NULL DEFAULT 'scan' CHECK (stage IN ('scan','article','image')),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','running','completed','stopped')),
  claim_token uuid,
  claimed_at timestamptz,
  results jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(results)='object' AND octet_length(results::text)<=600000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scan_request<>article_request AND scan_request<>image_request AND article_request<>image_request),
  CHECK ((state='running') = (claim_token IS NOT NULL))
);
ALTER TABLE public.owner_ai_benchmark_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_ai_benchmark_runs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.owner_ai_benchmark_runs TO service_role;

CREATE OR REPLACE FUNCTION public.keep_owner_benchmark_plan_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.stage<>'scan' OR NEW.state<>'ready' OR NEW.results<>'{}'::jsonb
       OR NEW.claim_token IS NOT NULL OR NEW.claimed_at IS NOT NULL THEN
      RAISE EXCEPTION 'benchmark_must_start_at_scan';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id,NEW.user_id,NEW.project_id,NEW.opportunity_id,NEW.asset_id,NEW.image_id,
      NEW.snapshot,NEW.scan_request,NEW.article_request,NEW.image_request,NEW.created_at,NEW.expires_at)
     IS DISTINCT FROM
     (OLD.id,OLD.user_id,OLD.project_id,OLD.opportunity_id,OLD.asset_id,OLD.image_id,
      OLD.snapshot,OLD.scan_request,OLD.article_request,OLD.image_request,OLD.created_at,OLD.expires_at) THEN
    RAISE EXCEPTION 'benchmark_plan_immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS owner_benchmark_plan_immutable ON public.owner_ai_benchmark_runs;
CREATE TRIGGER owner_benchmark_plan_immutable BEFORE INSERT OR UPDATE ON public.owner_ai_benchmark_runs
FOR EACH ROW EXECUTE FUNCTION public.keep_owner_benchmark_plan_immutable();
REVOKE ALL ON FUNCTION public.keep_owner_benchmark_plan_immutable() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_owner_benchmark_stage(
  p_run uuid,p_user uuid,p_stage text,p_token uuid,
  p_text_model text,p_image_model text,p_text_ceiling bigint,p_image_ceiling bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r public.owner_ai_benchmark_runs%ROWTYPE;
  v_period text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  v_request uuid;
  v_ceiling bigint;
BEGIN
  IF p_token IS NULL OR p_stage IS NULL OR p_stage NOT IN ('scan','article','image')
     OR p_text_model IS NULL OR p_image_model IS NULL
     OR p_text_ceiling IS NULL OR p_image_ceiling IS NULL
     OR p_text_ceiling<=0 OR p_image_ceiling<=0
     OR 2*p_text_ceiling+p_image_ceiling>5000000 THEN RETURN false; END IF;
  SELECT * INTO r FROM public.owner_ai_benchmark_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR r.state<>'ready' OR r.stage<>p_stage OR r.expires_at<=clock_timestamp()
     OR r.results ? p_stage THEN RETURN false; END IF;
  v_request := CASE p_stage WHEN 'scan' THEN r.scan_request WHEN 'article' THEN r.article_request ELSE r.image_request END;
  v_ceiling := CASE p_stage WHEN 'image' THEN p_image_ceiling ELSE p_text_ceiling END;
  -- All three permits must match the immutable plan. Prior completed steps may
  -- have consumed theirs; only this step must still be unused.
  IF (SELECT count(*) FROM (VALUES
      (r.scan_request,'scanWebsiteCore',p_text_model,p_text_ceiling),
      (r.article_request,'generateContentCore',p_text_model,p_text_ceiling),
      (r.image_request,'generateArticleImageCore',p_image_model,p_image_ceiling)
    ) expected(request_id,operation,model,ceiling)
    JOIN public.ai_expense_permits p ON p.request_id=expected.request_id
    WHERE p.user_id=r.user_id AND p.job_id=r.id AND p.period=v_period
      AND p.provider='openai' AND p.model=expected.model AND p.operation=expected.operation
      AND p.ceiling_microusd=expected.ceiling AND NOT p.revoked
      AND p.expires_at>clock_timestamp()) <> 3 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_expense_requests WHERE request_id=v_request) THEN RETURN false; END IF;
  -- Readiness only; reserve_ai_expense remains the atomic financial authority.
  -- Both budgets must be restricted so unrelated background calls cannot spend.
  IF (SELECT count(*) FROM public.ai_expense_budgets b
      WHERE b.period=v_period AND b.scope IN ('global','user:'||p_user::text)
        AND b.requires_permit AND NOT b.paused
        AND b.cap_microusd-b.reserved_microusd-b.spent_microusd>=v_ceiling) <> 2 THEN RETURN false; END IF;
  UPDATE public.owner_ai_benchmark_runs SET state='running',claim_token=p_token,
    claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.record_owner_benchmark_result(
  p_run uuid,p_user uuid,p_stage text,p_token uuid,p_result jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.owner_ai_benchmark_runs%ROWTYPE;
BEGIN
  IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>200000 THEN RETURN false; END IF;
  SELECT * INTO r FROM public.owner_ai_benchmark_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR r.state<>'running' OR r.stage IS DISTINCT FROM p_stage OR r.claim_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
  IF r.results ? p_stage THEN RETURN r.results->p_stage=p_result; END IF;
  UPDATE public.owner_ai_benchmark_runs SET results=jsonb_set(results,ARRAY[p_stage],p_result),updated_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.finish_owner_benchmark_stage(
  p_run uuid,p_user uuid,p_stage text,p_token uuid,p_success boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.owner_ai_benchmark_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.owner_ai_benchmark_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR r.state<>'running' OR r.stage IS DISTINCT FROM p_stage
     OR r.claim_token IS DISTINCT FROM p_token OR p_success IS NULL THEN RETURN false; END IF;
  IF p_success AND NOT (r.results ? p_stage) THEN RETURN false; END IF;
  UPDATE public.owner_ai_benchmark_runs SET
    state=CASE WHEN NOT p_success THEN 'stopped' WHEN p_stage='image' THEN 'completed' ELSE 'ready' END,
    stage=CASE WHEN NOT p_success THEN stage WHEN p_stage='scan' THEN 'article' ELSE 'image' END,
    claim_token=NULL,updated_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_owner_benchmark_stage(uuid,uuid,text,uuid,text,text,bigint,bigint),
  public.record_owner_benchmark_result(uuid,uuid,text,uuid,jsonb),
  public.finish_owner_benchmark_stage(uuid,uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_owner_benchmark_stage(uuid,uuid,text,uuid,text,text,bigint,bigint),
  public.record_owner_benchmark_result(uuid,uuid,text,uuid,jsonb),
  public.finish_owner_benchmark_stage(uuid,uuid,text,uuid,boolean) TO service_role;
