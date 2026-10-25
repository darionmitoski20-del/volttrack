import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type Values = z.infer<typeof schema>;

export function SignIn() {
  const { signIn } = useAuth();
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
      await signIn(values.email, values.password);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Unable to sign in. Check your credentials.'));
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back — let's get to work."
      footer={
        <>
          New company?{' '}
          <Link to="/create-company" className="font-medium text-navy-900 underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-navy-700 hover:text-ink">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" fullWidth size="lg" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
