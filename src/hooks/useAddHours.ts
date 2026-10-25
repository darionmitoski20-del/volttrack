import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import type { MemberWithProfile } from './types';

export interface AddHoursInput {
  job_site_id: string;
  clock_in: string;
  clock_out: string;
  note: string | null;
  coworker_ids: string[];
  force: boolean;
}

export interface OverlapInfo {
  entryId: string;
  range: string;
}

export function parseOverlapError(msg: string): OverlapInfo | null {
  const match = msg.match(/overlap::([^:]+)::(.+)/);
  if (!match) return null;
  return { entryId: match[1]!, range: match[2]! };
}

export function useAddHours() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddHoursInput) => {
      const { data, error } = await supabase.rpc('employee_add_hours', {
        p_job_site_id: input.job_site_id,
        p_clock_in: input.clock_in,
        p_clock_out: input.clock_out,
        p_note: input.note,
        p_coworker_ids: input.coworker_ids,
        p_force: input.force,
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

export function useEmployeeOptions() {
  const { companyId, userId } = useCompanyContext();
  return useQuery({
    queryKey: ['employee-options', companyId],
    queryFn: async (): Promise<MemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('company_members')
        .select('*, profile:profiles!company_members_user_id_fkey(id, full_name, avatar_url)')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .neq('user_id', userId)
        .order('created_at', { ascending: true })
        .returns<MemberWithProfile[]>();
      if (error) throw error;
      return data;
    },
  });
}
