-- ============================================================================
-- VoltTrack — 0011 employees edit/delete their own entries until the week
-- is approved (or exported).
-- ============================================================================

-- Helper: is the local week of this entry locked (approved/exported timesheet)?
create or replace function public.is_entry_week_locked(p_entry public.time_entries)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1
    from public.timesheets t
    join public.companies c on c.id = p_entry.company_id
    where t.company_id = p_entry.company_id
      and t.employee_id = p_entry.employee_id
      and (p_entry.clock_in at time zone c.timezone)::date
            between t.week_start and t.week_end
      and t.status in ('approved', 'exported')
  );
$$;

-- ---------------------------------------------------------------------------
-- employee_update_entry: edit an own, completed entry
-- ---------------------------------------------------------------------------
create or replace function public.employee_update_entry(
  p_id uuid,
  p_job_site_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_note text default null
) returns public.time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.time_entries;
  v_entry public.time_entries;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_prev from public.time_entries where id = p_id;
  if not found then raise exception 'entry not found'; end if;
  if v_prev.employee_id <> auth.uid() then raise exception 'not your entry'; end if;
  if v_prev.status = 'active' then raise exception 'clock out first'; end if;
  if public.is_entry_week_locked(v_prev) then
    raise exception 'this week is already approved and can no longer be changed';
  end if;

  if p_clock_out <= p_clock_in then
    raise exception 'clock-out must be after clock-in';
  end if;
  if p_clock_in > now() then
    raise exception 'clock-in cannot be in the future';
  end if;
  if not exists (
    select 1 from public.job_sites
    where id = p_job_site_id and company_id = v_prev.company_id
  ) then
    raise exception 'job site not found';
  end if;

  update public.time_entries set
    job_site_id = p_job_site_id,
    clock_in = p_clock_in,
    clock_out = p_clock_out,
    employee_note = nullif(trim(p_note), ''),
    status = 'edited'
  where id = p_id
  returning * into v_entry;

  perform public.write_audit(v_prev.company_id, 'time_entry.self_edited', 'time_entry',
    v_entry.id, to_jsonb(v_prev), to_jsonb(v_entry));

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- employee_delete_entry: delete an own, completed entry
-- ---------------------------------------------------------------------------
create or replace function public.employee_delete_entry(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.time_entries;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_prev from public.time_entries where id = p_id;
  if not found then raise exception 'entry not found'; end if;
  if v_prev.employee_id <> auth.uid() then raise exception 'not your entry'; end if;
  if v_prev.status = 'active' then raise exception 'clock out first'; end if;
  if public.is_entry_week_locked(v_prev) then
    raise exception 'this week is already approved and can no longer be changed';
  end if;

  delete from public.time_entries where id = p_id;

  perform public.write_audit(v_prev.company_id, 'time_entry.self_deleted', 'time_entry',
    v_prev.id, to_jsonb(v_prev), null::jsonb);
end;
$$;

grant execute on function
  public.employee_update_entry(uuid, uuid, timestamptz, timestamptz, text),
  public.employee_delete_entry(uuid)
to authenticated;
