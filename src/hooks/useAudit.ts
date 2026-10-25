import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import type { AuditWithActor } from './types';

export interface AuditFilters {
  actorId?: string;
  action?: string;
  entityType?: string;
  startKey?: string; // yyyy-mm-dd, inclusive, local date
  endKey?: string; // yyyy-mm-dd, inclusive, local date
}

export function useAudit(limit = 50, filters: AuditFilters = {}) {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['audit', companyId, limit, filters],
    queryFn: async (): Promise<AuditWithActor[]> => {
      let q = supabase
        .from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_id_fkey(id, full_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filters.actorId) q = q.eq('actor_id', filters.actorId);
      if (filters.action) q = q.eq('action', filters.action);
      if (filters.entityType) q = q.eq('entity_type', filters.entityType);
      if (filters.startKey) {
        q = q.gte('created_at', new Date(`${filters.startKey}T00:00:00`).toISOString());
      }
      if (filters.endKey) {
        const end = new Date(`${filters.endKey}T00:00:00`);
        end.setDate(end.getDate() + 1);
        q = q.lt('created_at', end.toISOString());
      }

      const { data, error } = await q.returns<AuditWithActor[]>();
      if (error) throw error;
      return data;
    },
  });
}

const ACTION_LABELS: Record<string, string> = {
  'company.created': 'created the company',
  'job_site.created': 'created a job site',
  'job_site.updated': 'updated a job site',
  'employee.activated': 'activated an employee',
  'employee.deactivated': 'deactivated an employee',
  'invitation.created': 'invited an employee',
  'invitation.accepted': 'accepted an invitation',
  'invitation.revoked': 'revoked an invitation',
  'invitation.resent': 'resent an invitation',
  'assignment.created': 'assigned an employee',
  'assignment.removed': 'removed an assignment',
  'time_entry.clock_in': 'clocked in',
  'time_entry.clock_out': 'clocked out',
  'time_entry.edited': 'edited a time entry',
  'break.started': 'started a break',
  'break.ended': 'ended a break',
  'timesheet.submitted': 'submitted a timesheet',
  'timesheet.approved': 'approved a timesheet',
  'timesheet.rejected': 'rejected a timesheet',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ');
}
