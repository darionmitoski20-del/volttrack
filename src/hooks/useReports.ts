import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { inclusiveRangeToUtc, localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';

const WEEKLY_OT_THRESHOLD = 40 * 60; // minutes

export interface ReportFilters {
  startKey: string;
  endKey: string;
  employeeId?: string;
  jobSiteId?: string;
}

export interface EmployeeReportRow {
  id: string;
  name: string;
  regularMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
}

export interface JobSiteReportRow {
  id: string;
  name: string;
  actualMinutes: number;
  estimatedHours: number | null;
}

export interface DailyReportRow {
  dateKey: string;
  minutes: number;
}

export interface ReportData {
  byEmployee: EmployeeReportRow[];
  byJobSite: JobSiteReportRow[];
  daily: DailyReportRow[];
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  missingClockOuts: number;
}

interface RawEntry {
  employee_id: string;
  job_site_id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  job_site: { id: string; name: string } | null;
  profile: { id: string; full_name: string } | null;
  breaks: { started_at: string; ended_at: string | null }[];
}

export function useReports(filters: ReportFilters) {
  const { companyId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['reports', companyId, filters, timezone],
    queryFn: async (): Promise<ReportData> => {
      const { startUtc, endUtcExclusive } = inclusiveRangeToUtc(
        filters.startKey,
        filters.endKey,
        timezone,
      );

      let q = supabase
        .from('time_entries')
        .select(
          '*, job_site:job_sites(id, name), ' +
            'profile:profiles!time_entries_employee_id_fkey(id, full_name), ' +
            'breaks(started_at, ended_at)',
        )
        .eq('company_id', companyId)
        .gte('clock_in', startUtc)
        .lt('clock_in', endUtcExclusive);
      if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
      if (filters.jobSiteId) q = q.eq('job_site_id', filters.jobSiteId);

      const [entriesRes, sitesRes] = await Promise.all([
        q.returns<RawEntry[]>(),
        supabase.from('job_sites').select('id, name, estimated_hours').eq('company_id', companyId),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (sitesRes.error) throw sitesRes.error;

      const empName = new Map<string, string>();
      const empWeek = new Map<string, Map<string, number>>(); // emp -> weekStart -> minutes
      const empBreak = new Map<string, number>();
      const siteMinutes = new Map<string, number>();
      const siteName = new Map<string, string>();
      const daily = new Map<string, number>();
      let breakTotal = 0;
      let missingClockOuts = 0;

      for (const e of entriesRes.data) {
        if (e.profile) empName.set(e.employee_id, e.profile.full_name);
        if (e.job_site) siteName.set(e.job_site_id, e.job_site.name);
        if (!e.clock_out) {
          if (e.status === 'incomplete' || e.status === 'active') missingClockOuts += 1;
          continue;
        }
        let worked = minutesBetween(e.clock_in, e.clock_out);
        let brk = 0;
        for (const b of e.breaks) if (b.ended_at) brk += minutesBetween(b.started_at, b.ended_at);
        worked = Math.max(0, worked - brk);
        breakTotal += brk;
        empBreak.set(e.employee_id, (empBreak.get(e.employee_id) ?? 0) + brk);

        const dayKey = localDateKey(e.clock_in, timezone);
        daily.set(dayKey, (daily.get(dayKey) ?? 0) + worked);
        siteMinutes.set(e.job_site_id, (siteMinutes.get(e.job_site_id) ?? 0) + worked);

        const wk = weekRange(dayKey).weekStart;
        const perWeek = empWeek.get(e.employee_id) ?? new Map<string, number>();
        perWeek.set(wk, (perWeek.get(wk) ?? 0) + worked);
        empWeek.set(e.employee_id, perWeek);
      }

      let totalMinutes = 0;
      let regularTotal = 0;
      let overtimeTotal = 0;
      const byEmployee: EmployeeReportRow[] = [];
      for (const [empId, weeks] of empWeek) {
        let regular = 0;
        let overtime = 0;
        for (const minutes of weeks.values()) {
          const ot = Math.max(0, minutes - WEEKLY_OT_THRESHOLD);
          overtime += ot;
          regular += minutes - ot;
        }
        const total = regular + overtime;
        totalMinutes += total;
        regularTotal += regular;
        overtimeTotal += overtime;
        byEmployee.push({
          id: empId,
          name: empName.get(empId) ?? 'Unknown',
          regularMinutes: regular,
          overtimeMinutes: overtime,
          breakMinutes: empBreak.get(empId) ?? 0,
          totalMinutes: total,
        });
      }
      byEmployee.sort((a, b) => b.totalMinutes - a.totalMinutes);

      const estimatedBySite = new Map<string, number | null>();
      for (const s of sitesRes.data) estimatedBySite.set(s.id, s.estimated_hours);
      const byJobSite: JobSiteReportRow[] = [...siteMinutes.entries()]
        .map(([id, minutes]) => ({
          id,
          name: siteName.get(id) ?? 'Unknown',
          actualMinutes: minutes,
          estimatedHours: estimatedBySite.get(id) ?? null,
        }))
        .sort((a, b) => b.actualMinutes - a.actualMinutes);

      const dailyRows: DailyReportRow[] = [...daily.entries()]
        .map(([dateKey, minutes]) => ({ dateKey, minutes }))
        .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

      return {
        byEmployee,
        byJobSite,
        daily: dailyRows,
        totalMinutes,
        regularMinutes: regularTotal,
        overtimeMinutes: overtimeTotal,
        breakMinutes: breakTotal,
        missingClockOuts,
      };
    },
  });
}
