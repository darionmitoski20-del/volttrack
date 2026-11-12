import { supabase } from '@/lib/supabase';
import type { PlanDiff, PlanDiffRow, PlanItem, PlanVersion } from '@/lib/database.types';
import { readPlan, Library, type EngineItem, type LibraryJson } from './engine';
import baseLibrary from './library.json';
import { loadPdfjs } from './pdfjs';

export const BUCKET = 'plans';

/** Built-in symbols plus the ones this company taught the reader. */
export async function companyLibrary(companyId: string): Promise<Library> {
  const lib = new Library(structuredClone(baseLibrary) as LibraryJson);
  const { data } = await supabase.from('plan_symbols').select('grp, cls, dims, feat').eq('company_id', companyId);
  for (const s of data ?? []) lib.add(s.grp, [s.cls], s.dims, s.feat);
  return lib;
}

function newUid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function summarize(list: { sheet: string; room: string; name: string; cls: string }[]): PlanDiffRow[] {
  const m = new Map<string, PlanDiffRow>();
  for (const x of list) {
    if (x.cls === 'UNKNOWN') continue;
    const k = `${x.sheet}|${x.room}|${x.name}`;
    const r = m.get(k) ?? { sheet: x.sheet, room: x.room, name: x.name, n: 0 };
    r.n++;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => a.sheet.localeCompare(b.sheet) || a.room.localeCompare(b.room));
}

/** uid -> latest Done/Not done state for a job site. */
export async function latestWork(jobSiteId: string) {
  const { data, error } = await supabase
    .from('plan_work')
    .select('item_uid, done, created_at')
    .eq('job_site_id', jobSiteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const m = new Map<string, boolean>();
  for (const w of data ?? []) m.set(w.item_uid, w.done);
  return m;
}

async function insertBatches<T extends object>(table: 'plan_items' | 'plan_sheets', rows: T[]) {
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 400) as never);
    if (error) throw error;
  }
}

/**
 * Reads a plan PDF in the browser and saves it as a new version of the job site's plan.
 * Devices that are still in the same place keep their uid, so work marked on the previous
 * version stays. Devices that were removed but already done are reported to the owner.
 */
export async function uploadPlan(opts: {
  file: File;
  jobSiteId: string;
  companyId: string;
  userId: string;
  onProgress: (message: string, percent: number) => void;
}): Promise<PlanVersion> {
  const { file, jobSiteId, companyId, userId, onProgress } = opts;

  const { data: last } = await supabase
    .from('plan_versions')
    .select('n')
    .eq('job_site_id', jobSiteId)
    .order('n', { ascending: false })
    .limit(1);
  const n = (last?.[0]?.n ?? 0) + 1;
  const base = `${companyId}/${jobSiteId}/v${n}`;

  const { data: version, error: vErr } = await supabase
    .from('plan_versions')
    .insert({ company_id: companyId, job_site_id: jobSiteId, n, file_name: file.name, created_by: userId, status: 'processing' })
    .select()
    .single();
  if (vErr) throw vErr;

  try {
    onProgress('Uploading PDF…', 1);
    const pdfPath = `${base}/plan.pdf`;
    const up = await supabase.storage.from(BUCKET).upload(pdfPath, file, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw up.error;

    onProgress('Loading the PDF reader…', 2);
    const [pdfjs, lib, bytes] = await Promise.all([loadPdfjs(), companyLibrary(companyId), file.arrayBuffer()]);
    const result = await readPlan(pdfjs, new Uint8Array(bytes), lib, (m, p) => onProgress(m, 2 + p * 0.85));

    onProgress('Saving sheet images…', 88);
    const sheetRows = [];
    for (const sh of result.sheets) {
      const path = `${base}/sheet-${sh.number.replace(/[^\w.-]/g, '_')}.jpg`;
      const r = await supabase.storage.from(BUCKET).upload(path, sh.image, { contentType: 'image/jpeg', upsert: true });
      if (r.error) throw r.error;
      sheetRows.push({
        company_id: companyId, version_id: version.id, page: sh.page, number: sh.number, title: sh.title,
        discipline: sh.discipline, floor: sh.floor, level: sh.level, width: sh.width, height: sh.height,
        image_path: path, offset_x: sh.offset[0], offset_y: sh.offset[1],
      });
    }

    onProgress('Comparing with the previous version…', 93);
    const { data: prevV } = await supabase
      .from('plan_versions')
      .select('id, n')
      .eq('job_site_id', jobSiteId)
      .eq('status', 'done')
      .neq('id', version.id)
      .order('n', { ascending: false })
      .limit(1);
    const prev = prevV?.[0] ?? null;
    let old: PlanItem[] = [];
    if (prev) {
      const { data, error } = await supabase.from('plan_items').select('*').eq('version_id', prev.id);
      if (error) throw error;
      old = data ?? [];
    }
    // match: same sheet + same type + within 15pt -> same uid (keeps the work)
    const used = new Set<string>();
    const added: EngineItem[] = [];
    const uids = result.items.map((it) => {
      let best: PlanItem | null = null;
      let bd = 15;
      for (const o of old) {
        if (used.has(o.id) || o.sheet !== it.sheet || o.cls !== it.cls || o.src === 'manual') continue;
        const d = Math.hypot(o.x - it.x, o.y - it.y);
        if (d < bd) { best = o; bd = d; }
      }
      if (best) { used.add(best.id); return best.uid; }
      added.push(it);
      return newUid();
    });
    // devices added by hand on the previous version are carried over as they are
    const manual = old.filter((o) => o.src === 'manual');
    const removed = old.filter((o) => !used.has(o.id) && o.src !== 'manual');
    const work = prev ? await latestWork(jobSiteId) : new Map<string, boolean>();
    const diff: PlanDiff = {
      prev: prev?.n ?? null,
      matched: used.size,
      added: summarize(added),
      removed: summarize(removed),
      removed_done: summarize(removed.filter((r) => work.get(r.uid) === true)),
    };

    onProgress('Saving devices…', 95);
    await insertBatches('plan_sheets', sheetRows);
    const itemRows = [
      ...result.items.map((it, i) => ({
        company_id: companyId, job_site_id: jobSiteId, version_id: version.id, uid: uids[i]!,
        sheet: it.sheet, cls: it.cls, name: it.name, x: Math.round(it.x * 10) / 10, y: Math.round(it.y * 10) / 10,
        room: it.room, existing: it.existing, conf: it.conf, src: it.src,
        grp: it.group ?? null, dims: it.dims ?? null, feat: it.feat ?? null, crop: it.crop ?? null,
      })),
      ...manual.map(({ id: _id, version_id: _v, ...m }) => ({ ...m, version_id: version.id })),
    ];
    await insertBatches('plan_items', itemRows);

    const { data: done, error: dErr } = await supabase
      .from('plan_versions')
      .update({ status: 'done', sheet_count: sheetRows.length, item_count: itemRows.length, diff, pdf_path: pdfPath })
      .eq('id', version.id)
      .select()
      .single();
    if (dErr) throw dErr;
    onProgress('Done', 100);
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from('plan_versions').update({ status: 'error', error: msg }).eq('id', version.id);
    throw e;
  }
}
