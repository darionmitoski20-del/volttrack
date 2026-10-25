import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { errorMessage } from '@/lib/supabase';
import { useCreateInvitation, invitationLink } from '@/hooks/useInvitations';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/form';
import { CopyButton } from '@/components/ui/CopyButton';

const schema = z.object({
  fullName: z.string().min(2, 'Enter their name'),
  email: z.string().email('Enter a valid email'),
  role: z.enum(['employee', 'owner']),
});
type Values = z.infer<typeof schema>;

export function InviteEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateInvitation();
  const [formError, setFormError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { role: 'employee' } });

  useEffect(() => {
    if (open) {
      setFormError(null);
      setCreatedLink(null);
      reset({ fullName: '', email: '', role: 'employee' });
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const inv = await create.mutateAsync({
        fullName: values.fullName,
        email: values.email,
        role: values.role,
      });
      setCreatedLink(invitationLink(inv.secure_token));
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create the invitation.'));
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Invite employee">
      {createdLink ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Invitation created. Share this secure link so they can set a password and join:
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-navy-100 bg-navy-50 p-2">
            <code className="flex-1 truncate px-1 text-xs text-ink">{createdLink}</code>
            <CopyButton value={createdLink} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
            <Input id="fullName" invalid={!!errors.fullName} {...register('fullName')} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
          <FormField label="Role" htmlFor="role" hint="Owners can manage the whole company.">
            <Select id="role" {...register('role')}>
              <option value="employee">Employee</option>
              <option value="owner">Owner</option>
            </Select>
          </FormField>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Create invitation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
