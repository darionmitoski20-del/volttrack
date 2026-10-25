import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TimeEntryStatus } from '@/lib/database.types';
import { inclusiveRangeToUtc } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';
import type { TimeEntryDetail } from './types';

const ENTRY_SELECT =
  '*, job_site:job_sites(id, name), ' +
  'profile:profiles!time_entries_employee_id_fkey(id, full_name, avatar_url), ' +
  'breaks(id, started_at, ended_at)';

export interface TimeEntryFilters {
  employeeId?: string;
  jobSiteId?: string;
  status?: TimeEntryStatus;
  startKey?: string;
  endKey?: string;
}

/**
 * Time entries for the company (owner) or a single employee. RLS still scopes
 * employees to their own rows, so `employeeId` is an owner-side convenience.
 */
export function useTimeEntries(filters: TimeEntryFilters = {}) {
  const { companyId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['time-entries', companyId, filters],
    queryFn: async (): Promise<TimeEntryDetail[]> => {
      let q = supabase
        .from('time_entries')
        .select(ENTRY_SELECT)
        .eq('company_id', companyId)
        .order('clock_in', { ascending: false })
        .limit(500);

      if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
      if (filters.jobSiteId) q = q.eq('job_site_id', filters.jobSiteId);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.startKey && filters.endKey) {
        const { startUtc, endUtcExclusive } = inclusiveRangeToUtc(
          filters.startKey,
          filters.endKey,
          timezone,
        );
        q = q.gte('clock_in', startUtc).lt('clock_in', endUtcExclusive);
      }

      const { data, error } = await q.returns<TimeEntryDetail[]>();
      if (error) throw error;
      return data;
    },
  });
}

export interface EditTimeEntryInput {
  id: string;
  clock_in: string;
  clock_out: string | null;
  job_site_id: string | null;
  owner_note: string | null;
}

export function useEditTimeEntry() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditTimeEntryInput) => {
      const { data, error } = await supabase.rpc('edit_time_entry', {
        p_id: input.id,
        p_clock_in: input.clock_in,
        p_clock_out: input.clock_out,
        p_job_site_id: input.job_site_id,
        p_owner_note: input.owner_note,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time-entries', companyId] });
      void qc.invalidateQueries({ queryKey: ['audit', companyId] });
    },
  });
}

export interface ManualTimeEntryInput {
  job_site_id: string;
  clock_in: string;
  clock_out: string;
  note: string | null;
}

export function useAddManualTimeEntry() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualTimeEntryInput) => {
      const { data, error } = await supabase.rpc('add_manual_time_entry', {
        p_job_site_id: input.job_site_id,
        p_clock_in: input.clock_in,
        p_clock_out: input.clock_out,
        p_note: input.note,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time-entries', companyId] });
      void qc.invalidateQueries({ queryKey: ['active-shift'] });
      void qc.invalidateQueries({ queryKey: ['my-hours'] });
    },
  });
}
