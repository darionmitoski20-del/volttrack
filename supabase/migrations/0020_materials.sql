-- ============================================================================
-- VoltTrack — 0020 materials tracking
--
-- New materials management system to track supplies/equipment usage:
--   - Materials table: stores material entries with photo proof
--   - Tracks: name, category, quantity, price, who added it, when, where, time spent
--   - Custom categories per company
--   - Financial reporting by job site
-- ============================================================================

create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, name)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete restrict,
  category_id uuid references public.material_categories(id) on delete set null,
  category_name text not null,
  name text not null,
  description text,
  quantity numeric(10,2) not null,
  unit text default 'pcs',
  price numeric(10,2),
  photo_url text,
  receipt_url text,
  clock_in timestamptz not null,
  clock_out timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint check_quantity_positive check (quantity > 0),
  constraint check_price_positive check (price is null or price > 0)
);

create index if not exists idx_materials_company_id on public.materials(company_id);
create index if not exists idx_materials_job_site_id on public.materials(job_site_id);
create index if not exists idx_materials_added_by on public.materials(added_by);
create index if not exists idx_materials_created_at on public.materials(created_at desc);
create index if not exists idx_material_categories_company on public.material_categories(company_id);

-- RLS for material_categories
alter table public.material_categories enable row level security;

create policy "users can view categories for their company"
  on public.material_categories for select
  using (company_id in (select public.auth_company_ids()));

create policy "owner can manage categories"
  on public.material_categories for all
  using (
    company_id in (select public.auth_company_ids()) and
    public.is_company_owner(company_id)
  )
  with check (
    company_id in (select public.auth_company_ids()) and
    public.is_company_owner(company_id)
  );

-- RLS for materials
alter table public.materials enable row level security;

create policy "users can view materials for their company"
  on public.materials for select
  using (company_id in (select public.auth_company_ids()));

create policy "employees can add materials for their company"
  on public.materials for insert
  with check (
    company_id in (select public.auth_company_ids()) and
    added_by = auth.uid()
  );

create policy "employees can update own materials"
  on public.materials for update
  using (
    company_id in (select public.auth_company_ids()) and
    added_by = auth.uid()
  )
  with check (
    company_id in (select public.auth_company_ids()) and
    added_by = auth.uid()
  );

create policy "employees can delete own materials"
  on public.materials for delete
  using (
    company_id in (select public.auth_company_ids()) and
    added_by = auth.uid()
  );

-- Function: calculate material costs by job site
create or replace function public.get_material_costs_by_job_site(
  p_company uuid,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  job_site_id uuid,
  job_site_name text,
  total_cost numeric,
  material_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    js.id,
    js.name,
    coalesce(sum(m.price * m.quantity), 0),
    count(m.id)
  from public.job_sites js
  left join public.materials m on m.job_site_id = js.id
  where js.company_id = p_company
    and (p_start_date is null or (m.created_at::date >= p_start_date or m.id is null))
    and (p_end_date is null or (m.created_at::date <= p_end_date or m.id is null))
  group by js.id, js.name
  order by total_cost desc;
$$;

grant execute on function public.get_material_costs_by_job_site(uuid, date, date) to authenticated;

-- Function: calculate material costs by employee
create or replace function public.get_material_costs_by_employee(
  p_company uuid,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  employee_id uuid,
  employee_name text,
  total_cost numeric,
  material_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    coalesce(sum(m.price * m.quantity), 0),
    count(m.id)
  from public.profiles p
  left join public.materials m on m.added_by = p.id
  where m.company_id = p_company
    and (p_start_date is null or (m.created_at::date >= p_start_date or m.id is null))
    and (p_end_date is null or (m.created_at::date <= p_end_date or m.id is null))
  group by p.id, p.full_name
  order by total_cost desc;
$$;

grant execute on function public.get_material_costs_by_employee(uuid, date, date) to authenticated;
