-- ============================================================================
-- VoltTrack — 0003 functions (server-authoritative business logic)
--
-- These SECURITY DEFINER functions are the ONLY way clients perform sensitive
-- actions (clock in/out, breaks, submit/review timesheets, accept invites,
-- create a company). Each one authorizes the caller internally and enforces
-- business rules, so the database — not the browser — is the source of truth.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- internal helpers (not granted to anon/authenticated directly)
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_company uuid, p_action text, p_entity_type text,
  p_entity_id uuid, p_prev jsonb, p_new jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (company_id, actor_id, action, entity_type, entity_id, previous_value, new_value)
  values (p_company, auth.uid(), p_action, p_entity_type, p_entity_id, p_prev, p_new);
$$;

create or replace function public.notify(
  p_company uuid, p_user uuid, p_type text, p_title text, p_message text
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications (company_id, user_id, type, title, message)
  values (p_company, p_user, p_type, p_title, p_message);
$$;

-- Fan a notification out to every active owner of a company.
create or replace function public.notify_owners(
  p_company uuid, p_type text, p_title text, p_message text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (company_id, user_id, type, title, message)
  select p_company, m.user_id, p_type, p_title, p_message
  from public.company_members m
  where m.company_id = p_company and m.role = 'owner' and m.status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- create_company_and_owner: register a company for the current user.
-- ---------------------------------------------------------------------------
create or replace function public.create_company_and_owner(
  p_name text, p_timezone text default 'UTC',
  p_address text default null, p_phone text default null
) returns public.companies
language plpgsql security definer set search_path = public as $$
declare
  v_company public.companies;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'company name is required';
  end if;

  insert into public.companies (name, timezone, address, phone)
  values (trim(p_name), coalesce(nullif(trim(p_timezone), ''), 'UTC'), p_address, p_phone)
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role, status)
  values (v_company.id, auth.uid(), 'owner', 'active');

  perform public.write_audit(v_company.id, 'company.created', 'company',
    v_company.id, null, to_jsonb(v_company));

  return v_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation: an authenticated user redeems an invitation token.
-- The invitee sets their own password via normal Supabase auth first; this
-- attaches them to the company. Owners never see the password.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns public.company_members
language plpgsql security definer set search_path = public as $$
declare
  v_inv    public.employee_invitations;
  v_member public.company_members;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_inv from public.employee_invitations
  where secure_token = p_token for update;

  if not found then raise exception 'invalid invitation'; end if;
  if v_inv.status <> 'pending' then raise exception 'invitation is %', v_inv.status; end if;
  if v_inv.expires_at < now() then
    update public.employee_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_inv.email) then
    raise exception 'this invitation was issued to a different email address';
  end if;

  insert into public.company_members (company_id, user_id, role, status)
  values (v_inv.company_id, auth.uid(), v_inv.role, 'active')
  on conflict (company_id, user_id)
    do update set status = 'active', role = excluded.role
  returning * into v_member;

  update public.employee_invitations
    set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  perform public.write_audit(v_inv.company_id, 'invitation.accepted', 'invitation',
    v_inv.id, to_jsonb(v_inv), null);
  perform public.notify_owners(v_inv.company_id, 'invitation_accepted',
    'Invitation accepted', coalesce(v_inv.full_name, v_inv.email) || ' joined your team.');

  return v_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- clock_in
-- ---------------------------------------------------------------------------
create or replace function public.clock_in(p_job_site_id uuid, p_note text default null)
returns public.time_entries
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
  if v_site.status not in ('planned', 'active', 'paused') then
    raise exception 'cannot clock into a % job site', v_site.status;
  end if;

  if not exists (
    select 1 from public.job_site_assignments
    where job_site_id = p_job_site_id and employee_id = auth.uid()
  ) then
    raise exception 'you are not assigned to this job site';
  end if;

  -- Enforced by a partial unique index too; check first for a clean message.
  if exists (
    select 1 from public.time_entries
    where company_id = v_site.company_id and employee_id = auth.uid() and status = 'active'
  ) then
    raise exception 'you already have an active shift';
  end if;

  insert into public.time_entries (company_id, employee_id, job_site_id, clock_in, employee_note, status)
  values (v_site.company_id, auth.uid(), p_job_site_id, now(), nullif(trim(p_note), ''), 'active')
  returning * into v_entry;

  perform public.write_audit(v_site.company_id, 'time_entry.clock_in', 'time_entry',
    v_entry.id, null, to_jsonb(v_entry));

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_break / end_break
-- ---------------------------------------------------------------------------
create or replace function public.start_break(p_time_entry_id uuid)
returns public.breaks
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.time_entries;
  v_break public.breaks;
begin
  select * into v_entry from public.time_entries where id = p_time_entry_id;
  if not found then raise exception 'shift not found'; end if;
  if v_entry.employee_id <> auth.uid() then raise exception 'not your shift'; end if;
  if v_entry.status <> 'active' then raise exception 'shift is not active'; end if;
  if exists (select 1 from public.breaks where time_entry_id = v_entry.id and ended_at is null) then
    raise exception 'a break is already in progress';
  end if;

  insert into public.breaks (company_id, time_entry_id, employee_id, started_at)
  values (v_entry.company_id, v_entry.id, auth.uid(), now())
  returning * into v_break;

  perform public.write_audit(v_entry.company_id, 'break.started', 'break',
    v_break.id, null, to_jsonb(v_break));
  return v_break;
end;
$$;

create or replace function public.end_break(p_time_entry_id uuid)
returns public.breaks
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.time_entries;
  v_break public.breaks;
begin
  select * into v_entry from public.time_entries where id = p_time_entry_id;
  if not found then raise exception 'shift not found'; end if;
  if v_entry.employee_id <> auth.uid() then raise exception 'not your shift'; end if;

  update public.breaks set ended_at = now()
  where time_entry_id = v_entry.id and ended_at is null
  returning * into v_break;

  if not found then raise exception 'no break in progress'; end if;

  perform public.write_audit(v_entry.company_id, 'break.ended', 'break',
    v_break.id, null, to_jsonb(v_break));
  return v_break;
end;
$$;

-- ---------------------------------------------------------------------------
-- clock_out
-- ---------------------------------------------------------------------------
create or replace function public.clock_out(p_time_entry_id uuid, p_note text default null)
returns public.time_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.time_entries;
  v_prev  jsonb;
begin
  select * into v_entry from public.time_entries where id = p_time_entry_id;
  if not found then raise exception 'shift not found'; end if;
  if v_entry.employee_id <> auth.uid() then raise exception 'not your shift'; end if;
  if v_entry.status <> 'active' then raise exception 'shift is not active'; end if;

  v_prev := to_jsonb(v_entry);

  -- Close any dangling break.
  update public.breaks set ended_at = now()
  where time_entry_id = v_entry.id and ended_at is null;

  update public.time_entries
    set clock_out = now(),
        status = 'completed',
        employee_note = coalesce(nullif(trim(p_note), ''), employee_note)
  where id = v_entry.id
  returning * into v_entry;

  perform public.write_audit(v_entry.company_id, 'time_entry.clock_out', 'time_entry',
    v_entry.id, v_prev, to_jsonb(v_entry));

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- refresh_timesheet: upsert a draft weekly timesheet and recompute minutes
-- from time entries, grouped by the company timezone. Overtime = minutes
-- beyond 40h (2400 min) in the week.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_timesheet(
  p_employee uuid, p_week_start date
) returns public.timesheets
language plpgsql security definer set search_path = public as $$
declare
  v_tz      text;
  v_company uuid;
  v_week_end date := p_week_start + 5; -- Sunday when week_start is Monday +6? see note
  v_worked  integer;
  v_regular integer;
  v_ot      integer;
  v_ts      public.timesheets;
begin
  -- Resolve the company + timezone for this employee (must share a company
  -- with the caller, enforced by the membership lookup below).
  select c.id, c.timezone into v_company, v_tz
  from public.companies c
  join public.company_members m on m.company_id = c.id
  where m.user_id = p_employee and m.status = 'active'
    and c.id in (select public.auth_company_ids())
  limit 1;

  if v_company is null then raise exception 'employee not found in your company'; end if;
  if not (p_employee = auth.uid() or public.is_company_owner(v_company)) then
    raise exception 'not authorized';
  end if;

  v_week_end := p_week_start + 6; -- inclusive Monday..Sunday

  -- Total worked minutes = shift duration minus break duration, for shifts
  -- whose LOCAL clock-in date falls in the week.
  select coalesce(sum(
    greatest(0,
      extract(epoch from (coalesce(te.clock_out, now()) - te.clock_in)) / 60
      - coalesce((
          select sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)) / 60)
          from public.breaks b where b.time_entry_id = te.id
        ), 0)
    )
  ), 0)::int
  into v_worked
  from public.time_entries te
  where te.employee_id = p_employee
    and te.company_id = v_company
    and (te.clock_in at time zone v_tz)::date between p_week_start and v_week_end;

  v_regular := least(v_worked, 2400);
  v_ot := greatest(v_worked - 2400, 0);

  insert into public.timesheets (company_id, employee_id, week_start, week_end,
    regular_minutes, overtime_minutes, status)
  values (v_company, p_employee, p_week_start, v_week_end, v_regular, v_ot, 'draft')
  on conflict (company_id, employee_id, week_start) do update
    set regular_minutes = excluded.regular_minutes,
        overtime_minutes = excluded.overtime_minutes,
        updated_at = now()
    where public.timesheets.status in ('draft', 'rejected')
  returning * into v_ts;

  -- If the row existed but was locked (submitted/approved), fetch it as-is.
  if v_ts is null then
    select * into v_ts from public.timesheets
    where company_id = v_company and employee_id = p_employee and week_start = p_week_start;
  end if;

  return v_ts;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_timesheet (employee)
-- ---------------------------------------------------------------------------
create or replace function public.submit_timesheet(p_timesheet_id uuid, p_comment text default null)
returns public.timesheets
language plpgsql security definer set search_path = public as $$
declare v_ts public.timesheets; v_prev jsonb;
begin
  select * into v_ts from public.timesheets where id = p_timesheet_id;
  if not found then raise exception 'timesheet not found'; end if;
  if v_ts.employee_id <> auth.uid() then raise exception 'not your timesheet'; end if;
  if v_ts.status not in ('draft', 'rejected') then
    raise exception 'timesheet cannot be submitted from status %', v_ts.status;
  end if;

  v_prev := to_jsonb(v_ts);
  update public.timesheets
    set status = 'submitted', submitted_at = now(),
        employee_comment = nullif(trim(p_comment), '')
  where id = v_ts.id returning * into v_ts;

  perform public.write_audit(v_ts.company_id, 'timesheet.submitted', 'timesheet',
    v_ts.id, v_prev, to_jsonb(v_ts));
  perform public.notify_owners(v_ts.company_id, 'timesheet_submitted',
    'Timesheet submitted', 'A weekly timesheet is ready for review.');
  return v_ts;
end;
$$;

-- ---------------------------------------------------------------------------
-- review_timesheet (owner): approve or reject with a comment
-- ---------------------------------------------------------------------------
create or replace function public.review_timesheet(
  p_timesheet_id uuid, p_approve boolean, p_comment text default null
) returns public.timesheets
language plpgsql security definer set search_path = public as $$
declare v_ts public.timesheets; v_prev jsonb;
begin
  select * into v_ts from public.timesheets where id = p_timesheet_id;
  if not found then raise exception 'timesheet not found'; end if;
  if not public.is_company_owner(v_ts.company_id) then raise exception 'not authorized'; end if;
  if v_ts.status <> 'submitted' then raise exception 'only submitted timesheets can be reviewed'; end if;
  if not p_approve and coalesce(trim(p_comment), '') = '' then
    raise exception 'a comment is required when rejecting';
  end if;

  v_prev := to_jsonb(v_ts);
  update public.timesheets
    set status = case when p_approve then 'approved' else 'rejected' end,
        owner_comment = nullif(trim(p_comment), ''),
        reviewed_at = now(), reviewed_by = auth.uid()
  where id = v_ts.id returning * into v_ts;

  perform public.write_audit(v_ts.company_id,
    case when p_approve then 'timesheet.approved' else 'timesheet.rejected' end,
    'timesheet', v_ts.id, v_prev, to_jsonb(v_ts));
  perform public.notify(v_ts.company_id, v_ts.employee_id,
    case when p_approve then 'timesheet_approved' else 'timesheet_rejected' end,
    case when p_approve then 'Timesheet approved' else 'Timesheet rejected' end,
    coalesce(nullif(trim(p_comment), ''), 'Your weekly timesheet was reviewed.'));
  return v_ts;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: expose RPCs to authenticated users (RLS + internal checks still apply)
-- ---------------------------------------------------------------------------
grant execute on function
  public.create_company_and_owner(text, text, text, text),
  public.accept_invitation(text),
  public.clock_in(uuid, text),
  public.start_break(uuid),
  public.end_break(uuid),
  public.clock_out(uuid, text),
  public.refresh_timesheet(uuid, date),
  public.submit_timesheet(uuid, text),
  public.review_timesheet(uuid, boolean, text)
to authenticated;
