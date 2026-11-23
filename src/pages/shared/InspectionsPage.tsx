import { useMemo, useState } from 'react';
import { CalendarClock, Check, ClipboardCheck, MapPin, Pencil, Phone, Plus, RotateCcw, Trash2, User, Users, X } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { localDateKey } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useJobSiteOptions } from '@/hooks/useJobSites';
import {
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  useDeleteInspection,
  useCompanyPeople,
  useInspections,
  useSaveInspection,
  useSetInspectionStatus,
  type InspectionRow,
} from '@/hooks/useInspections';
import { PageHeader } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState, SkeletonRows } from '@/components/ui/states';

const statusOf = (id: string) => INSPECTION_STATUSES.find((s) => s.id === id) ?? INSPECTION_STATUSES[0]!;

function niceDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function niceTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Inspections of all job sites. The owner adds and edits them; employees only see them. */
export function InspectionsPage() {
  const { role, timezone, userId } = useCompanyContext();
  const isOwner = role === 'owner';
  const list = useInspections();
  const people = useCompanyPeople();
  const setStatus = useSetInspectionStatus();
  const names = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.name])), [people.data]);
  const sites = useJobSiteOptions();
  const del = useDeleteInspection();
  const [site, setSite] = useState('');
  const [editing, setEditing] = useState<InspectionRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<InspectionRow | null>(null);
  const today = localDateKey(new Date(), timezone);

  const { upcoming, past } = useMemo(() => {
    const rows = (list.data ?? []).filter((r) => !site || r.job_site_id === site);
    const isUpcoming = (r: InspectionRow) => r.inspection_date >= today && r.status === 'scheduled';
    return {
      upcoming: rows.filter(isUpcoming),
      past: rows.filter((r) => !isUpcoming(r)).reverse(),
    };
  }, [list.data, site, today]);

  return (
    <div className="max-w-4xl pb-24">
      <PageHeader
        title="Inspections"
        subtitle={isOwner ? 'Plan and record the inspections of every job site.' : 'Upcoming and past inspections of the job sites.'}
        actions={isOwner && (
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add inspection
          </Button>
        )}
      />

      <div className="mb-4">
        <Select aria-label="Job site" value={site} onChange={(e) => setSite(e.target.value)} className="max-w-xs">
          <option value="">All job sites</option>
          {(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      {list.isLoading ? (
        <Card><CardBody><SkeletonRows rows={4} /></CardBody></Card>
      ) : !upcoming.length && !past.length ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title="No inspections yet"
            description={isOwner ? 'Add the first inspection: job site, type, date and time.' : 'The owner has not added any inspections yet.'}
            action={isOwner && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add inspection</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Upcoming ({upcoming.length})</h2>
            {upcoming.length ? (
              <div className="space-y-2">
                {upcoming.map((r) => (
                  <InspectionCard key={r.id} r={r} today={today} isOwner={isOwner} me={userId} names={names}
                    onResult={(status) => setStatus.mutate({ id: r.id, status })}
                    onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No upcoming inspections.</p>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Past &amp; done ({past.length})</h2>
              <div className="space-y-2">
                {past.map((r) => (
                  <InspectionCard key={r.id} r={r} today={today} isOwner={isOwner} me={userId} names={names}
                    onResult={(status) => setStatus.mutate({ id: r.id, status })}
                    onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {isOwner && editing && (
        <InspectionModal
          inspection={editing === 'new' ? null : editing}
          defaultSite={site}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete inspection"
        message={deleting ? `Delete the ${deleting.type} inspection of ${deleting.job_site?.name ?? 'this job site'} on ${niceDate(deleting.inspection_date)}?` : ''}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (deleting) void del.mutateAsync(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function InspectionCard({ r, today, isOwner, me, names, onResult, onEdit, onDelete }: {
  r: InspectionRow; today: string; isOwner: boolean; me: string; names: Map<string, string>;
  onResult: (status: string) => void; onEdit: () => void; onDelete: () => void;
}) {
  const st = statusOf(r.status);
  const going = (r.assignee_ids ?? []).map((id) => (id === me ? 'You' : names.get(id) ?? 'Employee'));
  const imGoing = (r.assignee_ids ?? []).includes(me);
  const isToday = r.inspection_date === today;
  const overdue = r.status === 'scheduled' && r.inspection_date < today;
  return (
    <Card className={isToday && r.status === 'scheduled' ? 'border-volt-500 ring-2 ring-volt-400/30' : ''}>
      <CardBody className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{r.type}</p>
            <Badge tone={st.tone}>{st.label}</Badge>
            {isToday && r.status === 'scheduled' && <Badge tone="volt">Today</Badge>}
            {overdue && <Badge tone="warning">Result not entered</Badge>}
            {imGoing && r.status === 'scheduled' && <Badge tone="volt">You're going</Badge>}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-ink"><MapPin className="h-4 w-4 text-ink-subtle" />{r.job_site?.name ?? 'Job site'}</p>
          <p className="flex items-center gap-1.5 text-sm text-ink"><CalendarClock className="h-4 w-4 text-ink-subtle" />{niceDate(r.inspection_date)}{r.inspection_time ? ` · ${niceTime(r.inspection_time)}` : ''}</p>
          {(r.inspector || r.inspector_phone) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              {r.inspector && <span className="flex items-center gap-1.5"><User className="h-4 w-4" />{r.inspector}</span>}
              {r.inspector_phone && <a href={`tel:${r.inspector_phone}`} className="flex items-center gap-1.5 hover:text-ink"><Phone className="h-4 w-4" />{r.inspector_phone}</a>}
            </p>
          )}
          {going.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-ink"><Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" /><span><span className="text-ink-muted">Going:</span> {going.join(', ')}</span></p>
          )}
          {r.notes && <p className="whitespace-pre-wrap pt-1 text-sm text-ink-muted">{r.notes}</p>}
          {isOwner && (
            r.status === 'scheduled' ? (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs text-ink-muted">Result:</span>
                <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} onClick={() => onResult('passed')}>Passed</Button>
                <Button size="sm" variant="danger" icon={<X className="h-4 w-4" />} onClick={() => onResult('failed')}>Failed</Button>
                <Button size="sm" variant="secondary" onClick={() => onResult('partial')}>Partial</Button>
              </div>
            ) : r.status !== 'cancelled' && (
              <button type="button" onClick={() => onResult('scheduled')} className="flex items-center gap-1 pt-1 text-xs text-ink-muted hover:text-ink">
                <RotateCcw className="h-3 w-3" /> Undo result
              </button>
            )
          )}
        </div>
        {isOwner && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" aria-label="Edit inspection" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>Edit</Button>
            <Button variant="ghost" size="sm" aria-label="Delete inspection" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function InspectionModal({ inspection, defaultSite, today, onClose }: { inspection: InspectionRow | null; defaultSite: string; today: string; onClose: () => void }) {
  const sites = useJobSiteOptions();
  const people = useCompanyPeople();
  const save = useSaveInspection();
  const [who, setWho] = useState<string[]>(inspection?.assignee_ids ?? []);
  const toggle = (id: string) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  const known = !inspection || INSPECTION_TYPES.includes(inspection.type);
  const [f, setF] = useState({
    job_site_id: inspection?.job_site_id ?? defaultSite,
    type: inspection ? (known ? inspection.type : 'Other') : 'Rough-in',
    otherType: inspection && !known ? inspection.type : '',
    inspection_date: inspection?.inspection_date ?? today,
    inspection_time: inspection?.inspection_time ?? '09:00',
    inspector: inspection?.inspector ?? '',
    inspector_phone: inspection?.inspector_phone ?? '',
    status: inspection?.status ?? 'scheduled',
    notes: inspection?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const type = f.type === 'Other' ? f.otherType.trim() || 'Other' : f.type;
    if (!f.job_site_id) return setError('Choose a job site.');
    if (!f.inspection_date) return setError('Choose a date.');
    try {
      await save.mutateAsync({
        id: inspection?.id,
        job_site_id: f.job_site_id,
        type,
        inspection_date: f.inspection_date,
        inspection_time: f.inspection_time || null,
        inspector: f.inspector.trim() || null,
        inspector_phone: f.inspector_phone.trim() || null,
        status: f.status,
        notes: f.notes.trim() || null,
        assignee_ids: who,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the inspection.'));
    }
  };

  return (
    <Modal open onClose={onClose} title={inspection ? 'Edit inspection' : 'Add inspection'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <FormField label="Job site" htmlFor="insp-site" required>
          <Select id="insp-site" value={f.job_site_id} onChange={set('job_site_id')}>
            <option value="">Choose a job site…</option>
            {(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Inspection" htmlFor="insp-type" required>
            <Select id="insp-type" value={f.type} onChange={set('type')}>
              {INSPECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Status" htmlFor="insp-status">
            <Select id="insp-status" value={f.status} onChange={set('status')}>
              {INSPECTION_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </FormField>
        </div>
        {f.type === 'Other' && (
          <FormField label="Which inspection?" htmlFor="insp-other">
            <Input id="insp-other" value={f.otherType} onChange={set('otherType')} placeholder="e.g. Generator test" />
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Date" htmlFor="insp-date" required>
            <Input id="insp-date" type="date" value={f.inspection_date} onChange={set('inspection_date')} />
          </FormField>
          <FormField label="Time" htmlFor="insp-time">
            <Input id="insp-time" type="time" value={f.inspection_time} onChange={set('inspection_time')} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Inspector" htmlFor="insp-inspector">
            <Input id="insp-inspector" value={f.inspector} onChange={set('inspector')} placeholder="Name or office" />
          </FormField>
          <FormField label="Inspector phone" htmlFor="insp-phone">
            <Input id="insp-phone" type="tel" value={f.inspector_phone} onChange={set('inspector_phone')} />
          </FormField>
        </div>
        <FormField label="Who goes" hint="Pick the employees who meet the inspector.">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-navy-100 p-2">
            {(people.data ?? []).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-navy-50">
                <input type="checkbox" className="h-4 w-4 accent-volt-500" checked={who.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="text-ink">{p.name}</span>
                {p.role === 'owner' && <span className="text-xs text-ink-subtle">owner</span>}
              </label>
            ))}
            {!people.isLoading && !people.data?.length && <p className="px-2 py-1 text-sm text-ink-muted">No employees yet.</p>}
          </div>
        </FormField>
        <FormField label="Notes" htmlFor="insp-notes" hint="What must be ready, who meets the inspector, corrections to make…">
          <Textarea id="insp-notes" rows={3} value={f.notes} onChange={set('notes')} />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>{inspection ? 'Save' : 'Add inspection'}</Button>
        </div>
      </form>
    </Modal>
  );
}
