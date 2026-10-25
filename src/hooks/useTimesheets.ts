import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TimesheetStatus } from '@/lib/database.types';
import { inclusiveRangeToUtc } from '@/lib/datetime';
import { useCompanyContext } from './useCompanyContext';
import type { TimesheetWithProfile, TimeEntryDetail } from './types';

const ENTRY_SELECT =
  '*, job_site:job_sites(id, name), ' +
  'profile:profiles!time_entries_employee_id_fkey(id, full_name, avatar_url), ' +
  'breaks(id, started_at, ended_at)';

/** Company timesheets (owner view). Optionally filter by status. */
export function useTimesheets(statuses?: TimesheetStatus[]) {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['timesheets', companyId, statuses ?? 'all'],
    queryFn: async (): Promise<TimesheetWithProfile[]> => {
      let q = supabase
        .from('timesheets')
        .select('*, profile:profiles!timesheets_employee_id_fkey(id, full_name, avatar_url)')
        .eq('company_id', companyId)
        .order('week_start', { ascending: false });
      if (statuses && statuses.length) q = q.in('status', statuses);
      const { data, error } = await q.returns<TimesheetWithProfile[]>();
      if (error) throw error;
      return data;
    },
  });
}

/** The current employee's own timesheets. */
export function useMyTimesheets() {
  const { userId } = useCompanyContext();
  return useEmployeeTimesheets(userId);
}

/** A given employee's timesheets (owner viewing an employee's profile). */
export function useEmployeeTimesheets(employeeId: string) {
  return useQuery({
    queryKey: ['my-timesheets', employeeId],
    queryFn: async (): Promise<TimesheetWithProfile[]> => {
      const { data, error } = await supabase
        .from('timesheets')
        .select('*, profile:profiles!timesheets_employee_id_fkey(id, full_name, avatar_url)')
        .eq('employee_id', employeeId)
        .order('week_start', { ascending: false })
        .returns<TimesheetWithProfile[]>();
      if (error) throw error;
      return data;
    },
  });
}

/** Time entries that fall within a timesheet week (for review / detail). */
export function useWeekEntries(employeeId: string, weekStart: string, weekEnd: string) {
  const { companyId, timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['week-entries', companyId, employeeId, weekStart],
    queryFn: async (): Promise<TimeEntryDetail[]> => {
      const { startUtc, endUtcExclusive } = inclusiveRangeToUtc(weekStart, weekEnd, timezone);
      const { data, error } = await supabase
        .from('time_entries')
        .select(ENTRY_SELECT)
        .eq('employee_id', employeeId)
        .gte('clock_in', startUtc)
        .lt('clock_in', endUtcExclusive)
        .order('clock_in', { ascending: true })
        .returns<TimeEntryDetail[]>();
      if (error) throw error;
      return data;
    },
  });
}

function invalidateTimesheets(qc: ReturnType<typeof useQueryClient>, companyId: string, userId: string) {
  void qc.invalidateQueries({ queryKey: ['timesheets', companyId] });
  void qc.invalidateQueries({ queryKey: ['my-timesheets', userId] });
}

/** Ensure a draft timesheet exists for a week and recompute its totals. */
export function useRefreshTimesheet() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; weekStart: string }) => {
      const { data, error } = await supabase.rpc('refresh_timesheet', {
        p_employee: input.employeeId,
        p_week_start: input.weekStart,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTimesheets(qc, companyId, userId),
  });
}

export function useSubmitTimesheet() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; comment?: string | null }) => {
      const { data, error } = await supabase.rpc('submit_timesheet', {
        p_timesheet_id: input.id,
        p_comment: input.comment ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTimesheets(qc, companyId, userId),
  });
}

/** Owner-triggered "please submit your hours now" notification to all employees. */
export function useRequestTimesheetSubmission() {
  const { companyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (message?: string) => {
      const { error } = await supabase.rpc('request_timesheet_submission', {
        p_company: companyId,
        p_message: message ?? null,
      });
      if (error) throw error;
    },
  });
}

export function useReviewTimesheet() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; approve: boolean; comment?: string | null }) => {
      const { data, error } = await supabase.rpc('review_timesheet', {
        p_timesheet_id: input.id,
        p_approve: input.approve,
        p_comment: input.comment ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTimesheets(qc, companyId, userId),
  });
}
