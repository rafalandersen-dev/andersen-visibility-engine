-- Claude.ai OAuth connector — Phase 2B. Pending authorization requests.
--
-- A pending request is created by GET /api/oauth/authorize AFTER strict
-- validation, then the browser is redirected to the authenticated consent page.
-- On approval (later phase) it is converted into a single-use authorization code
-- (stored in oauth_authorization_codes) and marked consumed.
--
-- Additive only. Does NOT alter mcp_connections or the Phase 1 OAuth tables.
-- Service-role-only pattern: RLS enabled, no anon/authenticated policies. No
-- secrets stored here (the PKCE code_challenge is a public value by design).

CREATE TABLE IF NOT EXISTS public.oauth_authorization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  scope text NOT NULL DEFAULT '',
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  resource text,
  state text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_auth_requests_expires
  ON public.oauth_authorization_requests (expires_at);

ALTER TABLE public.oauth_authorization_requests ENABLE ROW LEVEL SECURITY;

-- Service role only. Bypasses RLS. No anon/authenticated grants or policies.
GRANT ALL ON public.oauth_authorization_requests TO service_role;
