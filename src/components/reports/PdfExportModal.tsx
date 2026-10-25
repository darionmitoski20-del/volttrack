import { useState } from 'react';
import { FileText } from 'lucide-react';
import { currentWeekStart, weekRange, addDaysToKey, monthRange } from '@/lib/datetime';
import { errorMessage } from '@/lib/supabase';
import { generateTimesheetPdf } from '@/lib/pdf';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useReports } from '@/hooks/useReports';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/form';

type Period = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

function periodRange(period: Period, timezone: string): { start: string; end: string } {
  const ws = currentWeekStart(timezone);
  const { weekEnd } = weekRange(ws);

  switch (period) {
    case 'this-week':
      return { start: ws, end: weekEnd };
    case 'last-week': {
      const lws = addDaysToKey(ws, -7);
      return { start: lws, end: weekRange(lws).weekEnd };
    }
    case 'this-month': {
      const now = new Date();
      const { firstDay, lastDay } = monthRange(now.getFullYear(), now.getMonth() + 1);
      return { start: firstDay, end: lastDay };
    }
    case 'last-month': {
      const d = new Date();
      const m = d.getMonth() === 0 ? 12 : d.getMonth();
      const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
      const { firstDay, lastDay } = monthRange(y, m);
      return { start: firstDay, end: lastDay };
    }
    default:
      return { start: ws, end: weekEnd };
  }
}

export function PdfExportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { timezone, company } = useCompanyContext();
  const [period, setPeriod] = useState<Period>('this-week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const range = period === 'custom'
    ? { start: customStart, end: customEnd }
    : periodRange(period, timezone);

  const report = useReports({
    startKey: range.start,
    endKey: range.end,
  });

  const generate = async () => {
    setFormError(null);
    if (!range.start || !range.end) {
      setFormError('Please select a date range.');
      return;
    }
    if (!report.data) {
      setFormError('Report data is still loading.');
      return;
    }
    try {
      setGenerating(true);
      await generateTimesheetPdf({
        companyName: company.name,
        logoUrl: company.logo_url,
        period: `${range.start} to ${range.end}`,
        report: report.data,
      });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not generate PDF.'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export PDF report">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Generate a branded PDF report with hours, overtime, and job site breakdown.
        </p>

        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <FormField label="Period" htmlFor="pdf-period">
          <Select
            id="pdf-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="this-week">This week</option>
            <option value="last-week">Last week</option>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="custom">Custom range</option>
          </Select>
        </FormField>

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From" htmlFor="pdf-from">
              <Input
                id="pdf-from"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </FormField>
            <FormField label="To" htmlFor="pdf-to">
              <Input
                id="pdf-to"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </FormField>
          </div>
        )}

        {report.data && (
          <div className="rounded-xl bg-navy-50 px-3 py-2 text-xs text-ink-muted">
            Preview: {report.data.byEmployee.length} employees ·{' '}
            {report.data.byJobSite.length} job sites ·{' '}
            {report.data.daily.length} days
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={generate}
            loading={generating || report.isLoading}
            disabled={!report.data}
            icon={<FileText className="h-4 w-4" />}
          >
            Generate PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
