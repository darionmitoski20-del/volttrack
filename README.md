# VoltTrack ⚡

Workforce & time tracking SaaS built for electrical contractors.  
React + TypeScript + Vite + Tailwind CSS + Supabase.

---

## Features implemented

- **Authentication** — sign in, sign up (owner creates company), forgot / reset password, invitation acceptance with password setup, protected routes, role-based routing (owner → `/app`, employee → `/me`)
- **Owner dashboard** — onboarding checklist ("Company Setup — 0 of 4"), KPI stat cards (on-the-clock, active employees, weekly hours, active sites), live active-crew list, attention-required panel (pending timesheets, missing clock-outs), recent audit activity, quick-action links
- **Employee management** — searchable + filterable employee table, status badges, activate / suspend / deactivate via server-authoritative RPC, pending invitations section with copy-link, resend, revoke
- **Invitation system** — owner creates invitations (name, email, role), secure 48-char hex token, 7-day expiry, token-gated preview RPC for invitees, one-click accept flow that creates auth user + company member
- **Job sites** — full CRUD (create, update, status transitions: planned → active → paused → completed → archived), estimated-hours tracking, actual-hours progress bar, assigned-employee count, live on-site worker count, detail page with assignment management
- **Clock in / break / out** — all server-authoritative via SECURITY DEFINER RPCs (no client-side time manipulation), one-active-shift-per-employee enforced at DB level (partial unique index), break tracking, live elapsed timer that recovers after page refresh (reads `clock_in` from server), employee note support
- **Time entries** — owner view with 5-axis filtering (employee, job site, status, date range), responsive table (desktop) / card list (mobile), inline edit modal for clock-in/out correction with full audit trail
- **Weekly timesheets** — Monday-based weeks, automatic minute computation (regular + overtime > 40h/week), employee submit flow with comment, owner review modal with entry breakdown, approve / reject (rejection requires comment), bulk "approve all"
- **Reports & CSV export** — configurable date range + employee / site filters, KPI summary (total / regular / overtime / missing clock-outs), hours-by-employee table with overtime breakdown, hours-by-job-site list with estimated-vs-actual progress bars, one-click CSV download (UTF-8 BOM)
- **Audit log** — immutable, server-written (via SECURITY DEFINER), covers every sensitive action (company creation, employee status changes, invitations, assignments, clock events, time-entry edits, timesheet decisions), owner-only access via RLS
- **In-app notifications** — bell icon with unread badge, real-time count, mark-read / mark-all-read, triggered server-side by RPCs (timesheet submitted, assignment created, account status changed, invitation accepted)
- **Onboarding** — "Company Setup 0 of 4" checklist (add details, create job site, invite employee, record first shift), auto-progresses and hides when complete
- **Empty / loading / error states** — `QueryBoundary` component handles loading skeleton, error with retry, and empty-state illustration for every data list
- **Accessibility** — focus-visible rings, `aria-label` on icon buttons, `role="alert"` on errors, `role="dialog"` with Escape-close and focus trap on modals, keyboard-navigable nav, screen-reader-only labels
- **Mobile-first responsive** — bottom nav with raised Clock action for employees, tables collapse to card lists, modal slides up as bottom sheet, safe-area padding

## Project structure

```
volttrack/
├── public/volt.svg              # Favicon (bolt icon)
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql      # Tables, indexes, triggers
│   │   ├── 0002_security.sql    # RLS policies + helper functions
│   │   ├── 0003_functions.sql   # Core RPCs (clock, timesheets)
│   │   └── 0004_admin_functions.sql  # Owner RPCs (CRUD, invitations)
│   └── seed.sql                 # Demo data
├── src/
│   ├── lib/                     # Pure utilities (zero framework deps)
│   │   ├── database.types.ts    # Typed DB schema + RPC signatures
│   │   ├── datetime.ts          # Timezone-aware date engine (Intl-based)
│   │   ├── datetime.test.ts     # 14 verified datetime tests
│   │   ├── permissions.ts       # Client-side role/permission checks
│   │   ├── permissions.test.ts  # Permission + CSV tests
│   │   ├── csv.ts               # CSV generation + download
│   │   ├── supabase.ts          # Typed Supabase client
│   │   ├── query.ts             # TanStack QueryClient config
│   │   └── utils.ts             # cn(), initials(), avatarColor()
│   ├── features/auth/           # AuthProvider + useAuth hook
│   ├── hooks/                   # TanStack Query data hooks
│   │   ├── useCompanyContext.ts  # Company/user/role accessor
│   │   ├── useCompany.ts        # Company CRUD
│   │   ├── useEmployees.ts      # Members + weekly hours
│   │   ├── useInvitations.ts    # Invitation lifecycle
│   │   ├── useJobSites.ts       # Job site CRUD + stats
│   │   ├── useAssignments.ts    # Site ↔ employee assignments
│   │   ├── useClock.ts          # Active shift + clock actions
│   │   ├── useActiveWorkers.ts  # All in-progress shifts (owner)
│   │   ├── useTimeEntries.ts    # Filtered entries + owner edit
│   │   ├── useTimesheets.ts     # Timesheet CRUD + review
│   │   ├── useReports.ts        # Aggregated report data
│   │   ├── useNotifications.ts  # Notification list + mark-read
│   │   └── useAudit.ts          # Audit log + labels
│   ├── components/
│   │   ├── ui/                  # Design system primitives
│   │   ├── layout/              # AppShell, Sidebar, TopHeader, MobileNav
│   │   ├── forms/               # Modal forms (invite, job site, edit entry, review)
│   │   └── OnboardingChecklist.tsx
│   ├── pages/
│   │   ├── auth/                # SignIn, CreateCompany, ForgotPassword, ResetPassword, AcceptInvitation
│   │   ├── owner/               # Dashboard, Employees, JobSites, JobSiteDetail, TimeEntries, Timesheets, Reports, Audit, Settings
│   │   └── employee/            # Dashboard (ClockCard), MyTimeEntries, MyTimesheets, JobSites
│   ├── routes/guards.tsx        # ProtectedRoute, RequireCompany, RoleRoute
│   ├── App.tsx                  # Router configuration
│   └── main.tsx                 # React root + providers
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
└── eslint.config.js
```

## Database tables

| Table | Purpose |
|-------|---------|
| `profiles` | User identity (name, avatar); auto-created on auth signup |
| `companies` | Company record (name, timezone, address, phone) |
| `company_members` | Links users to companies with role (owner/employee) and status |
| `employee_invitations` | Secure token-based invitation with expiry and status lifecycle |
| `job_sites` | Work locations with status, dates, estimated hours |
| `job_site_assignments` | Many-to-many between job sites and employees |
| `time_entries` | Clock-in/out records; partial unique index enforces one active shift |
| `breaks` | Break periods within a shift; partial unique index enforces one open break |
| `timesheets` | Weekly hour summaries with approval workflow |
| `audit_logs` | Immutable activity log; insert-only via SECURITY DEFINER functions |
| `notifications` | In-app notification queue per user |

## Row Level Security (RLS) policies

Every table has RLS enabled. Key rules:

- **Profiles**: users see coworkers in their company; can only update their own row
- **Companies**: members can read; only owners can update
- **Members**: members can read; owners can manage
- **Invitations**: owner-only access (invitees use the `invitation_preview` RPC)
- **Job sites / assignments**: members can read; owners can write
- **Time entries**: employees see their own; owners see all company entries; inserts happen via `clock_in` RPC only
- **Breaks**: same visibility as time entries
- **Timesheets**: employees see/submit their own; owners see all and review
- **Audit logs**: owner-only read; inserts are closed — only server RPCs write via `write_audit()`
- **Notifications**: users see their own only

All sensitive writes go through SECURITY DEFINER RPCs that validate permissions server-side.

## Environment variables

Create `.env` from `.env.example`:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:5173
```

## Install & run

```bash
# Install dependencies
npm install

# Start Supabase (requires Docker)
npx supabase start

# Copy env vars from supabase start output
cp .env.example .env
# Edit .env with the URL and anon key shown by `supabase start`

# Run migrations and seed
npx supabase db reset

# Start dev server
npm run dev
```

## Migration commands (Supabase CLI)

```bash
npx supabase start            # Start local Supabase (Postgres, Auth, etc.)
npx supabase db reset          # Drop + recreate + run all migrations + seed.sql
npx supabase db push           # Push migrations to a remote Supabase project
npx supabase db diff           # Generate a new migration from schema changes
npx supabase gen types typescript --local > src/lib/database.types.ts  # Regenerate types
```

## Test commands

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (flat config, no-explicit-any = error)
npm test            # vitest run (datetime, permissions, CSV tests)
npm run test:watch  # vitest interactive mode
npm run build       # Production build (vite build)
```

## Demo account setup

After `supabase db reset`, create three test users via the Supabase Dashboard (Auth → Users → Add User) or the management API:

| Email | Password | UUID (must match seed.sql) |
|-------|----------|---------------------------|
| `owner@volttrack.dev` | `password123` | `00000000-0000-0000-0000-000000000001` |
| `alice@volttrack.dev` | `password123` | `00000000-0000-0000-0000-000000000002` |
| `bob@volttrack.dev`   | `password123` | `00000000-0000-0000-0000-000000000003` |

Use the Supabase management API to create users with specific UUIDs:

```bash
# From your project's supabase start output, use the service_role key:
curl -X POST 'http://localhost:54321/auth/v1/admin/users' \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@volttrack.dev","password":"password123","email_confirm":true,"user_metadata":{"full_name":"Mike Watts"},"id":"00000000-0000-0000-0000-000000000001"}'
```

Repeat for Alice and Bob. Then run `psql < supabase/seed.sql` or restart with `supabase db reset` (seed runs automatically).

Sign in as the owner to see the full dashboard with employees, job sites, pending timesheets, and audit log. Sign in as Alice or Bob to see the employee experience with clock-in and timesheet submission.

## Future improvements

- **Real-time subscriptions** — Supabase Realtime channels for live clock-in/out updates on the owner dashboard without polling
- **Push notifications** — integrate with web push or email via Supabase Edge Functions for timesheet reminders and missing clock-out alerts
- **Geolocation verification** — optional GPS check on clock-in to confirm the employee is at the job site
- **Photo attachments** — allow employees to attach progress photos to time entries
- **Multi-company support** — the schema already supports it (users can be members of multiple companies); the UI currently assumes one
- **Payroll export** — structured CSV/PDF export formatted for common payroll systems (ADP, Gusto, QuickBooks)
- **Overtime rules engine** — configurable daily and weekly overtime thresholds per state/jurisdiction
- **Offline clock-in** — PWA with service worker that queues clock events when offline and syncs when reconnected
- **Manager role** — intermediate role between owner and employee with scoped permissions (e.g., can review timesheets for their crew only)
- **Dark mode** — the navy palette is already dark-mode-ready; add a `prefers-color-scheme` toggle

---

### Build environment note

This codebase was generated in a sandboxed environment **without network access**. `npm install`, TypeScript compilation, ESLint, Vitest (with React/jsdom), and Vite build could not be executed during authoring. However:

- The **datetime engine**, **CSV generator**, and **permissions module** were genuinely unit-tested in-sandbox using `tsx` (they have zero external dependencies).
- All internal imports were statically verified to resolve correctly.
- The code follows strict TypeScript conventions (`noUncheckedIndexedAccess`, no `any`, no `@ts-ignore`).

After cloning, run `npm install && npm run typecheck && npm run lint && npm test && npm run build` to verify everything compiles and passes on a networked machine.
