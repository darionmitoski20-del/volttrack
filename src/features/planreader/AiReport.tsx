import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, RefreshCw, Send, Copy, Loader2, ChevronDown, Lightbulb, ToggleLeft, Plug, Wifi, Cog, Zap } from 'lucide-react';
import { supabase, errorMessage } from '@/lib/supabase';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/Toast';
import { AI_MODELS, askAi, openPdf, pollAiReport, pollAsk, startAiReport, type AiCount, type AiReport, type AiTrade } from './ai';

interface ReportRow { status: string; error: string | null; result: AiReport; updated_at: string }
interface QuestionRow { id: string; question: string; answer: string | null; status: string; created_at: string; user: { full_name: string } | null }

export function useReportRow(jobSiteId: string, versionId: string, page = 0) {
  return useQuery({
    queryKey: ['plan-ai-report', versionId, page],
    queryFn: async (): Promise<ReportRow | null> => {
      const { data, error } = await supabase
        .from('plan_ai_pages')
        .select('status, error, result, updated_at')
        .eq('job_site_id', jobSiteId)
        .eq('version_id', versionId)
        .eq('page', page)
        .maybeSingle();
      if (error) throw error;
      return (data as ReportRow | null) ?? null;
    },
  });
}

/** The AI report of a plan version: starts, waits for, and shows it, with questions below. */
export function AiReportPanel({ jobSiteId, versionId, versionN, isOwner }: { jobSiteId: string; versionId: string; versionN: number; isOwner: boolean }) {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const row = useReportRow(jobSiteId, versionId);
  // A new reading of a plan that already has a report (the old one stays until it is done).
  const pending = useReportRow(jobSiteId, versionId, -1);
  const [starting, setStarting] = useState(false);
  const [needFile, setNeedFile] = useState(false);
  const [prog, setProg] = useState('');
  const [model, setModel] = useState('');
  const status = row.data?.status;
  const rereading = pending.data?.status === 'running';

  // While the AI works in the background, ask the server every 8 s whether it is done.
  useEffect(() => {
    if (status !== 'running' && !rereading) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await pollAiReport(companyId, versionId);
        if (!stop && r.status !== 'running') void qc.invalidateQueries({ queryKey: ['plan-ai-report', versionId] });
      } catch { /* try again next tick */ }
    };
    void tick();
    const t = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [status, rereading, companyId, versionId, qc]);

  const start = async () => {
    setStarting(true);
    try {
      await startAiReport({ companyId, versionId, model });
      void qc.invalidateQueries({ queryKey: ['plan-ai-report', versionId] });
    } catch (e) {
      const msg = errorMessage(e, 'Try again.');
      // Big plans are not stored: ask for the PDF again.
      if (/No PDF/i.test(msg)) setNeedFile(true);
      else showToast('AI could not start', msg);
    } finally {
      setStarting(false);
    }
  };

  const startWithFile = async (file: File | undefined) => {
    if (!file) return;
    setStarting(true);
    try {
      const doc = await openPdf(file);
      await startAiReport({ companyId, versionId, jobSiteId, versionN, file, doc, model, onProgress: (m) => setProg(m) });
      setNeedFile(false);
      void qc.invalidateQueries({ queryKey: ['plan-ai-report', versionId] });
    } catch (e) {
      showToast('AI could not start', errorMessage(e, 'Try again.'));
    } finally {
      setStarting(false);
      setProg('');
    }
  };

  const modelPicker = isOwner && (
    <Select aria-label="AI model" value={model} onChange={(e) => setModel(e.target.value)} className="h-9 max-w-[16rem] text-sm">
      {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
    </Select>
  );

  const filePicker = needFile && (
    <Card className="border-volt-300">
      <CardBody className="space-y-2">
        <p className="text-sm text-ink">This plan is too big to keep on the server. Choose the same PDF again so AI can read it:</p>
        <input type="file" accept="application/pdf" disabled={starting} onChange={(e) => startWithFile(e.target.files?.[0])} className="block w-full text-sm" />
        {starting && <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> {prog || 'Preparing…'}</p>}
      </CardBody>
    </Card>
  );

  if (row.isLoading) return null;

  if (!row.data) {
    if (!isOwner) return null;
    if (needFile) return filePicker;
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-volt-600" />
            <p className="text-sm text-ink">AI has not read this plan yet.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {modelPicker}
            <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} loading={starting} onClick={start}>Read the plan with AI</Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (status === 'running') {
    return (
      <Card className="border-volt-300">
        <CardBody className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-volt-600" />
          <div>
            <p className="font-medium text-ink">AI is reading the whole plan…</p>
            <p className="text-sm text-ink-muted">This can take a few minutes. You can leave this page — the report appears here when it is ready.</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (status === 'error') {
    if (needFile) return filePicker;
    return (
      <Card className="border-red-200">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-700">AI reading failed: {row.data.error ?? 'unknown error'}</p>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-2">
              {modelPicker}
              <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={starting} onClick={start}>Try again</Button>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {filePicker}
      {rereading && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink">
          <Loader2 className="h-4 w-4 animate-spin text-volt-600" /> AI is reading the plan again. This report stays until the new one is ready.
        </p>
      )}
      {isOwner && pending.data?.status === 'error' && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">The new reading failed ({pending.data.error ?? 'unknown error'}). This is still the previous report.</p>
      )}
      {row.data.error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{row.data.error}</p>}
      <ReportView r={row.data.result} isOwner={isOwner} onRerun={start} rerunning={starting || rereading} picker={modelPicker} />
      <Questions jobSiteId={jobSiteId} versionId={versionId} />
    </div>
  );
}

// -- report ---------------------------------------------------------------------------

const TILES: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'Lighting', label: 'Lights', icon: Lightbulb },
  { key: 'Switches & controls', label: 'Switches & controls', icon: ToggleLeft },
  { key: 'Receptacles', label: 'Receptacles', icon: Plug },
  { key: 'Data & low voltage', label: 'Data & low voltage', icon: Wifi },
  { key: 'Equipment & connections', label: 'Equipment', icon: Cog },
];

function sum(items?: AiCount[]) {
  return (items ?? []).reduce((a, b) => a + (typeof b.count === 'number' ? b.count : 0), 0);
}

function clean(name?: string) {
  return (name ?? '').replace(/^~\s*/, '');
}

/** Normalises old and new report shapes. */
function shape(r: AiReport) {
  const el = r.electrical ?? {};
  const floors = el.floors ?? r.floors ?? [];
  const isOther = (n?: string) => !!n && !/electric|fire|low.?volt|data|telecom/i.test(n);
  const trades = r.other_trades ?? (r.disciplines ?? []).filter((d) => isOther(d.name));
  const fa = r.fire_alarm;
  const faFloors = fa?.floors ?? (fa?.devices?.length ? [{ name: 'All floors', devices: fa.devices }] : []);
  return {
    floors: floors.map((f) => ({ ...f, totals: (f.totals ?? []).filter((t) => t.category !== 'Fire alarm') })),
    lighting: el.lighting ?? r.lighting ?? [],
    panels: el.panels ?? r.panels ?? [],
    materials: el.materials ?? r.materials ?? [],
    demolition: el.demolition ?? r.demolition ?? [],
    fa,
    faFloors,
    trades,
  };
}

function Section({ title, count, children, defaultOpen }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-xl border border-navy-100 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <span className="font-semibold text-ink">{title}</span>
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          {count !== undefined && <span className="tabular-nums">{count}</span>}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-navy-100 px-4 py-3">{children}</div>
    </details>
  );
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${value === o.id ? 'bg-navy-900 text-white' : 'bg-navy-50 text-ink-muted hover:bg-navy-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ReportView({ r, isOwner, onRerun, rerunning, picker }: { r: AiReport; isOwner: boolean; onRerun: () => void; rerunning: boolean; picker: React.ReactNode }) {
  const d = useMemo(() => shape(r), [r]);
  const project = typeof r.project === 'string' ? { name: r.project } : r.project ?? {};
  const tabs = [
    { id: 'Electrical', label: 'Electrical' },
    ...(d.fa && (d.faFloors.length || d.fa.summary) ? [{ id: 'Fire Alarm', label: 'Fire Alarm' }] : []),
    ...d.trades.map((t) => ({ id: t.name || 'Other', label: t.name || 'Other' })),
  ];
  const [tab, setTab] = useState('Electrical');
  const trade = d.trades.find((t) => (t.name || 'Other') === tab);

  return (
    <Card className="border-volt-300">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 text-volt-600" />
              <h2 className="truncate text-lg font-semibold text-ink">{project.name || 'Plan report'}</h2>
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">{[project.address, project.issue_date].filter(Boolean).join(' · ')}</p>
          </div>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-2">
              {picker}
              <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} loading={rerunning} onClick={onRerun}>Read again</Button>
            </div>
          )}
        </div>

        {(r.changes?.length ?? 0) > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3">
            <p className="mb-1 text-sm font-semibold text-amber-900">Changed in this version</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">{r.changes!.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}

        {tabs.length > 1 && <Pills value={tab} options={tabs} onChange={setTab} />}

        {tab === 'Electrical' && <ElectricalView d={d} r={r} />}
        {tab === 'Fire Alarm' && d.fa && <FireAlarmView fa={d.fa} floors={d.faFloors} />}
        {trade && <TradeView t={trade} />}

        <p className="text-xs text-ink-subtle">Read by AI{r.model ? ` (${r.model})` : ''}. Numbers marked ~ are uncertain — check the drawings before ordering.</p>
      </CardBody>
    </Card>
  );
}

function Scope({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > 220;
  return (
    <p className="text-sm text-ink-muted">
      {long && !more ? `${text.slice(0, 220).trim()}… ` : `${text} `}
      {long && (
        <button type="button" className="font-medium text-ink underline" onClick={() => setMore((v) => !v)}>
          {more ? 'less' : 'more'}
        </button>
      )}
    </p>
  );
}

function ElectricalView({ d, r }: { d: ReturnType<typeof shape>; r: AiReport }) {
  const { showToast } = useToast();
  const [floorIdx, setFloorIdx] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const floor = d.floors[Math.min(floorIdx, Math.max(0, d.floors.length - 1))];
  const byCat = useMemo(() => {
    const m = new Map<string, AiCount[]>();
    for (const t of floor?.totals ?? []) {
      const k = TILES.some((x) => x.key === t.category) ? (t.category as string) : 'Equipment & connections';
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [floor]);
  const openItems = open ? byCat.get(open) ?? [] : [];

  return (
    <div className="space-y-4">
      {r.scope && <Scope text={r.scope} />}

      {d.floors.length > 0 && (
        <>
          {d.floors.length > 1 && (
            <Pills
              value={String(floorIdx)}
              options={d.floors.map((f, i) => ({ id: String(i), label: f.name || `Floor ${i + 1}` }))}
              onChange={(v) => { setFloorIdx(Number(v)); setOpen(null); }}
            />
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TILES.map((t) => {
              const n = sum(byCat.get(t.key));
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={n === 0}
                  onClick={() => setOpen(open === t.key ? null : t.key)}
                  className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-40 ${open === t.key ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-100 bg-white hover:border-navy-300'}`}
                >
                  <Icon className="h-5 w-5 opacity-70" />
                  <p className="mt-1 text-2xl font-bold tabular-nums">{n}</p>
                  <p className={`text-xs ${open === t.key ? 'text-white/80' : 'text-ink-muted'}`}>{t.label}</p>
                </button>
              );
            })}
          </div>
          {open && (
            <div className="rounded-xl bg-navy-50/60 px-4 py-2">
              {openItems.map((it, i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-navy-100 py-1.5 text-sm last:border-0">
                  <span className="text-ink">{clean(it.item)}{it.item?.startsWith('~') && <span className="ml-1 text-amber-600">~</span>}</span>
                  <span className="font-semibold tabular-nums">{it.count ?? '—'}</span>
                </div>
              ))}
            </div>
          )}

          {(floor?.rooms?.length ?? 0) > 0 && (
            <Section title={`Rooms — ${floor?.name ?? ''}`} count={floor!.rooms!.length}>
              <div className="divide-y divide-navy-100">
                {floor!.rooms!.map((room, i) => (
                  <details key={i} className="py-2 text-sm">
                    <summary className="flex cursor-pointer list-none justify-between gap-2">
                      <span className="font-medium text-ink">{room.room}</span>
                      <span className="tabular-nums text-ink-muted">{sum(room.items)}</span>
                    </summary>
                    <div className="mt-1 space-y-0.5 pl-3">
                      {(room.items ?? []).map((it, j) => (
                        <div key={j} className="flex justify-between gap-2"><span className="text-ink-muted">{clean(it.item)}</span><span className="tabular-nums">{it.count ?? '—'}</span></div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {d.lighting.length > 0 && (
        <Section title="Light fixtures" count={d.lighting.reduce((a, f) => a + (f.count ?? 0), 0)}>
          <div className="divide-y divide-navy-100">
            {d.lighting.map((f, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-ink"><b className="mr-1.5">{f.type}</b>{f.description}</p>
                  <p className="text-xs text-ink-muted">{[f.manufacturer, f.catalog, f.watts && `${f.watts} W`, f.mounting].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{f.count ?? '—'}</p>
                  {!!f.emergency_count && <p className="text-xs text-ink-muted">{f.emergency_count} EM</p>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.panels.length > 0 && (
        <Section title="Panels and circuits" count={d.panels.length}>
          <div className="space-y-2">
            {d.panels.map((p, i) => (
              <details key={i} className="rounded-lg border border-navy-100 px-3 py-2 text-sm">
                <summary className="cursor-pointer list-none">
                  <b>{p.name}</b>
                  {p.status && <span className="ml-2 rounded bg-navy-50 px-1.5 py-0.5 text-xs">{p.status}</span>}
                  <span className="block text-xs text-ink-muted">{[p.voltage, p.main, p.location, p.feeder].filter(Boolean).join(' · ')}</span>
                </summary>
                {(p.circuits?.length ?? 0) > 0 && (
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {p.circuits!.map((c, j) => (
                        <tr key={j} className="border-t border-navy-50 align-top">
                          <td className="w-14 py-1 font-medium">{c.ckt}</td>
                          <td className="py-1">{c.description}</td>
                          <td className="w-20 py-1 text-right">{c.breaker}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </details>
            ))}
          </div>
        </Section>
      )}

      {d.materials.length > 0 && (
        <Section title="Materials to order" count={d.materials.length}>
          <div className="divide-y divide-navy-100">
            {d.materials.map((m, i) => (
              <div key={i} className="flex justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0">
                  <span className="text-ink">{clean(m.item)}</span>
                  <span className="block text-xs text-ink-subtle">{m.category}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{m.quantity ?? '—'} {m.unit}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.demolition.length > 0 && (
        <Section title="Demolition" count={d.demolition.length}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{d.demolition.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Section>
      )}

      {(r.risks?.length ?? 0) > 0 && (
        <Section title="Watch out" count={r.risks!.length}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{r.risks!.map((x, i) => <li key={i}>{clean(x)}</li>)}</ul>
        </Section>
      )}

      {(r.rfi?.length ?? 0) > 0 && (
        <Section title="Questions for the architect (RFI)" count={r.rfi!.length}>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{r.rfi!.map((q, i) => <li key={i}>{q}</li>)}</ol>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            icon={<Copy className="h-4 w-4" />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(r.rfi!.map((q, i) => `${i + 1}. ${q}`).join('\n'));
                showToast('Copied', 'Paste the questions into an email');
              } catch {
                showToast('Could not copy', 'Select the text and copy it by hand');
              }
            }}
          >
            Copy all
          </Button>
        </Section>
      )}

      {(r.sheets?.length ?? 0) > 0 && (
        <Section title="Sheets in this set" count={r.sheets!.length}>
          <div className="space-y-0.5 text-sm">
            {r.sheets!.map((s, i) => <p key={i}><b className="mr-1.5">{s.number}</b>{s.title}</p>)}
          </div>
        </Section>
      )}
    </div>
  );
}

function FireAlarmView({ fa, floors }: { fa: NonNullable<AiReport['fire_alarm']>; floors: { name?: string; devices?: AiCount[] }[] }) {
  const [idx, setIdx] = useState(0);
  const f = floors[Math.min(idx, Math.max(0, floors.length - 1))];
  return (
    <div className="space-y-4">
      {fa.summary && <p className="text-sm text-ink">{fa.summary}</p>}
      {floors.length > 1 && (
        <Pills value={String(idx)} options={floors.map((x, i) => ({ id: String(i), label: x.name || `Floor ${i + 1}` }))} onChange={(v) => setIdx(Number(v))} />
      )}
      {f && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(f.devices ?? []).map((dv, i) => (
            <div key={i} className="rounded-xl border border-navy-100 bg-white p-3">
              <p className="text-2xl font-bold tabular-nums">{dv.count ?? '—'}</p>
              <p className="text-xs text-ink-muted">{clean(dv.item)}</p>
            </div>
          ))}
        </div>
      )}
      {(fa.notes?.length ?? 0) > 0 && (
        <Section title="Notes" count={fa.notes!.length}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{fa.notes!.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}

function TradeView({ t }: { t: AiTrade }) {
  return (
    <div className="space-y-4">
      {t.summary && <p className="text-sm text-ink">{t.summary}</p>}
      {(t.equipment?.length ?? 0) > 0 && (
        <div className="divide-y divide-navy-100 rounded-xl border border-navy-100 bg-white">
          {t.equipment!.map((e, i) => (
            <div key={i} className="px-4 py-2.5 text-sm">
              <p className="text-ink"><b className="mr-1.5">{e.tag}</b>{e.description}{e.location ? <span className="text-ink-muted"> · {e.location}</span> : null}</p>
              {e.power && (
                <p className={`mt-0.5 text-xs ${/not shown|no electrical|missing/i.test(e.power) ? 'font-semibold text-red-600' : 'text-ink-muted'}`}>
                  <Zap className="mr-1 inline h-3 w-3" />{e.power}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {(t.items?.length ?? 0) > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{t.items!.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {(t.notes?.length ?? 0) > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">{t.notes!.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </div>
  );
}

// -- questions ------------------------------------------------------------------------

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {children}
      </CardBody>
    </Card>
  );
}

function Questions({ jobSiteId, versionId }: { jobSiteId: string; versionId: string }) {
  const { companyId } = useCompanyContext();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);
  const list = useQuery({
    queryKey: ['plan-ai-questions', versionId],
    queryFn: async (): Promise<QuestionRow[]> => {
      const { data, error } = await supabase
        .from('plan_ai_questions')
        .select('id, question, answer, status, created_at, user:user_id(full_name)')
        .eq('job_site_id', jobSiteId)
        .eq('version_id', versionId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as never;
    },
  });
  const running = (list.data ?? []).filter((x) => x.status === 'running').map((x) => x.id);

  useEffect(() => {
    if (running.length === 0) return;
    const t = setInterval(async () => {
      let changed = false;
      for (const id of running) {
        try {
          const r = await pollAsk(companyId, id);
          if (r.status !== 'running') changed = true;
        } catch { /* next tick */ }
      }
      if (changed) void qc.invalidateQueries({ queryKey: ['plan-ai-questions', versionId] });
    }, 5000);
    return () => clearInterval(t);
  }, [running.join(','), companyId, versionId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const text = q.trim();
    if (!text) return;
    setSending(true);
    try {
      await askAi(companyId, versionId, text);
      setQ('');
      void qc.invalidateQueries({ queryKey: ['plan-ai-questions', versionId] });
    } catch (e) {
      showToast('Could not ask', errorMessage(e, 'Try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Block title="Ask about the plan">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Which rooms need GFCI receptacles? What size is the feeder to panel RLP-1?"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={sending} onClick={send}>Ask</Button>
      </div>
      <div className="space-y-3">
        {(list.data ?? []).map((x) => (
          <div key={x.id} className="rounded-xl border border-navy-100 p-3 text-sm">
            <p className="font-medium text-ink">{x.question}</p>
            <p className="mb-1 text-xs text-ink-subtle">{x.user?.full_name ?? 'Someone'}</p>
            {x.status === 'running' ? (
              <p className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> AI is answering…</p>
            ) : (
              <p className={`whitespace-pre-wrap ${x.status === 'error' ? 'text-red-700' : 'text-ink'}`}>{x.answer}</p>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}
