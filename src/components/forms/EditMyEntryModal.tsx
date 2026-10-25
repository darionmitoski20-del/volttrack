import { useEffect, useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { localInputToUtcIso, toLocalInputValue, minutesBetween, formatDuration } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useMyAssignedSites } from '@/hooks/useAssignments';
import { useUpdateMyEntry, useDeleteMyEntry } from '@/hooks/useMyEntryActions';
import type { TimeEntryDetail } from '@/hooks/types';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export function EditMyEntryModal({
  entry,
  onClose,
}: {
  entry: TimeEntryDetail | null;
  onClose: () => void;
}) {
  const { timezone } = useCompanyContext();
  const sites = useMyAssignedSites();
  const update = useUpdateMyEntry();
  const remove = useDeleteMyEntry();

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [jobSiteId, setJobSiteId] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (entry) {
      const inLocal = toLocalInputValue(entry.clock_in, timezone); // YYYY-MM-DDTHH:mm
      setDate(inLocal.slice(0, 10));
      setStartTime(inLocal.slice(11, 16));
      setEndTime(entry.clock_out ? toLocalInputValue(entry.clock_out, timezone).slice(11, 16) : '');
      setJobSiteId(entry.job_site?.id ?? '');
      setNote(entry.employee_note ?? '');
      setFormError(null);
    }
  }, [entry, timezone]);

  const mins =
    startTime && endTime && startTime < endTime
      ? minutesBetween(`2000-01-01T${startTime}`, `2000-01-01T${endTime}`)
      : 0;

  const save = async () => {
    if (!entry) return;
    setFormError(null);
    if (!date || !startTime || !endTime) {
      setFormError('Fill in the date and both times.');
      return;
    }
    if (startTime >= endTime) {
      setFormError('End time must be after start time.');
      return;
    }
    if (!jobSiteId) {
      setFormError('Select a job site.');
      return;
    }
    try {
      await update.mutateAsync({
        id: entry.id,
        jobSiteId,
        clockIn: localInputToUtcIso(`${date}T${startTime}`, timezone),
        clockOut: localInputToUtcIso(`${date}T${endTime}`, timezone),
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save changes.'));
    }
  };

  const doDelete = async () => {
    if (!entry) return;
    try {
      await remove.mutateAsync(entry.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(errorMessage(err, 'Could not delete the entry.'));
    }
  };

  return (
    <>
      <Modal open={!!entry} onClose={onClose} title="Edit entry">
        <div className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          {mins > 0 && (
            <p className="text-center text-xs font-semibold text-ink-muted">
              <span className="text-navy-900">{formatDuration(mins)}</span>
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Date</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-navy-200 bg-white px-4 py-3 text-sm font-semibold text-ink focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Start</p>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-navy-200 bg-white px-2 py-2.5 text-center text-sm font-semibold text-ink focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
              />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">End</p>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-navy-200 bg-white px-2 py-2.5 text-center text-sm font-semibold text-ink focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Job Site</p>
            <div className="relative">
              <select
                value={jobSiteId}
                onChange={(e) => setJobSiteId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-navy-200 bg-white px-3 py-2.5 pr-8 text-sm text-ink focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
              >
                <option value="">Select a job site…</option>
                {(sites.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Notes</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="w-full resize-none rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete entry"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={update.isPending} className="flex-1">
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete entry?"
        message="This shift will be removed from your hours. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
