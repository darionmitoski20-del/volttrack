import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { payForMinutes } from '@/lib/money';
import { useCompanyContext } from './useCompanyContext';

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface EmployeeStats {
  totalEntries: number;
  totalMinutes: number;
  avgDailyMinutes: number;
  avgWeeklyMinutes: number;
  mostWorkedMonth: string | null;
  mostWorkedMonthMinutes: number;
  topLocationName: string | null;
  topLocationMinutes: number;
  // Money (all 0 / null when no hourly rate is set)
  hourlyRate: number | null;
  totalEarnings: number;
  topEarningMonth: string | null;
  topEarningMonthAmount: number;
  avgHourlyEarned: number;
  avgWeeklyEarnings: number;
  avgMonthlyEarnings: number;
}

export function useEmployeeStats() {
  const { userId, companyId, timezone, company } = useCompanyContext();
  const otMultiplier = company.ot_multiplier ?? 1.5;
  const otThresholdMin = (company.overtime_alert_hours ?? 40) * 60;

  return useQuery({
    queryKey: ['employee-stats', userId, timezone, otMultiplier, otThresholdMin],
    queryFn: async (): Promise<EmployeeStats> => {
      const [entriesRes, rateRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('clock_in, clock_out, breaks(started_at, ended_at), job_site:job_sites(name)')
          .eq('employee_id', userId)
          .not('clock_out', 'is', null)
          .returns<
            {
              clock_in: string;
              clock_out: string;
              breaks: { started_at: string; ended_at: string | null }[];
              job_site: { name: string } | null;
            }[]
          >(),
        supabase
          .from('employee_rates')
          .select('hourly_rate')
          .eq('company_id', companyId)
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      const data = entriesRes.data;
      const rate = rateRes.data ? Number(rateRes.data.hourly_rate) : null;

      const empty: EmployeeStats = {
        totalEntries: 0, totalMinutes: 0,
        avgDailyMinutes: 0, avgWeeklyMinutes: 0,
        mostWorkedMonth: null, mostWorkedMonthMinutes: 0,
        topLocationName: null, topLocationMinutes: 0,
        hourlyRate: rate, totalEarnings: 0,
        topEarningMonth: null, topEarningMonthAmount: 0,
        avgHourlyEarned: 0, avgWeeklyEarnings: 0, avgMonthlyEarnings: 0,
      };
      if (data.length === 0) return empty;

      const byDay = new Map<string, number>();
      const byMonth = new Map<string, number>();
      const byWeek = new Map<string, number>();
      const byLocation = new Map<string, number>();
      let totalMins = 0;

      for (const e of data) {
        let mins = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) {
          if (b.ended_at) mins -= minutesBetween(b.started_at, b.ended_at);
        }
        mins = Math.max(0, mins);

        const dayKey = localDateKey(e.clock_in, timezone);
        const monthKey = dayKey.slice(0, 7);
        const { weekStart } = weekRange(dayKey);
        const loc = e.job_site?.name ?? 'Unknown';

        totalMins += mins;
        byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + mins);
        byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + mins);
        byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + mins);
        byLocation.set(loc, (byLocation.get(loc) ?? 0) + mins);
      }

      const monthLabel = (k: string) => MONTH_NAMES[Number(k.slice(5, 7))] ?? k;

      let mostWorkedMonth: string | null = null;
      let mostWorkedMonthMins = 0;
      for (const [k, v] of byMonth) {
        if (v > mostWorkedMonthMins) { mostWorkedMonthMins = v; mostWorkedMonth = monthLabel(k); }
      }

      let topLocationName: string | null = null;
      let topLocationMins = 0;
      for (const [k, v] of byLocation) {
        if (v > topLocationMins) { topLocationMins = v; topLocationName = k; }
      }

      // --- Money (weekly OT bonus, attributed to the week's Monday month) ---
      let totalEarnings = 0;
      let topEarningMonth: string | null = null;
      let topEarningAmount = 0;
      let avgHourlyEarned = 0, avgWeeklyEarnings = 0, avgMonthlyEarnings = 0;

      if (rate != null) {
        const bonusRate = rate * (otMultiplier - 1);
        const earningsByMonth = new Map<string, number>();
        for (const [dayKey, mins] of byDay) {
          const mk = dayKey.slice(0, 7);
          earningsByMonth.set(mk, (earningsByMonth.get(mk) ?? 0) + payForMinutes(mins, rate));
        }
        for (const [weekStart, mins] of byWeek) {
          const ot = Math.max(0, mins - otThresholdMin);
          if (ot > 0) {
            const mk = weekStart.slice(0, 7);
            earningsByMonth.set(mk, (earningsByMonth.get(mk) ?? 0) + payForMinutes(ot, bonusRate));
          }
        }
        for (const [k, v] of earningsByMonth) {
          totalEarnings += v;
          if (v > topEarningAmount) { topEarningAmount = v; topEarningMonth = monthLabel(k); }
        }
        avgHourlyEarned = totalMins > 0 ? totalEarnings / (totalMins / 60) : 0;
        avgWeeklyEarnings = byWeek.size > 0 ? totalEarnings / byWeek.size : 0;
        avgMonthlyEarnings = byMonth.size > 0 ? totalEarnings / byMonth.size : 0;
      }

      return {
        totalEntries: data.length,
        totalMinutes: totalMins,
        avgDailyMinutes: byDay.size > 0 ? Math.round(totalMins / byDay.size) : 0,
        avgWeeklyMinutes: byWeek.size > 0 ? Math.round(totalMins / byWeek.size) : 0,
        mostWorkedMonth,
        mostWorkedMonthMinutes: mostWorkedMonthMins,
        topLocationName,
        topLocationMinutes: topLocationMins,
        hourlyRate: rate,
        totalEarnings,
        topEarningMonth,
        topEarningMonthAmount: topEarningAmount,
        avgHourlyEarned,
        avgWeeklyEarnings,
        avgMonthlyEarnings,
      };
    },
  });
}

/** Minutes worked per job site for the current employee (site_id → minutes). */
export function useMyHoursBySite() {
  const { userId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['my-hours-by-site', userId, timezone],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('job_site_id, clock_in, clock_out, breaks(started_at, ended_at)')
        .eq('employee_id', userId)
        .not('clock_out', 'is', null)
        .returns<
          {
            job_site_id: string;
            clock_in: string;
            clock_out: string;
            breaks: { started_at: string; ended_at: string | null }[];
          }[]
        >();
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const e of data) {
        let mins = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) {
          if (b.ended_at) mins -= minutesBetween(b.started_at, b.ended_at);
        }
        totals.set(e.job_site_id, (totals.get(e.job_site_id) ?? 0) + Math.max(0, mins));
      }
      return totals;
    },
  });
}
