import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EmployeeRate } from '@/lib/database.types';
import { useCompanyContext } from './useCompanyContext';

/** Owner: all hourly rates in the company, as a user_id → rate map. */
export function useEmployeeRates() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['employee-rates', companyId],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from('employee_rates')
        .select('user_id, hourly_rate')
        .eq('company_id', companyId)
        .returns<Pick<EmployeeRate, 'user_id' | 'hourly_rate'>[]>();
      if (error) throw error;
      return new Map(data.map((r) => [r.user_id, Number(r.hourly_rate)]));
    },
  });
}

/** Employee: my own hourly rate (null when the owner hasn't set one yet). */
export function useMyRate() {
  const { companyId, userId } = useCompanyContext();
  return useQuery({
    queryKey: ['my-rate', companyId, userId],
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('employee_rates')
        .select('hourly_rate')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ? Number(data.hourly_rate) : null;
    },
  });
}

export function useSetMemberRate() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; rate: number }) => {
      const { data, error } = await supabase.rpc('set_member_rate', {
        p_member_id: input.memberId,
        p_rate: input.rate,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['employee-rates', companyId] });
    },
  });
}
