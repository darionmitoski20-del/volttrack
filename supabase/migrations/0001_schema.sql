-- ============================================================================
-- VoltTrack — 0001 schema
-- Tables, constraints, foreign keys, indexes, and updated_at triggers.
-- Status/role columns use TEXT + CHECK constraints (easy to extend, no enum
-- migration pain). All timestamps are stored in UTC (timestamptz).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  timezone    text not null default 'UTC',
  address     text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_companies_updated before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_members (which users belong to which company + role/status)
-- ---------------------------------------------------------------------------
create table public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('owner', 'employee')),
  status      text not null default 'active'
                check (status in ('active', 'inactive', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index idx_members_company on public.company_members (company_id);
create index idx_members_user on public.company_members (user_id);
create trigger trg_members_updated before update on public.company_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- employee_invitations
-- ---------------------------------------------------------------------------
create table public.employee_invitations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  role         text not null default 'employee' check (role in ('owner', 'employee')),
  secure_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  invited_by   uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_invites_company on public.employee_invitations (company_id);
create index idx_invites_token on public.employee_invitations (secure_token);
-- Only one live (pending) invite per email per company.
create unique index idx_invites_unique_pending
  on public.employee_invitations (company_id, lower(email))
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- job_sites
-- ---------------------------------------------------------------------------
create table public.job_sites (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  client_name      text,
  address          text,
  description      text,
  status           text not null default 'planned'
                     check (status in ('planned', 'active', 'paused', 'completed', 'archived')),
  estimated_hours  numeric(8, 2) check (estimated_hours is null or estimated_hours >= 0),
  start_date       date,
  end_date         date,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index idx_jobsites_company on public.job_sites (company_id);
create index idx_jobsites_status on public.job_sites (company_id, status);
create trigger trg_jobsites_updated before update on public.job_sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- job_site_assignments
-- ---------------------------------------------------------------------------
create table public.job_site_assignments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  job_site_id  uuid not null references public.job_sites (id) on delete cascade,
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references public.profiles (id) on delete set null,
  unique (job_site_id, employee_id)
);
create index idx_assign_company on public.job_site_assignments (company_id);
create index idx_assign_employee on public.job_site_assignments (employee_id);
create index idx_assign_jobsite on public.job_site_assignments (job_site_id);

-- ---------------------------------------------------------------------------
-- time_entries (shifts)
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  employee_id   uuid not null references public.profiles (id) on delete cascade,
  job_site_id   uuid not null references public.job_sites (id) on delete restrict,
  clock_in      timestamptz not null,
  clock_out     timestamptz,
  employee_note text,
  owner_note    text,
  status        text not null default 'active'
                  check (status in ('active', 'completed', 'incomplete', 'edited')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create index idx_entries_company on public.time_entries (company_id);
create index idx_entries_employee on public.time_entries (employee_id, clock_in desc);
create index idx_entries_jobsite on public.time_entries (job_site_id);
create index idx_entries_clockin on public.time_entries (company_id, clock_in desc);
-- Hard guarantee: at most one active shift per employee per company.
create unique index idx_entries_one_active
  on public.time_entries (company_id, employee_id)
  where status = 'active';
create trigger trg_entries_updated before update on public.time_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- breaks
-- ---------------------------------------------------------------------------
create table public.breaks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  employee_id   uuid not null references public.profiles (id) on delete cascade,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);
create index idx_breaks_entry on public.breaks (time_entry_id);
create index idx_breaks_company on public.breaks (company_id);
-- At most one open break per shift.
create unique index idx_breaks_one_open
  on public.breaks (time_entry_id)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- timesheets (weekly)
-- ---------------------------------------------------------------------------
create table public.timesheets (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  employee_id       uuid not null references public.profiles (id) on delete cascade,
  week_start        date not null,       -- Monday (company tz), inclusive
  week_end          date not null,       -- Sunday (company tz), inclusive
  regular_minutes   integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes  integer not null default 0 check (overtime_minutes >= 0),
  status            text not null default 'draft'
                      check (status in ('draft', 'submitted', 'approved', 'rejected', 'exported')),
  employee_comment  text,
  owner_comment     text,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, employee_id, week_start)
);
create index idx_timesheets_company on public.timesheets (company_id, status);
create index idx_timesheets_employee on public.timesheets (employee_id, week_start desc);
create trigger trg_timesheets_updated before update on public.timesheets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  actor_id       uuid references public.profiles (id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  previous_value jsonb,
  new_value      jsonb,
  created_at     timestamptz not null default now()
);
create index idx_audit_company on public.audit_logs (company_id, created_at desc);
create index idx_audit_entity on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- notifications (in-app only for MVP)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  message     text not null default '',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_notifications_user on public.notifications (user_id, is_read, created_at desc);
