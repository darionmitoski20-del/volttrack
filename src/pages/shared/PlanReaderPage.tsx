import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileUp, FileText, AlertTriangle } from 'lucide-react';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useJobSite } from '@/hooks/useJobSites';
import {
  useCurrentPlan, usePlanDay, usePlanVersions, usePlanWork, useSheetImages, useTeachSymbol, useUnknownSymbols, planPdfUrl,
  type PlanData, type WorkState,
} from '@/hooks/usePlans';
import { PageHeader, Avatar } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select, Input } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/supabase';
import { formatDate, formatTime } from '@/lib/datetime';
import type { PlanDiffRow } from '@/lib/database.types';
import { PlanViewer } from '@/features/planreader/PlanViewer';
import { uploadPlan } from '@/features/planreader/service';
import { CLASSES, UNCERTAIN } from '@/features/planreader/engine';
import { DISCIPLINE_ORDER, isCountable, roomLabel } from '@/features/planreader/labels';

type Tab = 'plan' | 'overview' | 'rooms' | 'daily' | 'revisions' | 'review';

export function PlanReaderPage() {
  const { id = '' } = useParams();
  const { role, timezone } = useCompanyContext();
  const isOwner = role === 'owner';
  const site = useJobSite(id);
  const plan = useCurrentPlan(id);
  const work = usePlanWork(id);
  const images = useSheetImages(plan.data?.sheets);
  const [tab, setTab] = useState<Tab>('plan');

  const tabs: [Tab, string][] = [
    ['plan', 'Plan'], ['overview', 'Overview'], ['rooms', 'By room'], ['daily', 'Daily report'], ['revisions', 'Revisions'],
  ];
  if (isOwner) tabs.push(['review', 'Review']);

  const back = isOwner ? `/app/job-sites/${id}` : '/me/job-sites';

  return (
    <div>
      <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {site.data?.name ?? 'Job site'}
      </Link>
      <PageHeader
        title="Plan Reader"
        subtitle={plan.data ? `Version ${plan.data.version.n} · ${plan.data.version.file_name}` : 'Upload the electrical plans and track what is installed.'}
        actions={
          plan.data?.version.pdf_path ? (
            <Button
              variant="secondary"
              icon={<FileText className="h-4 w-4" />}
              onClick={async () => window.open(await planPdfUrl(plan.data!.version.pdf_path!), '_blank', 'noopener')}
            >
              Open PDF
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-navy-100">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-volt-500 text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'revisions' ? (
        <RevisionsTab jobSiteId={id} isOwner={isOwner} timezone={timezone} />
      ) : (
        <QueryBoundary query={plan}>
          {(p) =>
            !p ? (
              <NoPlan jobSiteId={id} isOwner={isOwner} />
            ) : tab === 'plan' ? (
              <PlanViewer
                jobSiteId={id}
                versionId={p.version.id}
                sheets={p.sheets}
                items={p.items}
                work={work.data ?? new Map()}
                images={images.data ?? {}}
                isOwner={isOwner}
                timezone={timezone}
              />
            ) : tab === 'overview' ? (
              <OverviewTab plan={p} work={work.data ?? new Map()} />
            ) : tab === 'rooms' ? (
              <RoomsTab plan={p} work={work.data ?? new Map()} />
            ) : tab === 'daily' ? (
              <DailyTab jobSiteId={id} plan={p} timezone={timezone} />
            ) : (
              <ReviewTab jobSiteId={id} plan={p} />
            )
          }
        </QueryBoundary>
      )}
    </div>
  );
}

// -- upload ------------------------------------------------------------------

function UploadBox({ jobSiteId, label }: { jobSiteId: string; label: string }) {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [prog, setProg] = useState<{ m: string; p: number } | null>(null);
  const [err, setErr] = useState('');

  const start = async () => {
    if (!file) return setErr('Choose a PDF first.');
    setErr('');
    setProg({ m: 'Starting…', p: 0 });
    try {
      const v = await uploadPlan({ file, jobSiteId, companyId, userId, onProgress: (m, p) => setProg({ m, p }) });
      showToast('Plan read', `${v.sheet_count} sheets, ${v.item_count} devices`);
      qc.invalidateQueries({ queryKey: ['plan-current', jobSiteId] });
      qc.invalidateQueries({ queryKey: ['plan-versions', jobSiteId] });
      setFile(null);
    } catch (e) {
      setErr(errorMessage(e, 'Could not read the plan.'));
    } finally {
      setProg(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input type="file" accept="application/pdf" disabled={!!prog} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(''); }} />
        <Button variant="primary" icon={<FileUp className="h-4 w-4" />} loading={!!prog} onClick={start}>
          {label}
        </Button>
      </div>
      {prog && (
        <div>
          <div className="h-2 overflow-hidden rounded bg-navy-100">
            <div className="h-full bg-volt-500 transition-all" style={{ width: `${prog.p}%` }} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">{prog.m} · keep this page open</p>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

function NoPlan({ jobSiteId, isOwner }: { jobSiteId: string; isOwner: boolean }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="text-base font-semibold text-ink">No plan yet</h2>
        {isOwner ? (
          <>
            <p className="text-sm text-ink-muted">
              Upload the project PDF (exported from AutoCAD / Bluebeam). Plan Reader finds the power, lighting, low-voltage and fire-alarm
              sheets, counts every device and assigns it to a room. It takes about a minute.
            </p>
            <UploadBox jobSiteId={jobSiteId} label="Upload and read" />
          </>
        ) : (
          <p className="text-sm text-ink-muted">The owner has not uploaded a plan for this job site yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

// -- overview ------------------------------------------------------------------

function useGrouped(plan: PlanData) {
  return useMemo(() => {
    const disc = new Map(plan.sheets.map((s) => [s.number, s]));
    const floors = [...new Set(plan.sheets.slice().sort((a, b) => a.level - b.level).map((s) => s.floor))];
    const withMeta = plan.items.filter((i) => i.cls !== 'UNKNOWN').map((i) => ({ ...i, disc: disc.get(i.sheet)?.discipline ?? '', floor: disc.get(i.sheet)?.floor ?? '' }));
    return { floors, items: withMeta };
  }, [plan]);
}

function OverviewTab({ plan, work }: { plan: PlanData; work: Map<string, WorkState> }) {
  const { floors, items } = useGrouped(plan);
  const discs = DISCIPLINE_ORDER.filter((d) => items.some((i) => i.disc === d));
  const countable = items.filter(isCountable);
  const done = countable.filter((i) => work.get(i.uid)?.done).length;
  const unknown = plan.items.filter((i) => i.cls === 'UNKNOWN').length;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-6">
            <Stat value={countable.length} label="devices to install" />
            <Stat value={done} label="done" />
            <Stat value={countable.length - done} label="not done" />
            <Stat value={`${countable.length ? Math.round((100 * done) / countable.length) : 0}%`} label="complete" />
            {unknown > 0 && <Stat value={unknown} label="unknown symbols" warn />}
          </div>
          <Bar value={done} total={countable.length} />
          {plan.version.diff?.removed_done && plan.version.diff.removed_done.length > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-orange-700">
              <AlertTriangle className="h-4 w-4" /> The last revision removed devices that were already done. See Revisions.
            </p>
          )}
        </CardBody>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {discs.map((d) => {
          const L = items.filter((i) => i.disc === d);
          const names = [...new Set(L.map((i) => i.name))].sort((a, b) => L.filter((i) => i.name === b).length - L.filter((i) => i.name === a).length);
          const C = L.filter(isCountable), D = C.filter((i) => work.get(i.uid)?.done).length;
          return (
            <Card key={d}>
              <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">{d}</h2>
                <span className="text-sm text-ink-muted">{D}/{C.length} done</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="px-4 py-2 font-medium">Device</th>
                      {floors.map((f) => <th key={f} className="px-2 py-2 text-right font-medium">{f}</th>)}
                      <th className="px-2 py-2 text-right font-medium">Total</th>
                      <th className="px-4 py-2 text-right font-medium">Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {names.map((n) => {
                      const x = L.filter((i) => i.name === n), ex = x[0]?.existing, unc = UNCERTAIN.includes(x[0]?.cls ?? '');
                      return (
                        <tr key={n} className="border-t border-navy-100">
                          <td className="px-4 py-1.5 text-ink">
                            {n.replace(' (existing)', '')}
                            {ex && <Badge tone="info" className="ml-2">existing</Badge>}
                            {unc && <Badge tone="warning" className="ml-2">check legend</Badge>}
                          </td>
                          {floors.map((f) => <td key={f} className="px-2 py-1.5 text-right tabular-nums">{x.filter((i) => i.floor === f).length || '–'}</td>)}
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{x.length}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{ex ? '' : x.filter((i) => work.get(i.uid)?.done).length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) {
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums ${warn ? 'text-orange-600' : 'text-ink'}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Bar({ value, total }: { value: number; total: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded bg-navy-100">
      <div className="h-full rounded bg-emerald-600" style={{ width: `${total ? (100 * value) / total : 0}%` }} />
    </div>
  );
}

// -- by room -------------------------------------------------------------------

function RoomsTab({ plan, work }: { plan: PlanData; work: Map<string, WorkState> }) {
  const { floors, items } = useGrouped(plan);
  const [floor, setFloor] = useState(floors[0] ?? '');
  const [disc, setDisc] = useState('All');
  const [q, setQ] = useState('');
  const L = items.filter((i) => i.floor === floor && (disc === 'All' || i.disc === disc) && isCountable(i));
  const ql = q.trim().toLowerCase();
  const rooms = [...new Set(L.map((i) => i.room))]
    .filter((r) => !ql || r.toLowerCase().includes(ql) || L.some((i) => i.room === r && (i.name.toLowerCase().includes(ql) || i.cls.toLowerCase() === ql)))
    .sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, undefined, { numeric: true }));

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap gap-2">
          <Select aria-label="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} className="max-w-[160px]">
            {floors.map((f) => <option key={f}>{f}</option>)}
          </Select>
          <Select aria-label="System" value={disc} onChange={(e) => setDisc(e.target.value)} className="max-w-[180px]">
            {['All', ...DISCIPLINE_ORDER].map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Input placeholder="Search room, device or tag (L4, 220…)" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </div>
        <ul className="divide-y divide-navy-100">
          {rooms.map((r) => {
            const x = L.filter((i) => i.room === r);
            const d = x.filter((i) => work.get(i.uid)?.done);
            const byName = [...new Set(x.map((i) => i.name))];
            const workers = [...new Set(d.map((i) => work.get(i.uid)!.by))];
            return (
              <li key={r || '-'} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{roomLabel(r)}</span>
                  <span className="text-sm tabular-nums text-ink-muted">{d.length}/{x.length} done</span>
                </div>
                <Bar value={d.length} total={x.length} />
                <p className="mt-2 text-xs text-ink-muted">
                  {byName.map((n) => `${x.filter((i) => i.name === n && work.get(i.uid)?.done).length}/${x.filter((i) => i.name === n).length} ${n}`).join(' · ')}
                </p>
                {workers.length > 0 && <p className="mt-1 text-xs text-ink">Done by: {workers.join(', ')}</p>}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

// -- daily report -------------------------------------------------------------

function DailyTab({ jobSiteId, plan, timezone }: { jobSiteId: string; plan: PlanData; timezone: string }) {
  const [day, setDay] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const q = usePlanDay(jobSiteId, day);
  const byUid = useMemo(() => new Map(plan.items.map((i) => [i.uid, i])), [plan.items]);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-muted">Day</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="max-w-[180px]" />
        </div>
        <QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No work marked on this day" description="Devices marked done on the plan show up here." />}>
          {(rows) => {
            const workers = new Map<string, { name: string; done: typeof rows; undone: typeof rows }>();
            for (const r of rows) {
              const w = workers.get(r.user_id) ?? { name: r.profile?.full_name ?? '—', done: [], undone: [] };
              (r.done ? w.done : w.undone).push(r);
              workers.set(r.user_id, w);
            }
            return (
              <div className="space-y-4">
                {[...workers.entries()].map(([uid, w]) => {
                  const rooms = new Map<string, Map<string, number>>();
                  for (const r of w.done) {
                    const it = byUid.get(r.item_uid);
                    if (!it) continue;
                    const m = rooms.get(it.room) ?? new Map<string, number>();
                    m.set(it.name, (m.get(it.name) ?? 0) + 1);
                    rooms.set(it.room, m);
                  }
                  return (
                    <div key={uid} className="rounded-xl border border-navy-100 p-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={w.name} id={uid} size="sm" />
                        <p className="font-medium text-ink">{w.name}</p>
                        <Badge tone="success" className="ml-auto">{w.done.length} done</Badge>
                        {w.undone.length > 0 && <Badge tone="warning">{w.undone.length} set back to not done</Badge>}
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {[...rooms.entries()].map(([room, m]) => (
                          <li key={room}>
                            <span className="font-medium text-ink">{roomLabel(room)}:</span>{' '}
                            <span className="text-ink-muted">{[...m.entries()].map(([n, c]) => `${c}× ${n}`).join(', ')}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-ink-subtle">
                        Last: {formatTime(w.done[0]?.created_at ?? w.undone[0]!.created_at, timezone)} · {formatDate(day + 'T12:00:00', timezone)}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

// -- revisions -----------------------------------------------------------------

function RevisionsTab({ jobSiteId, isOwner, timezone }: { jobSiteId: string; isOwner: boolean; timezone: string }) {
  const versions = usePlanVersions(jobSiteId);
  const latest = versions.data?.find((v) => v.status === 'done');
  const diff = latest?.diff;
  const total = (L: PlanDiffRow[]) => L.reduce((s, x) => s + x.n, 0);
  const DiffTable = ({ rows, sign }: { rows: PlanDiffRow[]; sign: string }) =>
    rows.length ? (
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-navy-100">
              <td className="py-1 pr-2 text-ink-muted">{r.sheet}</td>
              <td className="py-1 pr-2">{roomLabel(r.room)}</td>
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 text-right tabular-nums">{sign}{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-sm text-ink-subtle">None</p>
    );

  return (
    <div className="space-y-4">
      {isOwner && (
        <Card>
          <CardBody className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Upload a new revision</h2>
            <p className="text-sm text-ink-muted">Devices that did not change keep their Done status. You will see what was added and removed.</p>
            <UploadBox jobSiteId={jobSiteId} label="Upload revision" />
          </CardBody>
        </Card>
      )}
      <QueryBoundary query={versions}>
        {(list) => (
          <Card>
            <ul className="divide-y divide-navy-100">
              {list.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold text-ink">v{v.n}</span>
                  <span className="text-ink">{v.file_name}</span>
                  <span className="text-ink-subtle">{formatDate(v.created_at, timezone)} · {v.profile?.full_name ?? ''}</span>
                  <span className="ml-auto">
                    {v.status === 'done' ? <Badge tone="success">{v.sheet_count} sheets · {v.item_count} devices</Badge>
                      : v.status === 'processing' ? <Badge tone="warning">reading…</Badge>
                      : <Badge tone="danger">{v.error ?? 'error'}</Badge>}
                  </span>
                </li>
              ))}
              {list.length === 0 && <li className="px-4 py-3 text-sm text-ink-subtle">No versions yet.</li>}
            </ul>
          </Card>
        )}
      </QueryBoundary>
      {diff && diff.prev != null && latest && (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-sm font-semibold text-ink">What changed in v{latest.n} compared to v{diff.prev}</h2>
            <p className="text-sm text-ink-muted">{diff.matched} devices are unchanged and kept their status.</p>
            {diff.removed_done.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-800">
                  <AlertTriangle className="h-4 w-4" /> Removed in this revision but already done ({total(diff.removed_done)}): may need to be taken out
                </p>
                <DiffTable rows={diff.removed_done} sign="−" />
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-emerald-700">Added ({total(diff.added)})</h3>
                <DiffTable rows={diff.added} sign="+" />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-red-700">Removed ({total(diff.removed)})</h3>
                <DiffTable rows={diff.removed} sign="−" />
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// -- review (owner) ------------------------------------------------------------

function ReviewTab({ jobSiteId, plan }: { jobSiteId: string; plan: PlanData }) {
  const unknown = useUnknownSymbols(plan.version.id);
  const teach = useTeachSymbol(jobSiteId);
  const { showToast } = useToast();
  const [pick, setPick] = useState<Record<string, string>>({});
  const uncertain = useMemo(() => {
    const m = new Map<string, { n: number; sheets: Set<string> }>();
    for (const i of plan.items) {
      if (!UNCERTAIN.includes(i.cls)) continue;
      const r = m.get(i.name) ?? { n: 0, sheets: new Set<string>() };
      r.n++;
      r.sheets.add(i.sheet);
      m.set(i.name, r);
    }
    return [...m.entries()];
  }, [plan.items]);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h2 className="mb-1 text-sm font-semibold text-ink">Unknown symbols</h2>
          <p className="mb-3 text-sm text-ink-muted">Tell Plan Reader what each symbol is. It remembers it for all future plans of your company.</p>
          <QueryBoundary query={unknown} isEmpty={(d) => d.length === 0} empty={<p className="text-sm text-ink-subtle">All symbols were recognized.</p>}>
            {(list) => (
              <ul className="divide-y divide-navy-100">
                {list.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                    {u.crop && <img src={u.crop} alt="symbol" className="max-h-24 rounded border border-navy-100 bg-white" style={{ imageRendering: 'pixelated' }} />}
                    <div className="text-sm">
                      <p className="text-ink">{u.sheet}</p>
                      <p className="text-ink-muted">{roomLabel(u.room)}</p>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <Select aria-label="What is this symbol" value={pick[u.id] ?? ''} onChange={(e) => setPick((p) => ({ ...p, [u.id]: e.target.value }))}>
                        <option value="">What is this?</option>
                        {Object.entries(CLASSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        <option value="IGN">Not a device (ignore)</option>
                      </Select>
                      <Button
                        variant="primary"
                        disabled={!pick[u.id]}
                        loading={teach.isPending}
                        onClick={async () => {
                          try {
                            await teach.mutateAsync({ id: u.id, cls: pick[u.id]!, grp: u.grp, dims: u.dims, feat: u.feat });
                            showToast('Saved', 'Plan Reader will recognize this symbol next time.');
                          } catch (e) {
                            showToast('Could not save', errorMessage(e, 'Try again.'));
                          }
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h2 className="mb-1 text-sm font-semibold text-ink">Check against the legend</h2>
          <p className="mb-3 text-sm text-ink-muted">These were recognized by shape. Confirm on the symbol legend sheet (E0.02).</p>
          {uncertain.length ? (
            <ul className="text-sm">
              {uncertain.map(([n, r]) => (
                <li key={n} className="flex justify-between border-t border-navy-100 py-1.5">
                  <span>{n}</span>
                  <span className="text-ink-muted">{r.n} · {[...r.sheets].join(', ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-subtle">Nothing to check.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
