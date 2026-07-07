-- Claude.ai Custom Connector (OAuth) — Phase 1 schema foundation.
--
-- Additive only. Does NOT alter mcp_connections (developer tokens keep working).
-- Every table follows the established service-role-only pattern: RLS ENABLED with
-- NO anon/authenticated policies, so these tables are unreachable from client
-- queries. All secret material (auth codes, access/refresh tokens, client
-- secrets) is stored ONLY as a SHA-256 hash — never plaintext. Idempotent.
--
-- Nothing here is exercised until later phases add the OAuth endpoints, and the
-- whole connector is gated at runtime by MCP_OAUTH_ENABLED.

-- Dynamically-registered OAuth clients (RFC 7591). Public clients (PKCE) have a
-- null client_secret_hash.
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret_hash text,                       -- null for public/PKCE clients; hash only if ever used
  client_name text,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  grant_types text[] NOT NULL DEFAULT '{authorization_code,refresh_token}',
  response_types text[] NOT NULL DEFAULT '{code}',
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  scope text,
  software_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  disabled_at timestamptz
);

-- Short-lived authorization codes (~5 min). Bound to client + redirect + PKCE
-- challenge + resource. Single-use (consumed_at set on exchange).
CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,                -- SHA-256 of the code; never plaintext
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  scope text NOT NULL DEFAULT '',
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  resource text,
  nonce text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per active grant/connection. Access + rotating refresh tokens stored
-- as hashes only. refresh_family_id ties a rotation lineage together for
-- reuse-detection in a later phase.
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  access_token_hash text NOT NULL UNIQUE,        -- SHA-256; never plaintext
  refresh_token_hash text UNIQUE,                -- SHA-256; null if no offline_access
  refresh_family_id uuid,
  scope text NOT NULL DEFAULT '',
  resource text,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  label text
);

-- Consent records (drives the "connected apps" list; one active per user+client).
CREATE TABLE IF NOT EXISTS public.oauth_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  scope text NOT NULL DEFAULT '',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Append-only audit log. No secrets — ids/hashes/events only.
CREATE TABLE IF NOT EXISTS public.oauth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  client_id text,
  event text NOT NULL,                           -- register|authorize|consent_granted|consent_denied|token_issued|token_refreshed|token_reuse_detected|revoked|mcp_call|mcp_denied
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for hash lookups + per-user listing.
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON public.oauth_authorization_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON public.oauth_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_refresh_family ON public.oauth_tokens (refresh_family_id);
CREATE INDEX IF NOT EXISTS idx_oauth_consents_user ON public.oauth_consents (user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_user ON public.oauth_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_client ON public.oauth_audit_log (client_id, created_at DESC);

-- Service role only. Bypasses RLS. No anon/authenticated grants or policies →
-- clients cannot read token/code/secret hashes at all.
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_audit_log ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.oauth_clients TO service_role;
GRANT ALL ON public.oauth_authorization_codes TO service_role;
GRANT ALL ON public.oauth_tokens TO service_role;
GRANT ALL ON public.oauth_consents TO service_role;
GRANT ALL ON public.oauth_audit_log TO service_role;
