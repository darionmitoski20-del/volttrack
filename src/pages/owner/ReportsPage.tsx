import { useEffect, useState } from 'react';
import { Download, BarChart3, FileText, Star, X } from 'lucide-react';
import {
  currentWeekStart,
  weekRange,
  formatDuration,
  minutesToHours,
  localDateKey,
  monthRange,
} from '@/lib/datetime';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatMoney, payForMinutes } from '@/lib/money';
import { loadPresets, savePreset, deletePreset, type ReportPreset } from '@/lib/reportPresets';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useReports } from '@/hooks/useReports';
import { useEmployees } from '@/hooks/useEmployees';
import { useJobSiteOptions } from '@/hooks/useJobSites';
import { useEmployeeRates } from '@/hooks/useRates';
import { PageHeader, StatCard } from '@/components/ui/widgets';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { PdfExportModal } from '@/components/reports/PdfExportModal';

type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

export function ReportsPage() {
  const { timezone, company } = useCompanyContext();
  const defaultStart = currentWeekStart(timezone);
  const defaultEnd = weekRange(defaultStart).weekEnd;

  const [period, setPeriod] = useState<Period>('week');
  const [startKey, setStartKey] = useState(defaultStart);
  const [endKey, setEndKey] = useState(defaultEnd);
  const [employeeId, setEmployeeId] = useState('');
  const [jobSiteId, setJobSiteId] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    setPresets(loadPresets(company.id));
  }, [company.id]);

  const applyPreset = (preset: ReportPreset) => {
    setPeriod(preset.period);
    setStartKey(preset.startKey);
    setEndKey(preset.endKey);
    setEmployeeId(preset.employeeId);
    setJobSiteId(preset.jobSiteId);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const next = savePreset(company.id, { name: presetName.trim(), period, startKey, endKey, employeeId, jobSiteId });
    setPresets(next);
    setPresetName('');
    setNamingPreset(false);
  };

  const handleDeletePreset = (id: string) => {
    setPresets(deletePreset(company.id, id));
  };

  const selectPeriod = (p: Period) => {
    setPeriod(p);
    const today = localDateKey(new Date(), timezone);
    if (p === 'today') {
      setStartKey(today);
      setEndKey(today);
    } else if (p === 'week') {
      const { weekStart, weekEnd } = weekRange(today);
      setStartKey(weekStart);
      setEndKey(weekEnd);
    } else if (p === 'month') {
      const { firstDay, lastDay } = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
      setStartKey(firstDay);
      setEndKey(lastDay);
    } else if (p === 'year') {
      setStartKey(`${today.slice(0, 4)}-01-01`);
      setEndKey(`${today.slice(0, 4)}-12-31`);
    }
    // custom keeps whatever dates are set
  };

  const employees = useEmployees();
  const sites = useJobSiteOptions();
  const rates = useEmployeeRates();
  const otMultiplier = company.ot_multiplier ?? 1.5;
  const report = useReports({
    startKey,
    endKey,
    employeeId: employeeId || undefined,
    jobSiteId: jobSiteId || undefined,
  });

  /** regular×rate + overtime×rate×multiplier; null if the employee has no rate */
  const costFor = (row: { id: string; regularMinutes: number; overtimeMinutes: number }): number | null => {
    const rate = rates.data?.get(row.id);
    if (rate == null) return null;
    return payForMinutes(row.regularMinutes, rate) + payForMinutes(row.overtimeMinutes, rate * otMultiplier);
  };

  const exportEmployees = () => {
    const data = report.data;
    if (!data) return;
    const csv = toCsv(
      ['Employee', 'Regular hours', 'Overtime hours', 'Break hours', 'Total hours'],
      data.byEmployee.map((r) => [
        r.name,
        minutesToHours(r.regularMinutes),
        minutesToHours(r.overtimeMinutes),
        minutesToHours(r.breakMinutes),
        minutesToHours(r.totalMinutes),
      ]),
    );
    downloadCsv(`volttrack-hours_${startKey}_to_${endKey}.csv`, csv);
  };

  const exportSites = () => {
    const data = report.data;
    if (!data) return;
    const csv = toCsv(
      ['Job site', 'Actual hours', 'Estimated hours'],
      data.byJobSite.map((r) => [r.name, minutesToHours(r.actualMinutes), r.estimatedHours ?? '']),
    );
    downloadCsv(`volttrack-jobsites_${startKey}_to_${endKey}.csv`, csv);
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${company.name} · ${startKey === endKey ? startKey : `${startKey} → ${endKey}`}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<FileText className="h-4 w-4" />}
              onClick={() => setShowPdf(true)}
            >
              PDF
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              onClick={exportEmployees}
              disabled={!report.data || report.data.byEmployee.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Period tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PERIOD_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectPeriod(t.key)}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ' +
              (period === t.key ? 'bg-navy-900 text-white' : 'bg-white text-ink-muted hover:bg-navy-100')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Saved filter presets */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1 rounded-full bg-volt-400/25 py-1 pl-3 pr-1.5 text-xs font-medium text-navy-800"
          >
            <button onClick={() => applyPreset(p)} className="hover:underline">
              {p.name}
            </button>
            <button
              onClick={() => handleDeletePreset(p.id)}
              aria-label={`Delete preset ${p.name}`}
              className="rounded-full p-0.5 hover:bg-navy-900/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {namingPreset ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              placeholder="Preset name"
              className="h-8 w-36 text-xs"
            />
            <Button variant="primary" size="sm" onClick={handleSavePreset}>
              Save
            </Button>
            <button
              onClick={() => { setNamingPreset(false); setPresetName(''); }}
              className="rounded-lg p-1.5 text-ink-muted hover:bg-navy-100"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setNamingPreset(true)}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted hover:bg-navy-100"
          >
            <Star className="h-3.5 w-3.5" />
            Save current filters
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {period === 'custom' && (
          <>
            <Input aria-label="From" type="date" value={startKey} onChange={(e) => setStartKey(e.target.value)} />
            <Input aria-label="To" type="date" value={endKey} onChange={(e) => setEndKey(e.target.value)} />
          </>
        )}
        <Select aria-label="Employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">All employees</option>
          {(employees.data ?? [])
            .filter((m) => m.role === 'employee')
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.full_name}
              </option>
            ))}
        </Select>
        <Select aria-label="Job site" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
          <option value="">All job sites</option>
          {(sites.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <QueryBoundary query={report} isEmpty={(d) => d.totalMinutes === 0 && d.missingClockOuts === 0}
        empty={
          <Card>
            <EmptyState icon={BarChart3} title="No hours in this range" description="Adjust the dates or filters above." />
          </Card>
        }
      >
        {(data) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total hours" value={formatDuration(data.totalMinutes)} tone="volt" />
              <StatCard label="Regular" value={formatDuration(data.regularMinutes)} />
              <StatCard label="Overtime" value={formatDuration(data.overtimeMinutes)} tone="warning" />
              <StatCard
                label="Missing clock-outs"
                value={data.missingClockOuts}
                tone={data.missingClockOuts > 0 ? 'danger' : 'neutral'}
              />
            </div>

            {/* Labor cost — sum of employees that have an hourly rate set */}
            {(() => {
              const withRates = data.byEmployee.filter((r) => rates.data?.has(r.id));
              if (withRates.length === 0) return null;
              const totalCost = withRates.reduce((sum, r) => sum + (costFor(r) ?? 0), 0);
              const missing = data.byEmployee.length - withRates.length;
              return (
                <div className="rounded-2xl bg-navy-900 px-5 py-4 shadow-card">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-300">
                    Labor cost · {startKey === endKey ? startKey : `${startKey} → ${endKey}`}
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-volt-400">
                    {formatMoney(totalCost)}
                  </p>
                  {missing > 0 && (
                    <p className="mt-1 text-xs text-navy-400">
                      {missing} employee{missing === 1 ? '' : 's'} without a rate — not included.
                    </p>
                  )}
                </div>
              );
            })()}

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Hours by employee</CardTitle>
                <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={exportEmployees}>
                  CSV
                </Button>
              </CardHeader>
              <CardBody className="p-0">
                {data.byEmployee.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-ink-muted">No completed hours in range.</p>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-y border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-ink-subtle">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Employee</th>
                            <th className="px-4 py-2.5 text-right font-medium">Regular</th>
                            <th className="px-4 py-2.5 text-right font-medium">OT</th>
                            <th className="px-4 py-2.5 text-right font-medium">Total</th>
                            <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-navy-50">
                          {data.byEmployee.map((r) => (
                            <tr key={r.id}>
                              <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                                {formatDuration(r.regularMinutes)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">
                                {r.overtimeMinutes > 0 ? formatDuration(r.overtimeMinutes) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink">
                                {formatDuration(r.totalMinutes)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-volt-600">
                                {costFor(r) != null ? formatMoney(costFor(r)!) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2">
                      {data.byEmployee.map((r) => (
                        <div key={r.id} className="flex items-center justify-between border-b border-navy-50 px-4 py-3">
                          <div>
                            <p className="font-semibold text-ink">{r.name}</p>
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {formatDuration(r.regularMinutes)} · {r.overtimeMinutes > 0 ? formatDuration(r.overtimeMinutes) + ' OT' : 'no OT'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="tabular-nums font-bold text-ink">{formatDuration(r.totalMinutes)}</p>
                            {costFor(r) != null && (
                              <p className="text-xs font-semibold tabular-nums text-volt-600">
                                {formatMoney(costFor(r)!)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Hours by job site</CardTitle>
                <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={exportSites}>
                  CSV
                </Button>
              </CardHeader>
              <CardBody className="p-0">
                {data.byJobSite.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-ink-muted">No site hours in range.</p>
                ) : (
                  <ul className="divide-y divide-navy-50">
                    {data.byJobSite.map((r) => {
                      const estMin = r.estimatedHours != null ? r.estimatedHours * 60 : null;
                      const pct = estMin && estMin > 0 ? Math.min(100, (r.actualMinutes / estMin) * 100) : null;
                      return (
                        <li key={r.id} className="px-4 py-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-ink">{r.name}</span>
                            <span className="tabular-nums text-ink-muted">
                              {formatDuration(r.actualMinutes)}
                              {r.estimatedHours != null && (
                                <span className="text-ink-subtle"> / ~{r.estimatedHours}h</span>
                              )}
                            </span>
                          </div>
                          {pct != null && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
                              <div
                                className={pct >= 100 ? 'h-full bg-red-500' : 'h-full bg-volt-500'}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </QueryBoundary>
      <PdfExportModal open={showPdf} onClose={() => setShowPdf(false)} />
    </div>
  );
}
