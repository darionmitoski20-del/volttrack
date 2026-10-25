-- ============================================================================
-- VoltTrack — 0013 storage bucket for chat attachments
--
-- Split out from 0012 on purpose: policies on storage.objects can fail with a
-- permissions error depending on the project, and that must not roll back the
-- chat schema. Text chat works without this; only attachments need it.
--
-- If the CREATE POLICY statements below fail, create the bucket from the
-- Supabase dashboard instead (Storage → New bucket → name "chat-attachments",
-- private, 10 MB limit) and add the same three policies from that UI.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat attachments upload" ON storage.objects;
CREATE POLICY "chat attachments upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "chat attachments read" ON storage.objects;
CREATE POLICY "chat attachments read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "chat attachments delete own" ON storage.objects;
CREATE POLICY "chat attachments delete own" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid());
