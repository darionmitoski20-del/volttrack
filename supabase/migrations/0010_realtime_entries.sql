-- ============================================================================
-- VoltTrack — 0010 realtime on time_entries (live hours page updates instantly)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'time_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
  END IF;
END $$;
