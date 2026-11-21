import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, RefreshCw, Send, Copy, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase, errorMessage } from '@/lib/supabase';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/Toast';
import { askAi, pollAiReport, pollAsk, startAiReport, type AiCount, type AiReport } from './ai';

interface ReportRow { status: string; error: string | null; result: AiReport; updated_at: string }
interface QuestionRow { id: string; question: string; answer: string | null; status: string; created_at: string; user: { full_name: string } | null }

function useReportRow(jobSiteId: string, versionId: string) {
  return useQuery({
    queryKey: ['plan-ai-report', versionId],
    queryFn: async (): Promise<ReportRow | null> => {
      const { data, error } = await supabase
        .from('plan_ai_pages')
        .select('status, error, result, updated_at')
        .eq('job_site_id', jobSiteId)
        .eq('version_id', versionId)
        .eq('page', 0)
        .maybeSingle();
      if (error) throw error;
      return (data as ReportRow | null) ?? null;
    },
  });
}

/** The AI report of a plan version: starts, waits for, and shows it, with questions below. */
export function AiReportPanel({ jobSiteId, versionId, isOwner }: { jobSiteId: string; versionId: string; isOwner: boolean }) {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const row = useReportRow(jobSiteId, versionId);
  const [starting, setStarting] = useState(false);
  const status = row.data?.status;

  // While the AI works in the background, ask the server every 8 s whether it is done.
  useEffect(() => {
    if (status !== 'running') return;
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
  }, [status, companyId, versionId, qc]);

  const start = async () => {
    setStarting(true);
    try {
      await startAiReport({ companyId, versionId });
      void qc.invalidateQueries({ queryKey: ['plan-ai-report', versionId] });
    } catch (e) {
      showToast('AI could not start', errorMessage(e, 'Try again.'));
    } finally {
      setStarting(false);
    }
  };

  if (row.isLoading) return null;

  if (!row.data) {
    if (!isOwner) return null;
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-volt-600" />
            <p className="text-sm text-ink">AI has not read this plan yet.</p>
          </div>
          <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} loading={starting} onClick={start}>Read the plan with AI</Button>
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
    return (
      <Card className="border-red-200">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-700">AI reading failed: {row.data.error ?? 'unknown error'}</p>
          {isOwner && <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={starting} onClick={start}>Try again</Button>}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {row.data.error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{row.data.error}</p>}
      <ReportView r={row.data.result} isOwner={isOwner} onRerun={start} rerunning={starting} />
      <Questions jobSiteId={jobSiteId} versionId={versionId} />
    </div>
  );
}

// -- report ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['Lighting', 'Switches & controls', 'Receptacles', 'Data & low voltage', 'Fire alarm', 'Equipment & connections', 'Other'];

function List({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

function Block({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'amber' }) {
  return (
    <Card className={tone === 'amber' ? 'border-amber-300 bg-amber-50/40' : undefined}>
      <CardBody className="space-y-3">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {children}
      </CardBody>
    </Card>
  );
}

function sum(items?: AiCount[]) {
  return (items ?? []).reduce((a, b) => a + (typeof b.count === 'number' ? b.count : 0), 0);
}

function ReportView({ r, isOwner, onRerun, rerunning }: { r: AiReport; isOwner: boolean; onRerun: () => void; rerunning: boolean }) {
  const { showToast } = useToast();
  const floors = r.floors ?? [];
  const [floorIdx, setFloorIdx] = useState(0);
  const floor = floors[Math.min(floorIdx, Math.max(0, floors.length - 1))];
  const byCategory = useMemo(() => {
    const m = new Map<string, AiCount[]>();
    for (const t of floor?.totals ?? []) {
      const k = t.category || 'Other';
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]), ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [floor]);
  const project = typeof r.project === 'string' ? { name: r.project } : r.project ?? {};
  const materialsByCat = useMemo(() => {
    const m = new Map<string, NonNullable<AiReport['materials']>>();
    for (const x of r.materials ?? []) m.set(x.category || 'Other', [...(m.get(x.category || 'Other') ?? []), x]);
    return [...m.entries()];
  }, [r.materials]);

  return (
    <div className="space-y-4">
      <Card className="border-volt-300">
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-volt-600" />
              <h2 className="text-lg font-semibold text-ink">{project.name || 'Plan report'}</h2>
            </div>
            {isOwner && (
              <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} loading={rerunning} onClick={onRerun}>Read again</Button>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {[project.address, project.owner, project.architect && `Architect: ${project.architect}`, project.engineer && `Engineer: ${project.engineer}`, project.issue_date]
              .filter(Boolean).join(' · ')}
          </p>
          {r.scope && <p className="text-sm text-ink">{r.scope}</p>}
          <p className="text-xs text-ink-subtle">Read by AI{r.model ? ` (${r.model})` : ''} — check quantities on the drawings before ordering.</p>
        </CardBody>
      </Card>

      {(r.changes?.length ?? 0) > 0 && (
        <Block title="Changes from the previous version" tone="amber"><List items={r.changes} /></Block>
      )}

      {floors.length > 0 && (
        <Block title="Devices by floor">
          {floors.length > 1 && (
            <Select aria-label="Floor" value={String(floorIdx)} onChange={(e) => setFloorIdx(Number(e.target.value))} className="max-w-xs">
              {floors.map((f, i) => <option key={i} value={i}>{f.name || `Floor ${i + 1}`} — {sum(f.totals)} items</option>)}
            </Select>
          )}
          {floors.length === 1 && <p className="text-sm font-medium text-ink">{floor?.name}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byCategory.map(([cat, items]) => (
              <div key={cat} className="rounded-xl border border-navy-100 bg-white p-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-ink">{cat}</p>
                  <p className="text-lg font-bold tabular-nums text-ink">{sum(items)}</p>
                </div>
                {items.map((t, i) => (
                  <div key={i} className="flex justify-between gap-2 text-sm">
                    <span className="text-ink-muted">{t.item}</span>
                    <span className="tabular-nums text-ink">{t.count ?? '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {(floor?.rooms?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold text-ink">Rooms</p>
              <div className="divide-y divide-navy-100 rounded-xl border border-navy-100">
                {floor!.rooms!.map((room, i) => (
                  <details key={i} className="px-3 py-2 text-sm">
                    <summary className="flex cursor-pointer justify-between gap-2">
                      <span className="font-medium text-ink">{room.room}</span>
                      <span className="tabular-nums text-ink-muted">{sum(room.items)} items</span>
                    </summary>
                    <div className="mt-1 space-y-0.5 pl-4">
                      {(room.items ?? []).map((it, j) => (
                        <div key={j} className="flex justify-between gap-2"><span className="text-ink-muted">{it.item}</span><span className="tabular-nums">{it.count ?? '—'}</span></div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </Block>
      )}

      {(r.disciplines?.length ?? 0) > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {r.disciplines!.map((d, i) => (
            <Block key={i} title={d.name || 'Discipline'}>
              {d.summary && <p className="text-sm text-ink-muted">{d.summary}</p>}
              <List items={d.items} />
            </Block>
          ))}
        </div>
      )}

      {(r.lighting?.length ?? 0) > 0 && (
        <Block title="Light fixtures">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-muted">
                <tr><th className="py-1 pr-3">Type</th><th className="pr-3">Description</th><th className="pr-3">Manufacturer / catalog</th><th className="pr-3">W</th><th className="pr-3">Mounting</th><th className="pr-3 text-right">Count</th><th className="text-right">EM</th></tr>
              </thead>
              <tbody>
                {r.lighting!.map((f, i) => (
                  <tr key={i} className="border-t border-navy-100 align-top">
                    <td className="py-1.5 pr-3 font-semibold">{f.type}</td>
                    <td className="pr-3">{f.description}</td>
                    <td className="pr-3">{[f.manufacturer, f.catalog].filter(Boolean).join(' · ')}</td>
                    <td className="pr-3">{f.watts}</td>
                    <td className="pr-3">{f.mounting}</td>
                    <td className="pr-3 text-right tabular-nums">{f.count ?? '—'}</td>
                    <td className="text-right tabular-nums">{f.emergency_count || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      {(r.panels?.length ?? 0) > 0 && (
        <Block title="Panels and circuits">
          {r.panels!.map((p, i) => (
            <details key={i} className="rounded-xl border border-navy-100 px-3 py-2 text-sm" open={i === 0}>
              <summary className="cursor-pointer">
                <b>{p.name}</b>{p.status ? <span className="ml-2 rounded bg-navy-50 px-1.5 py-0.5 text-xs">{p.status}</span> : null}
                <span className="ml-2 text-ink-muted">{[p.voltage, p.main, p.location, p.fed_from && `fed from ${p.fed_from}`, p.feeder].filter(Boolean).join(' · ')}</span>
                <span className="ml-2 text-ink-subtle">· {p.circuits?.length ?? 0} circuits</span>
              </summary>
              {(p.circuits?.length ?? 0) > 0 && (
                <table className="mt-2 w-full text-xs">
                  <thead className="text-ink-muted"><tr><th className="py-0.5 text-left">Ckt</th><th className="text-left">Load</th><th className="text-left">Breaker</th><th className="text-left">Wire</th></tr></thead>
                  <tbody>
                    {p.circuits!.map((c, j) => (
                      <tr key={j} className="border-t border-navy-50"><td className="w-12 py-0.5 font-medium">{c.ckt}</td><td>{c.description}</td><td className="w-20">{c.breaker}</td><td className="w-28">{c.wire}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </details>
          ))}
        </Block>
      )}

      {r.fire_alarm && (r.fire_alarm.summary || (r.fire_alarm.devices?.length ?? 0) > 0) && (
        <Block title="Fire alarm">
          {r.fire_alarm.summary && <p className="text-sm text-ink-muted">{r.fire_alarm.summary}</p>}
          <div className="grid gap-x-6 text-sm sm:grid-cols-2">
            {(r.fire_alarm.devices ?? []).map((d, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-navy-50 py-1"><span>{d.item}</span><span className="font-semibold tabular-nums">{d.count ?? '—'}</span></div>
            ))}
          </div>
          <List items={r.fire_alarm.notes} />
        </Block>
      )}

      {materialsByCat.length > 0 && (
        <Block title="Materials (take-off)">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-muted"><tr><th className="py-1 pr-3">Item</th><th className="pr-3 text-right">Qty</th><th className="pr-3">Unit</th><th>Basis</th></tr></thead>
              <tbody>
                {materialsByCat.map(([cat, items]) => (
                  <Fragment key={cat}>
                    <tr><td colSpan={4} className="pt-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{cat}</td></tr>
                    {items.map((m, i) => (
                      <tr key={`${cat}-${i}`} className="border-t border-navy-100 align-top">
                        <td className="py-1.5 pr-3">{m.item}</td>
                        <td className="pr-3 text-right tabular-nums">{m.quantity ?? '—'}</td>
                        <td className="pr-3">{m.unit}</td>
                        <td className="text-xs text-ink-muted">{m.basis}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      {(r.demolition?.length ?? 0) > 0 && <Block title="Demolition"><List items={r.demolition} /></Block>}

      {(r.risks?.length ?? 0) > 0 && (
        <Block title="Risks — watch out">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><List items={r.risks} /></div>
        </Block>
      )}

      {(r.rfi?.length ?? 0) > 0 && (
        <Block title="RFI questions for the architect / engineer">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">{r.rfi!.map((q, i) => <li key={i}>{q}</li>)}</ol>
          <Button
            size="sm"
            variant="secondary"
            icon={<Copy className="h-4 w-4" />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(r.rfi!.map((q, i) => `${i + 1}. ${q}`).join('\n'));
                showToast('Copied', 'Paste the RFI questions into an email');
              } catch {
                showToast('Could not copy', 'Select the text and copy it by hand');
              }
            }}
          >
            Copy all
          </Button>
        </Block>
      )}

      {(r.sheets?.length ?? 0) > 0 && (
        <Block title="Sheets">
          <div className="grid gap-x-6 text-sm sm:grid-cols-2">
            {r.sheets!.map((s, i) => <p key={i}><b className="mr-1.5">{s.number}</b>{s.title}{s.discipline ? <span className="text-ink-subtle"> · {s.discipline}</span> : null}</p>)}
          </div>
        </Block>
      )}
    </div>
  );
}

// -- questions ------------------------------------------------------------------------

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
