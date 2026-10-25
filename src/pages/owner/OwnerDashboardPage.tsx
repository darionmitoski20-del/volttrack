import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Clock,
  CalendarCheck,
  MapPin,
  AlertTriangle,
  Plus,
  ClipboardList,
  LayoutGrid,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
} from 'lucide-react';
import { formatDuration, formatTime, formatDateTime, minutesBetween } from '@/lib/datetime';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useEmployees, useWeeklyHoursByEmployee } from '@/hooks/useEmployees';
import { useJobSites } from '@/hooks/useJobSites';
import { useInvitations } from '@/hooks/useInvitations';
import { useTimesheets } from '@/hooks/useTimesheets';
import { useActiveWorkers } from '@/hooks/useActiveWorkers';
import { useAudit, auditActionLabel } from '@/hooks/useAudit';
import { useCompany } from '@/hooks/useCompany';
import {
  loadDashboardLayout,
  saveDashboardLayout,
  resetDashboardLayout,
  type DashboardWidgetId,
} from '@/lib/dashboardLayout';
import { PageHeader, StatCard, Avatar, WorkStatusBadge } from '@/components/ui/widgets';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, SkeletonRows } from '@/components/ui/states';
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist';

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  clock: 'On the clock now',
  attention: 'Attention required',
  actions: 'Quick actions',
  activity: 'Recent activity',
};

export function OwnerDashboardPage() {
  const { profile } = useAuth();
  const { timezone, company: companyCtx } = useCompanyContext();
  const company = useCompany();
  const employees = useEmployees();
  const jobSites = useJobSites();
  const invitations = useInvitations();
  const submitted = useTimesheets(['submitted']);
  const weeklyHours = useWeeklyHoursByEmployee();
  const active = useActiveWorkers();
  const audit = useAudit(8);

  const [editingLayout, setEditingLayout] = useState(false);
  const [order, setOrder] = useState<DashboardWidgetId[]>([]);
  const [hidden, setHidden] = useState<DashboardWidgetId[]>([]);
  const [dragId, setDragId] = useState<DashboardWidgetId | null>(null);

  useEffect(() => {
    const layout = loadDashboardLayout(companyCtx.id);
    setOrder(layout.order);
    setHidden(layout.hidden);
  }, [companyCtx.id]);

  const persist = (nextOrder: DashboardWidgetId[], nextHidden: DashboardWidgetId[]) => {
    setOrder(nextOrder);
    setHidden(nextHidden);
    saveDashboardLayout(companyCtx.id, { order: nextOrder, hidden: nextHidden });
  };

  const toggleHidden = (id: DashboardWidgetId) => {
    const nextHidden = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    persist(order, nextHidden);
  };

  const handleDrop = (targetId: DashboardWidgetId) => {
    if (!dragId || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    const targetIndex = next.indexOf(targetId);
    next.splice(targetIndex, 0, dragId);
    persist(next, hidden);
    setDragId(null);
  };

  const handleReset = () => {
    const layout = resetDashboardLayout(companyCtx.id);
    setOrder(layout.order);
    setHidden(layout.hidden);
  };

  const activeEmployees = (employees.data ?? []).filter(
    (m) => m.role === 'employee' && m.status === 'active',
  ).length;
  const activeSites = (jobSites.data ?? []).filter((s) => s.status === 'active').length;
  const pendingReviews = submitted.data?.length ?? 0;
  const companyWeekMinutes = Object.values(weeklyHours.data ?? {}).reduce((a, b) => a + b, 0);
  const missing = (active.data ?? []).filter((w) => w.status === 'missing_clockout');
  const otThresholdMin = (companyCtx.overtime_alert_hours ?? 40) * 60;
  const overtimeCount = Object.values(weeklyHours.data ?? {}).filter((m) => m > otThresholdMin).length;

  const steps: OnboardingStep[] = useMemo(() => {
    const hasDetails = Boolean(company.data?.address || company.data?.phone);
    const hasSite = (jobSites.data?.length ?? 0) > 0;
    const hasInvite =
      (invitations.data?.length ?? 0) > 0 || (employees.data?.length ?? 0) > 1;
    const hasShift =
      (active.data?.length ?? 0) > 0 || companyWeekMinutes > 0 || (audit.data ?? []).some((a) =>
        a.action.startsWith('time_entry'),
      );
    return [
      {
        id: 'details',
        label: 'Add your company details',
        description: 'Set your address and phone so they appear on reports.',
        done: hasDetails,
        to: '/app/settings',
        cta: 'Add details',
      },
      {
        id: 'site',
        label: 'Create your first job site',
        description: 'Job sites are where your crew clocks in.',
        done: hasSite,
        to: '/app/job-sites',
        cta: 'Add job site',
      },
      {
        id: 'invite',
        label: 'Invite an employee',
        description: 'Send a secure invitation link to a crew member.',
        done: hasInvite,
        to: '/app/employees',
        cta: 'Invite',
      },
      {
        id: 'shift',
        label: 'Record the first shift',
        description: 'Once an employee clocks in, hours start rolling up here.',
        done: hasShift,
        to: '/app/time-entries',
        cta: 'View time',
      },
    ];
  }, [company.data, jobSites.data, invitations.data, employees.data, active.data, companyWeekMinutes, audit.data]);

  const widgetContent: Record<DashboardWidgetId, React.ReactNode> = {
    clock: (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>On the clock now</CardTitle>
          <Link to="/app/time-entries" className="text-sm font-medium text-navy-700 hover:text-ink">
            View all
          </Link>
        </CardHeader>
        <CardBody>
          {active.isLoading ? (
            <SkeletonRows rows={3} />
          ) : active.data && active.data.length > 0 ? (
            <ul className="divide-y divide-navy-50">
              {active.data.map(({ entry, status }) => (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <Avatar name={entry.profile?.full_name ?? '—'} id={entry.profile?.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {entry.profile?.full_name ?? 'Unknown'}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {entry.job_site?.name ?? 'No site'} · since {formatTime(entry.clock_in, timezone)}
                    </p>
                  </div>
                  <div className="text-right">
                    <WorkStatusBadge status={status} />
                    <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                      {formatDuration(minutesBetween(entry.clock_in, new Date()))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Clock}
              title="Nobody's clocked in"
              description="Active shifts will appear here in real time."
            />
          )}
        </CardBody>
      </Card>
    ),
    attention: (
      <Card>
        <CardHeader>
          <CardTitle>Attention required</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2.5">
          <AttentionRow
            show={pendingReviews > 0}
            to="/app/timesheets"
            icon={CalendarCheck}
            text={`${pendingReviews} timesheet${pendingReviews === 1 ? '' : 's'} awaiting review`}
            tone="warning"
          />
          <AttentionRow
            show={missing.length > 0}
            to="/app/time-entries"
            icon={AlertTriangle}
            text={`${missing.length} possible missing clock-out${missing.length === 1 ? '' : 's'}`}
            tone="danger"
          />
          <AttentionRow
            show={overtimeCount > 0}
            to="/app/live-hours"
            icon={AlertTriangle}
            text={`${overtimeCount} employee${overtimeCount === 1 ? '' : 's'} over ${Math.round(otThresholdMin / 60)}h this week`}
            tone="warning"
          />
          {pendingReviews === 0 && missing.length === 0 && overtimeCount === 0 && (
            <p className="py-2 text-sm text-ink-muted">You're all caught up. 🎉</p>
          )}
        </CardBody>
      </Card>
    ),
    actions: (
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 sm:flex-row">
          <Link to="/app/employees" className="flex-1">
            <Button variant="secondary" fullWidth icon={<Plus className="h-4 w-4" />}>
              Invite employee
            </Button>
          </Link>
          <Link to="/app/job-sites" className="flex-1">
            <Button variant="secondary" fullWidth icon={<Plus className="h-4 w-4" />}>
              New job site
            </Button>
          </Link>
          <Link to="/app/reports" className="flex-1">
            <Button variant="ghost" fullWidth>
              Export a report
            </Button>
          </Link>
        </CardBody>
      </Card>
    ),
    activity: (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent activity</CardTitle>
          <Link to="/app/audit" className="text-sm font-medium text-navy-700 hover:text-ink">
            View all
          </Link>
        </CardHeader>
        <CardBody>
          {audit.isLoading ? (
            <SkeletonRows rows={4} />
          ) : audit.data && audit.data.length > 0 ? (
            <ul className="space-y-2.5">
              {audit.data.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    <span className="font-medium">{log.actor?.full_name ?? 'Someone'}</span>{' '}
                    <span className="text-ink-muted">{auditActionLabel(log.action)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-subtle">
                    {formatDateTime(log.created_at, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" description="Actions across your company show up here." />
          )}
        </CardBody>
      </Card>
    ),
  };

  const visibleOrder = order.filter((id) => editingLayout || !hidden.includes(id));

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${(profile?.full_name ?? '').split(' ')[0] || 'there'}`}
        subtitle="Here's what's happening across your company today."
        actions={
          <div className="flex gap-2">
            {editingLayout && (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={handleReset}>
                Reset
              </Button>
            )}
            <Button
              variant={editingLayout ? 'primary' : 'secondary'}
              size="sm"
              icon={editingLayout ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              onClick={() => setEditingLayout((v) => !v)}
            >
              {editingLayout ? 'Done' : 'Customize'}
            </Button>
          </div>
        }
      />

      <OnboardingChecklist steps={steps} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="On the clock" value={active.data?.length ?? 0} icon={Clock} tone="volt" />
        <StatCard label="Active employees" value={activeEmployees} icon={Users} />
        <StatCard label="Hours this week" value={formatDuration(companyWeekMinutes)} icon={CalendarCheck} tone="success" />
        <StatCard label="Active job sites" value={activeSites} icon={MapPin} />
        <Link to="/app/timesheets">
          <StatCard
            label="Pending timesheets"
            value={pendingReviews}
            icon={ClipboardList}
            tone={pendingReviews > 0 ? 'warning' : 'neutral'}
          />
        </Link>
      </div>

      {editingLayout && (
        <p className="mb-3 text-sm text-ink-muted">
          Drag sections by the handle to reorder them, or use the eye icon to hide a section.
        </p>
      )}

      <div className="space-y-6">
        {visibleOrder.map((id) => (
          <div
            key={id}
            draggable={editingLayout}
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => editingLayout && e.preventDefault()}
            onDrop={() => handleDrop(id)}
            className={
              editingLayout
                ? `relative rounded-2xl ring-2 ring-dashed transition-opacity ${
                    hidden.includes(id) ? 'opacity-40 ring-navy-200' : 'ring-navy-200'
                  } ${dragId === id ? 'opacity-50' : ''}`
                : ''
            }
          >
            {editingLayout && (
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                  <GripVertical className="h-3.5 w-3.5 cursor-grab" />
                  {WIDGET_LABELS[id]}
                </span>
                <button
                  onClick={() => toggleHidden(id)}
                  className="rounded-lg p-1 text-ink-muted hover:bg-navy-100"
                  aria-label={hidden.includes(id) ? `Show ${WIDGET_LABELS[id]}` : `Hide ${WIDGET_LABELS[id]}`}
                >
                  {hidden.includes(id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}
            {widgetContent[id]}
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionRow({
  show,
  to,
  icon: Icon,
  text,
  tone,
}: {
  show: boolean;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: 'warning' | 'danger';
}) {
  if (!show) return null;
  const toneClass = tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700';
  return (
    <Link to={to} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${toneClass}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{text}</span>
    </Link>
  );
}
