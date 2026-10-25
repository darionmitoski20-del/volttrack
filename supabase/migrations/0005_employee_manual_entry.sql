-- ============================================================================
-- VoltTrack — 0005 employee manual time entry
--
-- Allows employees to add past time entries manually (e.g. forgot to clock in).
-- The entry is created with status 'completed' and recorded in the audit log.
-- ============================================================================

create or replace function public.add_manual_time_entry(
  p_job_site_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_note text default null
) returns public.time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_site  public.job_sites;
  v_entry public.time_entries;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_site from public.job_sites where id = p_job_site_id;
  if not found then raise exception 'job site not found'; end if;
  if not public.is_company_member(v_site.company_id) then
    raise exception 'not a member of this company';
  end if;

  if not exists (
    select 1 from public.job_site_assignments
    where job_site_id = p_job_site_id and employee_id = auth.uid()
  ) then
    raise exception 'you are not assigned to this job site';
  end if;

  if p_clock_out <= p_clock_in then
    raise exception 'clock-out must be after clock-in';
  end if;

  if p_clock_in > now() then
    raise exception 'clock-in cannot be in the future';
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
  perform public.notify_owners(v_site.company_id, 'manual_time_entry',
    'Manual time entry added',
    (select full_name from public.profiles where id = auth.uid()) ||
    ' added a manual time entry for ' || v_site.name || '.');

  return v_entry;
end;
$$;

grant execute on function public.add_manual_time_entry(uuid, timestamptz, timestamptz, text)
to authenticated;
