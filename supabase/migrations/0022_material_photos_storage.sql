-- ============================================================================
-- VoltTrack — 0022 storage bucket for material photos
--
-- AddMaterialModal has been uploading to a 'job-site-files' bucket that was
-- never actually created — uploads always failed silently past this point
-- (never caught in testing since automated tests didn't attach real files).
-- This creates the real bucket, named after what it stores, plus policies
-- scoped to company membership via the job site the photo belongs to.
-- Path shape: materials/{job_site_id}/{timestamp}-photo
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('material-photos', 'material-photos', true, 8388608) -- 8 MB, post client-compression
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "material photos public read" ON storage.objects;
CREATE POLICY "material photos public read" ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'material-photos');

DROP POLICY IF EXISTS "material photos company upload" ON storage.objects;
CREATE POLICY "material photos company upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'material-photos'
    AND EXISTS (
      SELECT 1 FROM public.job_sites js
      WHERE js.id::text = (storage.foldername(name))[2]
        AND js.company_id IN (SELECT public.auth_company_ids())
    )
  );

DROP POLICY IF EXISTS "material photos company delete" ON storage.objects;
CREATE POLICY "material photos company delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'material-photos'
    AND EXISTS (
      SELECT 1 FROM public.job_sites js
      WHERE js.id::text = (storage.foldername(name))[2]
        AND js.company_id IN (SELECT public.auth_company_ids())
    )
  );
