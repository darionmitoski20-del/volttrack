import { useEffect, useState } from 'react';
import { Play, Square, Coffee, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/supabase';
import { formatTime } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useActiveShift, useClockActions } from '@/hooks/useClock';
import { useMyAssignedSites } from '@/hooks/useAssignments';
import type { TimeEntryDetail } from '@/hooks/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/form';
import { EmptyState, Skeleton } from '@/components/ui/states';

/** Live HH:MM:SS elapsed since an ISO instant, ticking every second. */
function useElapsed(sinceIso: string | undefined): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!sinceIso) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sinceIso]);
  if (!sinceIso) return '00:00:00';
  const total = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function ClockCard() {
  const { timezone } = useCompanyContext();
  const shift = useActiveShift();
  const sites = useMyAssignedSites();
  const { clockIn, startBreak, endBreak, clockOut } = useClockActions();

  const [jobSiteId, setJobSiteId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = shift.data ?? null;
  const openBreak = active?.breaks.find((b) => !b.ended_at) ?? null;

  if (shift.isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="mx-auto h-16 w-48" />
      </Card>
    );
  }

  return active ? (
    <ActiveShiftCard
      active={active}
      timezone={timezone}
      onBreak={Boolean(openBreak)}
      breakSinceIso={openBreak?.started_at}
      note={note}
      setNote={setNote}
      error={error}
      busy={startBreak.isPending || endBreak.isPending || clockOut.isPending}
      onStartBreak={async () => {
        setError(null);
        try {
          await startBreak.mutateAsync(active.id);
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
      onEndBreak={async () => {
        setError(null);
        try {
          await endBreak.mutateAsync(active.id);
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
      onClockOut={async () => {
        setError(null);
        try {
          await clockOut.mutateAsync({ entryId: active.id, note: note.trim() || null });
          setNote('');
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
    />
  ) : (
    <Card className="p-5">
      {sites.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : sites.data && sites.data.length > 0 ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="clockin-site" className="mb-1.5 block text-sm font-medium text-ink">
              Where are you working?
            </label>
            <Select id="clockin-site" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
              <option value="">Select a job site…</option>
              {sites.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            aria-label="Note"
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Play className="h-5 w-5" fill="currentColor" />}
            disabled={!jobSiteId}
            loading={clockIn.isPending}
            onClick={async () => {
              setError(null);
              try {
                await clockIn.mutateAsync({ jobSiteId, note: note.trim() || null });
                setNote('');
                setJobSiteId('');
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Clock In
          </Button>
        </div>
      ) : (
        <EmptyState
          icon={MapPin}
          title="No job sites assigned"
          description="Ask your manager to assign you to a job site so you can clock in."
        />
      )}
    </Card>
  );
}

function ActiveShiftCard({
  active,
  timezone,
  onBreak,
  breakSinceIso,
  note,
  setNote,
  error,
  busy,
  onStartBreak,
  onEndBreak,
  onClockOut,
}: {
  active: TimeEntryDetail;
  timezone: string;
  onBreak: boolean;
  breakSinceIso?: string;
  note: string;
  setNote: (v: string) => void;
  error: string | null;
  busy: boolean;
  onStartBreak: () => void;
  onEndBreak: () => void;
  onClockOut: () => void;
}) {
  const shiftElapsed = useElapsed(active.clock_in);
  const breakElapsed = useElapsed(onBreak ? breakSinceIso : undefined);

  return (
    <Card className={cn('overflow-hidden p-0', onBreak ? 'ring-2 ring-orange-300' : 'ring-2 ring-emerald-300')}>
      <div className={cn('px-5 py-6 text-center', onBreak ? 'bg-orange-50' : 'bg-emerald-50')}>
        <div className="flex items-center justify-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', onBreak ? 'bg-orange-500' : 'animate-pulse-ring bg-emerald-500')} />
          <p className={cn('text-sm font-medium', onBreak ? 'text-orange-700' : 'text-emerald-700')}>
            {onBreak ? 'On break' : 'On the clock'}
          </p>
        </div>
        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-ink sm:text-5xl">
          {onBreak ? breakElapsed : shiftElapsed}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {active.job_site?.name ?? 'Job site'} · since {formatTime(active.clock_in, timezone)}
          {onBreak && <span className="block text-xs">Shift total: {shiftElapsed}</span>}
        </p>
      </div>

      <div className="space-y-3 p-5">
        <Textarea
          aria-label="Note"
          placeholder="Add a note before clocking out (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {onBreak ? (
            <Button variant="secondary" fullWidth icon={<Coffee className="h-4 w-4" />} loading={busy} onClick={onEndBreak}>
              End break
            </Button>
          ) : (
            <Button variant="secondary" fullWidth icon={<Coffee className="h-4 w-4" />} loading={busy} onClick={onStartBreak}>
              Start break
            </Button>
          )}
          <Button variant="danger" fullWidth icon={<Square className="h-4 w-4" fill="currentColor" />} loading={busy} onClick={onClockOut}>
            Clock Out
          </Button>
        </div>
      </div>
    </Card>
  );
}
