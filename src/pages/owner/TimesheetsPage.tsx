import { useMemo, useState } from 'react';
import { CalendarCheck, CheckCheck, Check, X, Send } from 'lucide-react';
import { formatWeekLabel, formatDuration } from '@/lib/datetime';
import type { TimesheetStatus } from '@/lib/database.types';
import { useTimesheets, useReviewTimesheet, useRequestTimesheetSubmission } from '@/hooks/useTimesheets';
import type { TimesheetWithProfile } from '@/hooks/types';
import { PageHeader, Avatar, TimesheetStatusBadge } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { ReviewTimesheetModal } from '@/components/forms/ReviewTimesheetModal';

const TABS: { key: 'submitted' | 'all' | 'approved' | 'rejected'; label: string }[] = [
  { key: 'submitted', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export function TimesheetsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('submitted');
  const statuses: TimesheetStatus[] | undefined =
    tab === 'all' ? undefined : tab === 'submitted' ? ['submitted'] : [tab];
  const timesheets = useTimesheets(statuses);
  const review = useReviewTimesheet();
  const request = useRequestTimesheetSubmission();
  const [reviewing, setReviewing] = useState<TimesheetWithProfile | null>(null);

  const submitted = useMemo(
    () => (timesheets.data ?? []).filter((t) => t.status === 'submitted'),
    [timesheets.data],
  );

  const approveAll = async () => {
    for (const t of submitted) {
      await review.mutateAsync({ id: t.id, approve: true });
    }
  };

  return (
    <div>
      <PageHeader
        title="Timesheets"
        subtitle="Review weekly hours and approve payroll."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={<Send className="h-4 w-4" />}
              loading={request.isPending}
              onClick={() => request.mutate(undefined)}
            >
              Request submissions
            </Button>
            {tab === 'submitted' && submitted.length > 0 ? (
              <Button
                variant="success"
                icon={<CheckCheck className="h-4 w-4" />}
                loading={review.isPending}
                onClick={approveAll}
              >
                Approve all ({submitted.length})
              </Button>
            ) : undefined}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
              (tab === t.key ? 'bg-navy-900 text-white' : 'bg-white text-ink-muted hover:bg-navy-100')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <QueryBoundary
        query={timesheets}
        isEmpty={(d) => d.length === 0}
        empty={
          <Card>
            <EmptyState
              icon={CalendarCheck}
              title="Nothing here"
              description="Submitted timesheets will appear for your review."
            />
          </Card>
        }
      >
        {(rows) => (
          <div className="space-y-2.5">
            {rows.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={t.profile?.full_name ?? '—'} id={t.profile?.id} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setReviewing(t)}>
                    <p className="truncate text-sm font-medium text-ink">{t.profile?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-ink-muted">
                      {formatWeekLabel(t.week_start)} · {formatDuration(t.regular_minutes + t.overtime_minutes)}
                      {t.overtime_minutes > 0 && (
                        <span className="text-orange-600"> · {formatDuration(t.overtime_minutes)} OT</span>
                      )}
                    </p>
                  </button>
                  {t.status === 'submitted' ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        aria-label="Reject"
                        onClick={() => setReviewing(t)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                      <button
                        aria-label="Approve"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: t.id, approve: true })}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                      >
                        <Check className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <TimesheetStatusBadge status={t.status} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      <ReviewTimesheetModal timesheet={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}
