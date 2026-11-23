import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import type { Inspection } from '@/lib/database.types';

export type InspectionRow = Inspection & { job_site: { name: string } | null };

export const INSPECTION_TYPES = [
  'Underground / slab',
  'Rough-in',
  'Above ceiling',
  'Fire alarm',
  'Service / meter release',
  'Low voltage',
  'Final',
  'Other',
];

export const INSPECTION_STATUSES: { id: string; label: string; tone: 'info' | 'success' | 'danger' | 'warning' | 'neutral' }[] = [
  { id: 'scheduled', label: 'Scheduled', tone: 'info' },
  { id: 'passed', label: 'Passed', tone: 'success' },
  { id: 'failed', label: 'Failed', tone: 'danger' },
  { id: 'partial', label: 'Partial / re-inspect', tone: 'warning' },
  { id: 'cancelled', label: 'Cancelled', tone: 'neutral' },
];

/** All inspections of the company, earliest first. */
export function useInspections() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['inspections', companyId],
    queryFn: async (): Promise<InspectionRow[]> => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*, job_site:job_sites(name)')
        .eq('company_id', companyId)
        .order('inspection_date', { ascending: true })
        .order('inspection_time', { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as unknown as InspectionRow[];
    },
  });
}

export interface InspectionInput {
  job_site_id: string;
  type: string;
  inspection_date: string;
  inspection_time: string | null;
  inspector: string | null;
  inspector_phone: string | null;
  status: string;
  notes: string | null;
  assignee_ids: string[];
}

/** Add (no id) or change (id) an inspection. Owner only. */
export function useSaveInspection() {
  const { companyId, userId } = useCompanyContext();
  return useMutation({
    mutationFn: async ({ id, ...input }: InspectionInput & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from('inspections')
          .update({ ...input, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inspections')
          .insert({ ...input, company_id: companyId, created_by: userId });
        if (error) throw error;
      }
    },
  });
}

/** Only change the result (Passed / Failed / Partial…). Owner only. */
export function useSetInspectionStatus() {
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('inspections')
        .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
  });
}

/** Everyone active in the company (owner included), to pick who goes to an inspection. */
export function useCompanyPeople() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['company-people', companyId],
    queryFn: async (): Promise<{ id: string; name: string; role: string }[]> => {
      const { data, error } = await supabase
        .from('company_members')
        .select('user_id, role, profile:profiles!company_members_user_id_fkey(full_name)')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((m) => ({ id: m.user_id, name: m.profile?.full_name || 'Unnamed', role: m.role }));
    },
  });
}

export function useDeleteInspection() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inspections').delete().eq('id', id);
      if (error) throw error;
    },
  });
}
