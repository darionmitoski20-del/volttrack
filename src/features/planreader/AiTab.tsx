import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Trash2 } from 'lucide-react';
import { supabase, errorMessage } from '@/lib/supabase';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import type { PlanAiPage } from '@/lib/database.types';
import { findSchedulePages, openPdf, readPagesWithAi, type AiResult, type PageCandidate } from './ai';

const MAX_PAGES = 6;

function useAiPages(jobSiteId: string, versionId: string) {
  return useQuery({
    queryKey: ['plan-ai', jobSiteId, versionId],
    queryFn: async (): Promise<PlanAiPage[]> => {
      const { data, error } = await supabase
        .from('plan_ai_pages')
        .select('*')
        .eq('job_site_id', jobSiteId)
        .eq('version_id', versionId)
        .order('page', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanAiPage[];
    },
  });
}

export function AiTab({ jobSiteId, versionId, isOwner }: { jobSiteId: string; versionId: string; isOwner: boolean }) {
  const pages = useAiPages(jobSiteId, versionId);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_ai_pages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-ai', jobSiteId, versionId] }),
    onError: (e) => showToast('Could not delete', errorMessage(e, 'Try again.')),
  });

  const list = pages.data ?? [];
  const fixtures = list.flatMap((p) => ((p.result as AiResult).fixtures ?? []).map((f) => ({ ...f, page: p.page })));

  return (
    <div className="space-y-4">
      {isOwner && <AiRunner jobSiteId={jobSiteId} versionId={versionId} onDone={() => qc.invalidateQueries({ queryKey: ['plan-ai', jobSiteId, versionId] })} />}

      {pages.isLoading ? null : list.length === 0 ? (
        <EmptyState
          title="Nothing read yet"
          description={isOwner ? 'Pick the plan PDF above and let AI read the legend, light fixture schedule and panel schedules.' : 'The owner has not run AI reading on this plan yet.'}
        />
      ) : (
        <>
          {fixtures.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="mb-2 font-semibold text-ink">Light fixture schedule</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-ink-muted">
                      <tr><th className="py-1 pr-3">Type</th><th className="pr-3">Description</th><th className="pr-3">Manufacturer / catalog</th><th className="pr-3">Lamp</th><th className="pr-3">Volt / W</th><th className="pr-3">Mounting</th></tr>
                    </thead>
                    <tbody>
                      {fixtures.map((f, i) => (
                        <tr key={i} className="border-t border-navy-100 align-top">
                          <td className="py-1.5 pr-3 font-semibold">{f.type}</td>
                          <td className="pr-3">{f.description}{f.notes ? <span className="block text-xs text-ink-muted">{f.notes}</span> : null}</td>
                          <td className="pr-3">{[f.manufacturer, f.catalog].filter(Boolean).join(' · ')}</td>
                          <td className="pr-3">{f.lamp}</td>
                          <td className="pr-3">{[f.voltage, f.watts].filter(Boolean).join(' / ')}</td>
                          <td className="pr-3">{f.mounting}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}

          {list.map((p) => {
            const r = p.result as AiResult;
            return (
              <Card key={p.id}>
                <CardBody>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink">
                      {r.sheet || p.title} <span className="font-normal text-ink-subtle">· page {p.page}</span>
                    </h3>
                    {isOwner && (
                      <button type="button" aria-label="Delete" className="text-ink-subtle hover:text-red-600" onClick={() => del.mutate(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {(r.legend?.length ?? 0) > 0 && (
                    <div className="mb-3">
                      <h4 className="mb-1 text-sm font-semibold text-ink-muted">Legend</h4>
                      <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                        {r.legend!.map((l, i) => (
                          <li key={i}>{l.tag ? <b className="mr-1.5">{l.tag}</b> : null}{l.description}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(r.panels?.length ?? 0) > 0 && (
                    <div className="mb-3">
                      <h4 className="mb-1 text-sm font-semibold text-ink-muted">Panels</h4>
                      {r.panels!.map((pn, i) => (
                        <details key={i} className="border-t border-navy-100 py-1.5 text-sm">
                          <summary className="cursor-pointer">
                            <b>{pn.name}</b> {[pn.voltage, pn.main, pn.location].filter(Boolean).join(' · ')}
                            <span className="text-ink-subtle"> · {pn.circuits?.length ?? 0} circuits</span>
                          </summary>
                          <table className="mt-1 w-full text-xs">
                            <tbody>
                              {(pn.circuits ?? []).map((c, j) => (
                                <tr key={j} className="border-t border-navy-50"><td className="w-12 py-0.5 font-medium">{c.ckt}</td><td>{c.description}</td><td className="w-16 text-right">{c.breaker}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      ))}
                    </div>
                  )}

                  {(r.fixtures?.length ?? 0) > 0 && (
                    <p className="mb-2 text-sm text-ink-muted">{r.fixtures!.length} fixture types (in the table above)</p>
                  )}

                  {(r.notes?.length ?? 0) > 0 && (
                    <div>
                      <h4 className="mb-1 text-sm font-semibold text-ink-muted">Notes</h4>
                      <ul className="list-disc space-y-0.5 pl-5 text-sm">
                        {r.notes!.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function AiRunner({ jobSiteId, versionId, onDone }: { jobSiteId: string; versionId: string; onDone: () => void }) {
  const { companyId } = useCompanyContext();
  const { showToast } = useToast();
  const [doc, setDoc] = useState<unknown>(null);
  const [cands, setCands] = useState<PageCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<{ m: string; p: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setCands(null);
    setBusy({ m: 'Looking for legend and schedule pages…', p: 0 });
    try {
      const d = await openPdf(file);
      const c = await findSchedulePages(d, (p) => setBusy({ m: 'Looking for legend and schedule pages…', p }));
      setDoc(d);
      setCands(c);
      setPicked(new Set(c.slice(0, MAX_PAGES).map((x) => x.page)));
    } catch (e) {
      setErr(errorMessage(e, 'Could not open the PDF.'));
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!doc || !cands) return;
    setErr(null);
    try {
      const n = await readPagesWithAi({
        doc,
        pages: cands.filter((c) => picked.has(c.page)).sort((a, b) => a.page - b.page),
        companyId,
        jobSiteId,
        versionId,
        onProgress: (m, p) => setBusy({ m, p }),
      });
      showToast('AI reading finished', `${n} page${n === 1 ? '' : 's'}`);
      setCands(null);
      onDone();
    } catch (e) {
      setErr(errorMessage(e, 'AI reading failed.'));
      onDone();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-volt-600" />
          <h3 className="font-semibold text-ink">Read legends and schedules with AI</h3>
        </div>
        <p className="mb-3 text-sm text-ink-muted">
          Pick the same plan PDF. Pages with legends, light fixture schedules and panel schedules are found automatically;
          only the pages you tick are sent to the AI (about 2–5 cents per page).
        </p>
        <input
          type="file"
          accept="application/pdf"
          disabled={!!busy}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:text-sm file:font-medium"
        />

        {cands && (
          <div className="mt-3">
            {cands.length === 0 ? (
              <p className="text-sm text-ink-muted">No legend or schedule pages found in this PDF.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-auto rounded-lg border border-navy-100">
                  {cands.map((c) => (
                    <label key={c.page} className="flex cursor-pointer items-center gap-2 border-b border-navy-50 px-3 py-1.5 text-sm last:border-0">
                      <input
                        type="checkbox"
                        checked={picked.has(c.page)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(c.page);
                            else n.delete(c.page);
                            return n;
                          })
                        }
                      />
                      <span className="w-16 tabular-nums text-ink-muted">Page {c.page}</span>
                      <span className="text-ink">{c.title}</span>
                    </label>
                  ))}
                </div>
                <Button className="mt-3" variant="primary" icon={<Sparkles className="h-4 w-4" />} disabled={picked.size === 0 || !!busy} onClick={run}>
                  Read {picked.size} page{picked.size === 1 ? '' : 's'} with AI
                </Button>
              </>
            )}
          </div>
        )}

        {busy && (
          <div className="mt-3">
            <p className="text-sm text-ink-muted">{busy.m}</p>
            <div className="mt-1 h-2 overflow-hidden rounded bg-navy-100">
              <div className="h-full rounded bg-volt-500 transition-all" style={{ width: `${Math.round(busy.p * 100)}%` }} />
            </div>
          </div>
        )}
        {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      </CardBody>
    </Card>
  );
}
