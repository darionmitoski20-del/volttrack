import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';

export interface CreateJobSiteInput {
  name: string;
  client_name: string | null;
  description: string | null;
}

export function useEmployeeCreateJobSite() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateJobSiteInput) => {
      const { data, error } = await supabase.rpc('employee_create_job_site', {
        p_name: input.name,
        p_client_name: input.client_name,
        p_description: input.description,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-assigned-sites', userId] });
      void qc.invalidateQueries({ queryKey: ['job-sites', companyId] });
    },
  });
}
