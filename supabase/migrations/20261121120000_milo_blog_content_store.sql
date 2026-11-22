-- Milo Growth blog: articles drafted in Milo (project ijnag106) arrive through
-- /api/milo/draft and go public through /api/milo/live. Drafts are server-only;
-- only the published copy is publicly readable.

CREATE TABLE public.milo_blog_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL CHECK (char_length(project_id) BETWEEN 1 AND 200),
  asset_id text NOT NULL CHECK (char_length(asset_id) BETWEEN 1 AND 200),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL,
  meta_title text NOT NULL,
  meta_description text NOT NULL,
  markdown text NOT NULL,
  sections jsonb NOT NULL,
  -- Set when the draft is promoted; the slug of a published article never changes.
  published_slug text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT milo_blog_drafts_project_asset_key UNIQUE (project_id, asset_id),
  CONSTRAINT milo_blog_drafts_slug_key UNIQUE (slug)
);

REVOKE ALL ON public.milo_blog_drafts FROM anon, authenticated;
GRANT ALL ON public.milo_blog_drafts TO service_role;
ALTER TABLE public.milo_blog_drafts ENABLE ROW LEVEL SECURITY;
-- No policies: drafts are reachable only through the service role on the server.

CREATE TABLE public.milo_blog_published (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL UNIQUE REFERENCES public.milo_blog_drafts(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL,
  meta_title text NOT NULL,
  meta_description text NOT NULL,
  sections jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX milo_blog_published_published_at_idx
  ON public.milo_blog_published (published_at DESC);

REVOKE ALL ON public.milo_blog_published FROM anon, authenticated;
GRANT SELECT ON public.milo_blog_published TO anon, authenticated;
GRANT ALL ON public.milo_blog_published TO service_role;
ALTER TABLE public.milo_blog_published ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published Milo articles are publicly readable"
  ON public.milo_blog_published
  FOR SELECT
  TO anon, authenticated
  USING (true);
