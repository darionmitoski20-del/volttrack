import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { localDateKey, monthRange, inclusiveRangeToUtc, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';

export interface DayEntry {
  id: string;
  job_site_name: string;
  clock_in: string;
  clock_out: string;
  note: string | null;
  minutes: number;
}

export interface DayData {
  totalMinutes: number;
  entries: DayEntry[];
}

export function useMonthlyHours(year: number, month: number) {
  const { companyId, timezone, userId } = useCompanyContext();
  const { firstDay, lastDay } = monthRange(year, month);

  return useQuery({
    queryKey: ['monthly-hours', companyId, userId, year, month],
    queryFn: async (): Promise<Map<string, DayData>> => {
      const { startUtc, endUtcExclusive } = inclusiveRangeToUtc(firstDay, lastDay, timezone);

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, clock_in, clock_out, employee_note, job_site:job_sites(name)')
        .eq('company_id', companyId)
        .eq('employee_id', userId)
        .gte('clock_in', startUtc)
        .lt('clock_in', endUtcExclusive)
        .not('clock_out', 'is', null)
        .order('clock_in', { ascending: true })
        .returns<
          {
            id: string;
            clock_in: string;
            clock_out: string;
            employee_note: string | null;
            job_site: { name: string } | null;
          }[]
        >();

      if (error) throw error;

      const result = new Map<string, DayData>();

      for (const entry of data) {
        const dayKey = localDateKey(entry.clock_in, timezone);
        const minutes = minutesBetween(entry.clock_in, entry.clock_out);

        const existing = result.get(dayKey) ?? { totalMinutes: 0, entries: [] };
        existing.totalMinutes += Math.max(0, minutes);
        existing.entries.push({
          id: entry.id,
          job_site_name: entry.job_site?.name ?? 'Unknown',
          clock_in: entry.clock_in,
          clock_out: entry.clock_out,
          note: entry.employee_note,
          minutes: Math.max(0, minutes),
        });
        result.set(dayKey, existing);
      }

      return result;
    },
  });
}
