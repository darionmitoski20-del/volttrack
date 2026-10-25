import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, Users, Clock, List, Map as MapIcon, ExternalLink } from 'lucide-react';
import { formatDuration, minutesToHours } from '@/lib/datetime';
import type { JobSiteStatus } from '@/lib/database.types';
import type { JobSiteStats } from '@/hooks/useJobSites';
import { useJobSites } from '@/hooks/useJobSites';
import { PageHeader, SearchInput, JobSiteStatusBadge } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { JobSiteFormModal } from '@/components/forms/JobSiteFormModal';

type ViewMode = 'list' | 'map';

export function JobSitesPage() {
  const sites = useJobSites();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobSiteStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = sites.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !(s.client_name ?? '').toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [sites.data, search, statusFilter]);

  const sitesWithAddress = useMemo(() => filtered.filter((s) => s.address && s.address.trim()), [filtered]);

  useEffect(() => {
    if (view !== 'map') return;
    if (!selectedSiteId || !sitesWithAddress.some((s) => s.id === selectedSiteId)) {
      setSelectedSiteId(sitesWithAddress[0]?.id ?? null);
    }
  }, [view, sitesWithAddress, selectedSiteId]);

  const selectedSite = sitesWithAddress.find((s) => s.id === selectedSiteId) ?? null;

  return (
    <div>
      <PageHeader
        title="Job Sites"
        subtitle="Track projects, assignments and hours on site."
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-navy-100 bg-white p-0.5">
              <button
                onClick={() => setView('list')}
                aria-label="List view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'list' ? 'bg-navy-900 text-white' : 'text-ink-muted hover:bg-navy-100'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('map')}
                aria-label="Map view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'map' ? 'bg-navy-900 text-white' : 'text-ink-muted hover:bg-navy-100'
                }`}
              >
                <MapIcon className="h-4 w-4" />
              </button>
            </div>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New job site
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search job sites…" className="sm:max-w-xs" />
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | JobSiteStatus)}
          className="w-auto"
        >
          <option value="all">All statuses</option>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {view === 'map' ? (
        <MapView sites={filtered} selectedSite={selectedSite} onSelect={setSelectedSiteId} />
      ) : (
      <QueryBoundary
        query={sites}
        isEmpty={() => filtered.length === 0}
        empty={
          <Card>
            <EmptyState
              icon={MapPin}
              title={search || statusFilter !== 'all' ? 'No matching sites' : 'No job sites yet'}
              description={
                search || statusFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Create your first job site so your crew can clock in.'
              }
              action={
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                  New job site
                </Button>
              }
            />
          </Card>
        }
      >
        {() => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Link
                key={s.id}
                to={`/app/job-sites/${s.id}`}
                className="rounded-2xl border border-navy-100 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-ink">{s.name}</h3>
                    {s.client_name && <p className="truncate text-sm text-ink-muted">{s.client_name}</p>}
                  </div>
                  <JobSiteStatusBadge status={s.status} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat icon={Users} value={s.assignedCount} label="Assigned" />
                  <Stat icon={Clock} value={minutesToHours(s.actualMinutes, 1)} label="Hours" />
                  <Stat
                    value={s.activeWorkers > 0 ? s.activeWorkers : '—'}
                    label="On site"
                    highlight={s.activeWorkers > 0}
                  />
                </dl>
                {s.estimated_hours != null && (
                  <p className="mt-3 text-xs text-ink-subtle">
                    {formatDuration(s.actualMinutes)} of ~{s.estimated_hours}h estimated
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </QueryBoundary>
      )}

      <JobSiteFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function MapView({
  sites,
  selectedSite,
  onSelect,
}: {
  sites: JobSiteStats[];
  selectedSite: JobSiteStats | null;
  onSelect: (id: string) => void;
}) {
  if (sites.length === 0) {
    return (
      <Card>
        <EmptyState icon={MapPin} title="No job sites yet" description="Create a job site to see it on the map." />
      </Card>
    );
  }

  const embedSrc = selectedSite
    ? `https://www.google.com/maps?q=${encodeURIComponent(selectedSite.address ?? selectedSite.name)}&output=embed`
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="p-0 lg:max-h-[560px] lg:overflow-y-auto">
        <ul className="divide-y divide-navy-50">
          {sites.map((s) => {
            const hasAddress = Boolean(s.address && s.address.trim());
            const isSelected = selectedSite?.id === s.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => hasAddress && onSelect(s.id)}
                  disabled={!hasAddress}
                  className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-volt-400/15' : hasAddress ? 'hover:bg-navy-50' : 'opacity-50'
                  }`}
                >
                  <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${isSelected ? 'text-volt-600' : 'text-ink-subtle'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {hasAddress ? s.address : 'No address set'}
                    </p>
                  </div>
                  <JobSiteStatusBadge status={s.status} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="overflow-hidden p-0">
        {embedSrc ? (
          <>
            <div className="flex items-center justify-end gap-2 border-b border-navy-100 px-4 py-3 sm:justify-between">
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold text-ink">{selectedSite!.name}</p>
                <p className="truncate text-xs text-ink-muted">{selectedSite!.address}</p>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedSite!.address ?? selectedSite!.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-navy-700 hover:text-ink"
              >
                Open in Maps <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <iframe
              key={selectedSite!.id}
              title={`Map for ${selectedSite!.name}`}
              src={embedSrc}
              className="h-[420px] w-full lg:h-[500px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </>
        ) : (
          <EmptyState
            icon={MapPin}
            title="No addresses to show"
            description="Add an address to a job site to see it here."
          />
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  highlight,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-ink-subtle" />}
        <span className={highlight ? 'font-semibold text-emerald-600' : 'font-semibold text-ink'}>{value}</span>
      </div>
      <span className="text-[11px] uppercase tracking-wide text-ink-subtle">{label}</span>
    </div>
  );
}
