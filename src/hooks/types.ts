import type {
  AuditLog,
  Break,
  CompanyMember,
  EmployeeInvitation,
  JobSite,
  JobSiteAssignment,
  Profile,
  TimeEntry,
  Timesheet,
} from '@/lib/database.types';

/** A company member joined with their profile (name/avatar). */
export interface MemberWithProfile extends CompanyMember {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email' | 'phone'>;
}

/** A time entry joined with its job site and the employee profile. */
export interface TimeEntryDetail extends TimeEntry {
  job_site: Pick<JobSite, 'id' | 'name'> | null;
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  breaks: Pick<Break, 'id' | 'started_at' | 'ended_at'>[];
}

export interface AssignmentWithProfile extends JobSiteAssignment {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
}

export interface TimesheetWithProfile extends Timesheet {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
}

export interface AuditWithActor extends AuditLog {
  actor: Pick<Profile, 'id' | 'full_name'> | null;
}

export type { EmployeeInvitation };
