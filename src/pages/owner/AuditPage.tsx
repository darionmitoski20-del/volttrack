import { useMemo, useState } from 'react';
import { ScrollText, Download } from 'lucide-react';
import { formatDateTime, localDateKey, addDaysToKey, weekRange } from '@/lib/datetime';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useAudit, auditActionLabel, type AuditFilters } from '@/hooks/useAudit';
import { useEmployees } from '@/hooks/useEmployees';
import { PageHeader, Avatar } from '@/components/ui/widgets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/form';
import { QueryBoundary, EmptyState } from '@/components/ui/states';

type QuickRange = 'all' | 'today' | 'this-week' | 'last-week' | 'custom';

const QUICK_CHIPS: { key: QuickRange; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
];

const ENTITY_TYPES = [
  'company',
  'job_site',
  'employee',
  'invitation',
  'assignment',
  'time_entry',
  'break',
  'timesheet',
];

export function AuditPage() {
  const { timezone } = useCompanyContext();
  const employees = useEmployees();

  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startKey, setStartKey] = useState('');
  const [endKey, setEndKey] = useState('');
  const [quick, setQuick] = useState<QuickRange>('all');

  const selectQuick = (q: QuickRange) => {
    setQuick(q);
    const today = localDateKey(new Date(), timezone);
    if (q === 'all') {
      setStartKey('');
      setEndKey('');
    } else if (q === 'today') {
      setStartKey(today);
      setEndKey(today);
    } else if (q === 'this-week') {
      const { weekStart, weekEnd } = weekRange(today);
      setStartKey(weekStart);
      setEndKey(weekEnd);
    } else {
      const { weekStart } = weekRange(today);
      setStartKey(addDaysToKey(weekStart, -7));
      setEndKey(addDaysToKey(weekStart, -1));
    }
  };

  const filters: AuditFilters = useMemo(
    () => ({
      actorId: actorId || undefined,
      entityType: entityType || undefined,
      startKey: startKey || undefined,
      endKey: endKey || undefined,
    }),
    [actorId, entityType, startKey, endKey],
  );

  const audit = useAudit(500, filters);

  const exportCsv = () => {
    const rows = audit.data;
    if (!rows || rows.length === 0) return;
    const csv = toCsv(
      ['Date/time', 'Actor', 'Action', 'Entity type'],
      rows.map((log) => [
        formatDateTime(log.created_at, timezone),
        log.actor?.full_name ?? 'System',
        auditActionLabel(log.action),
        log.entity_type,
      ]),
    );
    const suffix = startKey && endKey ? `${startKey}_to_${endKey}` : 'all';
    downloadCsv(`volttrack-activity_${suffix}.csv`, csv);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Activity log"
        subtitle="An immutable record of everything that happens in your company."
        actions={
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            disabled={!audit.data || audit.data.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => selectQuick(c.key)}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ' +
              (quick === c.key ? 'bg-navy-900 text-white' : 'bg-white text-ink-muted hover:bg-navy-100')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select aria-label="Team member" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Everyone</option>
          {(employees.data ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.profile.full_name}
            </option>
          ))}
        </Select>
        <Select aria-label="Entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">Any type</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Input
          aria-label="From date"
          type="date"
          value={startKey}
          onChange={(e) => { setStartKey(e.target.value); setQuick('custom'); }}
        />
        <Input
          aria-label="To date"
          type="date"
          value={endKey}
          onChange={(e) => { setEndKey(e.target.value); setQuick('custom'); }}
        />
      </div>

      <QueryBoundary
        query={audit}
        isEmpty={(d) => d.length === 0}
        empty={
          <Card>
            <EmptyState icon={ScrollText} title="No activity found" description="Try widening your filters or date range." />
          </Card>
        }
      >
        {(rows) => (
          <Card className="p-0">
            <ul className="divide-y divide-navy-50">
              {rows.map((log) => (
                <li key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={log.actor?.full_name ?? 'System'} id={log.actor?.id ?? log.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      <span className="font-medium">{log.actor?.full_name ?? 'System'}</span>{' '}
                      <span className="text-ink-muted">{auditActionLabel(log.action)}</span>
                    </p>
                    <p className="text-xs text-ink-subtle">{log.entity_type.replace(/_/g, ' ')}</p>
                  </div>
                  <time className="shrink-0 text-xs text-ink-subtle">{formatDateTime(log.created_at, timezone)}</time>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </QueryBoundary>
    </div>
  );
}
