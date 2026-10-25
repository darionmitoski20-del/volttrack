import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users, RefreshCw, X } from 'lucide-react';
import { formatDuration } from '@/lib/datetime';
import type { MemberStatus, Role } from '@/lib/database.types';
import {
  useEmployees,
  useSetMemberStatus,
  useWeeklyHoursByEmployee,
} from '@/hooks/useEmployees';
import {
  useInvitations,
  useRevokeInvitation,
  useResendInvitation,
  invitationLink,
} from '@/hooks/useInvitations';
import { PageHeader, SearchInput, Avatar, MemberStatusBadge } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { CopyButton } from '@/components/ui/CopyButton';
import { ConfirmDialog } from '@/components/ui/Modal';
import { InviteEmployeeModal } from '@/components/forms/InviteEmployeeModal';
import { SetRateModal } from '@/components/forms/SetRateModal';
import { useEmployeeRates } from '@/hooks/useRates';

export function EmployeesPage() {
  const employees = useEmployees();
  const invitations = useInvitations();
  const weeklyHours = useWeeklyHoursByEmployee();
  const setStatus = useSetMemberStatus();
  const revoke = useRevokeInvitation();
  const resend = useResendInvitation();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [rateMember, setRateMember] = useState<{ id: string; name: string; userId: string } | null>(null);
  const rates = useEmployeeRates();

  const pending = invitations.data?.filter((i) => i.status === 'pending') ?? [];

  const filtered = useMemo(() => {
    const list = employees.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (q && !m.profile.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees.data, search, statusFilter, roleFilter]);

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Manage your crew and pending invitations."
        actions={
          <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
            Invite employee
          </Button>
        }
      />

      {pending.length > 0 && (
        <Card className="mb-5">
          <div className="border-b border-navy-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Pending invitations ({pending.length})</h2>
          </div>
          <ul className="divide-y divide-navy-100">
            {pending.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{inv.full_name}</p>
                  <p className="truncate text-xs text-ink-subtle">{inv.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{inv.role}</Badge>
                  <CopyButton value={invitationLink(inv.secure_token)} label="Copy link" />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw className="h-4 w-4" />}
                    loading={resend.isPending}
                    onClick={() => resend.mutate(inv.id)}
                  >
                    Resend
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X className="h-4 w-4" />}
                    onClick={() => revoke.mutate(inv.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" className="sm:max-w-xs" />
        <div className="flex gap-2">
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | MemberStatus)}
            className="w-auto"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}
            className="w-auto"
          >
            <option value="all">All roles</option>
            <option value="owner">Owners</option>
            <option value="employee">Employees</option>
          </Select>
        </div>
      </div>

      <QueryBoundary
        query={employees}
        isEmpty={() => filtered.length === 0}
        empty={
          <Card>
            <EmptyState
              icon={Users}
              title={search || statusFilter !== 'all' || roleFilter !== 'all' ? 'No matches' : 'No employees yet'}
              description={
                search || statusFilter !== 'all' || roleFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Invite your first crew member to get started.'
              }
              action={
                <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
                  Invite employee
                </Button>
              }
            />
          </Card>
        }
      >
        {() => (
          <Card>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">This week</th>
                  <th className="px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <Link to={`/app/employees/${m.user_id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar name={m.profile.full_name} url={m.profile.avatar_url} id={m.profile.id} size="sm" />
                        <span className="font-medium text-ink">{m.profile.full_name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-ink-muted">{m.role}</td>
                    <td className="px-4 py-3">
                      <MemberStatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {formatDuration(weeklyHours.data?.[m.user_id] ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {m.role === 'employee' ? (
                        <button
                          onClick={() => setRateMember({ id: m.id, name: m.profile.full_name, userId: m.user_id })}
                          className="rounded-lg px-2 py-1 text-sm font-semibold tabular-nums text-navy-700 hover:bg-navy-50"
                        >
                          {rates.data?.has(m.user_id)
                            ? `$${rates.data.get(m.user_id)}/h`
                            : 'Set rate'}
                        </button>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.role === 'employee' && <StatusAction member={m} onDeactivate={setConfirmDeactivate} onSet={setStatus.mutate} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-navy-100 sm:hidden">
              {filtered.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <Link to={`/app/employees/${m.user_id}`} className="flex items-center gap-3">
                    <Avatar name={m.profile.full_name} url={m.profile.avatar_url} id={m.profile.id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{m.profile.full_name}</p>
                      <p className="text-xs capitalize text-ink-subtle">
                        {m.role} · {formatDuration(weeklyHours.data?.[m.user_id] ?? 0)} this week
                      </p>
                    </div>
                    <MemberStatusBadge status={m.status} />
                  </Link>
                  {m.role === 'employee' && (
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={() => setRateMember({ id: m.id, name: m.profile.full_name, userId: m.user_id })}
                        className="rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-navy-700"
                      >
                        {rates.data?.has(m.user_id)
                          ? `$${rates.data.get(m.user_id)}/h`
                          : 'Set rate'}
                      </button>
                      <StatusAction member={m} onDeactivate={setConfirmDeactivate} onSet={setStatus.mutate} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </QueryBoundary>

      <InviteEmployeeModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <SetRateModal
        member={rateMember}
        currentRate={rateMember ? rates.data?.get(rateMember.userId) ?? null : null}
        onClose={() => setRateMember(null)}
      />
      <ConfirmDialog
        open={!!confirmDeactivate}
        title="Deactivate employee?"
        message={`${confirmDeactivate?.name ?? 'This employee'} will no longer be able to clock in until reactivated.`}
        confirmLabel="Deactivate"
        loading={setStatus.isPending}
        onCancel={() => setConfirmDeactivate(null)}
        onConfirm={() => {
          if (confirmDeactivate) setStatus.mutate({ memberId: confirmDeactivate.id, status: 'inactive' });
          setConfirmDeactivate(null);
        }}
      />
    </div>
  );
}

function StatusAction({
  member,
  onDeactivate,
  onSet,
}: {
  member: { id: string; status: MemberStatus; profile: { full_name: string } };
  onDeactivate: (v: { id: string; name: string }) => void;
  onSet: (v: { memberId: string; status: MemberStatus }) => void;
}) {
  if (member.status === 'active') {
    return (
      <Button variant="ghost" size="sm" onClick={() => onDeactivate({ id: member.id, name: member.profile.full_name })}>
        Deactivate
      </Button>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={() => onSet({ memberId: member.id, status: 'active' })}>
      Reactivate
    </Button>
  );
}
