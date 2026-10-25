import { Link } from 'react-router-dom';
import { Clock, Zap } from 'lucide-react';
import { formatDuration, formatTime } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useLiveEmployeeHours, useLiveHoursRealtime } from '@/hooks/useLiveHours';
import { PageHeader } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, SkeletonRows } from '@/components/ui/states';

const MAX_WEEK_MINUTES = 40 * 60;

export function LiveHoursPage() {
  const { timezone } = useCompanyContext();
  const live = useLiveEmployeeHours();
  useLiveHoursRealtime();

  return (
    <div>
      <PageHeader
        title="Live hours"
        subtitle="Real-time view of employee hours this week. Refreshes every minute."
      />

      {live.isLoading ? (
        <Card><CardBody><SkeletonRows rows={4} /></CardBody></Card>
      ) : (live.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={Clock} title="No employees" description="No active employees found." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(live.data ?? []).map((emp) => {
            const pct = Math.min(100, Math.round((emp.weekMinutes / MAX_WEEK_MINUTES) * 100));
            return (
              <Link key={emp.userId} to={`/app/employees/${emp.userId}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-card-hover">
                <CardBody>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-200 text-sm font-bold text-navy-700">
                      {emp.fullName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{emp.fullName}</p>
                      {emp.activeShift ? (
                        <div className="flex items-center gap-1 text-xs text-volt-700">
                          <Zap className="h-3 w-3" fill="currentColor" />
                          <span className="truncate">
                            {emp.activeShift.jobSiteName} · since {formatTime(emp.activeShift.clockIn, timezone)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-subtle">Not clocked in</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-muted">This week</span>
                      <span className="font-semibold tabular-nums text-ink">
                        {formatDuration(emp.weekMinutes)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-navy-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-volt-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-ink-subtle">{pct}% of 40h</p>
                  </div>
                </CardBody>
              </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
