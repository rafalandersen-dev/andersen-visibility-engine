-- Article Studio 2.0 image storage (P1.1 Phase A).
--
-- Two Storage buckets with an explicit private→public lifecycle, because a
-- permanently-published article cannot depend on an expiring signed URL:
--   * article-assets-private — STAGED uploads, owner-only (never public).
--   * article-assets-public  — APPROVED/PUBLISHED assets, publicly readable.
--
-- Ownership is the FIRST path segment of the object name = the auth user id
-- (objects are written server-side as `<uid>/<projectId>/<assetId>/<id>.<ext>`).
-- The server fns use the service role (which bypasses RLS) and enforce that path;
-- these policies are defence-in-depth for any DIRECT client (anon/user-JWT)
-- access. Scoped to these two buckets only — no effect on other products.
--
-- Storage configuration only (no new table; image metadata lives in the
-- ContentAsset JSONB). Idempotent: safe to re-apply.

insert into storage.buckets (id, name, public)
values ('article-assets-private', 'article-assets-private', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('article-assets-public', 'article-assets-public', true)
on conflict (id) do update set public = true;

-- ---- PRIVATE bucket: owner-only read / insert / delete ----
drop policy if exists "article private owner read" on storage.objects;
create policy "article private owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'article-assets-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "article private owner insert" on storage.objects;
create policy "article private owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'article-assets-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "article private owner delete" on storage.objects;
create policy "article private owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'article-assets-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- PUBLIC bucket: public read; owner-only insert / delete ----
drop policy if exists "article public read" on storage.objects;
create policy "article public read" on storage.objects
  for select to public
  using (bucket_id = 'article-assets-public');

drop policy if exists "article public owner insert" on storage.objects;
create policy "article public owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'article-assets-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "article public owner delete" on storage.objects;
create policy "article public owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'article-assets-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
