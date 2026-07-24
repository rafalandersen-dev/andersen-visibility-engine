-- Link Growth Network (owner scope 2026-07-24): cross-project partner
-- directory + tracked introductions. Service-role only (RLS on, no policies)
-- — same trust model as scheduled_publishes: the app server derives every
-- row from the caller's OWN workspace and enforces ownership itself.

CREATE TABLE IF NOT EXISTS public.link_network_listings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  project_id  text NOT NULL,
  site_url    text NOT NULL,
  site_name   text NOT NULL,
  topics      text[] NOT NULL DEFAULT '{}',
  language    text NOT NULL DEFAULT 'en',
  locale      text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS link_network_listings_active_idx
  ON public.link_network_listings (status);
ALTER TABLE public.link_network_listings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.link_network_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  a_user      uuid NOT NULL,
  a_project   text NOT NULL,
  a_site      text NOT NULL,
  b_user      uuid NOT NULL,
  b_project   text NOT NULL,
  b_site      text NOT NULL,
  b_name      text NOT NULL DEFAULT '',
  b_topics    text[] NOT NULL DEFAULT '{}',
  b_contact   text NOT NULL DEFAULT '',
  b_language  text NOT NULL DEFAULT '',
  score       integer NOT NULL DEFAULT 0,
  shared_topics text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'suggested'
              CHECK (status IN ('suggested','contacted','agreed','live_verified','declined')),
  -- The partner page that should carry (or carries) the link to a_site.
  target_url  text NOT NULL DEFAULT '',
  link_rel    text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  last_check_found boolean,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (a_user, a_project, b_user, b_project)
);
CREATE INDEX IF NOT EXISTS link_network_matches_owner_idx
  ON public.link_network_matches (a_user, a_project, status);
ALTER TABLE public.link_network_matches ENABLE ROW LEVEL SECURITY;
