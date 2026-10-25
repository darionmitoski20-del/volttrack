import { useState } from 'react';
import { errorMessage } from '@/lib/supabase';
import { formatDate, formatDuration, formatWeekLabel, minutesBetween } from '@/lib/datetime';
import { useReviewTimesheet, useWeekEntries } from '@/hooks/useTimesheets';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import type { TimesheetWithProfile } from '@/hooks/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/form';
import { SkeletonRows } from '@/components/ui/states';

export function ReviewTimesheetModal({
  timesheet,
  onClose,
}: {
  timesheet: TimesheetWithProfile | null;
  onClose: () => void;
}) {
  const { timezone } = useCompanyContext();
  const review = useReviewTimesheet();
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const entries = useWeekEntries(
    timesheet?.employee_id ?? '',
    timesheet?.week_start ?? '',
    timesheet?.week_end ?? '',
  );

  const act = async (approve: boolean) => {
    if (!timesheet) return;
    if (!approve && !comment.trim()) {
      setFormError('Add a note so the employee knows what to fix.');
      return;
    }
    setFormError(null);
    try {
      await review.mutateAsync({ id: timesheet.id, approve, comment: comment.trim() || null });
      setComment('');
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not record your decision.'));
    }
  };

  const total = (timesheet?.regular_minutes ?? 0) + (timesheet?.overtime_minutes ?? 0);

  return (
    <Modal
      open={!!timesheet}
      onClose={onClose}
      title={timesheet ? `Review — ${formatWeekLabel(timesheet.week_start)}` : 'Review'}
    >
      {timesheet && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-4 rounded-xl bg-navy-50 p-4">
            <Total label="Regular" value={formatDuration(timesheet.regular_minutes)} />
            <Total label="Overtime" value={formatDuration(timesheet.overtime_minutes)} />
            <Total label="Total" value={formatDuration(total)} emphasis />
          </div>

          {timesheet.employee_comment && (
            <p className="rounded-xl border border-navy-100 px-3 py-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">Employee note: </span>
              {timesheet.employee_comment}
            </p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Entries this week</h3>
            {entries.isLoading ? (
              <SkeletonRows rows={3} />
            ) : entries.data && entries.data.length > 0 ? (
              <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100">
                {entries.data.map((e) => {
                  const worked = e.clock_out ? minutesBetween(e.clock_in, e.clock_out) : 0;
                  return (
                    <li key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-ink">{e.job_site?.name ?? 'Unknown site'}</p>
                        <p className="text-xs text-ink-subtle">{formatDate(e.clock_in, timezone)}</p>
                      </div>
                      <span className="text-ink-muted">
                        {e.clock_out ? formatDuration(worked) : 'Open'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-subtle">No entries recorded this week.</p>
            )}
          </div>

          <div>
            <label htmlFor="review-comment" className="mb-1.5 block text-sm font-medium text-ink">
              Note {timesheet.status === 'submitted' ? '(required to reject)' : ''}
            </label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional for approval, required when rejecting"
            />
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {timesheet.status === 'submitted' ? (
              <>
                <Button variant="danger" onClick={() => act(false)} loading={review.isPending}>
                  Reject
                </Button>
                <Button variant="success" onClick={() => act(true)} loading={review.isPending}>
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Total({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={emphasis ? 'text-lg font-semibold text-ink' : 'text-base font-medium text-ink'}>
        {value}
      </p>
    </div>
  );
}
