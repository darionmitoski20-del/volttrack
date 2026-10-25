import { useRef, useState } from 'react';
import { Clock, FileText, Pencil, Trash2 } from 'lucide-react';
import {
  formatDate,
  formatTime,
  formatDuration,
  minutesBetween,
  weekRange,
  addDaysToKey,
  localDateKey,
  monthRange,
} from '@/lib/datetime';
import { formatMoney, payForMinutes } from '@/lib/money';
import { errorMessage } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { useMyRate } from '@/hooks/useRates';
import { useDeleteMyEntry } from '@/hooks/useMyEntryActions';
import type { TimeEntryDetail } from '@/hooks/types';
import { PageHeader } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { QueryBoundary, EmptyState } from '@/components/ui/states';
import { EditMyEntryModal } from '@/components/forms/EditMyEntryModal';
import { PdfExportModal } from '@/components/reports/PdfExportModal';

type QuickRange = 'all' | 'today' | 'this-week' | 'last-week' | 'this-month';

const CHIPS: { key: QuickRange; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
];

function worked(e: TimeEntryDetail): number | null {
  if (!e.clock_out) return null;
  let m = minutesBetween(e.clock_in, e.clock_out);
  for (const b of e.breaks) if (b.ended_at) m -= minutesBetween(b.started_at, b.ended_at);
  return Math.max(0, m);
}

/** Row with swipe-left actions (Edit / Delete). Tap also opens edit. */
function SwipeRow({
  entry,
  minutes,
  rate,
  timezone,
  onEdit,
  onDelete,
}: {
  entry: TimeEntryDetail;
  minutes: number | null;
  rate: number | null;
  timezone: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);
  const moved = useRef(false);
  const ACTIONS_W = 128;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0]?.clientX ?? null;
    startOffset.current = offset;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
    if (Math.abs(dx) > 8) moved.current = true;
    setOffset(Math.min(0, Math.max(-ACTIONS_W, startOffset.current + dx)));
  };
  const onTouchEnd = () => {
    setOffset((o) => (o < -ACTIONS_W / 2 ? -ACTIONS_W : 0));
    startX.current = null;
  };

  const handleTap = () => {
    if (moved.current) return;
    if (offset !== 0) {
      setOffset(0);
    } else if (entry.clock_out) {
      onEdit();
    }
  };

  return (
    <li className="relative overflow-hidden">
      {/* Action layer behind */}
      <div className="absolute inset-y-0 right-0 flex w-32">
        <button
          onClick={() => { setOffset(0); onEdit(); }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-navy-700 text-[10px] font-semibold uppercase tracking-wide text-white"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
        <button
          onClick={() => { setOffset(0); onDelete(); }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-500 text-[10px] font-semibold uppercase tracking-wide text-white"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      {/* Sliding content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleTap}
        style={{ transform: `translateX(${offset}px)` }}
        className="relative flex cursor-pointer items-center justify-between bg-white px-4 py-3 transition-transform duration-150 ease-out"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{entry.job_site?.name ?? 'Job site'}</p>
          <p className="text-xs text-ink-muted">
            {formatDate(entry.clock_in, timezone)} · {formatTime(entry.clock_in, timezone)}
            {entry.clock_out ? ` – ${formatTime(entry.clock_out, timezone)}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-ink">
            {minutes == null ? <span className="text-volt-600">Active</span> : formatDuration(minutes)}
          </p>
          {minutes != null && rate != null && (
            <p className="text-xs font-semibold tabular-nums text-volt-600">
              {formatMoney(payForMinutes(minutes, rate))}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function MyTimeEntriesPage() {
  const { timezone, userId } = useCompanyContext();
  const [chip, setChip] = useState<QuickRange>('this-week');
  const [showPdf, setShowPdf] = useState(false);
  const [editing, setEditing] = useState<TimeEntryDetail | null>(null);
  const [deleting, setDeleting] = useState<TimeEntryDetail | null>(null);
  const myRate = useMyRate();
  const remove = useDeleteMyEntry();
  const { showToast } = useToast();

  const today = localDateKey(new Date(), timezone);
  const range = (() => {
    if (chip === 'today') return { startKey: today, endKey: today };
    if (chip === 'this-week') return weekRange(today);
    if (chip === 'last-week') {
      const { weekStart } = weekRange(today);
      return { startKey: addDaysToKey(weekStart, -7), endKey: addDaysToKey(weekStart, -1) };
    }
    if (chip === 'this-month') {
      const { firstDay, lastDay } = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
      return { startKey: firstDay, endKey: lastDay };
    }
    return {};
  })();
  const startKey = 'startKey' in range ? range.startKey : 'weekStart' in range ? range.weekStart : undefined;
  const endKey = 'endKey' in range ? range.endKey : 'weekEnd' in range ? range.weekEnd : undefined;

  const entries = useTimeEntries({ employeeId: userId, startKey, endKey });

  const rows = entries.data ?? [];
  const totalMins = rows.reduce((sum, e) => sum + (worked(e) ?? 0), 0);
  const totalPay = myRate.data != null ? payForMinutes(totalMins, myRate.data) : null;

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
    } catch (err) {
      showToast('Could not delete', errorMessage(err, 'Try again.'));
    }
    setDeleting(null);
  };

  return (
    <div>
      <PageHeader
        title="Work Logs"
        subtitle={`${rows.length} entries · ${formatDuration(totalMins)}${totalPay != null ? ` · ${formatMoney(totalPay)}` : ''}`}
        actions={
          <Button variant="secondary" size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => setShowPdf(true)}>
            PDF
          </Button>
        }
      />

      {/* Quick chips */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className={
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ' +
              (chip === c.key ? 'bg-navy-900 text-white' : 'bg-white text-ink-muted hover:bg-navy-100')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <QueryBoundary
        query={entries}
        isEmpty={(d) => d.length === 0}
        empty={
          <Card>
            <EmptyState icon={Clock} title="No shifts here" description="Tap + below to add your hours." />
          </Card>
        }
      >
        {(list) => (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-navy-50">
              {list.map((e) => (
                <SwipeRow
                  key={e.id}
                  entry={e}
                  minutes={worked(e)}
                  rate={myRate.data ?? null}
                  timezone={timezone}
                  onEdit={() => setEditing(e)}
                  onDelete={() => setDeleting(e)}
                />
              ))}
            </ul>
          </Card>
        )}
      </QueryBoundary>

      <EditMyEntryModal entry={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete entry?"
        message="This shift will be removed from your hours. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
      <PdfExportModal open={showPdf} onClose={() => setShowPdf(false)} />
    </div>
  );
}
