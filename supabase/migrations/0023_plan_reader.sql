-- ============================================================================
-- VoltTrack — 0023 Plan Reader
--
-- Reads electrical plan PDFs in the browser and counts devices per room.
-- Workers mark each device Done / Not done; everyone in the company can see
-- who completed which device and when.
--
--   plan_versions  one uploaded PDF (revision) per job site
--   plan_sheets    plan sheets found in a version (E2.01, FA3.02 ...)
--   plan_items     devices found on the sheets (uid stays the same across revisions)
--   plan_work      Done / Not done history per device (latest row wins)
--   plan_symbols   symbols the company taught the reader (in addition to the built-in set)
--
-- Storage bucket 'plans' (private): {company_id}/{job_site_id}/v{n}/...
-- ============================================================================

create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  n int not null,
  file_name text not null,
  pdf_path text,
  status text not null default 'processing' check (status in ('processing', 'done', 'error')),
  sheet_count int not null default 0,
  item_count int not null default 0,
  diff jsonb,
  error text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (job_site_id, n)
);

create table if not exists public.plan_sheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  version_id uuid not null references public.plan_versions(id) on delete cascade,
  page int not null,
  number text not null,
  title text,
  discipline text not null,
  floor text not null,
  level int not null default 0,
  width real not null,
  height real not null,
  image_path text,
  offset_x real not null default 0,
  offset_y real not null default 0
);

create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  version_id uuid not null references public.plan_versions(id) on delete cascade,
  uid text not null,
  sheet text not null,
  cls text not null,
  name text not null,
  x real not null,
  y real not null,
  room text not null default '',
  existing boolean not null default false,
  conf real,
  src text not null default 'symbol' check (src in ('symbol', 'text', 'manual')),
  grp text,
  dims int[],
  feat text,
  crop text
);

create table if not exists public.plan_work (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  item_uid text not null,
  done boolean not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_symbols (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  grp text not null,
  cls text not null,
  dims int[] not null,
  feat text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_versions_site on public.plan_versions(job_site_id, n desc);
create index if not exists idx_plan_sheets_version on public.plan_sheets(version_id);
create index if not exists idx_plan_items_version on public.plan_items(version_id);
create index if not exists idx_plan_items_uid on public.plan_items(job_site_id, uid);
create index if not exists idx_plan_work_site on public.plan_work(job_site_id, created_at desc);
create index if not exists idx_plan_work_uid on public.plan_work(job_site_id, item_uid, created_at desc);
create index if not exists idx_plan_symbols_company on public.plan_symbols(company_id);

alter table public.plan_versions enable row level security;
alter table public.plan_sheets   enable row level security;
alter table public.plan_items    enable row level security;
alter table public.plan_work     enable row level security;
alter table public.plan_symbols  enable row level security;

-- Everyone in the company can see plans, devices and who did the work.
create policy plan_versions_select on public.plan_versions for select using (company_id in (select public.auth_company_ids()));
create policy plan_sheets_select   on public.plan_sheets   for select using (company_id in (select public.auth_company_ids()));
create policy plan_items_select    on public.plan_items    for select using (company_id in (select public.auth_company_ids()));
create policy plan_work_select     on public.plan_work     for select using (company_id in (select public.auth_company_ids()));
create policy plan_symbols_select  on public.plan_symbols  for select using (company_id in (select public.auth_company_ids()));

-- Only the owner uploads plans, fixes devices and teaches symbols.
create policy plan_versions_owner on public.plan_versions for all
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
create policy plan_sheets_owner on public.plan_sheets for all
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
create policy plan_items_owner on public.plan_items for all
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
create policy plan_symbols_owner on public.plan_symbols for all
  using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));

-- Any active member marks work, always as themselves.
create policy plan_work_insert on public.plan_work for insert
  with check (company_id in (select public.auth_company_ids()) and user_id = auth.uid());
-- Work history is never edited; the owner may clean up mistakes.
create policy plan_work_owner_delete on public.plan_work for delete
  using (public.is_company_owner(company_id));

-- Storage: private bucket, readable by the company, written by the owner.
insert into storage.buckets (id, name, public, file_size_limit)
values ('plans', 'plans', false, 209715200) -- 200 MB
on conflict (id) do nothing;

-- (compared as text, so paths in other buckets are never cast to uuid)
drop policy if exists "plans company read" on storage.objects;
create policy "plans company read" on storage.objects for select to authenticated
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] in (select c::text from public.auth_company_ids() c)
  );

drop policy if exists "plans owner write" on storage.objects;
create policy "plans owner write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'plans'
    and exists (
      select 1 from public.company_members m
      where m.company_id::text = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'active'
    )
  );

drop policy if exists "plans owner delete" on storage.objects;
create policy "plans owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'plans'
    and exists (
      select 1 from public.company_members m
      where m.company_id::text = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'active'
    )
  );
