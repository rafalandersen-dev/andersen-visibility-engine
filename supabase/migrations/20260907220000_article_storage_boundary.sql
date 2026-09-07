-- Match the existing Article Studio 5MiB/raster contract at the storage boundary.
-- Existing objects are untouched. Keep any stricter pre-existing limits.
DO $$
DECLARE b record; allowed text[];
BEGIN
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('article-assets-private','article-assets-public'))<>2 THEN
    RAISE EXCEPTION 'article_buckets_missing';
  END IF;
  FOR b IN SELECT id,allowed_mime_types FROM storage.buckets WHERE id IN ('article-assets-private','article-assets-public') FOR UPDATE LOOP
    IF b.allowed_mime_types IS NULL OR cardinality(b.allowed_mime_types)=0 THEN
      allowed:=ARRAY['image/jpeg','image/png','image/webp'];
    ELSE
      SELECT array_agg(m) INTO allowed FROM unnest(ARRAY['image/jpeg','image/png','image/webp']) m
      WHERE m=ANY(b.allowed_mime_types) OR 'image/*'=ANY(b.allowed_mime_types) OR '*/*'=ANY(b.allowed_mime_types);
      IF coalesce(cardinality(allowed),0)=0 THEN RAISE EXCEPTION 'article_mime_configuration_conflict'; END IF;
    END IF;
    UPDATE storage.buckets SET file_size_limit=least(coalesce(file_size_limit,5242880),5242880),allowed_mime_types=allowed WHERE id=b.id;
  END LOOP;
END $$;

-- All app public promotion/removal already use the service role after validation.
-- Restrictive policies also withstand another broad permissive policy being added.
DROP POLICY IF EXISTS "article public server insert only" ON storage.objects;
CREATE POLICY "article public server insert only" ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon,authenticated WITH CHECK (bucket_id<>'article-assets-public');
DROP POLICY IF EXISTS "article public server update only" ON storage.objects;
CREATE POLICY "article public server update only" ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon,authenticated USING (bucket_id<>'article-assets-public') WITH CHECK (bucket_id<>'article-assets-public');
DROP POLICY IF EXISTS "article public server delete only" ON storage.objects;
CREATE POLICY "article public server delete only" ON storage.objects AS RESTRICTIVE
  FOR DELETE TO anon,authenticated USING (bucket_id<>'article-assets-public');
