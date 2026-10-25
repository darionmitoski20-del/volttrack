import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';

function invalidate(qc: ReturnType<typeof useQueryClient>, userId: string, companyId: string) {
  void qc.invalidateQueries({ queryKey: ['time-entries', companyId] });
  void qc.invalidateQueries({ queryKey: ['my-hours-summary', userId] });
  void qc.invalidateQueries({ queryKey: ['monthly-hours', companyId] });
  void qc.invalidateQueries({ queryKey: ['employee-stats', userId] });
}

export function useUpdateMyEntry() {
  const { userId, companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      jobSiteId: string;
      clockIn: string;
      clockOut: string;
      note: string | null;
    }) => {
      const { data, error } = await supabase.rpc('employee_update_entry', {
        p_id: input.id,
        p_job_site_id: input.jobSiteId,
        p_clock_in: input.clockIn,
        p_clock_out: input.clockOut,
        p_note: input.note,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc, userId, companyId),
  });
}

export function useDeleteMyEntry() {
  const { userId, companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('employee_delete_entry', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, userId, companyId),
  });
}
