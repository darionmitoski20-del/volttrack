import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import type { Material, MaterialCategory } from '@/lib/database.types';

/** All materials for the company. */
export function useMaterials(jobSiteId?: string) {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['materials', companyId, jobSiteId],
    queryFn: async (): Promise<(Material & { profile: { full_name: string } })[]> => {
      let q = supabase
        .from('materials')
        .select('*, profile:added_by(full_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (jobSiteId) q = q.eq('job_site_id', jobSiteId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any;
    },
  });
}

/** Material categories for the company. */
export function useMaterialCategories() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['material-categories', companyId],
    queryFn: async (): Promise<MaterialCategory[]> => {
      const { data, error } = await supabase
        .from('material_categories')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

/** Add a new material. */
export function useAddMaterial() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      jobSiteId: string;
      categoryName: string;
      name: string;
      description?: string;
      quantity: number;
      unit: string;
      price?: number;
      photoUrl?: string;
      receiptUrl?: string;
      clockIn: string;
      clockOut?: string;
    }) => {
      const { data, error } = await supabase
        .from('materials')
        .insert([
          {
            company_id: companyId,
            job_site_id: input.jobSiteId,
            added_by: userId,
            category_name: input.categoryName,
            name: input.name,
            description: input.description || null,
            quantity: input.quantity,
            unit: input.unit,
            price: input.price || null,
            photo_url: input.photoUrl || null,
            receipt_url: input.receiptUrl || null,
            clock_in: input.clockIn,
            clock_out: input.clockOut || null,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['materials'] });
    },
  });
}

/** Update a material. */
export function useUpdateMaterial() {
  const qc = useQueryClient();
  const { companyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (input: { id: string; updates: Partial<Material> }) => {
      const { data, error } = await supabase
        .from('materials')
        .update(input.updates)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['materials', companyId] });
    },
  });
}

/** Delete a material. */
export function useDeleteMaterial() {
  const qc = useQueryClient();
  const { companyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (materialId: string) => {
      const { error } = await supabase.from('materials').delete().eq('id', materialId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['materials', companyId] });
    },
  });
}

/** Create or update a material category. */
export function useUpsertMaterialCategory() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (categoryName: string) => {
      const { data, error } = await supabase
        .from('material_categories')
        .upsert([{ company_id: companyId, name: categoryName }], { onConflict: 'company_id,name' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['material-categories', companyId] });
    },
  });
}

/** Get material costs by job site. */
export function useMaterialCostsByJobSite(startDate?: string, endDate?: string) {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['material-costs-by-site', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_material_costs_by_job_site', {
        p_company: companyId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      });
      if (error) throw error;
      return (data || []) as Array<{ job_site_id: string; job_site_name: string; total_cost: number; material_count: number }>;
    },
  });
}

/** Get material costs by employee. */
export function useMaterialCostsByEmployee(startDate?: string, endDate?: string) {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['material-costs-by-employee', companyId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_material_costs_by_employee', {
        p_company: companyId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      });
      if (error) throw error;
      return (data || []) as Array<{ employee_id: string; employee_name: string; total_cost: number; material_count: number }>;
    },
  });
}
