-- UNRELEASED. Adds private continuation metadata around the released details lifecycle.
-- Does not replace180000, create funding, schedule work or dispatch a provider request.
CREATE TABLE public.backlink_detail_pages (
 user_id uuid NOT NULL, project_id text NOT NULL, request_id uuid NOT NULL,
 parent_request_id uuid, root_request_id uuid NOT NULL,
 page_number integer NOT NULL CHECK(page_number BETWEEN 1 AND 10000),
 prior_returned_count bigint NOT NULL CHECK(prior_returned_count BETWEEN 0 AND 9007199254740991),
 request_cursor_hash bytea CHECK(request_cursor_hash IS NOT DISTINCT FROM sha256(convert_to(request_cursor,'UTF8'))),
 request_cursor text CHECK(request_cursor IS NULL OR octet_length(request_cursor) BETWEEN 1 AND 8192),
 next_cursor text CHECK(next_cursor IS NULL OR octet_length(next_cursor) BETWEEN 1 AND 8192),
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id,request_id) REFERENCES public.backlink_details_requests(user_id,request_id) ON DELETE CASCADE,
 CHECK((parent_request_id IS NULL AND root_request_id=request_id AND page_number=1 AND prior_returned_count=0 AND request_cursor IS NULL) OR (parent_request_id IS NOT NULL AND parent_request_id<>request_id AND root_request_id<>request_id AND page_number>1 AND prior_returned_count>0 AND request_cursor IS NOT NULL))
);
CREATE UNIQUE INDEX backlink_detail_one_child ON public.backlink_detail_pages(user_id,parent_request_id) WHERE parent_request_id IS NOT NULL;
CREATE UNIQUE INDEX backlink_detail_chain_cursor ON public.backlink_detail_pages(user_id,root_request_id,request_cursor_hash) WHERE request_cursor_hash IS NOT NULL;
ALTER TABLE public.backlink_detail_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backlink_detail_pages FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_backlink_page(p_user uuid,p_project text,p_request uuid,p_website text,p_scope jsonb,p_parent uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE website text; saved public.backlink_detail_pages%ROWTYPE; parent public.backlink_detail_pages%ROWTYPE; previous public.backlink_details_requests%ROWTYPE; result jsonb; scope jsonb; page_number integer:=1; prior_count bigint:=0; cursor_value text; root_id uuid:=p_request;
BEGIN
 website:=public.read_backlink_monitoring_owner(p_user,p_project,true);
 IF p_request IS NULL OR p_website IS DISTINCT FROM website OR (p_parent IS NULL AND p_scope IS NULL) OR (p_parent IS NOT NULL AND (p_scope IS NOT NULL OR p_parent=p_request)) THEN RAISE EXCEPTION 'backlink_page_scope'; END IF;
 SELECT * INTO saved FROM public.backlink_detail_pages WHERE user_id=p_user AND request_id=p_request FOR UPDATE NOWAIT;
 IF FOUND THEN
   IF saved.project_id<>p_project OR saved.parent_request_id IS DISTINCT FROM p_parent THEN RAISE EXCEPTION 'backlink_page_replay'; END IF;
   SELECT * INTO previous FROM public.backlink_details_requests WHERE user_id=p_user AND request_id=p_request FOR UPDATE NOWAIT;
   IF previous.website_value IS DISTINCT FROM website OR (p_parent IS NULL AND previous.scope IS DISTINCT FROM p_scope) THEN RAISE EXCEPTION 'backlink_page_replay'; END IF;
   RETURN jsonb_build_object('claimed',false,'record',to_jsonb(previous)-ARRAY['lease_token','lease_until']);
 END IF;
 IF EXISTS(SELECT 1 FROM public.backlink_details_requests WHERE user_id=p_user AND request_id=p_request) THEN RAISE EXCEPTION 'backlink_page_replay'; END IF;
 IF p_parent IS NOT NULL THEN
   SELECT * INTO parent FROM public.backlink_detail_pages WHERE user_id=p_user AND project_id=p_project AND request_id=p_parent FOR SHARE NOWAIT;
   IF NOT FOUND OR parent.next_cursor IS NULL OR parent.page_number>=10000 THEN RAISE EXCEPTION 'backlink_page_unavailable'; END IF;
   SELECT * INTO previous FROM public.backlink_details_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_parent FOR SHARE NOWAIT;
   IF NOT FOUND OR previous.website_value IS DISTINCT FROM website OR previous.status<>'succeeded' OR previous.accounting_state<>'settled' OR previous.observation IS NULL THEN RAISE EXCEPTION 'backlink_page_unavailable'; END IF;
   IF EXISTS(SELECT 1 FROM public.backlink_detail_pages WHERE user_id=p_user AND parent_request_id=p_parent) THEN RAISE EXCEPTION 'backlink_page_already_requested'; END IF;
   IF jsonb_typeof(previous.observation->'providerReturnedCount') IS DISTINCT FROM 'number' OR (previous.observation->>'providerReturnedCount')::numeric NOT BETWEEN 1 AND (previous.scope->>'limit')::integer OR (previous.observation->>'providerReturnedCount')::numeric<>trunc((previous.observation->>'providerReturnedCount')::numeric) THEN RAISE EXCEPTION 'backlink_page_unavailable'; END IF;
   scope:=previous.scope; root_id:=parent.root_request_id; cursor_value:=parent.next_cursor; page_number:=parent.page_number+1;
   prior_count:=parent.prior_returned_count+(previous.observation->>'providerReturnedCount')::bigint;
   IF prior_count>9007199254740991 THEN RAISE EXCEPTION 'backlink_page_unavailable'; END IF;
 ELSE scope:=p_scope;
 END IF;
 result:=public.reserve_backlink_details(p_user,p_project,p_request,p_website,scope);
 IF (result->>'claimed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'backlink_page_replay'; END IF;
 INSERT INTO public.backlink_detail_pages(user_id,project_id,request_id,parent_request_id,root_request_id,page_number,prior_returned_count,request_cursor,request_cursor_hash) VALUES(p_user,p_project,p_request,p_parent,root_id,page_number,prior_count,cursor_value,sha256(convert_to(cursor_value,'UTF8')));
 -- Private return: only the authenticated server lifecycle consumes this cursor.
 RETURN result||jsonb_build_object('page',jsonb_build_object('parentRequestId',p_parent,'pageNumber',page_number,'priorReturnedCount',prior_count,'requestCursor',cursor_value));
END; $$;

CREATE FUNCTION public.authorize_backlink_page_dispatch(p_user uuid,p_project text,p_request uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.read_backlink_monitoring_owner(p_user,p_project,true);
 PERFORM 1 FROM public.backlink_detail_pages WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN public.authorize_backlink_details_dispatch(p_user,p_project,p_request,p_lease);
END; $$;

CREATE FUNCTION public.finish_backlink_page(p_user uuid,p_project text,p_request uuid,p_lease uuid,p_observation jsonb,p_next_cursor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.backlink_detail_pages%ROWTYPE; current public.backlink_details_requests%ROWTYPE; finished boolean; returned_count numeric;
BEGIN
 PERFORM public.read_backlink_monitoring_owner(p_user,p_project,true);
 SELECT * INTO saved FROM public.backlink_detail_pages WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO current FROM public.backlink_details_requests WHERE user_id=p_user AND project_id=p_project AND request_id=p_request FOR UPDATE NOWAIT;
 IF NOT FOUND OR current.status<>'dispatched' OR p_lease IS NULL OR current.lease_token IS DISTINCT FROM p_lease THEN RETURN false; END IF;
 IF p_next_cursor IS NOT NULL AND (p_observation IS NULL OR octet_length(p_next_cursor) NOT BETWEEN 1 AND 8192 OR p_next_cursor IS NOT DISTINCT FROM saved.request_cursor OR saved.page_number>=10000) THEN RAISE EXCEPTION 'backlink_page_result'; END IF;
 -- Reject any cursor already followed in this immutable root chain, including
 -- cycles longer than one step (A -> B -> A). The private index also prevents reuse.
 IF p_next_cursor IS NOT NULL AND EXISTS(SELECT 1 FROM public.backlink_detail_pages WHERE user_id=p_user AND root_request_id=saved.root_request_id AND request_cursor_hash=sha256(convert_to(p_next_cursor,'UTF8'))) THEN RAISE EXCEPTION 'backlink_page_cycle'; END IF;
 IF p_observation IS NOT NULL THEN
   IF jsonb_typeof(p_observation->'providerReturnedCount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'backlink_page_result'; END IF;
   returned_count:=(p_observation->>'providerReturnedCount')::numeric;
   IF returned_count<>trunc(returned_count) OR returned_count NOT BETWEEN 0 AND (current.scope->>'limit')::integer OR saved.prior_returned_count+returned_count>9007199254740991 OR (p_next_cursor IS NOT NULL AND returned_count=0) THEN RAISE EXCEPTION 'backlink_page_result'; END IF;
 END IF;
 finished:=public.finish_backlink_details(p_user,p_project,p_request,p_lease,p_observation);
 IF finished AND p_observation IS NOT NULL THEN UPDATE public.backlink_detail_pages SET next_cursor=p_next_cursor WHERE user_id=p_user AND request_id=p_request; END IF;
 RETURN finished;
END; $$;

CREATE FUNCTION public.list_backlink_pages(p_user uuid,p_project text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE history jsonb; item jsonb; page public.backlink_detail_pages%ROWTYPE; child uuid; result jsonb:='[]';
BEGIN
 history:=public.list_backlink_details(p_user,p_project);
 FOR item IN SELECT value FROM jsonb_array_elements(history) LOOP
   SELECT * INTO page FROM public.backlink_detail_pages WHERE user_id=p_user AND project_id=p_project AND request_id=(item->>'request_id')::uuid;
   IF FOUND THEN
     SELECT request_id INTO child FROM public.backlink_detail_pages WHERE user_id=p_user AND project_id=p_project AND parent_request_id=page.request_id;
     item:=item||jsonb_build_object('pageInfo',jsonb_build_object('parentRequestId',page.parent_request_id,'pageNumber',page.page_number,'priorReturnedCount',page.prior_returned_count,'childRequestId',child,'canContinue',item->>'status'='succeeded' AND item->>'accounting_state'='settled' AND page.next_cursor IS NOT NULL AND page.page_number<10000 AND child IS NULL));
   ELSE item:=item||jsonb_build_object('pageInfo',NULL);
   END IF;
   result:=result||jsonb_build_array(item);
 END LOOP;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_backlink_page(uuid,text,uuid,text,jsonb,uuid),public.authorize_backlink_page_dispatch(uuid,text,uuid,uuid),public.finish_backlink_page(uuid,text,uuid,uuid,jsonb,text),public.list_backlink_pages(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_backlink_page(uuid,text,uuid,text,jsonb,uuid),public.authorize_backlink_page_dispatch(uuid,text,uuid,uuid),public.finish_backlink_page(uuid,text,uuid,uuid,jsonb,text),public.list_backlink_pages(uuid,text) TO service_role;
