-- ============================================================================
-- VoltTrack — 0008 owner enhancements: auto-submit, logo
-- ============================================================================

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS auto_submit_day smallint;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS auto_submit_hour smallint DEFAULT 17;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;
