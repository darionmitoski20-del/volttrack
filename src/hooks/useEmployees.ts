import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MemberStatus } from '@/lib/database.types';
import { localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';
import type { MemberWithProfile } from './types';

export function useEmployees() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['employees', companyId],
    queryFn: async (): Promise<MemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('company_members')
        .select('*, profile:profiles!company_members_user_id_fkey(id, full_name, avatar_url, email, phone)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .returns<MemberWithProfile[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useSetMemberStatus() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; status: MemberStatus }) => {
      const { data, error } = await supabase.rpc('set_member_status', {
        p_member_id: input.memberId,
        p_status: input.status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['employees', companyId] });
    },
  });
}

/** Minutes worked per employee within the current company-local week. */
export function useWeeklyHoursByEmployee() {
  const { companyId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['weekly-hours', companyId, timezone],
    queryFn: async (): Promise<Record<string, number>> => {
      const { weekStart } = weekRange(localDateKey(new Date(), timezone));
      // Fetch completed entries recent enough to cover this week, then group by
      // the employee's LOCAL clock-in day so DST / midnight crossings are exact.
      const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from('time_entries')
        .select('employee_id, clock_in, clock_out, breaks(started_at, ended_at)')
        .eq('company_id', companyId)
        .gte('clock_in', since)
        .not('clock_out', 'is', null)
        .returns<
          {
            employee_id: string;
            clock_in: string;
            clock_out: string;
            breaks: { started_at: string; ended_at: string | null }[];
          }[]
        >();
      if (error) throw error;

      const totals: Record<string, number> = {};
      for (const entry of data) {
        const dayKey = localDateKey(entry.clock_in, timezone);
        const { weekStart: entryWeek } = weekRange(dayKey);
        if (entryWeek !== weekStart) continue;
        let minutes = minutesBetween(entry.clock_in, entry.clock_out);
        for (const b of entry.breaks) {
          if (b.ended_at) minutes -= minutesBetween(b.started_at, b.ended_at);
        }
        totals[entry.employee_id] = (totals[entry.employee_id] ?? 0) + Math.max(0, minutes);
      }
      return totals;
    },
  });
}
