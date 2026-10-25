import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, UserPlus, X, MapPin } from 'lucide-react';
import { formatDate, formatDuration, formatTime, minutesBetween } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useJobSite } from '@/hooks/useJobSites';
import {
  useAssignments,
  useAssignEmployee,
  useUnassignEmployee,
} from '@/hooks/useAssignments';
import { useEmployees } from '@/hooks/useEmployees';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { PageHeader, Avatar, JobSiteStatusBadge, TimeEntryStatusBadge } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';
import { QueryBoundary, EmptyState, SkeletonRows } from '@/components/ui/states';
import { JobSiteFormModal } from '@/components/forms/JobSiteFormModal';

export function JobSiteDetailPage() {
  const { id = '' } = useParams();
  const { timezone } = useCompanyContext();
  const site = useJobSite(id);
  const assignments = useAssignments(id);
  const employees = useEmployees();
  const assign = useAssignEmployee(id);
  const unassign = useUnassignEmployee(id);
  const entries = useTimeEntries({ jobSiteId: id });

  const [editOpen, setEditOpen] = useState(false);
  const [pickEmployee, setPickEmployee] = useState('');

  const assignable = useMemo(() => {
    const assignedIds = new Set(assignments.data?.map((a) => a.employee_id));
    return (employees.data ?? []).filter(
      (m) => m.role === 'employee' && m.status === 'active' && !assignedIds.has(m.user_id),
    );
  }, [employees.data, assignments.data]);

  return (
    <div>
      <Link to="/app/job-sites" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Job sites
      </Link>

      <QueryBoundary query={site}>
        {(s) => (
          <>
            <PageHeader
              title={s.name}
              subtitle={s.client_name ?? undefined}
              actions={
                <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-muted">Status</span>
                    <JobSiteStatusBadge status={s.status} />
                  </div>
                  {s.address && (
                    <div className="flex items-start gap-2 text-sm text-ink">
                      <MapPin className="mt-0.5 h-4 w-4 text-ink-subtle" />
                      {s.address}
                    </div>
                  )}
                  {s.estimated_hours != null && (
                    <p className="text-sm text-ink-muted">Estimated: {s.estimated_hours}h</p>
                  )}
                  {(s.start_date || s.end_date) && (
                    <p className="text-sm text-ink-muted">
                      {s.start_date ?? '—'} → {s.end_date ?? '—'}
                    </p>
                  )}
                  {s.description && <p className="text-sm text-ink-muted">{s.description}</p>}
                </CardBody>
              </Card>

              {/* Assignments */}
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-ink">Assigned crew</h2>
                </div>
                <CardBody className="space-y-3">
                  <div className="flex gap-2">
                    <Select
                      aria-label="Choose employee to assign"
                      value={pickEmployee}
                      onChange={(e) => setPickEmployee(e.target.value)}
                    >
                      <option value="">Select an employee…</option>
                      {assignable.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.profile.full_name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="primary"
                      icon={<UserPlus className="h-4 w-4" />}
                      disabled={!pickEmployee}
                      loading={assign.isPending}
                      onClick={() => {
                        if (pickEmployee) assign.mutate(pickEmployee);
                        setPickEmployee('');
                      }}
                    >
                      Assign
                    </Button>
                  </div>

                  {assignments.isLoading ? (
                    <SkeletonRows rows={2} />
                  ) : assignments.data && assignments.data.length > 0 ? (
                    <ul className="divide-y divide-navy-100">
                      {assignments.data.map((a) => (
                        <li key={a.id} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <Avatar name={a.profile.full_name} url={a.profile.avatar_url} id={a.profile.id} size="sm" />
                            <span className="text-sm font-medium text-ink">{a.profile.full_name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<X className="h-4 w-4" />}
                            onClick={() => unassign.mutate(a.id)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-sm text-ink-subtle">No one is assigned to this site yet.</p>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Recent entries */}
            <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Recent time entries</h2>
            <QueryBoundary
              query={entries}
              isEmpty={(d) => d.length === 0}
              empty={
                <Card>
                  <EmptyState title="No time entries" description="Hours logged at this site will appear here." />
                </Card>
              }
            >
              {(list) => (
                <Card>
                  <ul className="divide-y divide-navy-100">
                    {list.slice(0, 15).map((e) => (
                      <li key={e.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={e.profile?.full_name ?? '—'}
                            url={e.profile?.avatar_url}
                            id={e.profile?.id}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-medium text-ink">{e.profile?.full_name ?? 'Unknown'}</p>
                            <p className="text-xs text-ink-subtle">
                              {formatDate(e.clock_in, timezone)} · {formatTime(e.clock_in, timezone)}
                              {e.clock_out ? ` – ${formatTime(e.clock_out, timezone)}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-ink-muted">
                            {e.clock_out ? formatDuration(minutesBetween(e.clock_in, e.clock_out)) : 'Active'}
                          </span>
                          <TimeEntryStatusBadge status={e.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </QueryBoundary>

            <JobSiteFormModal open={editOpen} onClose={() => setEditOpen(false)} site={s} />
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
