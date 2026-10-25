import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateKey, formatTime, formatDuration, parseDateKey } from '@/lib/datetime';
import { formatMoney, payForMinutes } from '@/lib/money';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useMonthlyHours } from '@/hooks/useMonthlyHours';
import { useMyRate } from '@/hooks/useRates';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MonthlyCalendar } from '@/components/calendar/MonthlyCalendar';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CalendarPage() {
  const { timezone } = useCompanyContext();
  const today = localDateKey(new Date(), timezone);
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));

  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const monthly = useMonthlyHours(year, month);
  const myRate = useMyRate();

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };
  const isCurrentMonth = year === todayYear && month === todayMonth;

  const selectedData = monthly.data?.get(selectedDay);
  const { year: sy, month: sm, day: sd } = parseDateKey(selectedDay);
  // Weekday of selected day (0=Sun)
  const wdIndex = new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay();
  const selectedLabel = `${WEEKDAY_NAMES[wdIndex]}, ${MONTH_NAMES[sm]} ${sd}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Calendar</h1>

      <Card>
        <CardBody>
          {/* Month navigation */}
          <div className="mb-4 flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-bold uppercase tracking-wide text-ink">
              {MONTH_NAMES[month]} {year}
            </h2>
            <Button variant="secondary" size="sm" onClick={goNext} disabled={isCurrentMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {monthly.isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-200 border-t-volt-500" />
            </div>
          ) : (
            <MonthlyCalendar
              year={year}
              month={month}
              data={monthly.data ?? new Map()}
              today={today}
              selectedDay={selectedDay}
              onDayClick={setSelectedDay}
            />
          )}
        </CardBody>
      </Card>

      {/* Inline day detail */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-ink">{selectedLabel}</h3>

        {!selectedData || selectedData.entries.length === 0 ? (
          <p className="text-sm text-ink-muted">No entries this day.</p>
        ) : (
          <div className="space-y-2">
            {selectedData.entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-2xl border border-navy-100 bg-white px-4 py-3 shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{e.job_site_name}</p>
                  <p className="text-xs text-ink-muted">
                    {formatTime(e.clock_in, timezone)} – {formatTime(e.clock_out, timezone)}
                  </p>
                  {e.note && (
                    <p className="mt-0.5 truncate text-xs text-ink-subtle">"{e.note}"</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-ink">
                    {formatDuration(e.minutes)}
                  </p>
                  {myRate.data != null && (
                    <p className="text-xs font-semibold tabular-nums text-volt-600">
                      {formatMoney(payForMinutes(e.minutes, myRate.data))}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-2xl bg-navy-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Total</span>
              <span className="text-sm font-bold text-navy-900">
                {formatDuration(selectedData.totalMinutes)}
                {myRate.data != null && (
                  <span className="ml-2 text-volt-600">
                    {formatMoney(payForMinutes(selectedData.totalMinutes, myRate.data))}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
