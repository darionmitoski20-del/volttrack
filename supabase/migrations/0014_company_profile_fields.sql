-- ============================================================================
-- VoltTrack — 0014 company profile fields + logo storage
--
-- Adds contact email and a structured address (street/city/postal code) to
-- companies, replacing the single free-text `address` column going forward
-- (kept for backward compatibility with existing rows/reports).
-- Also provisions a public "company-logos" bucket, following the same
-- split-migration pattern as 0013 (storage policies can fail independently
-- of the schema change on some projects).
-- ============================================================================

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_line text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS postal_code text;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('company-logos', 'company-logos', true, 2097152)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company logos public read" ON storage.objects;
CREATE POLICY "company logos public read" ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "company logos owner write" ON storage.objects;
CREATE POLICY "company logos owner write" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'owner'
        AND m.status = 'active'
        AND m.company_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "company logos owner update" ON storage.objects;
CREATE POLICY "company logos owner update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'owner'
        AND m.status = 'active'
        AND m.company_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "company logos owner delete" ON storage.objects;
CREATE POLICY "company logos owner delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'owner'
        AND m.status = 'active'
        AND m.company_id::text = (storage.foldername(name))[1]
    )
  );
