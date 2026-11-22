-- GA4 Data API sync for the ChatGPT channel (TEST ROLLOUT: platform owner,
-- Synergy Massage project only; enforced by the server, see src/lib/ga4.server.ts).
--
-- The GA4 refresh token reuses public.google_connections with provider
-- 'google_analytics'. Checked against the released definition (20260630120000,
-- 20260712130000): the only constraints are the uuid primary key, NOT NULL
-- workspace_id/user_id/provider and the unique (user_id, provider) index; there
-- is no CHECK or enum on provider and no foreign key. A second provider row per
-- user is therefore valid and the upsert's onConflict (user_id, provider) target
-- exists. No change to that table.
--
-- 1. ga4_project_properties: which GA4 property an owner verified for a project.
-- 2. ga4_oauth_attempts: one pending OAuth attempt per user; the sha256 of the
--    nonce held in the initiating browser's __Host- cookie. The callback deletes
--    the matching unexpired row (one-time consumption) before using the code.
--
-- Security model mirrors google_connections: RLS enabled, NO anon/authenticated
-- grants or policies, service role only. Every server query filters by the
-- authenticated user_id. Additive and idempotent.

CREATE TABLE IF NOT EXISTS public.ga4_project_properties (
  user_id uuid NOT NULL,
  project_id text NOT NULL CHECK (length(project_id) BETWEEN 1 AND 128),
  property_id text NOT NULL CHECK (property_id ~ '^[0-9]{1,20}$'),
  property_name text,
  time_zone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

ALTER TABLE public.ga4_project_properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ga4_project_properties FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ga4_project_properties TO service_role;

CREATE TABLE IF NOT EXISTS public.ga4_oauth_attempts (
  nonce_hash text PRIMARY KEY CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL,
  project_id text NOT NULL CHECK (length(project_id) BETWEEN 1 AND 128),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ga4_oauth_attempts_user_idx ON public.ga4_oauth_attempts (user_id);

ALTER TABLE public.ga4_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ga4_oauth_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ga4_oauth_attempts TO service_role;
