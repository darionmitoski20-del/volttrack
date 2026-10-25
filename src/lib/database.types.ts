/**
 * Database types for the Supabase client.
 *
 * These are maintained by hand to match the migrations. In a live project you
 * can regenerate them from the running database with:
 *   npm run db:types
 * (see package.json → supabase gen types typescript --local)
 */

export type Role = 'owner' | 'employee';
export type MemberStatus = 'active' | 'inactive' | 'suspended';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type JobSiteStatus = 'planned' | 'active' | 'paused' | 'completed' | 'archived';
export type TimeEntryStatus = 'active' | 'completed' | 'incomplete' | 'edited';
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'exported';

export interface MaterialCategory {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  company_id: string;
  job_site_id: string;
  added_by: string;
  category_id: string | null;
  category_name: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  photo_url: string | null;
  receipt_url: string | null;
  clock_in: string;
  clock_out: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  timezone: string;
  address: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  auto_submit_day: number | null;
  auto_submit_hour: number | null;
  logo_url: string | null;
  ot_multiplier: number;
  overtime_alert_hours: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeRate {
  id: string;
  company_id: string;
  user_id: string;
  hourly_rate: number;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface EmployeeInvitation {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: Role;
  secure_token: string;
  status: InvitationStatus;
  expires_at: string;
  invited_by: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface JobSite {
  id: string;
  company_id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  description: string | null;
  status: JobSiteStatus;
  estimated_hours: number | null;
  budget_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobSiteAssignment {
  id: string;
  company_id: string;
  job_site_id: string;
  employee_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface TimeEntry {
  id: string;
  company_id: string;
  employee_id: string;
  job_site_id: string;
  clock_in: string;
  clock_out: string | null;
  employee_note: string | null;
  owner_note: string | null;
  status: TimeEntryStatus;
  created_at: string;
  updated_at: string;
}

export interface Break {
  id: string;
  company_id: string;
  time_entry_id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface Timesheet {
  id: string;
  company_id: string;
  employee_id: string;
  week_start: string;
  week_end: string;
  regular_minutes: number;
  overtime_minutes: number;
  status: TimesheetStatus;
  employee_comment: string | null;
  owner_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  company_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
}

export type ChatChannelType = 'dm' | 'group';

export interface ChatChannel {
  id: string;
  company_id: string;
  type: ChatChannelType;
  name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
}

export type AttachmentType = 'image' | 'file';

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: AttachmentType | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface InvitationPreview {
  valid: boolean;
  reason: string;
  email?: string;
  full_name?: string;
  company_name?: string;
}

type Row<T> = T;
type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

interface TableDef<T> {
  Row: Row<T>;
  Insert: Insert<T>;
  Update: Update<T>;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      companies: TableDef<Company>;
      company_members: TableDef<CompanyMember>;
      employee_invitations: TableDef<EmployeeInvitation>;
      job_sites: TableDef<JobSite>;
      job_site_assignments: TableDef<JobSiteAssignment>;
      time_entries: TableDef<TimeEntry>;
      breaks: TableDef<Break>;
      timesheets: TableDef<Timesheet>;
      audit_logs: TableDef<AuditLog>;
      notifications: TableDef<Notification>;
      chat_channels: TableDef<ChatChannel>;
      chat_channel_members: TableDef<ChatChannelMember>;
      chat_messages: TableDef<ChatMessage>;
      chat_reactions: TableDef<ChatReaction>;
      employee_rates: TableDef<EmployeeRate>;
      push_subscriptions: TableDef<PushSubscriptionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      create_company_and_owner: {
        Args: { p_name: string; p_timezone?: string; p_address?: string | null; p_phone?: string | null };
        Returns: Company;
      };
      accept_invitation: { Args: { p_token: string }; Returns: CompanyMember };
      clock_in: { Args: { p_job_site_id: string; p_note?: string | null }; Returns: TimeEntry };
      start_break: { Args: { p_time_entry_id: string }; Returns: Break };
      end_break: { Args: { p_time_entry_id: string }; Returns: Break };
      clock_out: { Args: { p_time_entry_id: string; p_note?: string | null }; Returns: TimeEntry };
      refresh_timesheet: { Args: { p_employee: string; p_week_start: string }; Returns: Timesheet };
      submit_timesheet: { Args: { p_timesheet_id: string; p_comment?: string | null }; Returns: Timesheet };
      review_timesheet: {
        Args: { p_timesheet_id: string; p_approve: boolean; p_comment?: string | null };
        Returns: Timesheet;
      };
      create_job_site: {
        Args: {
          p_name: string;
          p_client_name?: string | null;
          p_address?: string | null;
          p_description?: string | null;
          p_status?: JobSiteStatus;
          p_estimated_hours?: number | null;
          p_start_date?: string | null;
          p_end_date?: string | null;
        };
        Returns: JobSite;
      };
      update_job_site: {
        Args: {
          p_id: string;
          p_name: string;
          p_client_name?: string | null;
          p_address?: string | null;
          p_description?: string | null;
          p_status?: JobSiteStatus;
          p_estimated_hours?: number | null;
          p_start_date?: string | null;
          p_end_date?: string | null;
        };
        Returns: JobSite;
      };
      set_member_status: { Args: { p_member_id: string; p_status: MemberStatus }; Returns: CompanyMember };
      set_member_rate: { Args: { p_member_id: string; p_rate: number }; Returns: EmployeeRate };
      set_job_site_budget: { Args: { p_job_site_id: string; p_budget_amount: number | null }; Returns: JobSite };
      employee_update_entry: {
        Args: {
          p_id: string;
          p_job_site_id: string;
          p_clock_in: string;
          p_clock_out: string;
          p_note?: string | null;
        };
        Returns: TimeEntry;
      };
      employee_delete_entry: { Args: { p_id: string }; Returns: void };
      create_invitation: {
        Args: { p_email: string; p_full_name: string; p_role?: Role };
        Returns: EmployeeInvitation;
      };
      revoke_invitation: { Args: { p_id: string }; Returns: EmployeeInvitation };
      resend_invitation: { Args: { p_id: string }; Returns: EmployeeInvitation };
      assign_employee: { Args: { p_job_site_id: string; p_employee_id: string }; Returns: JobSiteAssignment };
      unassign_employee: { Args: { p_assignment_id: string }; Returns: void };
      edit_time_entry: {
        Args: {
          p_id: string;
          p_clock_in: string;
          p_clock_out?: string | null;
          p_job_site_id?: string | null;
          p_owner_note?: string | null;
        };
        Returns: TimeEntry;
      };
      add_manual_time_entry: {
        Args: {
          p_job_site_id: string;
          p_clock_in: string;
          p_clock_out: string;
          p_note?: string | null;
        };
        Returns: TimeEntry;
      };
      invitation_preview: { Args: { p_token: string }; Returns: InvitationPreview };
      update_own_profile: {
        Args: { p_full_name: string; p_phone?: string | null; p_avatar_url?: string | null };
        Returns: Profile;
      };
      employee_create_job_site: {
        Args: { p_name: string; p_client_name?: string | null; p_description?: string | null };
        Returns: JobSite;
      };
      employee_add_hours: {
        Args: {
          p_job_site_id: string;
          p_clock_in: string;
          p_clock_out: string;
          p_note?: string | null;
          p_coworker_ids?: string[];
          p_force?: boolean;
        };
        Returns: TimeEntry;
      };
      create_dm_channel: {
        Args: { p_other_user_id: string };
        Returns: ChatChannel;
      };
      create_group_channel: {
        Args: { p_name: string; p_member_ids: string[] };
        Returns: ChatChannel;
      };
      send_message: {
        Args: {
          p_channel_id: string;
          p_content: string;
          p_attachment_path?: string | null;
          p_attachment_name?: string | null;
          p_attachment_type?: AttachmentType | null;
        };
        Returns: ChatMessage;
      };
      mark_channel_read: {
        Args: { p_channel_id: string };
        Returns: void;
      };
      edit_message: {
        Args: { p_message_id: string; p_content: string };
        Returns: ChatMessage;
      };
      delete_message: { Args: { p_message_id: string }; Returns: ChatMessage };
      toggle_reaction: { Args: { p_message_id: string; p_emoji: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
