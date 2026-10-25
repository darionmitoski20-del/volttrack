import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { formatDuration, formatDate, formatTime, minutesToHours, minutesBetween, localDateKey } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { toCsv, downloadCsv } from '@/lib/csv';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useEmployeeStats } from '@/hooks/useEmployeeStats';
import { useMyHoursSummary } from '@/hooks/useMyHoursSummary';
import { Button } from '@/components/ui/Button';
import { PdfExportModal } from '@/components/reports/PdfExportModal';

function StatCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className="mt-1.5 text-xl font-bold text-ink">{primary}</p>
      {secondary && <p className="mt-0.5 text-xs font-semibold tabular-nums text-volt-600">{secondary}</p>}
    </div>
  );
}

function FullWidthStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-navy-100 bg-white px-4 py-3 shadow-card">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</span>
      <span className="text-base font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}

export function EmployeeStatsPage() {
  const { userId, timezone } = useCompanyContext();
  const stats = useEmployeeStats();
  const summary = useMyHoursSummary();
  const [showPdf, setShowPdf] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);

  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('clock_in, clock_out, employee_note, job_site:job_sites(name), breaks(started_at, ended_at)')
        .eq('employee_id', userId)
        .not('clock_out', 'is', null)
        .order('clock_in', { ascending: false })
        .returns<
          {
            clock_in: string;
            clock_out: string;
            employee_note: string | null;
            job_site: { name: string } | null;
            breaks: { started_at: string; ended_at: string | null }[];
          }[]
        >();
      if (error) throw error;
      const csv = toCsv(
        ['Date', 'Job site', 'Start', 'End', 'Hours', 'Note'],
        data.map((e) => {
          let mins = minutesBetween(e.clock_in, e.clock_out);
          for (const b of e.breaks) if (b.ended_at) mins -= minutesBetween(b.started_at, b.ended_at);
          return [
            formatDate(e.clock_in, timezone),
            e.job_site?.name ?? '',
            formatTime(e.clock_in, timezone),
            formatTime(e.clock_out, timezone),
            minutesToHours(Math.max(0, mins)),
            e.employee_note ?? '',
          ];
        }),
      );
      downloadCsv(`volttrack-my-hours_${localDateKey(new Date(), timezone)}.csv`, csv);
    } finally {
      setCsvBusy(false);
    }
  };

  if (stats.isLoading || summary.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-ink">Statistics</h1>
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-200 border-t-volt-500" />
        </div>
      </div>
    );
  }

  const s = stats.data;
  const sum = summary.data;
  const hasMoney = s?.hourlyRate != null;
  const fmt = (m: number | undefined | null) => (m != null && m > 0 ? formatDuration(m) : '—');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Statistics</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => setShowPdf(true)}>
            PDF
          </Button>
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} loading={csvBusy} onClick={exportCsv}>
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Most Worked Month"
          primary={s?.mostWorkedMonth ?? '—'}
          secondary={s?.mostWorkedMonthMinutes ? formatDuration(s.mostWorkedMonthMinutes) : undefined}
        />
        {hasMoney ? (
          <StatCard
            label="Top Earning Month"
            primary={s?.topEarningMonth ?? '—'}
            secondary={s?.topEarningMonthAmount ? formatMoney(s.topEarningMonthAmount) : undefined}
          />
        ) : (
          <StatCard label="This Month" primary={fmt(sum?.monthMinutes)} />
        )}
        <StatCard label="Avg Daily Hours" primary={fmt(s?.avgDailyMinutes)} />
        {hasMoney ? (
          <StatCard label="Avg Hourly $" primary={s?.avgHourlyEarned ? formatMoney(s.avgHourlyEarned) : '—'} />
        ) : (
          <StatCard label="Avg Weekly Hours" primary={fmt(s?.avgWeeklyMinutes)} />
        )}
        {hasMoney && (
          <>
            <StatCard label="Avg Weekly $" primary={s?.avgWeeklyEarnings ? formatMoney(s.avgWeeklyEarnings) : '—'} />
            <StatCard label="Avg Monthly $" primary={s?.avgMonthlyEarnings ? formatMoney(s.avgMonthlyEarnings) : '—'} />
          </>
        )}
        <StatCard
          label="Top Location"
          primary={s?.topLocationName ?? '—'}
          secondary={s?.topLocationMinutes ? formatDuration(s.topLocationMinutes) : undefined}
        />
        <StatCard
          label="Total Hours"
          primary={fmt(s?.totalMinutes)}
          secondary={hasMoney && s?.totalEarnings ? formatMoney(s.totalEarnings) : undefined}
        />
      </div>

      <div className="space-y-2">
        <FullWidthStat label="Total Entries" value={String(s?.totalEntries ?? 0)} />
        <FullWidthStat label="Today" value={fmt(sum?.todayMinutes)} />
        <FullWidthStat label="This Week" value={fmt(sum?.weekMinutes)} />
      </div>

      <PdfExportModal open={showPdf} onClose={() => setShowPdf(false)} />
    </div>
  );
}
