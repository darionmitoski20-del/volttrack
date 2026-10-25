import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { formatDuration, currentWeekStart, weekRange, addDaysToKey, localDateKey } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useAnalysisData } from '@/hooks/useAnalysis';
import { PageHeader } from '@/components/ui/widgets';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormField, Input } from '@/components/ui/form';
import { EmptyState, SkeletonRows } from '@/components/ui/states';

type SortKey = 'total' | 'overtime' | 'avg';

function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d);
}

export function AnalysisPage() {
  const { timezone } = useCompanyContext();
  const ws = currentWeekStart(timezone);
  const { weekEnd } = weekRange(ws);

  // Default: last 4 weeks so the trend chart has something to show.
  const [startKey, setStartKey] = useState(addDaysToKey(ws, -21));
  const [endKey, setEndKey] = useState(weekEnd);
  const [sortBy, setSortBy] = useState<SortKey>('total');

  const analysis = useAnalysisData({ startKey, endKey });
  const employees = analysis.data?.employees ?? [];
  const weeks = analysis.data?.weeks ?? [];
  const sites = analysis.data?.sites ?? [];

  const sorted = [...employees].sort((a, b) => {
    if (sortBy === 'overtime') return b.overtimeMinutes - a.overtimeMinutes;
    if (sortBy === 'avg') return b.avgMinutesPerDay - a.avgMinutesPerDay;
    return b.totalMinutes - a.totalMinutes;
  });

  const maxTotal = Math.max(1, ...employees.map((r) => r.totalMinutes));
  const maxWeek = Math.max(1, ...weeks.map((w) => w.minutes));
  const maxSite = Math.max(1, ...sites.map((s) => s.minutes));
  const currentWeek = weekRange(localDateKey(new Date(), timezone)).weekStart;

  return (
    <div>
      <PageHeader title="Analysis" subtitle="Compare employee hours and performance." />

      {/* Filters */}
      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <FormField label="From" htmlFor="analysis-from">
              <Input id="analysis-from" type="date" value={startKey} onChange={(e) => setStartKey(e.target.value)} />
            </FormField>
            <FormField label="To" htmlFor="analysis-to">
              <Input id="analysis-to" type="date" value={endKey} onChange={(e) => setEndKey(e.target.value)} />
            </FormField>
          </div>
        </CardBody>
      </Card>

      {analysis.isLoading ? (
        <Card><CardBody><SkeletonRows rows={5} /></CardBody></Card>
      ) : employees.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title="No data" description="No hours found for the selected period." />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Weekly trend */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly trend</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: '9rem' }}>
                {weeks.map((w) => {
                  const pct = Math.max(6, Math.round((w.minutes / maxWeek) * 100));
                  const isCurrent = w.weekStart === currentWeek;
                  return (
                    <div key={w.weekStart} className="flex h-full min-w-[3rem] flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[10px] font-semibold tabular-nums text-ink-muted">
                        {formatDuration(w.minutes)}
                      </span>
                      <div
                        className={`w-full max-w-[2.5rem] rounded-t-lg transition-all ${
                          isCurrent ? 'bg-volt-500' : 'bg-navy-200'
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                      <span className="text-[10px] text-ink-subtle">{weekLabel(w.weekStart)}</span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* Employee comparison */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>By employee</CardTitle>
              <div className="flex gap-1.5">
                {(['total', 'overtime', 'avg'] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      sortBy === k ? 'bg-navy-900 text-white' : 'bg-navy-50 text-ink-muted hover:bg-navy-100'
                    }`}
                  >
                    {k === 'total' ? 'Total' : k === 'overtime' ? 'OT' : 'Avg/day'}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {sorted.map((emp) => (
                  <div key={emp.userId}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-200 text-xs font-bold text-navy-700">
                          {emp.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-ink">{emp.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs tabular-nums text-ink-muted">
                        <span className="hidden sm:inline">{emp.daysWorked}d</span>
                        <span className="hidden sm:inline">{formatDuration(emp.avgMinutesPerDay)}/d</span>
                        <span className="font-semibold text-ink">{formatDuration(emp.totalMinutes)}</span>
                      </div>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-navy-100">
                      <div
                        className="h-full bg-volt-500 transition-all"
                        style={{ width: `${Math.round(((emp.totalMinutes - emp.overtimeMinutes) / maxTotal) * 100)}%` }}
                      />
                      {emp.overtimeMinutes > 0 && (
                        <div
                          className="h-full bg-red-400 transition-all"
                          style={{ width: `${Math.round((emp.overtimeMinutes / maxTotal) * 100)}%` }}
                        />
                      )}
                    </div>
                    {emp.overtimeMinutes > 0 && (
                      <p className="mt-0.5 text-right text-[10px] text-red-500">
                        {formatDuration(emp.overtimeMinutes)} overtime
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* By job site */}
          <Card>
            <CardHeader>
              <CardTitle>By job site</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {sites.map((s) => (
                  <div key={s.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-medium text-ink">{s.name}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-ink">
                        {formatDuration(s.minutes)}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-navy-100">
                      <div
                        className="h-full rounded-full bg-navy-700 transition-all"
                        style={{ width: `${Math.max(3, Math.round((s.minutes / maxSite) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
