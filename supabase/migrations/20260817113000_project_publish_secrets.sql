-- Launch Gate P0-3: move the custom-connector publish secret out of the
-- client-visible workspace data. Service-role-only table: RLS enabled with
-- ZERO policies (deny-all), matching the entitlements/oauth sensitive-table
-- pattern. Values are AES-256-GCM ciphertext ("v1.<iv>.<ct>") or, when no
-- encryption key is configured, "plain."-prefixed plaintext — still never
-- readable by anon/authenticated roles.
create table if not exists public.project_publish_secrets (
  user_id uuid not null,
  project_id text not null,
  secret text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.project_publish_secrets enable row level security;
