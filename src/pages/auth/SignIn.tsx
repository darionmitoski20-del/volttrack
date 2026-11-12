import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, HardHat } from 'lucide-react';
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

// One-tap demo sign-in. The email form is kept but hidden; open /signin?email to show it.
const DEMO = {
  owner: {
    email: import.meta.env.VITE_DEMO_OWNER_EMAIL as string | undefined,
    password: import.meta.env.VITE_DEMO_OWNER_PASSWORD as string | undefined,
  },
  employee: {
    email: import.meta.env.VITE_DEMO_EMPLOYEE_EMAIL as string | undefined,
    password: import.meta.env.VITE_DEMO_EMPLOYEE_PASSWORD as string | undefined,
  },
};

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const showEmail = params.has('email');
  const [demoBusy, setDemoBusy] = useState<'owner' | 'employee' | null>(null);

  const demoSignIn = async (who: 'owner' | 'employee') => {
    setFormError(null);
    const creds = DEMO[who];
    if (!creds.email || !creds.password) {
      setFormError('Demo sign-in is not set up yet.');
      return;
    }
    setDemoBusy(who);
    try {
      await signIn(creds.email, creds.password);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Unable to sign in.'));
    } finally {
      setDemoBusy(null);
    }
  };
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
      subtitle={showEmail ? "Welcome back — let's get to work." : 'Choose how you want to enter.'}
      footer={
        showEmail && (
        <>
          New company?{' '}
          <Link to="/create-company" className="font-medium text-navy-900 underline">
            Create an account
          </Link>
        </>
        )
      }
    >
      {!showEmail && (
        <div className="space-y-3">
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <Button
            type="button"
            variant="primary"
            fullWidth
            size="lg"
            loading={demoBusy === 'owner'}
            disabled={demoBusy !== null}
            onClick={() => demoSignIn('owner')}
          >
            <Briefcase className="mr-2 h-5 w-5" aria-hidden /> Owner
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            size="lg"
            loading={demoBusy === 'employee'}
            disabled={demoBusy !== null}
            onClick={() => demoSignIn('employee')}
          >
            <HardHat className="mr-2 h-5 w-5" aria-hidden /> Employee
          </Button>
        </div>
      )}
      {showEmail && (
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
      )}
    </AuthLayout>
  );
}
