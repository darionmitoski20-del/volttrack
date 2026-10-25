import { useState } from 'react';
import { CalendarCheck, Send, MapPin } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { formatWeekLabel, formatDuration, currentWeekStart, weekRange } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import {
  useMyTimesheets,
  useRefreshTimesheet,
  useSubmitTimesheet,
  useWeekEntries,
} from '@/hooks/useTimesheets';
import type { TimesheetWithProfile } from '@/hooks/types';
import { PageHeader, TimesheetStatusBadge } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';

const SUBMITTABLE = new Set(['draft', 'rejected']);

export function MyTimesheetsPage() {
  const { timezone, userId } = useCompanyContext();
  const timesheets = useMyTimesheets();
  const [submitWeek, setSubmitWeek] = useState<string | null>(null);

  const thisWeek = currentWeekStart(timezone);
  const hasThisWeek = (timesheets.data ?? []).some((t) => t.week_start === thisWeek);

  return (
    <div>
      <PageHeader
        title="My timesheets"
        subtitle="Submit your weekly hours for approval."
        actions={
          <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={() => setSubmitWeek(thisWeek)}>
            Submit this week
          </Button>
        }
      />

      <QueryBoundary
        query={timesheets}
        isEmpty={(d) => d.length === 0 && !hasThisWeek}
        empty={
          <Card>
            <EmptyState
              icon={CalendarCheck}
              title="No timesheets yet"
              description="Once you've logged some hours, submit them here for your manager to approve."
              action={
                <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={() => setSubmitWeek(thisWeek)}>
                  Submit this week
                </Button>
              }
            />
          </Card>
        }
      >
        {(rows) => (
          <div className="space-y-2.5">
            {rows.map((t) => (
              <Card key={t.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{formatWeekLabel(t.week_start)}</p>
                      <p className="text-xs text-ink-muted">
                        {formatDuration(t.regular_minutes + t.overtime_minutes)} total
                        {t.overtime_minutes > 0 && ` · ${formatDuration(t.overtime_minutes)} OT`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TimesheetStatusBadge status={t.status} />
                      {SUBMITTABLE.has(t.status) && (
                        <Button variant="secondary" size="sm" onClick={() => setSubmitWeek(t.week_start)}>
                          {t.status === 'rejected' ? 'Resubmit' : 'Submit'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {t.status === 'rejected' && t.owner_comment && (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                      <span className="font-medium">Manager: </span>
                      {t.owner_comment}
                    </p>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      <SubmitTimesheetModal
        weekStart={submitWeek}
        employeeId={userId}
        existing={(timesheets.data ?? []).find((t) => t.week_start === submitWeek) ?? null}
        onClose={() => setSubmitWeek(null)}
      />
    </div>
  );
}

function SubmitTimesheetModal({
  weekStart,
  employeeId,
  existing,
  onClose,
}: {
  weekStart: string | null;
  employeeId: string;
  existing: TimesheetWithProfile | null;
  onClose: () => void;
}) {
  const refresh = useRefreshTimesheet();
  const submit = useSubmitTimesheet();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ regular: number; overtime: number } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const weekEnd = weekStart ? weekRange(weekStart).weekEnd : '';
  const entries = useWeekEntries(employeeId, weekStart ?? '', weekEnd);

  // Recompute totals when the modal opens so the employee sees what they submit.
  const opened = weekStart !== null;
  if (opened && preview === null && !refresh.isPending) {
    refresh
      .mutateAsync({ employeeId, weekStart })
      .then((ts) => setPreview({ regular: ts.regular_minutes, overtime: ts.overtime_minutes }))
      .catch((e) => setError(errorMessage(e)));
  }

  const close = () => {
    setComment('');
    setError(null);
    setPreview(null);
    onClose();
  };

  const doSubmit = async () => {
    if (!weekStart) return;
    setError(null);
    try {
      const ts = await refresh.mutateAsync({ employeeId, weekStart });
      await submit.mutateAsync({ id: ts.id, comment: comment.trim() || null });
      close();
    } catch (e) {
      setError(errorMessage(e, 'Could not submit your timesheet.'));
    }
  };

  return (
    <Modal open={opened} onClose={close} title={weekStart ? `Submit — ${formatWeekLabel(weekStart)}` : 'Submit'}>
      <div className="space-y-4">
        <div className="flex gap-4 rounded-xl bg-navy-50 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-subtle">Regular</p>
            <p className="text-lg font-semibold text-ink">
              {preview ? formatDuration(preview.regular) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-subtle">Overtime</p>
            <p className="text-lg font-semibold text-orange-600">
              {preview ? formatDuration(preview.overtime) : '—'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full text-left text-sm font-medium text-volt-600 hover:text-volt-700"
        >
          {showDetails ? '▼' : '▶'} View work details
        </button>

        {showDetails && (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-navy-100 bg-navy-50 p-3">
            {entries.data && entries.data.length > 0 ? (
              entries.data.map((e) => (
                <div key={e.id} className="rounded-lg bg-white p-2.5 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{e.job_site?.name ?? 'No job site'}</p>
                      <p className="text-xs text-ink-muted">
                        {new Date(e.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {e.clock_out ? new Date(e.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-ink-muted">No work entries this week</p>
            )}
          </div>
        )}

        {existing?.status === 'rejected' && (
          <p className="text-sm text-ink-muted">
            This week was returned for changes. Fixing your entries and resubmitting will send it back for review.
          </p>
        )}

        <div>
          <label htmlFor="ts-comment" className="mb-1.5 block text-sm font-medium text-ink">
            Note to your manager (optional)
          </label>
          <Textarea
            id="ts-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything they should know about this week?"
          />
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Send className="h-4 w-4" />}
            loading={refresh.isPending || submit.isPending}
            onClick={doSubmit}
          >
            Submit for approval
          </Button>
        </div>
      </div>
    </Modal>
  );
}
