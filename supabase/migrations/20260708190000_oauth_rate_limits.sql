-- Phase 0 (trust foundation): DB-backed fixed-window rate limiting for the
-- OAuth/MCP endpoints. Additive only — nothing else references this table.
-- Service-role-only pattern: RLS enabled with ZERO policies (invisible to
-- anon/authenticated; the service role bypasses RLS), and the functions are
-- revoked from client roles.
--
-- Keys are SHA-256 hashes of salted identifiers (IP / bearer token) computed
-- in the app — raw IPs, tokens, or OAuth token hashes are never stored here.

create table if not exists public.oauth_rate_limits (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 1,
  primary key (bucket, key, window_start)
);

create index if not exists oauth_rate_limits_window_start_idx
  on public.oauth_rate_limits (window_start);

alter table public.oauth_rate_limits enable row level security;
-- no policies on purpose

-- Atomic increment-then-return. One statement per request; safe across
-- concurrent Cloudflare Workers isolates.
create or replace function public.bump_rate_limit(p_bucket text, p_key text, p_window_start timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.oauth_rate_limits as r (bucket, key, window_start, count)
  values (p_bucket, p_key, p_window_start, 1)
  on conflict (bucket, key, window_start)
  do update set count = r.count + 1
  returning r.count;
$$;

-- Best-effort cleanup of stale windows (called opportunistically by the app).
create or replace function public.cleanup_rate_limits(p_before timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.oauth_rate_limits where window_start < p_before;
$$;

revoke all on table public.oauth_rate_limits from anon, authenticated;
revoke execute on function public.bump_rate_limit(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.cleanup_rate_limits(timestamptz) from public, anon, authenticated;
grant execute on function public.bump_rate_limit(text, text, timestamptz) to service_role;
grant execute on function public.cleanup_rate_limits(timestamptz) to service_role;
