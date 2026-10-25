import { formatTime, formatDuration, parseDateKey } from '@/lib/datetime';
import type { DayData } from '@/hooks/useMonthlyHours';
import { Modal } from '@/components/ui/Modal';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function DayDetailPopup({
  dateKey,
  dayData,
  timezone,
  onClose,
}: {
  dateKey: string;
  dayData: DayData | undefined;
  timezone: string;
  onClose: () => void;
}) {
  const { year, month, day } = parseDateKey(dateKey);
  const title = `${MONTH_NAMES[month]} ${day}, ${year}`;
  const entries = dayData?.entries ?? [];

  return (
    <Modal open onClose={onClose} title={title}>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">No hours logged this day.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">
            Total: <span className="text-volt-700">{formatDuration(dayData?.totalMinutes ?? 0)}</span>
          </p>
          <ul className="divide-y divide-navy-50">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{e.job_site_name}</p>
                  <p className="text-xs text-ink-muted">
                    {formatTime(e.clock_in, timezone)} – {formatTime(e.clock_out, timezone)}
                  </p>
                  {e.note && <p className="mt-0.5 text-xs text-ink-subtle">"{e.note}"</p>}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                  {formatDuration(e.minutes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
