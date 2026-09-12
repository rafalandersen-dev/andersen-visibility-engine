-- Expand only the explicit email-language preference. This migration does not
-- opt anyone in, enqueue mail, alter delivery gates or change existing rows.
ALTER TABLE public.operational_email_preferences
 DROP CONSTRAINT operational_email_preferences_locale_check;
ALTER TABLE public.operational_email_preferences
 ADD CONSTRAINT operational_email_preferences_locale_check
 CHECK (locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','sk','sl','es','sv'));

CREATE OR REPLACE FUNCTION public.set_operational_email_preference(p_enabled boolean,p_locale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR p_enabled IS NULL OR p_locale IS NULL OR p_locale NOT IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','sk','sl','es','sv') THEN RAISE EXCEPTION 'invalid_email_preference'; END IF;
 INSERT INTO public.operational_email_preferences(user_id,enabled,locale) VALUES(u,p_enabled,p_locale)
 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,locale=excluded.locale,updated_at=now();
 IF NOT p_enabled THEN
  UPDATE public.operational_email_outbox SET status='cancelled',reason='disabled',finished_at=now(),lease_token=NULL,lease_until=NULL
   WHERE user_id=u AND status IN ('pending','leased');
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.set_operational_email_preference(boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_operational_email_preference(boolean,text) TO authenticated;

-- A language-only save cannot enable mail or restore a stale enabled value.
CREATE FUNCTION public.set_operational_email_language(p_locale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR p_locale IS NULL OR p_locale NOT IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','sk','sl','es','sv') THEN RAISE EXCEPTION 'invalid_email_preference'; END IF;
 INSERT INTO public.operational_email_preferences(user_id,enabled,locale) VALUES(u,false,p_locale)
 ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,updated_at=now();
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.set_operational_email_language(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_operational_email_language(text) TO authenticated;
