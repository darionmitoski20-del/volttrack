import { useState } from 'react';
import { Plus, Trash2, ChevronDown, Users, StickyNote, CalendarDays } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { localInputToUtcIso, minutesBetween, formatDuration } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useMyAssignedSites } from '@/hooks/useAssignments';
import { useAddHours, useEmployeeOptions, parseOverlapError } from '@/hooks/useAddHours';
import { useEmployeeCreateJobSite } from '@/hooks/useEmployeeJobSite';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface LocationEntry {
  id: number;
  jobSiteId: string;
  startTime: string;
  endTime: string;
  breakMins: number;
  showNewSite: boolean;
  newSiteName: string;
}

let nextId = 1;
function makeEntry(): LocationEntry {
  return {
    id: nextId++,
    jobSiteId: '',
    startTime: '08:00',
    endTime: '16:00',
    breakMins: 0,
    showNewSite: false,
    newSiteName: '',
  };
}

function effectiveMins(loc: LocationEntry): number {
  if (!loc.startTime || !loc.endTime || loc.startTime >= loc.endTime) return 0;
  const raw = minutesBetween(`2000-01-01T${loc.startTime}`, `2000-01-01T${loc.endTime}`);
  return Math.max(0, raw - loc.breakMins);
}

/** Small caps label used above every field. */
function Label({ children, icon: Icon }: { children: React.ReactNode; icon?: typeof Users }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </p>
  );
}

const fieldClass =
  'w-full rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-sm text-ink ' +
  'focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30';

export function AddHoursModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { timezone } = useCompanyContext();
  const sites = useMyAssignedSites();
  const coworkers = useEmployeeOptions();
  const addHours = useAddHours();
  const createSite = useEmployeeCreateJobSite();

  const todayKey = new Date().toLocaleDateString('en-CA');

  const [date, setDate] = useState(todayKey);
  const [locations, setLocations] = useState<LocationEntry[]>([makeEntry()]);
  const [selectedCoworkers, setSelectedCoworkers] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [overlapInfo, setOverlapInfo] = useState<{ entryId: string; range: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setDate(todayKey);
    setLocations([makeEntry()]);
    setSelectedCoworkers([]);
    setNote('');
    setFormError(null);
    setOverlapInfo(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const updateLoc = (id: number, patch: Partial<LocationEntry>) =>
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLocation = () => setLocations((prev) => [...prev, makeEntry()]);
  const removeLoc = (id: number) => setLocations((prev) => prev.filter((l) => l.id !== id));

  const handleCreateSite = async (locId: number, name: string) => {
    if (!name.trim()) return;
    try {
      const site = await createSite.mutateAsync({
        name: name.trim(),
        client_name: null,
        description: null,
      });
      updateLoc(locId, { jobSiteId: site.id, showNewSite: false, newSiteName: '' });
      void sites.refetch();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create job site.'));
    }
  };

  const toggleCoworker = (id: string) =>
    setSelectedCoworkers((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const doSubmit = async (force: boolean) => {
    setFormError(null);
    if (!date) {
      setFormError('Please select a date.');
      return;
    }

    const valid = locations.filter((l) => l.jobSiteId && l.startTime && l.endTime);
    if (valid.length === 0) {
      setFormError('Select a job site and set start and end time.');
      return;
    }
    for (const loc of valid) {
      if (loc.startTime >= loc.endTime) {
        setFormError('End time must be after start time.');
        return;
      }
    }

    try {
      setSubmitting(true);
      for (const loc of valid) {
        await addHours.mutateAsync({
          job_site_id: loc.jobSiteId,
          clock_in: localInputToUtcIso(`${date}T${loc.startTime}`, timezone),
          clock_out: localInputToUtcIso(`${date}T${loc.endTime}`, timezone),
          note: note.trim() || null,
          coworker_ids: selectedCoworkers,
          force,
        });
      }
      handleClose();
    } catch (err) {
      const msg = errorMessage(err, '');
      const overlap = parseOverlapError(msg);
      if (overlap && !force) setOverlapInfo(overlap);
      else setFormError(msg || 'Could not save hours.');
    } finally {
      setSubmitting(false);
    }
  };

  const allSites = sites.data ?? [];
  const totalMins = locations.reduce((sum, l) => sum + effectiveMins(l), 0);
  const filledCount = locations.filter((l) => l.jobSiteId && effectiveMins(l) > 0).length;

  return (
    <>
      <Modal open={open} onClose={handleClose} title="Add work hours">
        <div className="space-y-6">
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          {/* ---- Date ------------------------------------------------- */}
          <div>
            <Label icon={CalendarDays}>Date</Label>
            <input
              type="date"
              value={date}
              max={todayKey}
              onChange={(e) => setDate(e.target.value)}
              className={`${fieldClass} font-semibold`}
            />
          </div>

          {/* ---- Locations -------------------------------------------- */}
          <div className="space-y-3">
            {locations.map((loc, idx) => {
              const mins = effectiveMins(loc);
              return (
                <div
                  key={loc.id}
                  className="overflow-hidden rounded-2xl border border-navy-100 bg-navy-50/40"
                >
                  {/* Card header: number, hours, remove */}
                  <div className="flex items-center justify-between border-b border-navy-100 px-4 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Location {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {mins > 0 && (
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums text-ink">
                          {formatDuration(mins)}
                        </span>
                      )}
                      {locations.length > 1 && (
                        <button
                          onClick={() => removeLoc(loc.id)}
                          aria-label={`Remove location ${idx + 1}`}
                          className="rounded-lg p-1 text-ink-subtle hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    {/* Job site */}
                    {!loc.showNewSite ? (
                      <div className="relative">
                        <select
                          value={loc.jobSiteId}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              updateLoc(loc.id, { showNewSite: true, jobSiteId: '' });
                            } else {
                              updateLoc(loc.id, { jobSiteId: e.target.value });
                            }
                          }}
                          className={`${fieldClass} appearance-none pr-9`}
                        >
                          <option value="">Select a job site…</option>
                          {allSites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                          <option value="__new__">＋ Create new site</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          type="text"
                          value={loc.newSiteName}
                          onChange={(e) => updateLoc(loc.id, { newSiteName: e.target.value })}
                          placeholder="New site name…"
                          className={fieldClass.replace('border-navy-200', 'border-volt-300')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCreateSite(loc.id, loc.newSiteName);
                            if (e.key === 'Escape')
                              updateLoc(loc.id, { showNewSite: false, newSiteName: '' });
                          }}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => updateLoc(loc.id, { showNewSite: false, newSiteName: '' })}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            className="flex-1"
                            onClick={() => handleCreateSite(loc.id, loc.newSiteName)}
                            loading={createSite.isPending}
                            disabled={!loc.newSiteName.trim()}
                          >
                            Create
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Times — one joined row */}
                    <div className="flex overflow-hidden rounded-xl border border-navy-200 bg-white">
                      <div className="flex-1 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Start
                        </p>
                        <input
                          type="time"
                          value={loc.startTime}
                          onChange={(e) => updateLoc(loc.id, { startTime: e.target.value })}
                          className="w-full bg-transparent text-sm font-semibold text-ink focus:outline-none"
                        />
                      </div>
                      <div className="w-px bg-navy-100" />
                      <div className="flex-1 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          End
                        </p>
                        <input
                          type="time"
                          value={loc.endTime}
                          onChange={(e) => updateLoc(loc.id, { endTime: e.target.value })}
                          className="w-full bg-transparent text-sm font-semibold text-ink focus:outline-none"
                        />
                      </div>
                      <div className="w-px bg-navy-100" />
                      <div className="w-20 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Break
                        </p>
                        <input
                          type="number"
                          min={0}
                          max={480}
                          step={15}
                          value={loc.breakMins}
                          onChange={(e) =>
                            updateLoc(loc.id, { breakMins: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-full bg-transparent text-sm font-semibold text-ink focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={addLocation}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-navy-200 py-3 text-sm font-medium text-ink-muted transition-colors hover:border-volt-400 hover:text-volt-700"
            >
              <Plus className="h-4 w-4" />
              Add another location
            </button>
          </div>

          {/* ---- Coworkers -------------------------------------------- */}
          {(coworkers.data ?? []).length > 0 && (
            <div>
              <Label icon={Users}>Coworkers on site</Label>
              <div className="flex flex-wrap gap-2">
                {(coworkers.data ?? []).map((m) => {
                  const selected = selectedCoworkers.includes(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => toggleCoworker(m.user_id)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        selected
                          ? 'bg-navy-800 text-white'
                          : 'bg-navy-100 text-ink-muted hover:bg-navy-200'
                      }`}
                    >
                      {m.profile.full_name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---- Notes ------------------------------------------------ */}
          <div>
            <Label icon={StickyNote}>Notes</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              className={`${fieldClass} resize-none placeholder:text-ink-subtle`}
            />
          </div>

          {/* ---- Total + save ----------------------------------------- */}
          <div className="space-y-3 border-t border-navy-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Total{filledCount > 1 ? ` · ${filledCount} locations` : ''}
              </span>
              <span className="text-xl font-bold tabular-nums text-ink">
                {totalMins > 0 ? formatDuration(totalMins) : '—'}
              </span>
            </div>
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => doSubmit(false)}
              loading={submitting}
            >
              Save entry
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!overlapInfo}
        title="Overlapping entry"
        message="You already have a time entry that overlaps with this period. Save anyway?"
        confirmLabel="Save anyway"
        tone="danger"
        onConfirm={() => {
          setOverlapInfo(null);
          void doSubmit(true);
        }}
        onCancel={() => setOverlapInfo(null)}
      />
    </>
  );
}
