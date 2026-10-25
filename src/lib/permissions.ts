/**
 * Frontend permission helpers. These MIRROR the RLS policies in the database
 * (server-side is the real enforcement) so the UI can hide/disable actions the
 * user is not allowed to take. Never rely on these alone for security.
 */

export type Role = 'owner' | 'employee';
export type MemberStatus = 'active' | 'inactive' | 'suspended';

export type Permission =
  | 'company.manage'
  | 'jobsites.write'
  | 'employees.manage'
  | 'invitations.manage'
  | 'timeentries.editAny'
  | 'timesheets.review'
  | 'reports.view'
  | 'audit.view'
  | 'clock.self'
  | 'timesheets.submitOwn';

const OWNER_PERMISSIONS: readonly Permission[] = [
  'company.manage',
  'jobsites.write',
  'employees.manage',
  'invitations.manage',
  'timeentries.editAny',
  'timesheets.review',
  'reports.view',
  'audit.view',
];

const EMPLOYEE_PERMISSIONS: readonly Permission[] = ['clock.self', 'timesheets.submitOwn'];

export function permissionsFor(role: Role): readonly Permission[] {
  return role === 'owner' ? OWNER_PERMISSIONS : EMPLOYEE_PERMISSIONS;
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function isActiveMember(status: MemberStatus): boolean {
  return status === 'active';
}
