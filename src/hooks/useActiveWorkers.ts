import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import type { TimeEntryDetail } from './types';

const ACTIVE_SELECT =
  '*, job_site:job_sites(id, name), ' +
  'profile:profiles!time_entries_employee_id_fkey(id, full_name, avatar_url), ' +
  'breaks(id, started_at, ended_at)';

export type WorkStatus = 'working' | 'on_break' | 'missing_clockout';

export interface ActiveWorker {
  entry: TimeEntryDetail;
  status: WorkStatus;
}

const LONG_SHIFT_MINUTES = 12 * 60;

/** All in-progress shifts across the company, classified for monitoring. */
export function useActiveWorkers() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['active-workers', companyId],
    queryFn: async (): Promise<ActiveWorker[]> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select(ACTIVE_SELECT)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('clock_in', { ascending: true })
        .returns<TimeEntryDetail[]>();
      if (error) throw error;

      const now = Date.now();
      return data.map((entry) => {
        const onBreak = entry.breaks.some((b) => !b.ended_at);
        const elapsed = (now - new Date(entry.clock_in).getTime()) / 60000;
        const status: WorkStatus = onBreak
          ? 'on_break'
          : elapsed > LONG_SHIFT_MINUTES
            ? 'missing_clockout'
            : 'working';
        return { entry, status };
      });
    },
    refetchInterval: 60_000,
  });
}

export { LONG_SHIFT_MINUTES };
