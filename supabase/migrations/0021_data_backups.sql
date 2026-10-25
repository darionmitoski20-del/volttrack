-- ============================================================================
-- VoltTrack — 0021 monthly automated data backup/export
--
-- Stores a JSON snapshot of a company's core data (members, job sites, time
-- entries, timesheets, materials) once a month via pg_cron, so an owner can
-- always recover a point-in-time export even without touching the dashboard.
-- Owners can also trigger an on-demand backup from Settings.
-- ============================================================================

create table if not exists public.data_backups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period text not null, -- e.g. '2026-08'
  payload jsonb not null,
  created_at timestamptz default now(),
  unique (company_id, period)
);

create index if not exists idx_data_backups_company on public.data_backups(company_id, created_at desc);

alter table public.data_backups enable row level security;

create policy "owner can view own company backups"
  on public.data_backups for select
  using (
    company_id in (select public.auth_company_ids()) and
    public.is_company_owner(company_id)
  );

-- Builds the JSON snapshot for one company. Shared by the manual RPC and the
-- scheduled monthly job.
create or replace function public.build_company_backup(p_company uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'company', (select to_jsonb(c) from public.companies c where c.id = p_company),
    'members', (
      select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('full_name', p.full_name, 'email', p.email)), '[]'::jsonb)
      from public.company_members m
      join public.profiles p on p.id = m.user_id
      where m.company_id = p_company
    ),
    'job_sites', (
      select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
      from public.job_sites j where j.company_id = p_company
    ),
    'time_entries', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.time_entries t where t.company_id = p_company
    ),
    'timesheets', (
      select coalesce(jsonb_agg(to_jsonb(ts)), '[]'::jsonb)
      from public.timesheets ts where ts.company_id = p_company
    ),
    'materials', (
      select coalesce(jsonb_agg(to_jsonb(mt)), '[]'::jsonb)
      from public.materials mt where mt.company_id = p_company
    )
  );
$$;

-- Manual, owner-triggered backup of the current month.
create or replace function public.generate_backup_now(p_company uuid)
returns public.data_backups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_row public.data_backups;
begin
  if not public.is_company_owner(p_company) then
    raise exception 'not authorized';
  end if;

  insert into public.data_backups (company_id, period, payload)
  values (p_company, v_period, public.build_company_backup(p_company))
  on conflict (company_id, period) do update
    set payload = excluded.payload, created_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.generate_backup_now(uuid) to authenticated;

-- System-context version for the scheduler: no auth.uid(), runs for every company.
create or replace function public.run_monthly_backups()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_period text := to_char(now(), 'YYYY-MM');
begin
  for c in select id from public.companies loop
    insert into public.data_backups (company_id, period, payload)
    values (c.id, v_period, public.build_company_backup(c.id))
    on conflict (company_id, period) do update
      set payload = excluded.payload, created_at = now();
  end loop;
end;
$$;

-- Schedule: 1st of every month at 03:00 UTC. Mirrors the pattern in
-- 0016_timesheet_cron.sql — if pg_cron isn't enabled yet, enable it from the
-- Supabase dashboard (Database → Extensions) and re-run just the schedule call.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job where jobname = 'monthly-data-backup';
exception when others then null;
end $$;

select cron.schedule(
  'monthly-data-backup',
  '0 3 1 * *',
  $$select public.run_monthly_backups();$$
);
