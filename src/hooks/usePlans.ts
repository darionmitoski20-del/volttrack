import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import type { PlanDrawing, PlanItem, PlanSheet, PlanVersion } from '@/lib/database.types';
import { BUCKET } from '@/features/planreader/service';
import { className } from '@/features/planreader/engine';

export interface WorkState {
  done: boolean;
  by: string;
  byId: string;
  at: string;
}

export interface PlanData {
  version: PlanVersion;
  sheets: PlanSheet[];
  items: PlanItem[];
}

/** All uploaded versions (revisions) of a job site's plan, newest first. */
export function usePlanVersions(jobSiteId: string) {
  return useQuery({
    queryKey: ['plan-versions', jobSiteId],
    queryFn: async (): Promise<(PlanVersion & { profile: { full_name: string } | null })[]> => {
      const { data, error } = await supabase
        .from('plan_versions')
        .select('*, profile:created_by(full_name)')
        .eq('job_site_id', jobSiteId)
        .order('n', { ascending: false });
      if (error) throw error;
      return data as never;
    },
    refetchInterval: (q) => (q.state.data?.some((v) => v.status === 'processing') ? 4000 : false),
  });
}

/** The latest finished version with its sheets and devices. */
export function useCurrentPlan(jobSiteId: string) {
  return useQuery({
    queryKey: ['plan-current', jobSiteId],
    queryFn: async (): Promise<PlanData | null> => {
      const { data: v, error } = await supabase
        .from('plan_versions')
        .select('*')
        .eq('job_site_id', jobSiteId)
        .eq('status', 'done')
        .order('n', { ascending: false })
        .limit(1);
      if (error) throw error;
      const version = v?.[0];
      if (!version) return null;
      const [sheets, items] = await Promise.all([
        supabase.from('plan_sheets').select('*').eq('version_id', version.id).order('level').order('number'),
        fetchAll(version.id),
      ]);
      if (sheets.error) throw sheets.error;
      return { version, sheets: sheets.data ?? [], items };
    },
  });
}

async function fetchAll(versionId: string): Promise<PlanItem[]> {
  const out: PlanItem[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('plan_items')
      .select('id, company_id, job_site_id, version_id, uid, sheet, cls, name, x, y, room, existing, conf, src, grp, dims')
      .eq('version_id', versionId)
      .neq('cls', 'IGN')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as PlanItem[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Latest Done / Not done state per device, with who did it and when. Visible to the whole company. */
export function usePlanWork(jobSiteId: string) {
  return useQuery({
    queryKey: ['plan-work', jobSiteId],
    queryFn: async (): Promise<Map<string, WorkState>> => {
      const m = new Map<string, WorkState>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('plan_work')
          .select('item_uid, done, user_id, created_at, profile:user_id(full_name)')
          .eq('job_site_id', jobSiteId)
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        for (const w of (data ?? []) as unknown as { item_uid: string; done: boolean; user_id: string; created_at: string; profile: { full_name: string } | null }[]) {
          m.set(w.item_uid, { done: w.done, by: w.profile?.full_name ?? '—', byId: w.user_id, at: w.created_at });
        }
        if (!data || data.length < 1000) break;
      }
      return m;
    },
    refetchInterval: 30000,
  });
}

/** Work done on a given day: who completed what. */
export function usePlanDay(jobSiteId: string, day: string) {
  return useQuery({
    queryKey: ['plan-day', jobSiteId, day],
    queryFn: async () => {
      const start = new Date(`${day}T00:00:00`);
      const end = new Date(start.getTime() + 86400000);
      const { data, error } = await supabase
        .from('plan_work')
        .select('item_uid, done, user_id, created_at, profile:user_id(full_name)')
        .eq('job_site_id', jobSiteId)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { item_uid: string; done: boolean; user_id: string; created_at: string; profile: { full_name: string } | null }[];
    },
  });
}

/** Mark devices Done or Not done (always as the signed-in user). */
export function useMarkWork(jobSiteId: string) {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uids, done }: { uids: string[]; done: boolean }) => {
      const rows = uids.map((u) => ({ company_id: companyId, job_site_id: jobSiteId, item_uid: u, done, user_id: userId }));
      for (let i = 0; i < rows.length; i += 400) {
        const { error } = await supabase.from('plan_work').insert(rows.slice(i, i + 400));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-work', jobSiteId] });
      qc.invalidateQueries({ queryKey: ['plan-day', jobSiteId] });
    },
  });
}

/** Owner: add a device the reader missed, by clicking on the plan. */
export function useAddPlanItem(jobSiteId: string) {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { versionId: string; sheet: string; cls: string; x: number; y: number; room: string }) => {
      const { error } = await supabase.from('plan_items').insert({
        company_id: companyId, job_site_id: jobSiteId, version_id: i.versionId,
        uid: crypto.randomUUID().replace(/-/g, '').slice(0, 12), sheet: i.sheet, cls: i.cls, name: className(i.cls),
        x: i.x, y: i.y, room: i.room, existing: false, conf: 1, src: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-current', jobSiteId] }),
  });
}

/** Owner: remove a wrongly detected device. */
export function useDeletePlanItem(jobSiteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_items').update({ cls: 'IGN', name: 'Ignored' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-current', jobSiteId] }),
  });
}

/** Owner: unknown symbols waiting for a name. */
export function useUnknownSymbols(versionId: string | undefined) {
  return useQuery({
    queryKey: ['plan-unknown', versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_items')
        .select('id, sheet, room, crop, grp, dims, feat')
        .eq('version_id', versionId!)
        .eq('cls', 'UNKNOWN');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Owner: name an unknown symbol. The reader remembers it for every future plan of the company. */
export function useTeachSymbol(jobSiteId: string) {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { id: string; cls: string; grp: string | null; dims: number[] | null; feat: string | null }) => {
      if (i.cls === 'IGN') {
        const { error } = await supabase.from('plan_items').update({ cls: 'IGN', name: 'Ignored' }).eq('id', i.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('plan_items').update({ cls: i.cls, name: className(i.cls), conf: 1 }).eq('id', i.id);
      if (error) throw error;
      if (i.grp && i.dims && i.feat) {
        const r = await supabase.from('plan_symbols').insert({ company_id: companyId, grp: i.grp, cls: i.cls, dims: i.dims, feat: i.feat, created_by: userId });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-current', jobSiteId] });
      qc.invalidateQueries({ queryKey: ['plan-unknown'] });
    },
  });
}

/** Signed URLs for the sheet images (private bucket). */
export function useSheetImages(sheets: PlanSheet[] | undefined) {
  const paths = (sheets ?? []).map((s) => s.image_path).filter((p): p is string => !!p);
  return useQuery({
    queryKey: ['plan-images', paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
  });
}

/** Signed URL to open the original PDF (details, sections, notes). */
export async function planPdfUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Hand-drawn routes on a job site's plan sheets (kept across revisions). */
export function usePlanDrawings(jobSiteId: string) {
  return useQuery({
    queryKey: ['plan-drawings', jobSiteId],
    queryFn: async (): Promise<PlanDrawing[]> => {
      const { data, error } = await supabase
        .from('plan_drawings')
        .select('*')
        .eq('job_site_id', jobSiteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanDrawing[];
    },
  });
}

/** Owner: save one drawn line. */
export function useAddDrawing(jobSiteId: string) {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { sheet: string; points: number[]; color: string; width: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('plan_drawings')
        .insert({ company_id: companyId, job_site_id: jobSiteId, sheet: d.sheet, points: d.points, color: d.color, width: d.width, created_by: u.user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      return data as PlanDrawing;
    },
    onSuccess: (row) => qc.setQueryData<PlanDrawing[]>(['plan-drawings', jobSiteId], (old) => [...(old ?? []), row]),
  });
}

/** Owner: delete a drawn line. */
export function useDeleteDrawing(jobSiteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_drawings').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => qc.setQueryData<PlanDrawing[]>(['plan-drawings', jobSiteId], (old) => (old ?? []).filter((d) => d.id !== id)),
  });
}
