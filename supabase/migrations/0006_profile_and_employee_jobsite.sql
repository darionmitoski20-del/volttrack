-- ============================================================================
-- VoltTrack — 0006 employee profile, enhanced hours entry, employee job sites
-- ============================================================================

-- Add phone to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- ---------------------------------------------------------------------------
-- update_own_profile: employee self-edit
-- ---------------------------------------------------------------------------
create or replace function public.update_own_profile(
  p_full_name text,
  p_phone text default null,
  p_avatar_url text default null
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.profiles;
  v_profile public.profiles;
  v_company uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_prev from public.profiles where id = auth.uid();
  if not found then raise exception 'profile not found'; end if;

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'name is required';
  end if;

  update public.profiles set
    full_name = btrim(p_full_name),
    phone = nullif(btrim(p_phone), ''),
    avatar_url = nullif(btrim(p_avatar_url), '')
  where id = auth.uid()
  returning * into v_profile;

  select company_id into v_company
  from public.company_members
  where user_id = auth.uid() and status = 'active'
  limit 1;

  if v_company is not null then
    perform public.write_audit(v_company, 'profile.updated', 'profile',
      auth.uid(), to_jsonb(v_prev), to_jsonb(v_profile));
  end if;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- employee_create_job_site: any active member can create a job site
-- ---------------------------------------------------------------------------
create or replace function public.employee_create_job_site(
  p_name text,
  p_client_name text default null,
  p_description text default null
) returns public.job_sites
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_site public.job_sites;
  v_assign public.job_site_assignments;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select company_id into v_company
  from public.company_members
  where user_id = auth.uid() and status = 'active'
  limit 1;
  if v_company is null then raise exception 'not an active member of any company'; end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'job site name is required';
  end if;

  insert into public.job_sites (
    company_id, name, client_name, description, status, created_by
  ) values (
    v_company, btrim(p_name), nullif(btrim(p_client_name), ''),
    nullif(btrim(p_description), ''), 'active', auth.uid()
  ) returning * into v_site;

  insert into public.job_site_assignments (company_id, job_site_id, employee_id, assigned_by)
  values (v_company, v_site.id, auth.uid(), auth.uid())
  returning * into v_assign;

  perform public.write_audit(v_company, 'job_site.created_by_employee', 'job_site',
    v_site.id, null, to_jsonb(v_site));
  perform public.notify_owners(v_company, 'job_site_created',
    'New job site created',
    (select full_name from public.profiles where id = auth.uid()) ||
    ' created a new job site: ' || v_site.name || '.');

  return v_site;
end;
$$;

-- ---------------------------------------------------------------------------
-- employee_add_hours: enhanced manual entry with overlap detection & coworkers
-- ---------------------------------------------------------------------------
create or replace function public.employee_add_hours(
  p_job_site_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_note text default null,
  p_coworker_ids uuid[] default '{}',
  p_force boolean default false
) returns public.time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_site public.job_sites;
  v_entry public.time_entries;
  v_overlap record;
  v_cw_id uuid;
  v_caller_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_site from public.job_sites where id = p_job_site_id;
  if not found then raise exception 'job site not found'; end if;
  if not public.is_company_member(v_site.company_id) then
    raise exception 'not a member of this company';
  end if;

  if p_clock_out <= p_clock_in then
    raise exception 'clock-out must be after clock-in';
  end if;

  if p_clock_in > now() then
    raise exception 'clock-in cannot be in the future';
  end if;

  -- Overlap detection
  if not p_force then
    select id, clock_in, clock_out into v_overlap
    from public.time_entries
    where employee_id = auth.uid()
      and company_id = v_site.company_id
      and status in ('active', 'completed', 'edited')
      and clock_out > p_clock_in
      and clock_in < p_clock_out
    limit 1;

    if found then
      raise exception 'overlap::%::% - %',
        v_overlap.id, v_overlap.clock_in, v_overlap.clock_out;
    end if;
  end if;

  insert into public.time_entries (
    company_id, employee_id, job_site_id, clock_in, clock_out,
    employee_note, status
  ) values (
    v_site.company_id, auth.uid(), p_job_site_id, p_clock_in, p_clock_out,
    nullif(trim(p_note), ''), 'completed'
  ) returning * into v_entry;

  perform public.write_audit(v_site.company_id, 'time_entry.manual', 'time_entry',
    v_entry.id, null, to_jsonb(v_entry));

  select full_name into v_caller_name from public.profiles where id = auth.uid();

  perform public.notify_owners(v_site.company_id, 'manual_time_entry',
    'Manual time entry added',
    coalesce(v_caller_name, 'An employee') ||
    ' added hours for ' || v_site.name || '.');

  -- Create entries for coworkers
  if array_length(p_coworker_ids, 1) > 0 then
    foreach v_cw_id in array p_coworker_ids loop
      if v_cw_id = auth.uid() then continue; end if;

      if not exists (
        select 1 from public.company_members
        where company_id = v_site.company_id and user_id = v_cw_id and status = 'active'
      ) then continue; end if;

      insert into public.time_entries (
        company_id, employee_id, job_site_id, clock_in, clock_out,
        employee_note, status
      ) values (
        v_site.company_id, v_cw_id, p_job_site_id, p_clock_in, p_clock_out,
        'Added by ' || coalesce(v_caller_name, 'coworker') ||
          case when p_note is not null and trim(p_note) <> '' then ': ' || trim(p_note) else '' end,
        'completed'
      );
    end loop;
  end if;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function
  public.update_own_profile(text, text, text),
  public.employee_create_job_site(text, text, text),
  public.employee_add_hours(uuid, timestamptz, timestamptz, text, uuid[], boolean)
to authenticated;
