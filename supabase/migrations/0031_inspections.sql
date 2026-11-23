-- Inspections: the owner records when and what inspection a job site has; everyone in the company can see them.
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  type text not null,                          -- e.g. Rough-in, Above ceiling, Fire alarm, Final
  inspection_date date not null,
  inspection_time text,                        -- 'HH:MM', company local time
  inspector text,
  inspector_phone text,
  status text not null default 'scheduled',    -- scheduled | passed | failed | partial | cancelled
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inspections_company_date on public.inspections(company_id, inspection_date);
create index if not exists idx_inspections_site on public.inspections(job_site_id);

alter table public.inspections enable row level security;
drop policy if exists inspections_select on public.inspections;
drop policy if exists inspections_owner on public.inspections;
create policy inspections_select on public.inspections for select
  using (company_id in (select public.auth_company_ids()));
create policy inspections_owner on public.inspections for all
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

grant select, insert, update, delete on public.inspections to authenticated;
