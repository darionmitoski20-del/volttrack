import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';

/**
 * Refresh the live-hours query the moment any time entry changes
 * (clock in/out, edits). Requires time_entries in the realtime publication.
 */
export function useLiveHoursRealtime() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('live-hours-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_entries', filter: `company_id=eq.${companyId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['live-hours', companyId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}

export interface LiveEmployeeData {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  weekMinutes: number;
  activeShift: {
    jobSiteName: string;
    clockIn: string;
  } | null;
}

export function useLiveEmployeeHours() {
  const { companyId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['live-hours', companyId],
    queryFn: async (): Promise<LiveEmployeeData[]> => {
      const todayKey = localDateKey(new Date(), timezone);
      const { weekStart } = weekRange(todayKey);
      const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();

      const [membersRes, entriesRes, activeRes] = await Promise.all([
        supabase
          .from('company_members')
          .select('user_id, profile:profiles!company_members_user_id_fkey(id, full_name, avatar_url)')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .eq('role', 'employee'),
        supabase
          .from('time_entries')
          .select('employee_id, clock_in, clock_out, breaks(started_at, ended_at)')
          .eq('company_id', companyId)
          .gte('clock_in', since)
          .not('clock_out', 'is', null),
        supabase
          .from('time_entries')
          .select('employee_id, clock_in, job_site:job_sites(name)')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .is('clock_out', null),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (activeRes.error) throw activeRes.error;

      const weekTotals = new Map<string, number>();
      for (const e of entriesRes.data as { employee_id: string; clock_in: string; clock_out: string; breaks: { started_at: string; ended_at: string | null }[] }[]) {
        const dayKey = localDateKey(e.clock_in, timezone);
        const { weekStart: entryWeek } = weekRange(dayKey);
        if (entryWeek !== weekStart) continue;
        let mins = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) {
          if (b.ended_at) mins -= minutesBetween(b.started_at, b.ended_at);
        }
        weekTotals.set(e.employee_id, (weekTotals.get(e.employee_id) ?? 0) + Math.max(0, mins));
      }

      const activeShifts = new Map<string, { jobSiteName: string; clockIn: string }>();
      // PostgREST types embedded relations as arrays; they're single rows here.
      for (const a of activeRes.data as unknown as {
        employee_id: string;
        clock_in: string;
        job_site: { name: string } | null;
      }[]) {
        activeShifts.set(a.employee_id, {
          jobSiteName: a.job_site?.name ?? 'Unknown',
          clockIn: a.clock_in,
        });
      }

      type MemberRow = { user_id: string; profile: { id: string; full_name: string; avatar_url: string | null } };
      return (membersRes.data as unknown as MemberRow[]).map((m) => ({
        userId: m.user_id,
        fullName: m.profile.full_name,
        avatarUrl: m.profile.avatar_url,
        weekMinutes: weekTotals.get(m.user_id) ?? 0,
        activeShift: activeShifts.get(m.user_id) ?? null,
      }));
    },
    refetchInterval: 60000,
  });
}
