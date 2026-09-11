-- UNRELEASED. Immutable observed evidence and one atomic opportunity per finding.
CREATE TABLE public.technical_crawl_findings (
 user_id uuid NOT NULL, project_id text NOT NULL, evidence_id uuid NOT NULL,
 run_id uuid NOT NULL, run_revision bigint NOT NULL, page_index integer NOT NULL CHECK(page_index BETWEEN 0 AND 199),
 code text NOT NULL, opportunity_id text NOT NULL, snapshot jsonb NOT NULL,
 snapshot_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,evidence_id),
 UNIQUE(user_id,run_id,run_revision,page_index,code),
 FOREIGN KEY(user_id,run_id) REFERENCES public.technical_crawls(user_id,run_id) ON DELETE CASCADE
);
CREATE INDEX technical_crawl_findings_recent ON public.technical_crawl_findings(user_id,project_id,created_at DESC);
ALTER TABLE public.technical_crawl_findings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technical_crawl_findings FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.capture_technical_crawl_finding(p_user uuid,p_project text,p_run uuid,p_revision bigint,p_page integer,p_code text,p_title text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current public.technical_crawls%ROWTYPE; saved public.technical_crawl_findings%ROWTYPE;
 page jsonb; observation jsonb; valid boolean:=false; evidence uuid; opportunity text; snapshot jsonb; fingerprint text; stamp text; language text;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 SELECT * INTO current FROM public.technical_crawls WHERE user_id=p_user AND project_id=p_project AND run_id=p_run FOR UPDATE;
 IF NOT FOUND OR current.revision IS DISTINCT FROM p_revision OR current.status NOT IN ('completed','cancelled','held') THEN RAISE EXCEPTION 'technical_finding_changed'; END IF;
 SELECT * INTO saved FROM public.technical_crawl_findings WHERE user_id=p_user AND run_id=p_run AND run_revision=p_revision AND page_index=p_page AND code=p_code;
 IF FOUND THEN RETURN jsonb_build_object('evidenceId',saved.evidence_id,'opportunityId',saved.opportunity_id,'hash',saved.snapshot_hash,'opportunityExists',EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='opportunities' AND entity_id=saved.opportunity_id AND data->>'projectId'=p_project)); END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>199 OR p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'technical_finding_invalid'; END IF;
 page:=current.state->'pages'->p_page; observation:=page->'observation';
 IF page->>'state' IS DISTINCT FROM 'observed' OR jsonb_typeof(observation) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'technical_finding_unobserved'; END IF;
 IF p_code='http_error' THEN valid:=(observation->>'status')::integer>=400;
 ELSIF p_code='invalid_jsonld' THEN valid:=(observation->>'complete')::boolean AND EXISTS(SELECT 1 FROM jsonb_array_elements(observation->'structuredData') item WHERE item->>'state'='invalid_json' AND (item->>'complete')::boolean);
 ELSIF p_code='noindex' THEN valid:=EXISTS(SELECT 1 FROM jsonb_array_elements(observation->'robots') item WHERE item->>'value' ~* '(^|[[:space:],:])(noindex|none)($|[[:space:],])');
 ELSIF (observation->>'complete')::boolean AND (observation->>'status')::integer BETWEEN 200 AND 299 THEN
   CASE p_code
   WHEN 'missing_title' THEN valid:=length(btrim(coalesce(observation->>'title','')))=0;
   WHEN 'missing_description' THEN valid:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(observation->'descriptions') item WHERE length(btrim(item))>0);
   WHEN 'missing_h1' THEN valid:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(observation->'headings') item WHERE length(btrim(item))>0);
   WHEN 'multiple_h1' THEN valid:=jsonb_array_length(observation->'headings')>1;
   WHEN 'multiple_canonicals' THEN valid:=jsonb_array_length(observation->'canonicals')>1;
   ELSE valid:=false;
   END CASE;
 END IF;
 IF valid IS NOT TRUE THEN RAISE EXCEPTION 'technical_finding_not_observed'; END IF;
 IF (SELECT count(*) FROM public.technical_crawl_findings WHERE user_id=p_user AND project_id=p_project AND created_at>clock_timestamp()-interval '1 hour')>=1000 THEN RAISE EXCEPTION 'technical_finding_rate_limit'; END IF;
 evidence:=gen_random_uuid(); opportunity:=gen_random_uuid()::text; stamp:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 snapshot:=jsonb_build_object('runId',p_run,'runRevision',p_revision,'pageIndex',p_page,'code',p_code,'origin',current.origin,'runStatus',current.status,'page',page,'coverageLimits',current.state->'coverageLimits','sitemapLimitations',current.state->'sitemaps'->'limitations','sitemapFiles',(SELECT coalesce(jsonb_agg(item),'[]'::jsonb) FROM jsonb_array_elements(coalesce(current.state->'sitemaps'->'entries','[]'::jsonb)) item WHERE item->>'url'=page->>'requestedUrl'));
 fingerprint:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 SELECT coalesce(data->>'primaryLanguage','English') INTO language FROM public.workspace_entities WHERE user_id=p_user AND collection='projects' AND entity_id=p_project;
 INSERT INTO public.technical_crawl_findings VALUES(p_user,p_project,evidence,p_run,p_revision,p_page,p_code,opportunity,snapshot,fingerprint,clock_timestamp());
 INSERT INTO public.workspace_entities(user_id,collection,entity_id,ord,data) VALUES(p_user,'opportunities',opportunity,0,jsonb_build_object(
 'id',opportunity,'projectId',p_project,'title',p_title,'language',language,'contentType','Service Page','searchIntent','Informational','targetAudience','','businessValue',p_title,'recommendedCta','Review the saved page evidence before making changes','priority','Medium','status','captured','source','audit','creationMode','milo_discovery','primarySource','site_audit','sourceRefs',jsonb_build_array(jsonb_build_object('sourceType','technical_crawl','sourceRecordId',evidence,'capturedAt',stamp)),'reasonDiscovered',p_title,'canonicalUrl',observation->>'url','technicalEvidence',jsonb_build_object('id',evidence,'hash',fingerprint),'evidence',jsonb_build_array(jsonb_build_object('label','Observed URL','value',observation->>'url'),jsonb_build_object('label','Observed at','value',observation->>'observedAt')),'measurementStatus','not_started','createdAt',stamp,'updatedAt',stamp,'version',1));
 UPDATE public.workspace_meta SET rev=rev+1 WHERE user_id=p_user;
 RETURN jsonb_build_object('evidenceId',evidence,'opportunityId',opportunity,'hash',fingerprint,'opportunityExists',true);
END; $$;
REVOKE ALL ON FUNCTION public.capture_technical_crawl_finding(uuid,text,uuid,bigint,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_technical_crawl_finding(uuid,text,uuid,bigint,integer,text,text) TO service_role;

CREATE FUNCTION public.read_technical_crawl_finding(p_user uuid,p_project text,p_evidence uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.assert_technical_crawl_owner(p_user,p_project);
 SELECT jsonb_build_object('evidenceId',evidence_id,'opportunityId',opportunity_id,'hash',snapshot_hash,'snapshot',snapshot,'createdAt',created_at,
 'opportunityExists',EXISTS(SELECT 1 FROM public.workspace_entities WHERE user_id=p_user AND collection='opportunities' AND entity_id=f.opportunity_id AND data->>'projectId'=p_project))
 INTO result FROM public.technical_crawl_findings f WHERE user_id=p_user AND project_id=p_project AND evidence_id=p_evidence;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.read_technical_crawl_finding(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_technical_crawl_finding(uuid,text,uuid) TO service_role;
