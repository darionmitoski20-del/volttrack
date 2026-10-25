-- ============================================================================
-- VoltTrack — 0016 schedule the timesheet automation hourly via pg_cron
--
-- Split out from 0015 on purpose: enabling pg_cron requires the extension to
-- be available on the project, which can fail depending on plan/settings.
-- If this fails, enable "pg_cron" from the Supabase dashboard
-- (Database -> Extensions) and then run just the `cron.schedule(...)` call
-- below by hand.
-- ============================================================================

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job where jobname = 'timesheet-auto-submit-hourly';
exception when others then null;
end $$;

select cron.schedule(
  'timesheet-auto-submit-hourly',
  '0 * * * *',
  $$select public.run_scheduled_timesheet_automation();$$
);
