import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { JobSite, JobSiteStatus } from '@/lib/database.types';
import { errorMessage } from '@/lib/supabase';
import { useCreateJobSite, useUpdateJobSite, type JobSiteInput } from '@/hooks/useJobSites';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Textarea, Select } from '@/components/ui/form';

const STATUSES: JobSiteStatus[] = ['planned', 'active', 'paused', 'completed', 'archived'];

const schema = z.object({
  name: z.string().min(2, 'Enter a site name'),
  client_name: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['planned', 'active', 'paused', 'completed', 'archived']),
  estimated_hours: z.string().optional(),
  budget_amount: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
type Values = z.infer<typeof schema>;

function toInput(v: Values): JobSiteInput {
  const est = v.estimated_hours ? Number(v.estimated_hours) : null;
  const budget = v.budget_amount ? Number(v.budget_amount) : null;
  return {
    name: v.name.trim(),
    client_name: v.client_name?.trim() || null,
    address: v.address?.trim() || null,
    description: v.description?.trim() || null,
    status: v.status,
    estimated_hours: est != null && !Number.isNaN(est) ? est : null,
    budget_amount: budget != null && !Number.isNaN(budget) ? budget : null,
    start_date: v.start_date || null,
    end_date: v.end_date || null,
  };
}

export function JobSiteFormModal({
  open,
  onClose,
  site,
}: {
  open: boolean;
  onClose: () => void;
  site?: JobSite | null;
}) {
  const create = useCreateJobSite();
  const update = useUpdateJobSite();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { status: 'planned' } });

  useEffect(() => {
    if (open) {
      setFormError(null);
      reset({
        name: site?.name ?? '',
        client_name: site?.client_name ?? '',
        address: site?.address ?? '',
        description: site?.description ?? '',
        status: site?.status ?? 'planned',
        estimated_hours: site?.estimated_hours != null ? String(site.estimated_hours) : '',
        budget_amount: site?.budget_amount != null ? String(site.budget_amount) : '',
        start_date: site?.start_date ?? '',
        end_date: site?.end_date ?? '',
      });
    }
  }, [open, site, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const input = toInput(values);
      if (site) await update.mutateAsync({ ...input, id: site.id });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the job site.'));
    }
  });

  return (
    <Modal open={open} onClose={onClose} title={site ? 'Edit job site' : 'New job site'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <FormField label="Site name" htmlFor="name" error={errors.name?.message} required>
          <Input id="name" invalid={!!errors.name} {...register('name')} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Client" htmlFor="client_name">
            <Input id="client_name" {...register('client_name')} />
          </FormField>
          <FormField label="Status" htmlFor="status">
            <Select id="status" {...register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0]?.toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Address" htmlFor="address">
          <Input id="address" {...register('address')} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Est. hours" htmlFor="estimated_hours">
            <Input id="estimated_hours" type="number" min="0" step="0.5" {...register('estimated_hours')} />
          </FormField>
          <FormField label="Budget ($)" htmlFor="budget_amount">
            <Input id="budget_amount" type="number" min="0" step="50" {...register('budget_amount')} />
          </FormField>
          <FormField label="Start date" htmlFor="start_date">
            <Input id="start_date" type="date" {...register('start_date')} />
          </FormField>
          <FormField label="End date" htmlFor="end_date">
            <Input id="end_date" type="date" {...register('end_date')} />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="description">
          <Textarea id="description" {...register('description')} />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {site ? 'Save changes' : 'Create site'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
