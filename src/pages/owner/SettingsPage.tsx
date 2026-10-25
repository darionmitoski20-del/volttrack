import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, DatabaseBackup } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { COMMON_TIMEZONES } from '@/lib/datetime';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompany, useUpdateCompany } from '@/hooks/useCompany';
import { useRequestTimesheetSubmission } from '@/hooks/useTimesheets';
import { useBackups, useGenerateBackup, downloadBackup } from '@/hooks/useBackups';
import { PageHeader } from '@/components/ui/widgets';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/form';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { SkeletonRows, EmptyState } from '@/components/ui/states';
import { LogoUploader } from '@/components/settings/LogoUploader';

const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const PHONE_RE = /^[+()0-9\s-]{6,20}$/;

const schema = z.object({
  name: z.string().min(2, 'Company name is required'),
  timezone: z.string().min(1, 'Select a timezone'),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address_line: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || PHONE_RE.test(v), 'Enter a valid phone number'),
  auto_submit_day: z.string().optional(),
  auto_submit_hour: z.string().optional(),
  ot_multiplier: z.string().optional(),
  overtime_alert_hours: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function SettingsPage() {
  const company = useCompany();
  const update = useUpdateCompany();
  const { refresh } = useAuth();
  const requestSubmission = useRequestTimesheetSubmission();
  const backups = useBackups();
  const generateBackup = useGenerateBackup();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (company.data) {
      reset({
        name: company.data.name,
        timezone: company.data.timezone,
        email: company.data.email ?? '',
        address_line: company.data.address_line ?? '',
        city: company.data.city ?? '',
        postal_code: company.data.postal_code ?? '',
        phone: company.data.phone ?? '',
        auto_submit_day: company.data.auto_submit_day?.toString() ?? '',
        auto_submit_hour: company.data.auto_submit_hour?.toString() ?? '17',
        ot_multiplier: company.data.ot_multiplier?.toString() ?? '1.5',
        overtime_alert_hours: company.data.overtime_alert_hours?.toString() ?? '40',
      });
    }
  }, [company.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        name: values.name.trim(),
        timezone: values.timezone,
        email: values.email?.trim() || null,
        address_line: values.address_line?.trim() || null,
        city: values.city?.trim() || null,
        postal_code: values.postal_code?.trim() || null,
        address: values.address_line?.trim() || null,
        phone: values.phone?.trim() || null,
        auto_submit_day: values.auto_submit_day ? Number(values.auto_submit_day) : null,
        auto_submit_hour: values.auto_submit_hour ? Number(values.auto_submit_hour) : null,
        ot_multiplier: values.ot_multiplier ? Number(values.ot_multiplier) : 1.5,
        overtime_alert_hours: values.overtime_alert_hours ? Number(values.overtime_alert_hours) : 40,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save changes.'));
    }
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Company settings" subtitle="Manage your company profile and timezone." />
      </div>

      {company.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonRows rows={4} />
          </CardBody>
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Changes saved.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Company info</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {company.data && (
                <LogoUploader
                  logoUrl={company.data.logo_url}
                  companyName={company.data.name}
                  onUploaded={(url) =>
                    update.mutate(
                      { ...requiredFields(company.data!), logo_url: url },
                      { onSuccess: () => void refresh() },
                    )
                  }
                />
              )}
              <FormField label="Company name" htmlFor="name" error={errors.name?.message} required>
                <Input id="name" invalid={!!errors.name} {...register('name')} />
              </FormField>
              <FormField label="Contact email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" invalid={!!errors.email} {...register('email')} />
              </FormField>
              <FormField
                label="Timezone"
                htmlFor="timezone"
                error={errors.timezone?.message}
                hint="Used for all clock-ins, timesheets and reports."
                required
              >
                <Select id="timezone" invalid={!!errors.timezone} {...register('timezone')}>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" type="tel" invalid={!!errors.phone} {...register('phone')} />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="Street address" htmlFor="address_line" className="sm:col-span-3">
                  <Input id="address_line" {...register('address_line')} />
                </FormField>
                <FormField label="City" htmlFor="city">
                  <Input id="city" {...register('city')} />
                </FormField>
                <FormField label="Postal code" htmlFor="postal_code">
                  <Input id="postal_code" {...register('postal_code')} />
                </FormField>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                Auto-submit timesheets
                <InfoTooltip text="Automatically submits all draft timesheets on the chosen day and hour each week. A reminder is sent 24 hours before." />
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Day of week" htmlFor="auto-day" hint="Leave empty to disable">
                  <Select id="auto-day" {...register('auto_submit_day')}>
                    <option value="">Disabled</option>
                    {WEEKDAYS.slice(1).map((day, i) => (
                      <option key={i + 1} value={i + 1}>{day}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Hour" htmlFor="auto-hour">
                  <Select id="auto-hour" {...register('auto_submit_hour')}>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h.toString().padStart(2, '0')}:00
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-navy-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">Need hours sooner?</p>
                  <p className="text-xs text-ink-subtle">Send a one-off reminder now, without waiting for the schedule above.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  className="sm:w-auto"
                  loading={requestSubmission.isPending}
                  onClick={() => {
                    setReminderSent(false);
                    requestSubmission.mutate(undefined, { onSuccess: () => setReminderSent(true) });
                  }}
                >
                  Send reminder now
                </Button>
              </div>
              {reminderSent && (
                <p role="status" className="mt-2 text-xs font-medium text-emerald-600">
                  Reminder sent to your team.
                </p>
              )}
              {requestSubmission.isError && (
                <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                  {errorMessage(requestSubmission.error, 'Could not send reminder.')}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                Overtime
                <InfoTooltip text="Hours beyond the weekly threshold count as overtime, are paid at the multiplier, and trigger an alert on the dashboard." />
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Weekly threshold (hours)" htmlFor="ot-hours">
                  <Select id="ot-hours" {...register('overtime_alert_hours')}>
                    {[35, 38, 40, 42, 45, 48, 50, 55, 60].map((h) => (
                      <option key={h} value={h}>{h} hours</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Overtime pay multiplier" htmlFor="ot-mult">
                  <Select id="ot-mult" {...register('ot_multiplier')}>
                    <option value="1">1× (no extra pay)</option>
                    <option value="1.25">1.25×</option>
                    <option value="1.5">1.5× (standard)</option>
                    <option value="2">2×</option>
                  </Select>
                </FormField>
              </div>
            </CardBody>
          </Card>

          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Data backups
            <InfoTooltip text="A full snapshot of your team, job sites, time entries, timesheets and materials is generated automatically on the 1st of every month. You can also trigger one on demand." />
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-muted">
              Runs automatically each month. Trigger one now to capture today's data.
            </p>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              className="sm:w-auto"
              icon={<DatabaseBackup className="h-4 w-4" />}
              loading={generateBackup.isPending}
              onClick={() => generateBackup.mutate()}
            >
              Generate backup now
            </Button>
          </div>
          {generateBackup.isError && (
            <p role="alert" className="mb-3 text-xs font-medium text-red-600">
              {errorMessage(generateBackup.error, 'Could not generate backup.')}
            </p>
          )}

          {backups.isLoading ? (
            <SkeletonRows rows={2} />
          ) : backups.data && backups.data.length > 0 ? (
            <ul className="divide-y divide-navy-100">
              {backups.data.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{b.period}</p>
                    <p className="text-xs text-ink-subtle">
                      Generated {new Date(b.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Download className="h-4 w-4" />}
                    onClick={() => downloadBackup(b)}
                  >
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={DatabaseBackup}
              title="No backups yet"
              description="Your first automatic backup runs on the 1st of next month, or generate one now."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function requiredFields(company: { name: string; timezone: string; address: string | null; phone: string | null }) {
  return { name: company.name, timezone: company.timezone, address: company.address, phone: company.phone };
}
