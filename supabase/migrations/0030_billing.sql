-- Billing: which package a company pays for (Stripe), and how many AI plan reads it gets per month.
-- Written only by the billing edge function (service role); members can read their own company's row.
create table if not exists public.company_billing (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan text not null,                       -- 'starter' | 'pro' | 'business'
  reads_per_month int not null,             -- AI plan reads included each month
  status text not null default 'active',    -- Stripe subscription status: trialing, active, past_due, canceled …
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.company_billing enable row level security;
drop policy if exists company_billing_select on public.company_billing;
create policy company_billing_select on public.company_billing for select
  using (company_id in (select public.auth_company_ids()));

grant select on public.company_billing to authenticated;

-- One row per AI plan reading started, to count reads per month (rows in plan_ai_pages get replaced).
create table if not exists public.plan_ai_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  version_id uuid references public.plan_versions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_ai_usage_company on public.plan_ai_usage(company_id, created_at desc);

alter table public.plan_ai_usage enable row level security;
drop policy if exists plan_ai_usage_select on public.plan_ai_usage;
create policy plan_ai_usage_select on public.plan_ai_usage for select
  using (company_id in (select public.auth_company_ids()));

grant select on public.plan_ai_usage to authenticated;
