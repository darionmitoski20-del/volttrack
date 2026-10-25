import { Link } from 'react-router-dom';
import { Clock, Plus } from 'lucide-react';
import { formatDuration, formatDate, formatTime, minutesBetween, currentWeekStart } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { useMyHoursSummary } from '@/hooks/useMyHoursSummary';
import { useMyTimesheets } from '@/hooks/useTimesheets';
import type { TimeEntryDetail } from '@/hooks/types';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, SkeletonRows } from '@/components/ui/states';
import { useState } from 'react';
import { AddHoursModal } from '@/components/forms/AddHoursModal';
import { EditMyEntryModal } from '@/components/forms/EditMyEntryModal';

function StatBox({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${money ? 'text-volt-600' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  );
}

export function EmployeeDashboardPage() {
  const [showAddHours, setShowAddHours] = useState(false);
  const [editing, setEditing] = useState<TimeEntryDetail | null>(null);
  const { profile } = useAuth();
  const { timezone, userId } = useCompanyContext();
  const summary = useMyHoursSummary();
  const recent = useTimeEntries({ employeeId: userId });
  const timesheets = useMyTimesheets();

  const recentEntries = (recent.data ?? []).slice(0, 3);
  const fmt = (m: number | undefined) => (m != null ? formatDuration(m) : '—');
  const s = summary.data;
  const hasRate = s?.hourlyRate != null;

  // A timesheet row only exists once the employee has opened the submit
  // flow at least once, so "pending" can't just count existing rows — a
  // fully-worked, never-submitted current week must show up here too.
  const thisWeekStart = currentWeekStart(timezone);
  const thisWeekTimesheet = (timesheets.data ?? []).find((t) => t.week_start === thisWeekStart);
  const thisWeekSubmitted =
    thisWeekTimesheet?.status === 'submitted' || thisWeekTimesheet?.status === 'approved';
  const unsubmittedThisWeekMinutes = thisWeekSubmitted ? 0 : (s?.weekMinutes ?? 0);
  const otherPendingWeeks = (timesheets.data ?? []).filter(
    (t) => t.week_start !== thisWeekStart && (t.status === 'draft' || t.status === 'rejected'),
  ).length;
  const toSubmitValue =
    unsubmittedThisWeekMinutes > 0
      ? formatDuration(unsubmittedThisWeekMinutes)
      : otherPendingWeeks > 0
        ? `${otherPendingWeeks} week${otherPendingWeeks === 1 ? '' : 's'}`
        : '0m';

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-ink">
          Hi {(profile?.full_name ?? '').split(' ')[0] || 'there'} 👋
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">{formatDate(new Date(), timezone)}</p>
      </div>

      {/* Today hero card */}
      <div className="rounded-2xl bg-navy-900 p-5 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-300">Today</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-white">
              {fmt(s?.todayMinutes)}
            </p>
            {hasRate && (
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-volt-400">
                {formatMoney(s?.todayEarnings ?? 0)}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddHours(true)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-volt-500 px-4 py-3 text-sm font-bold text-navy-900 shadow-sm transition-colors hover:bg-volt-400 active:bg-volt-600"
          >
            <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
            Add hours
          </button>
        </div>
      </div>

      {/* Hours grid */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Hours</p>
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="This Week" value={fmt(s?.weekMinutes)} />
          <StatBox label="This Month" value={fmt(s?.monthMinutes)} />
        </div>
      </div>

      {/* Timesheets */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Timesheets</p>
        <Link to="/me/timesheets" className="block">
          <StatBox label="To submit" value={toSubmitValue} />
        </Link>
      </div>

      {/* Earnings grid — only when the owner has set an hourly rate */}
      {hasRate && (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Earnings</p>
          <div className="grid grid-cols-2 gap-3">
            <StatBox money label="This Week" value={formatMoney(s?.weekEarnings ?? 0)} />
            <StatBox money label="This Month" value={formatMoney(s?.monthEarnings ?? 0)} />
            <StatBox label="Total Hours" value={fmt(s?.totalMinutes)} />
            <StatBox money label="Total" value={formatMoney(s?.totalEarnings ?? 0)} />
          </div>
        </div>
      )}
      {!hasRate && (
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Total" value={fmt(s?.totalMinutes)} />
        </div>
      )}

      {/* Recent shifts — last 3, tap to edit */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent Logs</CardTitle>
          <Link to="/me/time-entries" className="text-sm font-medium text-navy-700 hover:text-ink">
            View all
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {recent.isLoading ? (
            <div className="p-4"><SkeletonRows rows={3} /></div>
          ) : recentEntries.length > 0 ? (
            <ul className="divide-y divide-navy-50">
              {recentEntries.map((e) => {
                const worked = e.clock_out ? minutesBetween(e.clock_in, e.clock_out) : null;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => e.clock_out && setEditing(e)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors active:bg-navy-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {e.job_site?.name ?? 'Job site'}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(e.clock_in, timezone)} · {formatTime(e.clock_in, timezone)}
                          {e.clock_out ? ` – ${formatTime(e.clock_out, timezone)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {worked == null ? (
                          <span className="text-volt-600">Active</span>
                        ) : (
                          formatDuration(worked)
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Clock}
              title="No shifts yet"
              description="Tap Add hours to record your first shift."
            />
          )}
        </CardBody>
      </Card>

      <AddHoursModal open={showAddHours} onClose={() => setShowAddHours(false)} />
      <EditMyEntryModal entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
