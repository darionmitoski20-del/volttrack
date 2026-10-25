import { useMemo, useState } from 'react';
import { Pencil, Clock } from 'lucide-react';
import {
  formatDate,
  formatTime,
  formatDuration,
  minutesBetween,
  localDateKey,
  addDaysToKey,
  weekRange,
} from '@/lib/datetime';
import type { TimeEntryStatus } from '@/lib/database.types';
import { useTimeEntries, type TimeEntryFilters } from '@/hooks/useTimeEntries';
import { useEmployees } from '@/hooks/useEmployees';
import { useJobSiteOptions } from '@/hooks/useJobSites';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import type { TimeEntryDetail } from '@/hooks/types';
import { PageHeader, Avatar, TimeEntryStatusBadge } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { EditTimeEntryModal } from '@/components/forms/EditTimeEntryModal';

function workedMinutes(e: TimeEntryDetail): number | null {
  if (!e.clock_out) return null;
  let m = minutesBetween(e.clock_in, e.clock_out);
  for (const b of e.breaks) if (b.ended_at) m -= minutesBetween(b.started_at, b.ended_at);
  return Math.max(0, m);
}

type QuickRange = 'all' | 'today' | 'yesterday' | 'this-week' | 'last-week' | 'custom';

const QUICK_CHIPS: { key: QuickRange; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
];

export function TimeEntriesPage() {
  const { timezone } = useCompanyContext();
  const employees = useEmployees();
  const sites = useJobSiteOptions();
  const [employeeId, setEmployeeId] = useState('');
  const [jobSiteId, setJobSiteId] = useState('');
  const [status, setStatus] = useState<'' | TimeEntryStatus>('');
  const [startKey, setStartKey] = useState('');
  const [endKey, setEndKey] = useState('');
  const [quick, setQuick] = useState<QuickRange>('all');
  const [editing, setEditing] = useState<TimeEntryDetail | null>(null);

  const selectQuick = (q: QuickRange) => {
    setQuick(q);
    const today = localDateKey(new Date(), timezone);
    if (q === 'all') {
      setStartKey('');
      setEndKey('');
    } else if (q === 'today') {
      setStartKey(today);
      setEndKey(today);
    } else if (q === 'yesterday') {
      const y = addDaysToKey(today, -1);
      setStartKey(y);
      setEndKey(y);
    } else if (q === 'this-week') {
      const { weekStart, weekEnd } = weekRange(today);
      setStartKey(weekStart);
      setEndKey(weekEnd);
    } else {
      const { weekStart } = weekRange(today);
      setStartKey(addDaysToKey(weekStart, -7));
      setEndKey(addDaysToKey(weekStart, -1));
    }
  };

  const filters: TimeEntryFilters = useMemo(
    () => ({
      employeeId: employeeId || undefined,
      jobSiteId: jobSiteId || undefined,
      status: status || undefined,
      startKey: startKey && endKey ? startKey : undefined,
      endKey: startKey && endKey ? endKey : undefined,
    }),
    [employeeId, jobSiteId, status, startKey, endKey],
  );
  const entries = useTimeEntries(filters);

  return (
    <div>
      <PageHeader title="Time Entries" subtitle="Review, filter and correct recorded shifts." />

      {/* Quick range chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => selectQuick(c.key)}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ' +
              (quick === c.key ? 'bg-navy-900 text-white' : 'bg-white text-ink-muted hover:bg-navy-100')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as TimeEntryStatus | '')}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="incomplete">Incomplete</option>
          <option value="edited">Edited</option>
        </Select>
        <Input
          aria-label="From date"
          type="date"
          value={startKey}
          onChange={(e) => { setStartKey(e.target.value); setQuick('custom'); }}
        />
        <Input
          aria-label="To date"
          type="date"
          value={endKey}
          onChange={(e) => { setEndKey(e.target.value); setQuick('custom'); }}
        />
      </div>

      <QueryBoundary
        query={entries}
        isEmpty={(d) => d.length === 0}
        empty={
          <Card>
            <EmptyState icon={Clock} title="No time entries" description="Try widening your filters or date range." />
          </Card>
        }
      >
        {(rows) => (
          <Card className="overflow-hidden p-0">
            {/* Desktop table */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-4 py-2.5 font-medium">Job site</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">In / Out</th>
                  <th className="px-4 py-2.5 font-medium">Worked</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {rows.map((e) => {
                  const worked = workedMinutes(e);
                  return (
                    <tr key={e.id} className="hover:bg-navy-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={e.profile?.full_name ?? '—'} id={e.profile?.id} size="sm" />
                          <span className="font-medium text-ink">{e.profile?.full_name ?? 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{e.job_site?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-muted">{formatDate(e.clock_in, timezone)}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">
                        {formatTime(e.clock_in, timezone)} – {e.clock_out ? formatTime(e.clock_out, timezone) : '⋯'}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium text-ink">
                        {worked == null ? 'In progress' : formatDuration(worked)}
                      </td>
                      <td className="px-4 py-3">
                        <TimeEntryStatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(e)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-navy-50 md:hidden">
              {rows.map((e) => {
                const worked = workedMinutes(e);
                return (
                  <li key={e.id}>
                    {/* Whole card taps into the edit modal */}
                    <button
                      onClick={() => setEditing(e)}
                      className="w-full p-4 text-left transition-colors active:bg-navy-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={e.profile?.full_name ?? '—'} id={e.profile?.id} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-ink">{e.profile?.full_name ?? 'Unknown'}</p>
                            <p className="text-xs text-ink-muted">{e.job_site?.name ?? '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <TimeEntryStatusBadge status={e.status} />
                          <Pencil className="h-3.5 w-3.5 text-ink-subtle" />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                        <span>
                          {formatDate(e.clock_in, timezone)} · {formatTime(e.clock_in, timezone)} –{' '}
                          {e.clock_out ? formatTime(e.clock_out, timezone) : '⋯'}
                        </span>
                        <span className="font-medium text-ink">
                          {worked == null ? 'In progress' : formatDuration(worked)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </QueryBoundary>

      <EditTimeEntryModal entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
