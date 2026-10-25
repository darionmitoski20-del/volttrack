import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { JobSite, JobSiteStatus } from '@/lib/database.types';
import { minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';

export interface JobSiteStats extends JobSite {
  assignedCount: number;
  activeWorkers: number;
  actualMinutes: number;
}

export interface JobSiteInput {
  name: string;
  client_name: string | null;
  address: string | null;
  description: string | null;
  status: JobSiteStatus;
  estimated_hours: number | null;
  budget_amount: number | null;
  start_date: string | null;
  end_date: string | null;
}

export function useJobSites() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['job-sites', companyId],
    queryFn: async (): Promise<JobSiteStats[]> => {
      const [sitesRes, assignRes, entriesRes] = await Promise.all([
        supabase.from('job_sites').select('*').eq('company_id', companyId).order('created_at', {
          ascending: false,
        }),
        supabase.from('job_site_assignments').select('job_site_id').eq('company_id', companyId),
        supabase
          .from('time_entries')
          .select('job_site_id, status, clock_in, clock_out, breaks(started_at, ended_at)')
          .eq('company_id', companyId)
          .returns<
            {
              job_site_id: string;
              status: string;
              clock_in: string;
              clock_out: string | null;
              breaks: { started_at: string; ended_at: string | null }[];
            }[]
          >(),
      ]);
      if (sitesRes.error) throw sitesRes.error;
      if (assignRes.error) throw assignRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const assignedCount = new Map<string, number>();
      for (const a of assignRes.data) {
        assignedCount.set(a.job_site_id, (assignedCount.get(a.job_site_id) ?? 0) + 1);
      }
      const activeWorkers = new Map<string, number>();
      const actualMinutes = new Map<string, number>();
      for (const e of entriesRes.data) {
        if (e.status === 'active') {
          activeWorkers.set(e.job_site_id, (activeWorkers.get(e.job_site_id) ?? 0) + 1);
        }
        if (e.clock_out) {
          let m = minutesBetween(e.clock_in, e.clock_out);
          for (const b of e.breaks) if (b.ended_at) m -= minutesBetween(b.started_at, b.ended_at);
          actualMinutes.set(e.job_site_id, (actualMinutes.get(e.job_site_id) ?? 0) + Math.max(0, m));
        }
      }

      return sitesRes.data.map((s) => ({
        ...s,
        assignedCount: assignedCount.get(s.id) ?? 0,
        activeWorkers: activeWorkers.get(s.id) ?? 0,
        actualMinutes: actualMinutes.get(s.id) ?? 0,
      }));
    },
  });
}

export function useJobSite(id: string) {
  return useQuery({
    queryKey: ['job-site', id],
    queryFn: async (): Promise<JobSite> => {
      const { data, error } = await supabase.from('job_sites').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

/** Lightweight list for selects/filters. */
export function useJobSiteOptions() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['job-site-options', companyId],
    queryFn: async (): Promise<Pick<JobSite, 'id' | 'name' | 'status'>[]> => {
      const { data, error } = await supabase
        .from('job_sites')
        .select('id, name, status')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

function invalidateSites(qc: ReturnType<typeof useQueryClient>, companyId: string) {
  void qc.invalidateQueries({ queryKey: ['job-sites', companyId] });
  void qc.invalidateQueries({ queryKey: ['job-site-options', companyId] });
}

export function useCreateJobSite() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: JobSiteInput): Promise<JobSite> => {
      const { data, error } = await supabase.rpc('create_job_site', {
        p_name: input.name,
        p_client_name: input.client_name,
        p_address: input.address,
        p_description: input.description,
        p_status: input.status,
        p_estimated_hours: input.estimated_hours,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
      });
      if (error) throw error;
      // Budget lives outside create_job_site's signature — set it separately.
      if (input.budget_amount != null) {
        const budget = await supabase.rpc('set_job_site_budget', {
          p_job_site_id: data.id,
          p_budget_amount: input.budget_amount,
        });
        if (budget.error) throw budget.error;
        return budget.data;
      }
      return data;
    },
    onSuccess: () => invalidateSites(qc, companyId),
  });
}

export function useUpdateJobSite() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: JobSiteInput & { id: string }): Promise<JobSite> => {
      const { error } = await supabase.rpc('update_job_site', {
        p_id: input.id,
        p_name: input.name,
        p_client_name: input.client_name,
        p_address: input.address,
        p_description: input.description,
        p_status: input.status,
        p_estimated_hours: input.estimated_hours,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
      });
      if (error) throw error;
      const budget = await supabase.rpc('set_job_site_budget', {
        p_job_site_id: input.id,
        p_budget_amount: input.budget_amount,
      });
      if (budget.error) throw budget.error;
      return budget.data;
    },
    onSuccess: (site) => {
      invalidateSites(qc, companyId);
      void qc.invalidateQueries({ queryKey: ['job-site', site.id] });
    },
  });
}
