import { Search } from 'lucide-react';
import { cn, initials, avatarColor } from '@/lib/utils';
import { Badge } from './Badge';
import type {
  JobSiteStatus,
  MemberStatus,
  TimeEntryStatus,
  TimesheetStatus,
} from '@/lib/database.types';

export function Avatar({
  name,
  url,
  id,
  size = 'md',
}: {
  name: string;
  url?: string | null;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm';
  if (url) {
    return <img src={url} alt="" className={cn('rounded-full object-cover', dims)} />;
  }
  return (
    <span
      aria-hidden
      className={cn('flex items-center justify-center rounded-full font-semibold text-white', dims)}
      style={{ backgroundColor: avatarColor(id ?? name) }}
    >
      {initials(name)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'volt' | 'success' | 'warning' | 'danger';
  hint?: string;
}) {
  const iconTone = {
    neutral: 'bg-navy-100 text-navy-700',
    volt: 'bg-volt-400/25 text-navy-800',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-orange-100 text-orange-700',
    danger: 'bg-red-100 text-red-700',
  }[tone];
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
        {Icon && (
          <span className={cn('rounded-lg p-1.5', iconTone)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

// -- status badges ----------------------------------------------------------

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const map = { active: 'success', inactive: 'neutral', suspended: 'danger' } as const;
  return <Badge tone={map[status]}>{status}</Badge>;
}

export function JobSiteStatusBadge({ status }: { status: JobSiteStatus }) {
  const map = {
    planned: 'info',
    active: 'success',
    paused: 'warning',
    completed: 'neutral',
    archived: 'neutral',
  } as const;
  return <Badge tone={map[status]}>{status}</Badge>;
}

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  const map = {
    draft: 'neutral',
    submitted: 'info',
    approved: 'success',
    rejected: 'danger',
    exported: 'volt',
  } as const;
  return <Badge tone={map[status]}>{status}</Badge>;
}

export function WorkStatusBadge({
  status,
}: {
  status: 'working' | 'on_break' | 'missing_clockout' | 'offline';
}) {
  const map = {
    working: { tone: 'success' as const, label: 'Working' },
    on_break: { tone: 'warning' as const, label: 'On Break' },
    missing_clockout: { tone: 'danger' as const, label: 'Missing Clock-Out' },
    offline: { tone: 'neutral' as const, label: 'Offline' },
  }[status];
  return <Badge tone={map.tone}>{map.label}</Badge>;
}

export function TimeEntryStatusBadge({ status }: { status: TimeEntryStatus }) {
  const map = {
    active: 'success',
    completed: 'neutral',
    incomplete: 'warning',
    edited: 'info',
  } as const;
  return <Badge tone={map[status]}>{status}</Badge>;
}

// -- page chrome ------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-navy-100 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-volt-500"
      />
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
  );
}
