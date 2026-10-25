import { useEffect, useMemo, useState } from 'react';
import { Clock, MapPin, Plus, List, Map as MapIcon, ExternalLink } from 'lucide-react';
import { formatDuration } from '@/lib/datetime';
import type { JobSite } from '@/lib/database.types';
import { useMyAssignedSites } from '@/hooks/useAssignments';
import { useMyHoursBySite } from '@/hooks/useEmployeeStats';
import { PageHeader, JobSiteStatusBadge } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { EmployeeCreateJobSiteModal } from '@/components/forms/EmployeeCreateJobSiteModal';

type ViewMode = 'list' | 'map';

export function EmployeeJobSitesPage() {
  const sites = useMyAssignedSites();
  const hoursBySite = useMyHoursBySite();
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const sitesWithAddress = useMemo(
    () => (sites.data ?? []).filter((s) => s.address && s.address.trim()),
    [sites.data],
  );

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
        title="My job sites"
        subtitle="Sites you're assigned to and can clock in at."
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
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setShowCreate(true)}
            >
              Create site
            </Button>
          </div>
        }
      />

      {view === 'map' ? (
        <EmployeeMapView sites={sites.data ?? []} selectedSite={selectedSite} onSelect={setSelectedSiteId} />
      ) : (
        <QueryBoundary
          query={sites}
          isEmpty={(d) => d.length === 0}
          empty={
            <Card>
              <EmptyState
                icon={MapPin}
                title="No assignments yet"
                description="Your manager hasn't assigned you to a job site. Check back soon."
              />
            </Card>
          }
        >
          {(rows) => (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rows.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink">{s.name}</h3>
                      {s.client_name && <p className="truncate text-sm text-ink-muted">{s.client_name}</p>}
                    </div>
                    <JobSiteStatusBadge status={s.status} />
                  </div>
                  {s.address && <p className="mt-3 text-sm text-ink-muted">{s.address}</p>}
                  {s.description && <p className="mt-1 text-xs text-ink-subtle">{s.description}</p>}
                  <div className="mt-3 flex items-center gap-1.5 border-t border-navy-50 pt-3">
                    <Clock className="h-3.5 w-3.5 text-ink-subtle" />
                    <span className="text-xs font-semibold tabular-nums text-ink">
                      {formatDuration(hoursBySite.data?.get(s.id) ?? 0)}
                    </span>
                    <span className="text-xs text-ink-subtle">worked here</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </QueryBoundary>
      )}

      <EmployeeCreateJobSiteModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

function EmployeeMapView({
  sites,
  selectedSite,
  onSelect,
}: {
  sites: JobSite[];
  selectedSite: JobSite | null;
  onSelect: (id: string) => void;
}) {
  if (sites.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={MapPin}
          title="No assignments yet"
          description="Your manager hasn't assigned you to a job site. Check back soon."
        />
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
            description="Ask your manager to add an address to a job site."
          />
        )}
      </Card>
    </div>
  );
}
