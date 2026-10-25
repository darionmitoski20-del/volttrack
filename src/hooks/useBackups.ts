import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';

export interface DataBackup {
  id: string;
  company_id: string;
  period: string;
  payload: unknown;
  created_at: string;
}

/** List of backups for the current company, most recent first. */
export function useBackups() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['backups', companyId],
    queryFn: async (): Promise<DataBackup[]> => {
      const { data, error } = await supabase
        .from('data_backups')
        .select('id, company_id, period, payload, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Owner-triggered backup for the current calendar month (upserts). */
export function useGenerateBackup() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_backup_now', { p_company: companyId });
      if (error) throw error;
      return data as DataBackup;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['backups', companyId] });
    },
  });
}

/** Trigger a client-side download of a backup's JSON payload. */
export function downloadBackup(backup: DataBackup): void {
  const blob = new Blob([JSON.stringify(backup.payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `volttrack-backup_${backup.period}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
