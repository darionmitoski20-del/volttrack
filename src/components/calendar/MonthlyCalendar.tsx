import { cn } from '@/lib/utils';
import { daysInMonth, weekdayOfKey, formatDuration } from '@/lib/datetime';
import type { DayData } from '@/hooks/useMonthlyHours';

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MonthlyCalendar({
  year,
  month,
  data,
  today,
  selectedDay,
  onDayClick,
}: {
  year: number;
  month: number;
  data: Map<string, DayData>;
  today: string;
  selectedDay?: string | null;
  onDayClick: (dateKey: string) => void;
}) {
  const days = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  const firstDayKey = `${year}-${mm}-01`;
  const dow = weekdayOfKey(firstDayKey);
  const startOffset = (dow + 6) % 7; // Mon-based

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }

          const dateKey = `${year}-${mm}-${String(day).padStart(2, '0')}`;
          const dayData = data.get(dateKey);
          const minutes = dayData?.totalMinutes ?? 0;
          const isToday = dateKey === today;
          const isSelected = dateKey === selectedDay;
          const hasHours = minutes > 0;

          return (
            <button
              key={dateKey}
              // Days without hours carry no detail — leave them inert.
              disabled={!hasHours && !isToday}
              onClick={() => onDayClick(dateKey)}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl p-1 transition-all',
                'min-h-[3.25rem] disabled:cursor-default',
                // selected = filled volt circle
                isSelected && 'bg-volt-500',
                // today (not selected) = subtle navy ring
                !isSelected && isToday && 'ring-2 ring-navy-700',
                // has hours but not selected/today = light bg
                !isSelected && !isToday && hasHours && 'bg-navy-50',
                // hover — only where there is something to open
                !isSelected && (hasHours || isToday) && 'hover:bg-navy-100',
              )}
            >
              <span
                className={cn(
                  'text-sm font-semibold leading-none',
                  isSelected ? 'text-navy-900' : isToday ? 'font-bold text-navy-900' : hasHours ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {day}
              </span>
              {hasHours && (
                <span
                  className={cn(
                    'mt-1 text-[10px] font-semibold leading-none',
                    isSelected ? 'text-navy-800' : 'text-volt-700',
                  )}
                >
                  {formatDuration(minutes)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
