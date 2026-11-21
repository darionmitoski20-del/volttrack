// AI reading of legend / schedule pages (Claude via the "plan-ai" edge function).
// The PDF is opened in the browser; only the chosen pages are sent, as image tiles.
import { supabase } from '@/lib/supabase';
import { loadPdfjs } from './pdfjs';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AiFixture { type?: string; description?: string; manufacturer?: string; catalog?: string; lamp?: string; voltage?: string; watts?: string; mounting?: string; notes?: string }
export interface AiLegend { tag?: string; description?: string }
export interface AiPanel { name?: string; voltage?: string; main?: string; location?: string; circuits?: { ckt?: string; description?: string; breaker?: string }[] }
export interface AiResult { sheet?: string; legend?: AiLegend[]; fixtures?: AiFixture[]; panels?: AiPanel[]; notes?: string[] }

export interface PageCandidate { page: number; title: string; score: number }

const KEYWORDS = ['SCHEDULE', 'LEGEND', 'SYMBOL', 'ABBREVIATION', 'LUMINAIRE', 'FIXTURE', 'PANEL', 'GENERAL NOTES', 'RISER', 'ONE-LINE', 'ONE LINE'];
const SHEET_RE = /\b(?:E|EL|ES|EP|FA|T|TC|LV)\d{0,2}[.-]\d{1,3}[A-Z]?\b/;

export async function openPdf(file: File): Promise<any> {
  const pdfjs: any = await loadPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** Pages that look like legends / schedules, best first. */
export async function findSchedulePages(doc: any, onProgress?: (p: number) => void): Promise<PageCandidate[]> {
  const out: PageCandidate[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map((i: any) => i.str || '').join(' ').toUpperCase();
    page.cleanup();
    let score = 0;
    for (const k of KEYWORDS) if (text.includes(k)) score += k === 'SCHEDULE' || k === 'LEGEND' ? 2 : 1;
    const isPlan = /\bFLOOR\s+(POWER|LIGHTING|FIRE ALARM|LOW VOLTAGE)\s+PLAN\b/.test(text);
    if (isPlan) score -= 2;
    if (score >= 2) {
      const sheet = text.match(SHEET_RE)?.[0] ?? '';
      const kinds = KEYWORDS.filter((k) => text.includes(k)).slice(0, 3).join(', ').toLowerCase();
      out.push({ page: p, title: [sheet, kinds].filter(Boolean).join(' · '), score });
    }
    onProgress?.(p / doc.numPages);
  }
  return out.sort((a, b) => b.score - a.score || a.page - b.page);
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Renders one page and cuts it into overlapping JPEG tiles (small text must stay readable). */
async function pageTiles(doc: any, p: number): Promise<string[]> {
  const page = await doc.getPage(p);
  const vp1 = page.getViewport({ scale: 1 });
  const long = Math.max(vp1.width, vp1.height);
  const vp = page.getViewport({ scale: 4200 / long });
  const W = Math.floor(vp.width), H = Math.floor(vp.height);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  page.cleanup();

  const cols = W >= H ? 3 : 2, rows = W >= H ? 2 : 3, pad = 60;
  const tw = Math.ceil(W / cols), th = Math.ceil(H / rows);
  const tiles: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.max(0, c * tw - pad), y0 = Math.max(0, r * th - pad);
      const x1 = Math.min(W, (c + 1) * tw + pad), y1 = Math.min(H, (r + 1) * th + pad);
      const t = document.createElement('canvas');
      t.width = x1 - x0;
      t.height = y1 - y0;
      t.getContext('2d')!.drawImage(canvas, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
      const blob: Blob = await new Promise((res, rej) => t.toBlob((b) => (b ? res(b) : rej(new Error('Could not render page'))), 'image/jpeg', 0.82));
      tiles.push(await blobToBase64(blob));
      t.width = t.height = 0;
    }
  }
  canvas.width = canvas.height = 0;
  return tiles;
}

/** Sends the chosen pages to the AI one by one and stores each result. */
export async function readPagesWithAi(opts: {
  doc: any;
  pages: PageCandidate[];
  companyId: string;
  jobSiteId: string;
  versionId: string;
  onProgress: (msg: string, frac: number) => void;
}): Promise<number> {
  const { doc, pages, companyId, jobSiteId, versionId, onProgress } = opts;
  const { data: u } = await supabase.auth.getUser();
  let saved = 0;
  for (let i = 0; i < pages.length; i++) {
    const pc = pages[i]!;
    onProgress(`Page ${pc.page}: preparing`, i / pages.length);
    const images = await pageTiles(doc, pc.page);
    onProgress(`Page ${pc.page}: AI is reading (about 30–60 s)`, (i + 0.3) / pages.length);
    const { data, error } = await supabase.functions.invoke('plan-ai', { body: { company_id: companyId, images } });
    if (error) {
      let msg = error.message;
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* keep message */ }
      throw new Error(msg);
    }
    const result = (data?.result ?? {}) as AiResult;
    const { error: insErr } = await supabase.from('plan_ai_pages').insert({
      company_id: companyId,
      job_site_id: jobSiteId,
      version_id: versionId,
      page: pc.page,
      title: result.sheet || pc.title,
      result,
      created_by: u.user?.id ?? null,
    } as never);
    if (insErr) throw insErr;
    saved++;
  }
  onProgress('Done', 1);
  return saved;
}

// ---- Whole-plan report (background AI job) ------------------------------------------

export interface AiCount { item?: string; count?: number | null; category?: string }
export interface AiFloor { name?: string; totals?: AiCount[]; rooms?: { room?: string; items?: AiCount[] }[] }
export interface AiLight { type?: string; description?: string; manufacturer?: string; catalog?: string; watts?: string; mounting?: string; count?: number | null; emergency_count?: number | null }
export interface AiPanelFull { name?: string; status?: string; voltage?: string; main?: string; location?: string; fed_from?: string; feeder?: string; circuits?: { ckt?: string; description?: string; breaker?: string; wire?: string }[] }
export interface AiMaterial { category?: string; item?: string; quantity?: number | string | null; unit?: string; basis?: string }
export interface AiTrade {
  name?: string;
  summary?: string;
  items?: string[];
  equipment?: { tag?: string; description?: string; location?: string; power?: string }[];
  notes?: string[];
}
export interface AiReport {
  model?: string;
  project?: { name?: string; address?: string; owner?: string; architect?: string; engineer?: string; issue_date?: string } | string;
  scope?: string;
  sheets?: { number?: string; title?: string; discipline?: string }[];
  electrical?: { floors?: AiFloor[]; lighting?: AiLight[]; panels?: AiPanelFull[]; materials?: AiMaterial[]; demolition?: string[] };
  fire_alarm?: { summary?: string; floors?: { name?: string; devices?: AiCount[] }[]; devices?: AiCount[]; notes?: string[] };
  other_trades?: AiTrade[];
  risks?: string[];
  rfi?: string[];
  changes?: string[];
  // older report shape (read before the electrical/other_trades split)
  disciplines?: AiTrade[];
  floors?: AiFloor[];
  lighting?: AiLight[];
  panels?: AiPanelFull[];
  materials?: AiMaterial[];
  demolition?: string[];
}

async function callAi(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('plan-ai', { body });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as any).context?.json?.();
      if (b?.error) msg = b.error;
    } catch { /* keep message */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Starts the AI report for a plan version. The server sends the stored PDF; the text is a fallback for big PDFs. */
export async function startAiReport(opts: { companyId: string; versionId: string; doc?: any; onProgress?: (m: string, p: number) => void }) {
  let text = '';
  if (opts.doc) text = await planText(opts.doc, (p) => opts.onProgress?.('Preparing the plan for AI…', p));
  opts.onProgress?.('Sending the plan to AI…', 1);
  return callAi({ action: 'start', company_id: opts.companyId, version_id: opts.versionId, text });
}

export const pollAiReport = (companyId: string, versionId: string) =>
  callAi({ action: 'poll', company_id: companyId, version_id: versionId }) as Promise<{ status: string; error?: string }>;

export const askAi = (companyId: string, versionId: string, question: string) =>
  callAi({ action: 'ask', company_id: companyId, version_id: versionId, question }) as Promise<{ id: string; status: string }>;

export const pollAsk = (companyId: string, questionId: string) =>
  callAi({ action: 'poll_ask', company_id: companyId, question_id: questionId }) as Promise<{ status: string }>;

/** Text of every page (lines in reading order) plus counts of short tags per page. */
export async function planText(doc: any, onProgress?: (p: number) => void): Promise<string> {
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    page.cleanup();
    const rows = new Map<number, { x: number; s: string }[]>();
    const tags = new Map<string, number>();
    for (const it of tc.items as any[]) {
      const s = String(it.str || '').trim();
      if (!s) continue;
      const t = it.transform || [0, 0, 0, 0, 0, 0];
      const y = Math.round(t[5] / 4);
      const row = rows.get(y) ?? [];
      row.push({ x: t[4], s });
      rows.set(y, row);
      for (const w of s.split(/\s+/)) {
        if (/^[A-Z]{1,3}\d{0,2}$/.test(w) && w.length <= 4) tags.set(w, (tags.get(w) ?? 0) + 1);
      }
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map((w) => w.s).join(' '));
    const top = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}:${v}`).join(' ');
    parts.push(`\n##### PAGE ${p} #####\nTAG COUNTS: ${top}\n${lines.join('\n').slice(0, 45000)}`);
    onProgress?.(p / doc.numPages);
  }
  return parts.join('\n');
}
