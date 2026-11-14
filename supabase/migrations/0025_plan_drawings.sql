-- ============================================================================
-- VoltTrack — 0025 hand-drawn routes on plans
--
-- The owner draws lines on a plan sheet with a pencil tool (e.g. how lights
-- are connected). Drawings belong to the job site + sheet number, so they stay
-- in place when a new revision of the plan is uploaded.
-- ============================================================================

create table if not exists public.plan_drawings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  sheet text not null,
  points real[] not null,            -- x0, y0, x1, y1, ... in sheet points
  color text not null default '#dc2626',
  width real not null default 3,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_drawings_site on public.plan_drawings(job_site_id, sheet);

alter table public.plan_drawings enable row level security;

create policy plan_drawings_select on public.plan_drawings for select
  using (company_id in (select public.auth_company_ids()));
create policy plan_drawings_owner on public.plan_drawings for all
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
