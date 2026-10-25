-- ============================================================================
-- VoltTrack — 0009 finance: hourly rates, overtime settings, job site budgets
-- ============================================================================

-- Company-level overtime settings
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ot_multiplier numeric(3,2) NOT NULL DEFAULT 1.5
    CHECK (ot_multiplier >= 1),
  ADD COLUMN IF NOT EXISTS overtime_alert_hours smallint NOT NULL DEFAULT 40
    CHECK (overtime_alert_hours BETWEEN 1 AND 100);

-- Money budget per job site (estimated_hours already exists)
ALTER TABLE public.job_sites
  ADD COLUMN IF NOT EXISTS budget_amount numeric(12,2)
    CHECK (budget_amount IS NULL OR budget_amount >= 0);

-- ---------------------------------------------------------------------------
-- employee_rates: hourly rate per employee.
-- Separate table (not a company_members column) so RLS can restrict reads:
-- owners see every rate, an employee sees only their own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  hourly_rate numeric(8,2) NOT NULL CHECK (hourly_rate >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_rates_company ON public.employee_rates (company_id);

ALTER TABLE public.employee_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rates_owner_select ON public.employee_rates;
CREATE POLICY rates_owner_select ON public.employee_rates FOR SELECT
  USING (public.is_company_owner(company_id));

DROP POLICY IF EXISTS rates_self_select ON public.employee_rates;
CREATE POLICY rates_self_select ON public.employee_rates FOR SELECT
  USING (user_id = auth.uid());

-- All writes via the RPC below (no direct insert/update policies).

-- ---------------------------------------------------------------------------
-- set_member_rate: owner sets an employee's hourly rate
-- ---------------------------------------------------------------------------
create or replace function public.set_member_rate(
  p_member_id uuid,
  p_rate numeric
) returns public.employee_rates
language plpgsql security definer set search_path = public as $$
declare
  v_member public.company_members;
  v_rate public.employee_rates;
begin
  select * into v_member from public.company_members where id = p_member_id;
  if not found then raise exception 'member not found'; end if;
  if not public.is_company_owner(v_member.company_id) then
    raise exception 'not authorized';
  end if;
  if p_rate is null or p_rate < 0 then
    raise exception 'rate must be zero or positive';
  end if;

  insert into public.employee_rates (company_id, user_id, hourly_rate)
  values (v_member.company_id, v_member.user_id, p_rate)
  on conflict (company_id, user_id)
    do update set hourly_rate = excluded.hourly_rate, updated_at = now()
  returning * into v_rate;

  perform public.write_audit(v_member.company_id, 'member.rate_set', 'employee_rate',
    v_rate.id, null::jsonb, to_jsonb(v_rate));

  return v_rate;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_job_site_budget: owner sets the money budget for a job site
-- ---------------------------------------------------------------------------
create or replace function public.set_job_site_budget(
  p_job_site_id uuid,
  p_budget_amount numeric
) returns public.job_sites
language plpgsql security definer set search_path = public as $$
declare
  v_site public.job_sites;
begin
  select * into v_site from public.job_sites where id = p_job_site_id;
  if not found then raise exception 'job site not found'; end if;
  if not public.is_company_owner(v_site.company_id) then
    raise exception 'not authorized';
  end if;
  if p_budget_amount is not null and p_budget_amount < 0 then
    raise exception 'budget must be zero or positive';
  end if;

  update public.job_sites
    set budget_amount = p_budget_amount
  where id = p_job_site_id
  returning * into v_site;

  return v_site;
end;
$$;

grant execute on function
  public.set_member_rate(uuid, numeric),
  public.set_job_site_budget(uuid, numeric)
to authenticated;
