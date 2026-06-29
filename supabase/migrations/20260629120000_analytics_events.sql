-- Milo Analytics v1 — first-party website analytics events.
-- Anonymous, append-only. Ingested server-side via the service role (see
-- /api/analytics/track), read server-side via auth-gated server functions.
-- No anon/authenticated grants or RLS policies: all access goes through
-- trusted server code using the service role. Idempotent for safe re-apply.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  event_type text NOT NULL,            -- page_view | content_view | cta_click | booking_click
  url text,
  path text,
  title text,
  referrer text,
  referrer_domain text,
  user_agent text,
  device_type text,                    -- desktop | mobile | tablet | bot | unknown
  country text,                        -- null for now
  city text,                           -- null for now
  session_id text,                     -- anonymous
  visitor_id text,                     -- anonymous
  content_asset_id text,               -- optional (reserved)
  milo_asset_id text,                  -- optional (reserved)
  destination_type text,               -- optional (blogPost | servicePage | faq | landingPage)
  ai_signal_type text,                 -- ai_referrer | ai_crawler | ai_search_bot | null
  ai_signal_source text,               -- e.g. "chatgpt.com", "GPTBot"
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role only (server-side ingestion + aggregation). Bypasses RLS.
GRANT ALL ON public.analytics_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_analytics_events_project_created
  ON public.analytics_events (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_project_type
  ON public.analytics_events (project_id, event_type);
