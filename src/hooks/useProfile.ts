import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';

export interface UpdateProfileInput {
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}

export function useUpdateProfile() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const { data, error } = await supabase.rpc('update_own_profile', {
        p_full_name: input.full_name,
        p_phone: input.phone,
        p_avatar_url: input.avatar_url,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['employees', companyId] });
    },
  });
}
