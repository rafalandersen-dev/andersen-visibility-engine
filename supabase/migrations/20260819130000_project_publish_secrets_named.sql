-- Launch-compliance follow-up (WP/Shopify token encryption): the WordPress
-- application password and Shopify Admin access token still lived plaintext in
-- the client-visible workspace data. They move into project_publish_secrets,
-- which therefore needs to hold MULTIPLE named secrets per (user, project):
-- 'publish' (the existing custom-connector secret), 'wordpressAppPassword'
-- and 'shopifyAdminToken'.
--
-- Existing rows keep working: they get secret_name 'publish' via the column
-- default, which is exactly what they are.
alter table public.project_publish_secrets
  add column if not exists secret_name text not null default 'publish';

alter table public.project_publish_secrets
  drop constraint if exists project_publish_secrets_pkey;

alter table public.project_publish_secrets
  add primary key (user_id, project_id, secret_name);
