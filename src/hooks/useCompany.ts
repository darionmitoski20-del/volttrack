import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/database.types';
import { useCompanyContext } from './useCompanyContext';

export function useCompany() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['company', companyId],
    queryFn: async (): Promise<Company> => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export interface CompanyUpdate {
  name: string;
  timezone: string;
  address: string | null;
  email?: string | null;
  address_line?: string | null;
  city?: string | null;
  postal_code?: string | null;
  phone: string | null;
  auto_submit_day?: number | null;
  auto_submit_hour?: number | null;
  logo_url?: string | null;
  ot_multiplier?: number;
  overtime_alert_hours?: number;
}

export function useUpdateCompany() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanyUpdate): Promise<Company> => {
      const { data, error } = await supabase
        .from('companies')
        .update(input)
        .eq('id', companyId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

/** Uploads a cropped logo image to the public company-logos bucket, returns its public URL. */
export function useUploadCompanyLogo() {
  const { companyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (file: Blob): Promise<string> => {
      const path = `${companyId}/logo-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from('company-logos')
        .upload(path, file, { contentType: 'image/png', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('company-logos').getPublicUrl(path);
      return data.publicUrl;
    },
  });
}
