import { useState } from 'react';
import { errorMessage } from '@/lib/supabase';
import { localInputToUtcIso, nowLocalInputValue } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useMyAssignedSites } from '@/hooks/useAssignments';
import { useAddManualTimeEntry } from '@/hooks/useTimeEntries';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/form';

export function AddManualTimeEntryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { timezone } = useCompanyContext();
  const sites = useMyAssignedSites();
  const addEntry = useAddManualTimeEntry();

  const [jobSiteId, setJobSiteId] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setJobSiteId('');
    setClockIn('');
    setClockOut('');
    setNote('');
    setFormError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setFormError(null);
    if (!jobSiteId) {
      setFormError('Please select a job site.');
      return;
    }
    if (!clockIn || !clockOut) {
      setFormError('Both clock-in and clock-out times are required.');
      return;
    }
    try {
      await addEntry.mutateAsync({
        job_site_id: jobSiteId,
        clock_in: localInputToUtcIso(clockIn, timezone),
        clock_out: localInputToUtcIso(clockOut, timezone),
        note: note.trim() || null,
      });
      handleClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not add the time entry.'));
    }
  };

  const maxDateTime = nowLocalInputValue(timezone);

  return (
    <Modal open={open} onClose={handleClose} title="Add hours manually">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Forgot to clock in? Add your worked hours here. Your manager will be
          notified.
        </p>
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <FormField label="Job site" htmlFor="manual-site" required>
          <Select id="manual-site" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
            <option value="">Select a job site…</option>
            {(sites.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Clock in" htmlFor="manual-in" required>
            <Input
              id="manual-in"
              type="datetime-local"
              max={maxDateTime}
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
            />
          </FormField>
          <FormField label="Clock out" htmlFor="manual-out" required>
            <Input
              id="manual-out"
              type="datetime-local"
              max={maxDateTime}
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Note" htmlFor="manual-note" hint="Optional — explain why you're adding this manually.">
          <Textarea
            id="manual-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Forgot to clock in this morning"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={addEntry.isPending}
            disabled={!jobSiteId || !clockIn || !clockOut}
          >
            Add hours
          </Button>
        </div>
      </div>
    </Modal>
  );
}
