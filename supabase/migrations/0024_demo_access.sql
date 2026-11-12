-- ============================================================================
-- VoltTrack — 0024 one-tap demo access
--
-- The sign-in page has only "Owner" and "Employee" buttons. Each tap signs in
-- an anonymous Supabase user and calls demo_join(role), which adds that user
-- to the demo company with the chosen role. Only anonymous users can join,
-- and only the demo company; real companies are untouched.
-- ============================================================================

update public.companies c set name = 'VoltTrack Demo'
where c.id = (
  select m.company_id from public.company_members m
  join auth.users u on u.id = m.user_id
  where u.email = 'qa-owner-vt2@example.com' and m.role = 'owner'
  limit 1
);

create or replace function public.demo_join(p_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Demo access is only for demo sessions';
  end if;
  if p_role not in ('owner', 'employee') then raise exception 'Unknown role'; end if;

  select id into v_company from public.companies
  where name = 'VoltTrack Demo' order by created_at limit 1;
  if v_company is null then raise exception 'Demo company is missing'; end if;

  update public.profiles
  set full_name = case p_role when 'owner' then 'Demo Owner' else 'Demo Employee' end
  where id = v_uid;

  insert into public.company_members (company_id, user_id, role, status)
  values (v_company, v_uid, p_role, 'active')
  on conflict (company_id, user_id) do update set role = excluded.role, status = 'active';

  if p_role = 'employee' then
    insert into public.job_site_assignments (company_id, job_site_id, employee_id)
    select v_company, js.id, v_uid from public.job_sites js
    where js.company_id = v_company and js.status in ('planned', 'active', 'paused')
    on conflict (job_site_id, employee_id) do nothing;
  end if;
end;
$$;

revoke all on function public.demo_join(text) from public, anon;
grant execute on function public.demo_join(text) to authenticated;
