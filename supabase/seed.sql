-- ---------------------------------------------------------------------------
-- VoltTrack seed data — for local development / demo
--
-- HOW TO USE:
--   1. Start Supabase locally: supabase start
--   2. Run migrations:         supabase db reset
--   3. This seed runs automatically after migrations.
--
-- Alternatively, to seed a remote project:
--   psql $DATABASE_URL < supabase/seed.sql
--
-- DEMO ACCOUNTS (created via Supabase Auth dashboard or supabase.auth.admin):
--
--   Owner:    owner@volttrack.dev / password123
--   Employee: alice@volttrack.dev / password123
--   Employee: bob@volttrack.dev   / password123
--
-- IMPORTANT: Supabase seed.sql runs AFTER migrations. However, auth.users
-- rows must be created through the Supabase Auth API (or Dashboard), not by
-- direct INSERT. The UUIDs below assume you've created these three test users
-- first. See README.md § "Demo Account Setup" for exact steps.
-- ---------------------------------------------------------------------------

-- Deterministic UUIDs for reproducibility (match the users you create)
\set owner_id  '''00000000-0000-0000-0000-000000000001'''
\set alice_id  '''00000000-0000-0000-0000-000000000002'''
\set bob_id    '''00000000-0000-0000-0000-000000000003'''

-- Profiles should already exist via handle_new_user trigger, but upsert for safety
insert into public.profiles (id, full_name) values
  (:owner_id, 'Mike Watts'),
  (:alice_id, 'Alice Chen'),
  (:bob_id,   'Bob Rivera')
on conflict (id) do update set full_name = excluded.full_name;

-- Company
insert into public.companies (id, name, timezone, address, phone) values
  ('c0000000-0000-0000-0000-000000000001',
   'Bright Spark Electric',
   'America/New_York',
   '742 Evergreen Terrace, Springfield, IL',
   '(555) 234-5678');

-- Members
insert into public.company_members (company_id, user_id, role, status) values
  ('c0000000-0000-0000-0000-000000000001', :owner_id, 'owner',    'active'),
  ('c0000000-0000-0000-0000-000000000001', :alice_id, 'employee', 'active'),
  ('c0000000-0000-0000-0000-000000000001', :bob_id,   'employee', 'active');

-- Job sites
insert into public.job_sites (id, company_id, name, client_name, address, status, estimated_hours, start_date, created_by) values
  ('s0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   'Downtown Office Renovation',
   'Acme Corp',
   '100 Main Street, Springfield, IL',
   'active', 200, '2025-06-01', :owner_id),
  ('s0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001',
   'Riverside Medical Center',
   'Springfield Health',
   '50 River Road, Springfield, IL',
   'active', 400, '2025-05-15', :owner_id),
  ('s0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000001',
   'Elm Street Residential',
   'Jane Smith',
   '22 Elm Street, Springfield, IL',
   'planned', 80, '2025-07-10', :owner_id);

-- Assignments
insert into public.job_site_assignments (company_id, job_site_id, employee_id, assigned_by) values
  ('c0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', :alice_id, :owner_id),
  ('c0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', :bob_id,   :owner_id),
  ('c0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000002', :alice_id, :owner_id),
  ('c0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000003', :alice_id, :owner_id);

-- Time entries — a few completed shifts from last week (Mon-Fri)
-- Using 'America/New_York' (UTC-4 in summer)
insert into public.time_entries (id, company_id, employee_id, job_site_id, clock_in, clock_out, status) values
  -- Alice: Mon 7am–3:30pm
  ('e0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', :alice_id, 's0000000-0000-0000-0000-000000000001',
   now() - interval '6 days' + interval '11 hours',  -- ~7am ET
   now() - interval '6 days' + interval '19 hours 30 minutes',
   'completed'),
  -- Alice: Tue 7am–4pm
  ('e0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001', :alice_id, 's0000000-0000-0000-0000-000000000002',
   now() - interval '5 days' + interval '11 hours',
   now() - interval '5 days' + interval '20 hours',
   'completed'),
  -- Alice: Wed 7am–3pm
  ('e0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000001', :alice_id, 's0000000-0000-0000-0000-000000000001',
   now() - interval '4 days' + interval '11 hours',
   now() - interval '4 days' + interval '19 hours',
   'completed'),
  -- Bob: Mon 8am–4:30pm
  ('e0000000-0000-0000-0000-000000000004',
   'c0000000-0000-0000-0000-000000000001', :bob_id, 's0000000-0000-0000-0000-000000000001',
   now() - interval '6 days' + interval '12 hours',
   now() - interval '6 days' + interval '20 hours 30 minutes',
   'completed'),
  -- Bob: Tue 8am–5pm
  ('e0000000-0000-0000-0000-000000000005',
   'c0000000-0000-0000-0000-000000000001', :bob_id, 's0000000-0000-0000-0000-000000000001',
   now() - interval '5 days' + interval '12 hours',
   now() - interval '5 days' + interval '21 hours',
   'completed'),
  -- Bob: incomplete entry from Wed (missing clock-out)
  ('e0000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-000000000001', :bob_id, 's0000000-0000-0000-0000-000000000001',
   now() - interval '4 days' + interval '12 hours',
   null,
   'incomplete');

-- Breaks for Alice's Monday shift
insert into public.breaks (company_id, time_entry_id, employee_id, started_at, ended_at) values
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', :alice_id,
   now() - interval '6 days' + interval '15 hours',
   now() - interval '6 days' + interval '15 hours 30 minutes');

-- Timesheets
insert into public.timesheets (id, company_id, employee_id, week_start, week_end, regular_minutes, overtime_minutes, status) values
  -- Alice last week: submitted
  ('t0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', :alice_id,
   (current_date - (extract(isodow from current_date)::int - 1 + 7) * interval '1 day')::date,
   (current_date - (extract(isodow from current_date)::int - 1 + 1) * interval '1 day')::date,
   1440, 0, 'submitted'),
  -- Bob last week: approved
  ('t0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001', :bob_id,
   (current_date - (extract(isodow from current_date)::int - 1 + 7) * interval '1 day')::date,
   (current_date - (extract(isodow from current_date)::int - 1 + 1) * interval '1 day')::date,
   1050, 0, 'approved');

-- Pending invitation
insert into public.employee_invitations (company_id, email, full_name, role, invited_by) values
  ('c0000000-0000-0000-0000-000000000001', 'charlie@example.com', 'Charlie Park', 'employee', :owner_id);

-- Audit log entries
insert into public.audit_logs (company_id, actor_id, action, entity_type, entity_id) values
  ('c0000000-0000-0000-0000-000000000001', :owner_id, 'company.created', 'company', 'c0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001', :owner_id, 'job_site.created', 'job_site', 's0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001', :owner_id, 'job_site.created', 'job_site', 's0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000001', :owner_id, 'invitation.created', 'invitation', null),
  ('c0000000-0000-0000-0000-000000000001', :alice_id, 'time_entry.clock_in', 'time_entry', 'e0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001', :alice_id, 'time_entry.clock_out', 'time_entry', 'e0000000-0000-0000-0000-000000000001');

-- Notifications
insert into public.notifications (company_id, user_id, type, title, message) values
  ('c0000000-0000-0000-0000-000000000001', :owner_id, 'timesheet_submitted',
   'Timesheet submitted', 'Alice Chen submitted a timesheet for review.'),
  ('c0000000-0000-0000-0000-000000000001', :bob_id, 'timesheet_approved',
   'Timesheet approved', 'Your timesheet for last week was approved.'),
  ('c0000000-0000-0000-0000-000000000001', :alice_id, 'assignment',
   'New job site assignment', 'You were assigned to Downtown Office Renovation.');
