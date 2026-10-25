-- ============================================================================
-- VoltTrack — 0015 timesheet auto-submit + manual reminder
--
-- The `auto_submit_day` / `auto_submit_hour` company settings existed in the
-- schema and UI but were never actually wired to anything (no cron, no edge
-- function). This migration makes them real:
--   - `run_scheduled_timesheet_automation()` is meant to be called hourly by
--     pg_cron (see 0016). For each company it checks, in the company's own
--     timezone, whether "now" matches the configured day/hour and either
--     auto-submits the current week's draft timesheets, or (24h earlier)
--     sends employees a reminder.
--   - `request_timesheet_submission()` is the manual counterpart: an owner
--     can trigger the same "please submit your hours" notification on demand
--     from the app, independent of the schedule.
-- ============================================================================

-- Shared aggregate, extracted out of refresh_timesheet so the automated path
-- computes totals the exact same way as the employee-triggered one.
create or replace function public.calc_worked_minutes(
  p_employee uuid, p_company uuid, p_tz text, p_week_start date, p_week_end date
) returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(
    greatest(0,
      extract(epoch from (coalesce(te.clock_out, now()) - te.clock_in)) / 60
      - coalesce((
          select sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)) / 60)
          from public.breaks b where b.time_entry_id = te.id
        ), 0)
    )
  ), 0)::int
  from public.time_entries te
  where te.employee_id = p_employee
    and te.company_id = p_company
    and (te.clock_in at time zone p_tz)::date between p_week_start and p_week_end;
$$;

create or replace function public.refresh_timesheet(
  p_employee uuid, p_week_start date
) returns public.timesheets
language plpgsql security definer set search_path = public as $$
declare
  v_tz      text;
  v_company uuid;
  v_week_end date;
  v_worked  integer;
  v_regular integer;
  v_ot      integer;
  v_ts      public.timesheets;
begin
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
  v_worked := public.calc_worked_minutes(p_employee, v_company, v_tz, p_week_start, v_week_end);
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

  if v_ts is null then
    select * into v_ts from public.timesheets
    where company_id = v_company and employee_id = p_employee and week_start = p_week_start;
  end if;

  return v_ts;
end;
$$;

-- Fan a notification out to every active employee of a company.
create or replace function public.notify_employees(
  p_company uuid, p_type text, p_title text, p_message text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (company_id, user_id, type, title, message)
  select p_company, m.user_id, p_type, p_title, p_message
  from public.company_members m
  where m.company_id = p_company and m.role = 'employee' and m.status = 'active';
end;
$$;

-- System-context auto-submit for one company/week: skips the auth.uid()
-- checks in submit_timesheet/refresh_timesheet since it's invoked by the
-- scheduler, not a signed-in user. Never granted to authenticated/anon.
create or replace function public.system_submit_company_timesheets(
  p_company uuid, p_week_start date
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_week_end date := p_week_start + 6;
  emp record;
  v_worked int;
  v_regular int;
  v_ot int;
  v_ts public.timesheets;
  v_count int := 0;
begin
  select timezone into v_tz from public.companies where id = p_company;
  if v_tz is null then return 0; end if;

  for emp in
    select user_id from public.company_members
    where company_id = p_company and role = 'employee' and status = 'active'
  loop
    v_ts := null;
    v_worked := public.calc_worked_minutes(emp.user_id, p_company, v_tz, p_week_start, v_week_end);
    v_regular := least(v_worked, 2400);
    v_ot := greatest(v_worked - 2400, 0);

    insert into public.timesheets (company_id, employee_id, week_start, week_end,
      regular_minutes, overtime_minutes, status, submitted_at)
    values (p_company, emp.user_id, p_week_start, v_week_end, v_regular, v_ot, 'submitted', now())
    on conflict (company_id, employee_id, week_start) do update
      set regular_minutes = excluded.regular_minutes,
          overtime_minutes = excluded.overtime_minutes,
          status = 'submitted',
          submitted_at = now(),
          updated_at = now()
      where public.timesheets.status in ('draft', 'rejected')
    returning * into v_ts;

    if v_ts.id is not null then
      v_count := v_count + 1;
      perform public.notify(p_company, emp.user_id, 'timesheet_auto_submitted',
        'Timesheet auto-submitted', 'Your weekly timesheet was automatically submitted for review.');
    end if;
  end loop;

  if v_count > 0 then
    perform public.notify_owners(p_company, 'timesheet_auto_submitted',
      'Timesheets auto-submitted', v_count || ' weekly timesheet(s) were auto-submitted for review.');
  end if;

  return v_count;
end;
$$;

-- Meant to run hourly via pg_cron (see 0016_timesheet_cron.sql). Compares
-- "now" against each company's own timezone/day/hour setting.
create or replace function public.run_scheduled_timesheet_automation()
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_local timestamp;
  v_dow int;
  v_hour int;
  v_reminder_dow int;
  v_week_start date;
begin
  for c in
    select id, timezone, auto_submit_day, auto_submit_hour
    from public.companies
    where auto_submit_day is not null and auto_submit_hour is not null
  loop
    v_local := now() at time zone c.timezone;
    v_dow := extract(isodow from v_local)::int;   -- 1 = Monday .. 7 = Sunday
    v_hour := extract(hour from v_local)::int;
    v_reminder_dow := case when c.auto_submit_day = 1 then 7 else c.auto_submit_day - 1 end;
    v_week_start := v_local::date - (v_dow - 1);   -- Monday of the current local week

    if v_dow = c.auto_submit_day and v_hour = c.auto_submit_hour then
      perform public.system_submit_company_timesheets(c.id, v_week_start);
    elsif v_dow = v_reminder_dow and v_hour = c.auto_submit_hour then
      perform public.notify_employees(c.id, 'timesheet_reminder', 'Submit your hours',
        'Your weekly timesheet will be auto-submitted tomorrow. Please review and submit it now.');
    end if;
  end loop;
end;
$$;

-- Manual counterpart: an owner can ask employees to submit right now,
-- independent of the schedule above.
create or replace function public.request_timesheet_submission(
  p_company uuid, p_message text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_company_owner(p_company) then raise exception 'not authorized'; end if;
  perform public.notify_employees(p_company, 'timesheet_reminder', 'Submit your hours',
    coalesce(nullif(trim(p_message), ''), 'Your employer is asking you to submit this week''s timesheet.'));
end;
$$;

grant execute on function
  public.request_timesheet_submission(uuid, text)
to authenticated;
