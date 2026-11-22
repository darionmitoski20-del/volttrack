-- employee_add_hours without duplicate hours:
--  * the exact same entry (same person, site, start and end) is never saved twice — a retry returns the existing one
--  * coworkers who already have hours in that time are not given a second, overlapping entry
--    (without p_force the call stops with 'coworker_overlap::<names>' so the app can ask first)
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
  v_busy text;
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

  -- The same entry already saved (double tap, or a retry after "Save anyway"): reuse it.
  select * into v_entry from public.time_entries
  where employee_id = auth.uid() and company_id = v_site.company_id
    and job_site_id = p_job_site_id and clock_in = p_clock_in and clock_out = p_clock_out
    and status in ('active', 'completed', 'edited')
  limit 1;

  if v_entry.id is null and not p_force then
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

  -- Coworkers who already have hours in this time (not counting this exact entry).
  if not p_force and coalesce(array_length(p_coworker_ids, 1), 0) > 0 then
    select string_agg(distinct coalesce(p.full_name, 'A coworker'), ', ') into v_busy
    from public.time_entries t
    left join public.profiles p on p.id = t.employee_id
    where t.employee_id = any(p_coworker_ids)
      and t.employee_id <> auth.uid()
      and t.company_id = v_site.company_id
      and t.status in ('active', 'completed', 'edited')
      and t.clock_out > p_clock_in
      and t.clock_in < p_clock_out
      and not (t.job_site_id = p_job_site_id and t.clock_in = p_clock_in and t.clock_out = p_clock_out);
    if v_busy is not null then
      raise exception 'coworker_overlap::%', v_busy;
    end if;
  end if;

  select full_name into v_caller_name from public.profiles where id = auth.uid();

  if v_entry.id is null then
    insert into public.time_entries (
      company_id, employee_id, job_site_id, clock_in, clock_out,
      employee_note, status
    ) values (
      v_site.company_id, auth.uid(), p_job_site_id, p_clock_in, p_clock_out,
      nullif(trim(p_note), ''), 'completed'
    ) returning * into v_entry;

    perform public.write_audit(v_site.company_id, 'time_entry.manual', 'time_entry',
      v_entry.id, null, to_jsonb(v_entry));

    perform public.notify_owners(v_site.company_id, 'manual_time_entry',
      'Manual time entry added',
      coalesce(v_caller_name, 'An employee') ||
      ' added hours for ' || v_site.name || '.');
  end if;

  -- Entries for coworkers — never on top of hours they already have.
  if coalesce(array_length(p_coworker_ids, 1), 0) > 0 then
    foreach v_cw_id in array p_coworker_ids loop
      if v_cw_id = auth.uid() then continue; end if;

      if not exists (
        select 1 from public.company_members
        where company_id = v_site.company_id and user_id = v_cw_id and status = 'active'
      ) then continue; end if;

      if exists (
        select 1 from public.time_entries
        where employee_id = v_cw_id
          and company_id = v_site.company_id
          and status in ('active', 'completed', 'edited')
          and clock_out > p_clock_in
          and clock_in < p_clock_out
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
