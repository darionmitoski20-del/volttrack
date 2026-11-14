-- ============================================================================
-- VoltTrack — 0026 AI reading of legends and schedules
--
-- The owner sends the legend / schedule pages of a plan to the "plan-ai" edge
-- function (Claude). The extracted legend, light fixture schedule, panel
-- schedules and notes are stored per page of a plan version.
-- ============================================================================

create table if not exists public.plan_ai_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  version_id uuid not null references public.plan_versions(id) on delete cascade,
  page int not null,
  title text not null default '',
  result jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_ai_site on public.plan_ai_pages(job_site_id, version_id, page);
create index if not exists idx_plan_ai_company_time on public.plan_ai_pages(company_id, created_at desc);

alter table public.plan_ai_pages enable row level security;
drop policy if exists plan_ai_select on public.plan_ai_pages;
drop policy if exists plan_ai_owner on public.plan_ai_pages;
create policy plan_ai_select on public.plan_ai_pages for select
  using (company_id in (select public.auth_company_ids()));
create policy plan_ai_owner on public.plan_ai_pages for all
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
