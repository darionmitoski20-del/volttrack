import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, errorMessage } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { AuthLayout } from './AuthLayout';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string().min(8, 'Confirm your password'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type Values = z.infer<typeof schema>;

export function ResetPassword() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(
        errorMessage(err, 'Could not update your password. Open this page from the email link.'),
      );
    }
  });

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password you'll remember.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <FormField label="New password" htmlFor="password" error={errors.password?.message} required>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirm" error={errors.confirm?.message} required>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.confirm}
            {...register('confirm')}
          />
        </FormField>
        <Button type="submit" variant="primary" fullWidth size="lg" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
