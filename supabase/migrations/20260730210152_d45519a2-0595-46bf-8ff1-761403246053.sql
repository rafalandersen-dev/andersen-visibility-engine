-- Defense in depth: RLS already denies writes (no INSERT/UPDATE/DELETE policy),
-- but the public-schema default grants still handed anon/authenticated the
-- privileges. Strip them so a future stray policy can't open a write path.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.entitlements FROM anon, authenticated;
REVOKE SELECT ON public.entitlements FROM anon;
GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

REVOKE ALL ON public.billing_webhook_events FROM anon, authenticated;
GRANT ALL ON public.billing_webhook_events TO service_role;