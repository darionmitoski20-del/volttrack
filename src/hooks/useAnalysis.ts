import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { inclusiveRangeToUtc, localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';

export interface AnalysisFilters {
  startKey: string;
  endKey: string;
}

export interface EmployeeComparison {
  userId: string;
  name: string;
  avatarUrl: string | null;
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  daysWorked: number;
  avgMinutesPerDay: number;
}

export interface WeekTrendRow {
  weekStart: string;
  minutes: number;
}

export interface SiteBreakdownRow {
  id: string;
  name: string;
  minutes: number;
}

export interface AnalysisData {
  employees: EmployeeComparison[];
  weeks: WeekTrendRow[];
  sites: SiteBreakdownRow[];
}

export function useAnalysisData(filters: AnalysisFilters) {
  const { companyId, timezone, company } = useCompanyContext();
  const otThresholdMin = (company.overtime_alert_hours ?? 40) * 60;

  return useQuery({
    queryKey: ['analysis', companyId, filters, otThresholdMin],
    queryFn: async (): Promise<AnalysisData> => {
      const { startUtc, endUtcExclusive } = inclusiveRangeToUtc(filters.startKey, filters.endKey, timezone);

      const { data, error } = await supabase
        .from('time_entries')
        .select(
          'employee_id, job_site_id, clock_in, clock_out, breaks(started_at, ended_at), ' +
            'profile:profiles!time_entries_employee_id_fkey(id, full_name, avatar_url), ' +
            'job_site:job_sites(id, name)',
        )
        .eq('company_id', companyId)
        .gte('clock_in', startUtc)
        .lt('clock_in', endUtcExclusive)
        .not('clock_out', 'is', null);

      if (error) throw error;

      type Row = {
        employee_id: string;
        job_site_id: string;
        clock_in: string;
        clock_out: string;
        breaks: { started_at: string; ended_at: string | null }[];
        profile: { id: string; full_name: string; avatar_url: string | null } | null;
        job_site: { id: string; name: string } | null;
      };

      const empName = new Map<string, string>();
      const empAvatar = new Map<string, string | null>();
      const empWeek = new Map<string, Map<string, number>>();
      const empDays = new Map<string, Set<string>>();
      const weekTotals = new Map<string, number>();
      const siteTotals = new Map<string, number>();
      const siteName = new Map<string, string>();

      for (const e of data as unknown as Row[]) {
        if (e.profile) {
          empName.set(e.employee_id, e.profile.full_name);
          empAvatar.set(e.employee_id, e.profile.avatar_url);
        }
        if (e.job_site) siteName.set(e.job_site_id, e.job_site.name);

        let worked = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) {
          if (b.ended_at) worked -= minutesBetween(b.started_at, b.ended_at);
        }
        worked = Math.max(0, worked);

        const dayKey = localDateKey(e.clock_in, timezone);
        const wk = weekRange(dayKey).weekStart;

        weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + worked);
        siteTotals.set(e.job_site_id, (siteTotals.get(e.job_site_id) ?? 0) + worked);

        const days = empDays.get(e.employee_id) ?? new Set<string>();
        days.add(dayKey);
        empDays.set(e.employee_id, days);

        const perWeek = empWeek.get(e.employee_id) ?? new Map<string, number>();
        perWeek.set(wk, (perWeek.get(wk) ?? 0) + worked);
        empWeek.set(e.employee_id, perWeek);
      }

      const employees: EmployeeComparison[] = [];
      for (const [empId, weeks] of empWeek) {
        let regular = 0;
        let overtime = 0;
        for (const mins of weeks.values()) {
          const ot = Math.max(0, mins - otThresholdMin);
          overtime += ot;
          regular += mins - ot;
        }
        const total = regular + overtime;
        const daysWorked = empDays.get(empId)?.size ?? 0;

        employees.push({
          userId: empId,
          name: empName.get(empId) ?? 'Unknown',
          avatarUrl: empAvatar.get(empId) ?? null,
          totalMinutes: total,
          regularMinutes: regular,
          overtimeMinutes: overtime,
          daysWorked,
          avgMinutesPerDay: daysWorked > 0 ? Math.round(total / daysWorked) : 0,
        });
      }
      employees.sort((a, b) => b.totalMinutes - a.totalMinutes);

      const weeks: WeekTrendRow[] = [...weekTotals.entries()]
        .map(([weekStart, minutes]) => ({ weekStart, minutes }))
        .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));

      const sites: SiteBreakdownRow[] = [...siteTotals.entries()]
        .map(([id, minutes]) => ({ id, name: siteName.get(id) ?? 'Unknown', minutes }))
        .sort((a, b) => b.minutes - a.minutes);

      return { employees, weeks, sites };
    },
  });
}

/** Back-compat wrapper: employee rows only. */
export function useEmployeeComparison(filters: AnalysisFilters) {
  const query = useAnalysisData(filters);
  return { ...query, data: query.data?.employees };
}
