-- ============================================================================
-- VoltTrack — 0028 owner can delete a job site
--
-- time_entries keep job sites from being deleted (on delete restrict), because
-- worked hours are payroll records. delete_job_site() deletes a site and, only
-- when the owner explicitly asks for it, its time entries too. Everything else
-- that belongs to the site (plans, drawings, materials, assignments) cascades.
-- ============================================================================

create or replace function public.delete_job_site(p_job_site_id uuid, p_delete_hours boolean default false)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_company uuid;
  v_hours int;
begin
  select company_id into v_company from public.job_sites where id = p_job_site_id;
  if v_company is null then raise exception 'Job site not found'; end if;
  if not public.is_company_owner(v_company) then raise exception 'Only the owner can delete a job site'; end if;

  select count(*) into v_hours from public.time_entries where job_site_id = p_job_site_id;
  if v_hours > 0 and not p_delete_hours then
    raise exception 'HAS_HOURS:%', v_hours;
  end if;

  delete from public.time_entries where job_site_id = p_job_site_id;
  delete from public.job_sites where id = p_job_site_id;
end;
$$;

revoke all on function public.delete_job_site(uuid, boolean) from public, anon;
grant execute on function public.delete_job_site(uuid, boolean) to authenticated;
