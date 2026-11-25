-- Problems marked on a plan sheet (red circle): e.g. an outlet is missing, wrong place, damaged.
-- Anyone in the company can add one and mark it fixed; the owner or whoever added it can delete it.
create table if not exists public.plan_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  sheet text not null,
  x real not null,
  y real not null,
  note text,
  status text not null default 'open',      -- open | fixed
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  fixed_by uuid references public.profiles(id) on delete set null,
  fixed_at timestamptz
);
create index if not exists idx_plan_issues_site on public.plan_issues(job_site_id, sheet);

alter table public.plan_issues enable row level security;
create policy plan_issues_select on public.plan_issues for select
  using (company_id in (select public.auth_company_ids()));
create policy plan_issues_insert on public.plan_issues for insert
  with check (company_id in (select public.auth_company_ids()) and created_by = auth.uid());
create policy plan_issues_update on public.plan_issues for update
  using (company_id in (select public.auth_company_ids()))
  with check (company_id in (select public.auth_company_ids()));
create policy plan_issues_delete on public.plan_issues for delete
  using (public.is_company_owner(company_id) or created_by = auth.uid());

grant select, insert, update, delete on public.plan_issues to authenticated;
