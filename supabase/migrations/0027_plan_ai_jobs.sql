-- ============================================================================
-- VoltTrack — 0027 AI plan reading runs in the background
--
-- The plan summary (page 0 of plan_ai_pages) is now produced by a background AI
-- job: status running -> done | error. job_id is the AI provider's job id and
-- file_id the uploaded PDF at the provider (reused for questions).
-- plan_ai_questions keeps the questions people ask about a plan and the answers.
-- ============================================================================

alter table public.plan_ai_pages add column if not exists status text not null default 'done';
alter table public.plan_ai_pages add column if not exists job_id text;
alter table public.plan_ai_pages add column if not exists file_id text;
alter table public.plan_ai_pages add column if not exists error text;
alter table public.plan_ai_pages add column if not exists updated_at timestamptz not null default now();

create table if not exists public.plan_ai_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  version_id uuid not null references public.plan_versions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  question text not null,
  answer text,
  status text not null default 'running',
  job_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_ai_q_version on public.plan_ai_questions(version_id, created_at desc);
create index if not exists idx_plan_ai_q_company_time on public.plan_ai_questions(company_id, created_at desc);

alter table public.plan_ai_questions enable row level security;
drop policy if exists plan_ai_q_select on public.plan_ai_questions;
create policy plan_ai_q_select on public.plan_ai_questions for select
  using (company_id in (select public.auth_company_ids()));
-- Rows are written by the plan-ai edge function (service role) after it checks membership.
