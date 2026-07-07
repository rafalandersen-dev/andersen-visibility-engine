-- Claude Connector (MCP) v1 — server-side connection tokens for Milo's MCP
-- endpoint (/api/mcp). A user generates a token in the app and adds it to their
-- Claude MCP client as a Bearer token; Milo resolves it to the owning user and
-- scopes all tools to that user's workspace.
--
-- Security mirrors analytics_events / google_connections: RLS ENABLED with NO
-- anon/authenticated policies, so the table is unreachable from client queries.
-- Only the SHA-256 HASH of the token is stored — the plaintext is shown once at
-- creation and never persisted. Idempotent for safe re-apply.

CREATE TABLE IF NOT EXISTS public.mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,                 -- SHA-256 hex of the token; never the plaintext
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- Fast, unique lookup by token hash (active tokens).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mcp_connections_token_hash
  ON public.mcp_connections (token_hash);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_user
  ON public.mcp_connections (user_id, created_at DESC);

ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;

-- Service role only (server functions + /api/mcp). Bypasses RLS. No anon/
-- authenticated grants or policies → clients cannot read token hashes.
GRANT ALL ON public.mcp_connections TO service_role;
