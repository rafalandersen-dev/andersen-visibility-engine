-- Phase 0 commit 6: refresh tokens with rotation + reuse detection.
-- Additive only. oauth_tokens already has refresh_token_hash /
-- refresh_family_id / refresh_expires_at (all null so far); this adds the
-- rotation marker, lookup indexes, and an atomic consume function.
-- Service-role-only pattern (matches oauth_rate_limits migration).

alter table public.oauth_tokens add column if not exists rotated_at timestamptz;

create index if not exists oauth_tokens_refresh_token_hash_idx
  on public.oauth_tokens (refresh_token_hash);

create index if not exists oauth_tokens_refresh_family_id_idx
  on public.oauth_tokens (refresh_family_id);

-- Atomically consume a LIVE refresh token (not rotated, not revoked).
-- Returns true when this caller won the rotation; null/false when the token
-- was already consumed — the app treats a lost race as reuse detection.
create or replace function public.consume_refresh_token(p_refresh_hash text, p_now timestamptz)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.oauth_tokens
     set rotated_at = p_now
   where refresh_token_hash = p_refresh_hash
     and rotated_at is null
     and revoked_at is null
  returning true;
$$;

revoke execute on function public.consume_refresh_token(text, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_refresh_token(text, timestamptz) to service_role;
