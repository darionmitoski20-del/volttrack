import { useState } from 'react';
import { Plus } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { localInputToUtcIso, nowLocalInputValue } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useMyAssignedSites } from '@/hooks/useAssignments';
import { useAddHours, useEmployeeOptions, parseOverlapError } from '@/hooks/useAddHours';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/Modal';

export function AddHoursForm() {
  const { timezone } = useCompanyContext();
  const sites = useMyAssignedSites();
  const coworkers = useEmployeeOptions();
  const addHours = useAddHours();

  const [jobSiteId, setJobSiteId] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [note, setNote] = useState('');
  const [selectedCoworkers, setSelectedCoworkers] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [overlapConfirm, setOverlapConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reset = () => {
    setJobSiteId('');
    setClockIn('');
    setClockOut('');
    setNote('');
    setSelectedCoworkers([]);
    setFormError(null);
    setExpanded(false);
  };

  const doSubmit = async (force: boolean) => {
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
      await addHours.mutateAsync({
        job_site_id: jobSiteId,
        clock_in: localInputToUtcIso(clockIn, timezone),
        clock_out: localInputToUtcIso(clockOut, timezone),
        note: note.trim() || null,
        coworker_ids: selectedCoworkers,
        force,
      });
      reset();
    } catch (err) {
      const msg = errorMessage(err, '');
      const overlap = parseOverlapError(msg);
      if (overlap && !force) {
        setOverlapConfirm(true);
      } else {
        setFormError(msg || 'Could not add the time entry.');
      }
    }
  };

  const toggleCoworker = (id: string) => {
    setSelectedCoworkers((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const maxDateTime = nowLocalInputValue(timezone);

  if (!expanded) {
    return (
      <Card className="border-volt-200 bg-volt-50/30">
        <CardBody>
          <button
            onClick={() => setExpanded(true)}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-volt-500">
              <Plus className="h-5 w-5 text-navy-900" />
            </span>
            <div>
              <p className="font-semibold text-ink">Add work hours</p>
              <p className="text-sm text-ink-muted">Forgot to clock in? Enter your hours manually.</p>
            </div>
          </button>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-volt-200">
        <CardHeader>
          <CardTitle>Add work hours</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <FormField label="Job site" htmlFor="hours-site" required>
            <Select id="hours-site" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
              <option value="">Select a job site…</option>
              {(sites.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Clock in" htmlFor="hours-in" required>
              <Input
                id="hours-in"
                type="datetime-local"
                max={maxDateTime}
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </FormField>
            <FormField label="Clock out" htmlFor="hours-out" required>
              <Input
                id="hours-out"
                type="datetime-local"
                max={maxDateTime}
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </FormField>
          </div>

          {(coworkers.data ?? []).length > 0 && (
            <FormField label="Coworkers" htmlFor="hours-coworkers" hint="Optional — also log hours for these people">
              <div className="flex flex-wrap gap-2">
                {(coworkers.data ?? []).map((m) => {
                  const selected = selectedCoworkers.includes(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => toggleCoworker(m.user_id)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                        selected
                          ? 'bg-volt-500 text-navy-900'
                          : 'bg-navy-50 text-ink-muted hover:bg-navy-100'
                      }`}
                    >
                      {m.profile.full_name}
                    </button>
                  );
                })}
              </div>
            </FormField>
          )}

          <FormField label="Note" htmlFor="hours-note" hint="Optional">
            <Textarea
              id="hours-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Forgot to clock in this morning"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => doSubmit(false)}
              loading={addHours.isPending}
              disabled={!jobSiteId || !clockIn || !clockOut}
            >
              Add hours
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={overlapConfirm}
        title="Overlapping entry detected"
        message="You already have a time entry that overlaps with this period. Add it anyway?"
        confirmLabel="Add anyway"
        tone="danger"
        onConfirm={() => {
          setOverlapConfirm(false);
          void doSubmit(true);
        }}
        onCancel={() => setOverlapConfirm(false)}
      />
    </>
  );
}
