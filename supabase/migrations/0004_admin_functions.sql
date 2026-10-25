-- ---------------------------------------------------------------------------
-- VoltTrack — 0004 admin functions (owner-authoritative writes + audit)
--
-- Job-site CRUD, member status changes, invitation lifecycle, assignments and
-- owner time-entry edits all run through SECURITY DEFINER RPCs so that every
-- sensitive mutation is authorized server-side and recorded in audit_logs.
-- Direct-table RLS still exists as a safety net, but the app calls these.
-- ---------------------------------------------------------------------------

-- create_job_site ----------------------------------------------------------
create or replace function public.create_job_site(
  p_name text,
  p_client_name text default null,
  p_address text default null,
  p_description text default null,
  p_status text default 'planned',
  p_estimated_hours numeric default null,
  p_start_date date default null,
  p_end_date date default null
) returns public.job_sites
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_site public.job_sites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- The owner acts within their (single) owned company.
  select company_id into v_company
  from public.company_members
  where user_id = auth.uid() and role = 'owner' and status = 'active'
  limit 1;
  if v_company is null then raise exception 'only an owner can create job sites'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'job site name is required'; end if;

  insert into public.job_sites (
    company_id, name, client_name, address, description, status,
    estimated_hours, start_date, end_date, created_by
  ) values (
    v_company, btrim(p_name), p_client_name, p_address, p_description, p_status,
    p_estimated_hours, p_start_date, p_end_date, auth.uid()
  ) returning * into v_site;

  perform public.write_audit(v_company, 'job_site.created', 'job_site',
    v_site.id, null, to_jsonb(v_site));
  return v_site;
end;
$$;

-- update_job_site ----------------------------------------------------------
create or replace function public.update_job_site(
  p_id uuid,
  p_name text,
  p_client_name text default null,
  p_address text default null,
  p_description text default null,
  p_status text default 'planned',
  p_estimated_hours numeric default null,
  p_start_date date default null,
  p_end_date date default null
) returns public.job_sites
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.job_sites;
  v_site public.job_sites;
begin
  select * into v_prev from public.job_sites where id = p_id;
  if not found then raise exception 'job site not found'; end if;
  if not public.is_company_owner(v_prev.company_id) then
    raise exception 'not authorized';
  end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'job site name is required'; end if;

  update public.job_sites set
    name = btrim(p_name),
    client_name = p_client_name,
    address = p_address,
    description = p_description,
    status = p_status,
    estimated_hours = p_estimated_hours,
    start_date = p_start_date,
    end_date = p_end_date
  where id = p_id
  returning * into v_site;

  perform public.write_audit(v_prev.company_id, 'job_site.updated', 'job_site',
    v_site.id, to_jsonb(v_prev), to_jsonb(v_site));
  return v_site;
end;
$$;

-- set_member_status --------------------------------------------------------
create or replace function public.set_member_status(
  p_member_id uuid,
  p_status text
) returns public.company_members
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.company_members;
  v_member public.company_members;
begin
  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid status %', p_status;
  end if;
  select * into v_prev from public.company_members where id = p_member_id;
  if not found then raise exception 'member not found'; end if;
  if not public.is_company_owner(v_prev.company_id) then
    raise exception 'not authorized';
  end if;
  if v_prev.role = 'owner' then raise exception 'cannot change an owner''s status'; end if;

  update public.company_members set status = p_status
  where id = p_member_id
  returning * into v_member;

  perform public.write_audit(v_prev.company_id,
    case when p_status = 'active' then 'employee.activated' else 'employee.deactivated' end,
    'company_member', v_member.id, to_jsonb(v_prev), to_jsonb(v_member));
  perform public.notify(v_prev.company_id, v_member.user_id, 'account_status',
    'Account ' || p_status,
    'Your account status was changed to ' || p_status || '.');
  return v_member;
end;
$$;

-- create_invitation --------------------------------------------------------
create or replace function public.create_invitation(
  p_email text,
  p_full_name text,
  p_role text default 'employee'
) returns public.employee_invitations
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_inv public.employee_invitations;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select company_id into v_company
  from public.company_members
  where user_id = auth.uid() and role = 'owner' and status = 'active'
  limit 1;
  if v_company is null then raise exception 'only an owner can invite employees'; end if;
  if coalesce(btrim(p_email), '') = '' then raise exception 'email is required'; end if;
  if p_role not in ('owner', 'employee') then raise exception 'invalid role'; end if;

  -- Already an active member?
  if exists (
    select 1 from public.company_members cm
    join public.profiles pr on pr.id = cm.user_id
    where cm.company_id = v_company and lower(pr.full_name) = lower(btrim(p_full_name))
  ) then
    -- name match is only a soft hint; real dupe guard is the email index below
    null;
  end if;

  insert into public.employee_invitations (company_id, email, full_name, role, invited_by)
  values (v_company, lower(btrim(p_email)), btrim(p_full_name), p_role, auth.uid())
  returning * into v_inv;

  perform public.write_audit(v_company, 'invitation.created', 'invitation',
    v_inv.id, null, jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
  return v_inv;
exception
  when unique_violation then
    raise exception 'a pending invitation for that email already exists';
end;
$$;

-- revoke_invitation --------------------------------------------------------
create or replace function public.revoke_invitation(p_id uuid)
returns public.employee_invitations
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.employee_invitations;
  v_inv public.employee_invitations;
begin
  select * into v_prev from public.employee_invitations where id = p_id;
  if not found then raise exception 'invitation not found'; end if;
  if not public.is_company_owner(v_prev.company_id) then raise exception 'not authorized'; end if;
  if v_prev.status <> 'pending' then raise exception 'only pending invitations can be revoked'; end if;

  update public.employee_invitations set status = 'revoked'
  where id = p_id returning * into v_inv;

  perform public.write_audit(v_prev.company_id, 'invitation.revoked', 'invitation',
    v_inv.id, to_jsonb(v_prev), to_jsonb(v_inv));
  return v_inv;
end;
$$;

-- resend_invitation: refresh token + expiry so the link works again --------
create or replace function public.resend_invitation(p_id uuid)
returns public.employee_invitations
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.employee_invitations;
  v_inv public.employee_invitations;
begin
  select * into v_prev from public.employee_invitations where id = p_id;
  if not found then raise exception 'invitation not found'; end if;
  if not public.is_company_owner(v_prev.company_id) then raise exception 'not authorized'; end if;
  if v_prev.status not in ('pending', 'expired') then
    raise exception 'only pending or expired invitations can be resent';
  end if;

  update public.employee_invitations set
    status = 'pending',
    secure_token = encode(gen_random_bytes(24), 'hex'),
    expires_at = now() + interval '7 days'
  where id = p_id returning * into v_inv;

  perform public.write_audit(v_prev.company_id, 'invitation.resent', 'invitation',
    v_inv.id, to_jsonb(v_prev), to_jsonb(v_inv));
  return v_inv;
end;
$$;

-- assign_employee ----------------------------------------------------------
create or replace function public.assign_employee(
  p_job_site_id uuid,
  p_employee_id uuid
) returns public.job_site_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_site public.job_sites;
  v_assign public.job_site_assignments;
begin
  select * into v_site from public.job_sites where id = p_job_site_id;
  if not found then raise exception 'job site not found'; end if;
  if not public.is_company_owner(v_site.company_id) then raise exception 'not authorized'; end if;
  if not exists (
    select 1 from public.company_members
    where company_id = v_site.company_id and user_id = p_employee_id and status = 'active'
  ) then
    raise exception 'employee is not an active member of this company';
  end if;

  insert into public.job_site_assignments (company_id, job_site_id, employee_id, assigned_by)
  values (v_site.company_id, p_job_site_id, p_employee_id, auth.uid())
  on conflict (job_site_id, employee_id) do nothing
  returning * into v_assign;

  if v_assign.id is null then
    select * into v_assign from public.job_site_assignments
    where job_site_id = p_job_site_id and employee_id = p_employee_id;
    return v_assign;
  end if;

  perform public.write_audit(v_site.company_id, 'assignment.created', 'job_site_assignment',
    v_assign.id, null, to_jsonb(v_assign));
  perform public.notify(v_site.company_id, p_employee_id, 'assignment',
    'New job site assignment', 'You were assigned to ' || v_site.name || '.');
  return v_assign;
end;
$$;

-- unassign_employee --------------------------------------------------------
create or replace function public.unassign_employee(p_assignment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.job_site_assignments;
begin
  select * into v_prev from public.job_site_assignments where id = p_assignment_id;
  if not found then return; end if;
  if not public.is_company_owner(v_prev.company_id) then raise exception 'not authorized'; end if;

  delete from public.job_site_assignments where id = p_assignment_id;
  perform public.write_audit(v_prev.company_id, 'assignment.removed', 'job_site_assignment',
    v_prev.id, to_jsonb(v_prev), null);
end;
$$;

-- edit_time_entry: owner correction of an entry (audited) ------------------
create or replace function public.edit_time_entry(
  p_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz default null,
  p_job_site_id uuid default null,
  p_owner_note text default null
) returns public.time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_prev public.time_entries;
  v_entry public.time_entries;
  v_status text;
begin
  select * into v_prev from public.time_entries where id = p_id;
  if not found then raise exception 'time entry not found'; end if;
  if not public.is_company_owner(v_prev.company_id) then raise exception 'not authorized'; end if;
  if p_clock_out is not null and p_clock_out <= p_clock_in then
    raise exception 'clock-out must be after clock-in';
  end if;

  v_status := case when p_clock_out is null then 'incomplete' else 'edited' end;

  update public.time_entries set
    clock_in = p_clock_in,
    clock_out = p_clock_out,
    job_site_id = coalesce(p_job_site_id, job_site_id),
    owner_note = p_owner_note,
    status = v_status
  where id = p_id
  returning * into v_entry;

  perform public.write_audit(v_prev.company_id, 'time_entry.edited', 'time_entry',
    v_entry.id, to_jsonb(v_prev), to_jsonb(v_entry));
  return v_entry;
end;
$$;

grant execute on function
  public.create_job_site(text, text, text, text, text, numeric, date, date),
  public.update_job_site(uuid, text, text, text, text, text, numeric, date, date),
  public.set_member_status(uuid, text),
  public.create_invitation(text, text, text),
  public.revoke_invitation(uuid),
  public.resend_invitation(uuid),
  public.assign_employee(uuid, uuid),
  public.unassign_employee(uuid),
  public.edit_time_entry(uuid, timestamptz, timestamptz, uuid, text)
to authenticated;

-- invitation_preview: token-gated lookup so an invitee can see who invited them
-- and prefill their email before authenticating. The token is the secret, so
-- this is safe to expose to anonymous visitors.
create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.employee_invitations;
  v_company public.companies;
begin
  select * into v_inv from public.employee_invitations where secure_token = p_token;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  select * into v_company from public.companies where id = v_inv.company_id;
  return jsonb_build_object(
    'valid', v_inv.status = 'pending' and v_inv.expires_at > now(),
    'reason', case
      when v_inv.status <> 'pending' then v_inv.status
      when v_inv.expires_at <= now() then 'expired'
      else 'ok' end,
    'email', v_inv.email,
    'full_name', v_inv.full_name,
    'company_name', v_company.name
  );
end;
$$;

grant execute on function public.invitation_preview(text) to anon, authenticated;
