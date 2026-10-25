import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, errorMessage } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type Values = z.infer<typeof schema>;

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const redirectTo = `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not send the reset email.'));
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new password."
      footer={
        <Link to="/signin" className="font-medium text-navy-900 underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
          <Button type="submit" variant="primary" fullWidth size="lg" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
