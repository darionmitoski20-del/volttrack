import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, Mail, Pencil, MessageSquare, MapPin, CalendarCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateKey, weekRange, minutesBetween, formatDuration, formatWeekLabel } from '@/lib/datetime';
import { formatMoney, payForMinutes } from '@/lib/money';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useEmployees } from '@/hooks/useEmployees';
import { useEmployeeRates } from '@/hooks/useRates';
import { useEmployeeAssignedSites } from '@/hooks/useAssignments';
import { useEmployeeTimesheets } from '@/hooks/useTimesheets';
import { useCreateDm } from '@/hooks/useChat';
import { Avatar, MemberStatusBadge, TimesheetStatusBadge } from '@/components/ui/widgets';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { SkeletonRows, EmptyState } from '@/components/ui/states';
import { SetRateModal } from '@/components/forms/SetRateModal';

interface HoursBreakdown {
  weekMinutes: number;
  monthMinutes: number;
  totalMinutes: number;
}

function useEmployeeBreakdown(userId: string) {
  const { timezone } = useCompanyContext();
  return useQuery({
    queryKey: ['employee-breakdown', userId, timezone],
    queryFn: async (): Promise<HoursBreakdown> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('clock_in, clock_out, breaks(started_at, ended_at)')
        .eq('employee_id', userId)
        .not('clock_out', 'is', null)
        .returns<
          { clock_in: string; clock_out: string; breaks: { started_at: string; ended_at: string | null }[] }[]
        >();
      if (error) throw error;

      const todayKey = localDateKey(new Date(), timezone);
      const { weekStart } = weekRange(todayKey);
      const monthPrefix = todayKey.slice(0, 7);

      let week = 0, month = 0, total = 0;
      for (const e of data) {
        let mins = minutesBetween(e.clock_in, e.clock_out);
        for (const b of e.breaks) if (b.ended_at) mins -= minutesBetween(b.started_at, b.ended_at);
        mins = Math.max(0, mins);
        const dayKey = localDateKey(e.clock_in, timezone);
        total += mins;
        if (dayKey.startsWith(monthPrefix)) month += mins;
        if (weekRange(dayKey).weekStart === weekStart) week += mins;
      }
      return { weekMinutes: week, monthMinutes: month, totalMinutes: total };
    },
  });
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs font-semibold tabular-nums text-volt-600">{sub}</p>}
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const employees = useEmployees();
  const rates = useEmployeeRates();
  const breakdown = useEmployeeBreakdown(id);
  const assignedSites = useEmployeeAssignedSites(id);
  const timesheets = useEmployeeTimesheets(id);
  const createDm = useCreateDm();
  const [showRate, setShowRate] = useState(false);

  const member = (employees.data ?? []).find((m) => m.user_id === id);
  const rate = rates.data?.get(id) ?? null;
  const otMultiplier = company.ot_multiplier ?? 1.5;
  const otThresholdMin = (company.overtime_alert_hours ?? 40) * 60;

  if (employees.isLoading || !member) {
    return (
      <div>
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const b = breakdown.data;
  const weekOt = b ? Math.max(0, b.weekMinutes - otThresholdMin) : 0;
  const weekCost =
    b && rate != null
      ? payForMinutes(b.weekMinutes - weekOt, rate) + payForMinutes(weekOt, rate * otMultiplier)
      : null;

  const openChat = async () => {
    const channel = await createDm.mutateAsync(id);
    navigate('/app/chat', { state: { channelId: channel.id } });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/app/employees" aria-label="Back to employees" className="rounded-lg p-1.5 hover:bg-navy-100">
          <ArrowLeft className="h-5 w-5 text-ink-muted" />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Employee profile</h1>
      </div>

      {/* Profile card */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-4">
            <Avatar name={member.profile.full_name} url={member.profile.avatar_url} id={member.user_id} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-ink">{member.profile.full_name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <MemberStatusBadge status={member.status} />
                <button
                  onClick={() => setShowRate(true)}
                  className="flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-navy-700 hover:bg-navy-100"
                >
                  {rate != null ? `$${rate}/h` : 'Set rate'}
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {member.profile.phone && (
              <a
                href={`tel:${member.profile.phone}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-navy-50 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-100"
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            )}
            <button
              onClick={openChat}
              disabled={createDm.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-navy-900 py-2.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50"
            >
              <MessageSquare className="h-4 w-4" />
              Message
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Hours */}
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="This week"
          value={b ? formatDuration(b.weekMinutes) : '—'}
          sub={weekCost != null ? formatMoney(weekCost) : undefined}
        />
        <Stat label="This month" value={b ? formatDuration(b.monthMinutes) : '—'} />
        <Stat label="Total" value={b ? formatDuration(b.totalMinutes) : '—'} />
      </div>

      {/* Contact info */}
      <Card>
        <CardHeader>
          <CardTitle>Contact info</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Phone className="h-4 w-4 shrink-0 text-ink-subtle" />
            <span className="text-ink-muted">Phone</span>
            <span className="ml-auto font-medium text-ink">{member.profile.phone ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-ink-subtle" />
            <span className="text-ink-muted">Email</span>
            <span className="ml-auto truncate font-medium text-ink">{member.profile.email ?? '—'}</span>
          </div>
        </CardBody>
      </Card>

      {/* Current assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Current assignment</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2.5 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-ink-subtle" />
            <span className="text-ink-muted">Job site</span>
            <span className="ml-auto truncate font-medium text-ink">
              {assignedSites.isLoading
                ? '—'
                : (assignedSites.data ?? []).map((s) => s.name).join(', ') || 'Unassigned'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <CalendarCheck className="h-4 w-4 shrink-0 text-ink-subtle" />
            <span className="text-ink-muted">Hours this week</span>
            <span className="ml-auto font-medium text-ink">{b ? formatDuration(b.weekMinutes) : '—'}</span>
          </div>
        </CardBody>
      </Card>

      {/* Recent timesheets */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Recent timesheets</CardTitle>
          <Link to="/app/timesheets" className="text-sm font-medium text-navy-700 hover:text-ink">
            All timesheets
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {timesheets.isLoading ? (
            <div className="p-4"><SkeletonRows rows={3} /></div>
          ) : (timesheets.data ?? []).length === 0 ? (
            <EmptyState title="No timesheets yet" description="Submitted weekly timesheets show up here." />
          ) : (
            <ul className="divide-y divide-navy-50">
              {(timesheets.data ?? []).slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{formatWeekLabel(t.week_start)}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDuration(t.regular_minutes + t.overtime_minutes)}
                      {t.overtime_minutes > 0 && ` · ${formatDuration(t.overtime_minutes)} OT`}
                    </p>
                  </div>
                  <TimesheetStatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <SetRateModal
        member={showRate ? { id: member.id, name: member.profile.full_name } : null}
        currentRate={rate}
        onClose={() => setShowRate(false)}
      />
    </div>
  );
}
