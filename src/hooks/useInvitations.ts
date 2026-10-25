import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EmployeeInvitation, Role } from '@/lib/database.types';
import { useCompanyContext } from './useCompanyContext';

export function useInvitations() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['invitations', companyId],
    queryFn: async (): Promise<EmployeeInvitation[]> => {
      const { data, error } = await supabase
        .from('employee_invitations')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, companyId: string) {
  void qc.invalidateQueries({ queryKey: ['invitations', companyId] });
}

export function useCreateInvitation() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; fullName: string; role?: Role }) => {
      const { data, error } = await supabase.rpc('create_invitation', {
        p_email: input.email,
        p_full_name: input.fullName,
        p_role: input.role ?? 'employee',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

export function useRevokeInvitation() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('revoke_invitation', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

export function useResendInvitation() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<EmployeeInvitation> => {
      const { data, error } = await supabase.rpc('resend_invitation', { p_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc, companyId),
  });
}

/** Build the absolute invitation acceptance URL for copy/share. */
export function invitationLink(token: string): string {
  const base = import.meta.env.VITE_APP_URL ||
    window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base.replace(/\/$/, '')}/accept-invitation?token=${token}`;
}
