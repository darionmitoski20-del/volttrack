import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { JobSite } from '@/lib/database.types';
import { useCompanyContext } from './useCompanyContext';
import type { AssignmentWithProfile } from './types';

export function useAssignments(jobSiteId: string) {
  return useQuery({
    queryKey: ['assignments', jobSiteId],
    queryFn: async (): Promise<AssignmentWithProfile[]> => {
      const { data, error } = await supabase
        .from('job_site_assignments')
        .select('*, profile:profiles!job_site_assignments_employee_id_fkey(id, full_name, avatar_url)')
        .eq('job_site_id', jobSiteId)
        .order('assigned_at', { ascending: true })
        .returns<AssignmentWithProfile[]>();
      if (error) throw error;
      return data;
    },
  });
}

/** Job sites the current employee is assigned to (their clock-in options). */
export function useMyAssignedSites() {
  const { userId } = useCompanyContext();
  return useEmployeeAssignedSites(userId);
}

/** Job sites a given employee is assigned to (owner viewing an employee's profile). */
export function useEmployeeAssignedSites(employeeId: string) {
  return useQuery({
    queryKey: ['my-assigned-sites', employeeId],
    queryFn: async (): Promise<JobSite[]> => {
      const { data, error } = await supabase
        .from('job_site_assignments')
        .select('job_sites(*)')
        .eq('employee_id', employeeId)
        .returns<{ job_sites: JobSite }[]>();
      if (error) throw error;
      return data.map((r) => r.job_sites).filter((s): s is JobSite => Boolean(s));
    },
  });
}

export function useAssignEmployee(jobSiteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.rpc('assign_employee', {
        p_job_site_id: jobSiteId,
        p_employee_id: employeeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments', jobSiteId] });
      void qc.invalidateQueries({ queryKey: ['my-assigned-sites'] });
    },
  });
}

export function useUnassignEmployee(jobSiteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.rpc('unassign_employee', { p_assignment_id: assignmentId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments', jobSiteId] });
      void qc.invalidateQueries({ queryKey: ['my-assigned-sites'] });
    },
  });
}
