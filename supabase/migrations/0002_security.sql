-- ============================================================================
-- VoltTrack — 0002 security (Row Level Security)
--
-- Model:
--   * Every domain row carries company_id.
--   * A user may read/write a row only for companies they are an ACTIVE member of.
--   * Owners get administrative write access; employees get scoped self-access.
--
-- Helper functions are SECURITY DEFINER so policies can consult company_members
-- without triggering recursive RLS on that table.
-- ============================================================================

-- companies the current user is an ACTIVE member of ------------------------
create or replace function public.auth_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.company_members
  where user_id = auth.uid() and status = 'active';
$$;

-- is the current user an ACTIVE owner of the given company? -----------------
create or replace function public.is_company_owner(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = target_company
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  );
$$;

-- is the current user an ACTIVE member (any role) of the given company? ------
create or replace function public.is_company_member(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = target_company
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.companies             enable row level security;
alter table public.company_members       enable row level security;
alter table public.employee_invitations  enable row level security;
alter table public.job_sites             enable row level security;
alter table public.job_site_assignments  enable row level security;
alter table public.time_entries          enable row level security;
alter table public.breaks                enable row level security;
alter table public.timesheets            enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.notifications         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: read your own + coworkers'; update only your own
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.company_members me
      join public.company_members them on them.company_id = me.company_id
      where me.user_id = auth.uid() and me.status = 'active'
        and them.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- companies: members read; owners update. (Creation goes through an RPC.)
-- ---------------------------------------------------------------------------
create policy companies_select on public.companies for select
  using (is_company_member(id));
create policy companies_update on public.companies for update
  using (is_company_owner(id)) with check (is_company_owner(id));

-- ---------------------------------------------------------------------------
-- company_members: members read within their company; owners manage.
-- ---------------------------------------------------------------------------
create policy members_select on public.company_members for select
  using (company_id in (select auth_company_ids()));
create policy members_owner_insert on public.company_members for insert
  with check (is_company_owner(company_id));
create policy members_owner_update on public.company_members for update
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));
create policy members_owner_delete on public.company_members for delete
  using (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- employee_invitations: owners manage; token-based acceptance uses an RPC.
-- ---------------------------------------------------------------------------
create policy invites_owner_all on public.employee_invitations for all
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- job_sites: members read; owners write.
-- ---------------------------------------------------------------------------
create policy jobsites_select on public.job_sites for select
  using (is_company_member(company_id));
create policy jobsites_owner_write on public.job_sites for all
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- job_site_assignments: members read (employees see their own team);
-- owners write.
-- ---------------------------------------------------------------------------
create policy assign_select on public.job_site_assignments for select
  using (is_company_member(company_id));
create policy assign_owner_write on public.job_site_assignments for all
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- time_entries:
--   * employees read their own; owners read all in company.
--   * clock in/out/break happen through SECURITY DEFINER RPCs (see 0003),
--     so direct INSERT is closed; owners may UPDATE (edit entries).
-- ---------------------------------------------------------------------------
create policy entries_select on public.time_entries for select
  using (
    company_id in (select auth_company_ids())
    and (employee_id = auth.uid() or is_company_owner(company_id))
  );
create policy entries_owner_update on public.time_entries for update
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- breaks: same visibility rule as their parent entry. Writes via RPCs.
-- ---------------------------------------------------------------------------
create policy breaks_select on public.breaks for select
  using (
    company_id in (select auth_company_ids())
    and (employee_id = auth.uid() or is_company_owner(company_id))
  );

-- ---------------------------------------------------------------------------
-- timesheets:
--   * employees read their own; owners read all.
--   * employees may create/update their own DRAFT timesheets; submit &
--     review go through RPCs. Owners may update (review/export).
-- ---------------------------------------------------------------------------
create policy timesheets_select on public.timesheets for select
  using (
    company_id in (select auth_company_ids())
    and (employee_id = auth.uid() or is_company_owner(company_id))
  );
create policy timesheets_emp_insert on public.timesheets for insert
  with check (
    employee_id = auth.uid()
    and is_company_member(company_id)
    and status = 'draft'
  );
create policy timesheets_emp_update on public.timesheets for update
  using (employee_id = auth.uid() and status in ('draft', 'rejected'))
  with check (employee_id = auth.uid());
create policy timesheets_owner_update on public.timesheets for update
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- audit_logs: owners read within company. Writes happen via SECURITY DEFINER
-- functions/triggers only (no client policy → inserts are closed to clients).
-- ---------------------------------------------------------------------------
create policy audit_owner_select on public.audit_logs for select
  using (is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- notifications: users read & update (mark-read) their own only.
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
