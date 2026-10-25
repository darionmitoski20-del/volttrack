import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/supabase';
import { toLocalInputValue, localInputToUtcIso } from '@/lib/datetime';
import { useEditTimeEntry } from '@/hooks/useTimeEntries';
import { useJobSiteOptions } from '@/hooks/useJobSites';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import type { TimeEntryDetail } from '@/hooks/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Textarea, Select } from '@/components/ui/form';

export function EditTimeEntryModal({
  entry,
  onClose,
}: {
  entry: TimeEntryDetail | null;
  onClose: () => void;
}) {
  const { timezone } = useCompanyContext();
  const edit = useEditTimeEntry();
  const sites = useJobSiteOptions();

  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [jobSiteId, setJobSiteId] = useState('');
  const [ownerNote, setOwnerNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setFormError(null);
      setClockIn(toLocalInputValue(entry.clock_in, timezone));
      setClockOut(entry.clock_out ? toLocalInputValue(entry.clock_out, timezone) : '');
      setJobSiteId(entry.job_site_id);
      setOwnerNote(entry.owner_note ?? '');
    }
  }, [entry, timezone]);

  const submit = async () => {
    if (!entry) return;
    setFormError(null);
    try {
      await edit.mutateAsync({
        id: entry.id,
        clock_in: localInputToUtcIso(clockIn, timezone),
        clock_out: clockOut ? localInputToUtcIso(clockOut, timezone) : null,
        job_site_id: jobSiteId || null,
        owner_note: ownerNote.trim() || null,
      });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the time entry.'));
    }
  };

  return (
    <Modal open={!!entry} onClose={onClose} title="Edit time entry">
      <div className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        {entry?.profile && (
          <p className="text-sm text-ink-muted">
            Editing {entry.profile.full_name}&apos;s shift. Times are shown in the company timezone.
          </p>
        )}
        <FormField label="Job site" htmlFor="edit-site">
          <Select id="edit-site" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
            {sites.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Clock in" htmlFor="edit-in" required>
            <Input
              id="edit-in"
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
            />
          </FormField>
          <FormField label="Clock out" htmlFor="edit-out" hint="Leave empty to keep it open.">
            <Input
              id="edit-out"
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Owner note" htmlFor="edit-note">
          <Textarea
            id="edit-note"
            value={ownerNote}
            onChange={(e) => setOwnerNote(e.target.value)}
            placeholder="Reason for the correction (recorded in the audit log)"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={edit.isPending} disabled={!clockIn}>
            Save entry
          </Button>
        </div>
      </div>
    </Modal>
  );
}
