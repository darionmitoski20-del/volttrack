import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';
import type { TimeEntryDetail } from './types';

const ACTIVE_SELECT =
  '*, job_site:job_sites(id, name), ' +
  'profile:profiles!time_entries_employee_id_fkey(id, full_name, avatar_url), ' +
  'breaks(id, started_at, ended_at)';

/**
 * The current user's active shift, read from the server (source of truth).
 * Because this is fetched fresh on mount, the live timer recovers correctly
 * after a page refresh — the elapsed time is derived from `clock_in`, never
 * from a client-only counter.
 */
export function useActiveShift() {
  const { userId } = useCompanyContext();
  return useQuery({
    queryKey: ['active-shift', userId],
    queryFn: async (): Promise<TimeEntryDetail | null> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select(ACTIVE_SELECT)
        .eq('employee_id', userId)
        .eq('status', 'active')
        .returns<TimeEntryDetail[]>()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: true,
  });
}

function invalidateClock(qc: ReturnType<typeof useQueryClient>, userId: string, companyId: string) {
  void qc.invalidateQueries({ queryKey: ['active-shift', userId] });
  void qc.invalidateQueries({ queryKey: ['my-hours', userId] });
  void qc.invalidateQueries({ queryKey: ['time-entries', companyId] });
  void qc.invalidateQueries({ queryKey: ['active-workers', companyId] });
}

export function useClockActions() {
  const { userId, companyId } = useCompanyContext();
  const qc = useQueryClient();
  const settle = () => invalidateClock(qc, userId, companyId);

  const clockIn = useMutation({
    mutationFn: async (input: { jobSiteId: string; note?: string | null }) => {
      const { data, error } = await supabase.rpc('clock_in', {
        p_job_site_id: input.jobSiteId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: settle,
  });

  const startBreak = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.rpc('start_break', { p_time_entry_id: entryId });
      if (error) throw error;
    },
    onSuccess: settle,
  });

  const endBreak = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.rpc('end_break', { p_time_entry_id: entryId });
      if (error) throw error;
    },
    onSuccess: settle,
  });

  const clockOut = useMutation({
    mutationFn: async (input: { entryId: string; note?: string | null }) => {
      const { data, error } = await supabase.rpc('clock_out', {
        p_time_entry_id: input.entryId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: settle,
  });

  return { clockIn, startBreak, endBreak, clockOut };
}

export interface MyHours {
  todayMinutes: number;
  weekMinutes: number;
}

/** Completed worked minutes for the current employee: today and this week. */
export function useMyHours() {
  const { userId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['my-hours', userId, timezone],
    queryFn: async (): Promise<MyHours> => {
      const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from('time_entries')
        .select('clock_in, clock_out, breaks(started_at, ended_at)')
        .eq('employee_id', userId)
        .not('clock_out', 'is', null)
        .gte('clock_in', since)
        .returns<
          { clock_in: string; clock_out: string; breaks: { started_at: string; ended_at: string | null }[] }[]
        >();
      if (error) throw error;

      const todayKey = localDateKey(new Date(), timezone);
      const { weekStart } = weekRange(todayKey);
      let today = 0;
      let week = 0;
      for (const e of data) {
        const dayKey = localDateKey(e.clock_in, timezone);
        let minutes = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) if (b.ended_at) minutes -= minutesBetween(b.started_at, b.ended_at);
        minutes = Math.max(0, minutes);
        if (dayKey === todayKey) today += minutes;
        if (weekRange(dayKey).weekStart === weekStart) week += minutes;
      }
      return { todayMinutes: today, weekMinutes: week };
    },
  });
}
