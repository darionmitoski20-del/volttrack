import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { localDateKey, weekRange, minutesBetween } from '@/lib/datetime';
import { payForMinutes } from '@/lib/money';
import { useCompanyContext } from './useCompanyContext';

export interface MyHoursSummary {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  totalMinutes: number;
  /** null when the owner hasn't set an hourly rate for this employee */
  hourlyRate: number | null;
  todayEarnings: number;
  weekEarnings: number;
  monthEarnings: number;
  totalEarnings: number;
}

/**
 * Hours + earnings for the current employee.
 * Overtime: minutes beyond the weekly threshold are paid at the company's
 * ot_multiplier. The OT bonus of a week is attributed to the month that
 * contains that week's Monday.
 */
export function useMyHoursSummary() {
  const { userId, companyId, timezone, company } = useCompanyContext();
  const otMultiplier = company.ot_multiplier ?? 1.5;
  const otThresholdMin = (company.overtime_alert_hours ?? 40) * 60;

  return useQuery({
    queryKey: ['my-hours-summary', userId, timezone, otMultiplier, otThresholdMin],
    queryFn: async (): Promise<MyHoursSummary> => {
      const [entriesRes, rateRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('clock_in, clock_out, breaks(started_at, ended_at)')
          .eq('employee_id', userId)
          .not('clock_out', 'is', null)
          .returns<
            {
              clock_in: string;
              clock_out: string;
              breaks: { started_at: string; ended_at: string | null }[];
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

      const rate = rateRes.data ? Number(rateRes.data.hourly_rate) : null;

      const todayKey = localDateKey(new Date(), timezone);
      const { weekStart: currentWeek } = weekRange(todayKey);
      const monthPrefix = todayKey.slice(0, 7); // "YYYY-MM"

      let today = 0, week = 0, month = 0, total = 0;
      const byWeek = new Map<string, number>();

      for (const e of entriesRes.data) {
        let mins = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) {
          if (b.ended_at) mins -= minutesBetween(b.started_at, b.ended_at);
        }
        mins = Math.max(0, mins);

        const dayKey = localDateKey(e.clock_in, timezone);
        const wk = weekRange(dayKey).weekStart;
        total += mins;
        byWeek.set(wk, (byWeek.get(wk) ?? 0) + mins);
        if (dayKey.startsWith(monthPrefix)) month += mins;
        if (wk === currentWeek) week += mins;
        if (dayKey === todayKey) today += mins;
      }

      // Earnings: base pay on every minute + OT bonus per week beyond threshold.
      let totalEarnings = 0, monthEarnings = 0, weekEarnings = 0, todayEarnings = 0;
      if (rate != null) {
        const bonusRate = rate * (otMultiplier - 1);
        let totalBonus = 0, monthBonus = 0, weekBonus = 0;
        for (const [wk, mins] of byWeek) {
          const ot = Math.max(0, mins - otThresholdMin);
          const bonus = payForMinutes(ot, bonusRate);
          totalBonus += bonus;
          if (wk.startsWith(monthPrefix)) monthBonus += bonus;
          if (wk === currentWeek) weekBonus += bonus;
        }
        totalEarnings = payForMinutes(total, rate) + totalBonus;
        monthEarnings = payForMinutes(month, rate) + monthBonus;
        weekEarnings = payForMinutes(week, rate) + weekBonus;
        todayEarnings = payForMinutes(today, rate);
      }

      return {
        todayMinutes: today,
        weekMinutes: week,
        monthMinutes: month,
        totalMinutes: total,
        hourlyRate: rate,
        todayEarnings,
        weekEarnings,
        monthEarnings,
        totalEarnings,
      };
    },
    refetchInterval: 60_000,
  });
}
