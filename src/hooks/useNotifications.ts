import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/lib/database.types';
import { useCompanyContext } from './useCompanyContext';

export function useNotifications() {
  const { userId } = useCompanyContext();
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const { userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; all?: boolean }) => {
      let q = supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
      q = input.all ? q.eq('is_read', false) : q.eq('id', input.id ?? '');
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });
}
