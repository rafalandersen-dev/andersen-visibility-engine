-- GSC OAuth / API Sync v1 (Sprint 17) — server-side Google Search Console OAuth
-- connections. Holds refresh/access tokens that must NEVER reach the client.
--
-- Security model mirrors analytics_events: RLS is ENABLED with NO anon/
-- authenticated policies, so the table is unreachable from client queries.
-- All access goes through trusted server functions using the service role.
-- Refresh tokens are stored encrypted (AES-GCM, app key GSC_TOKEN_ENCRYPTION_KEY)
-- and only ever decrypted server-side. Idempotent for safe re-apply.

CREATE TABLE IF NOT EXISTS public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,                 -- = user_id (Milo workspaces are user-keyed)
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'google_search_console',
  google_account_email text,
  encrypted_refresh_token text,               -- AES-GCM ciphertext; never plaintext, never returned to client
  access_token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- One live connection per user per provider.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_google_connections_user_provider
  ON public.google_connections (user_id, provider);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

-- Service role only (server functions). Bypasses RLS. No anon/authenticated grants
-- and no policies → client queries cannot read token columns at all.
GRANT ALL ON public.google_connections TO service_role;
