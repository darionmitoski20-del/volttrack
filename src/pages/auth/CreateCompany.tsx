import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { COMMON_TIMEZONES } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/form';
import { AuthLayout } from './AuthLayout';

const guessTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
};

const schema = z.object({
  fullName: z.string().min(2, 'Enter your name'),
  companyName: z.string().min(2, 'Enter your company name'),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  password: z.string().min(8, 'Use at least 8 characters').or(z.literal('')).optional(),
  timezone: z.string().min(1, 'Select a timezone'),
});
type Values = z.infer<typeof schema>;

export function CreateCompany() {
  const { refresh, session, profile } = useAuth();
  const alreadySignedIn = Boolean(session);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      timezone: guessTimezone(),
      fullName: profile?.full_name ?? '',
      email: session?.user.email ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setNotice(null);
    try {
      // If the user is already authenticated (e.g. signed in then redirected
      // here because they have no company), skip signup entirely.
      const { data: existing } = await supabase.auth.getSession();

      if (!existing.session) {
        if (!values.email || !values.password) {
          setFormError('Email and password are required to create an account.');
          return;
        }
        const { data: signUp, error: signUpError } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { data: { full_name: values.fullName } },
        });
        if (signUpError) throw signUpError;

        if (!signUp.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: values.email,
            password: values.password,
          });
          if (signInError) {
            setNotice(
              'Account created. Please confirm your email address, then sign in to finish setting up your company.',
            );
            return;
          }
        }
      }

      const { error: rpcError } = await supabase.rpc('create_company_and_owner', {
        p_name: values.companyName,
        p_timezone: values.timezone,
        p_address: null,
        p_phone: null,
      });
      if (rpcError) throw rpcError;

      await refresh();
      // Full reload ensures AuthProvider reads the fresh membership from scratch.
      window.location.replace('/app');
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create your company.'));
    }
  });

  return (
    <AuthLayout
      title={alreadySignedIn ? 'Set up your company' : 'Create your company'}
      subtitle={
        alreadySignedIn
          ? "You're signed in — just add your company details."
          : 'Set up VoltTrack for your crew in under a minute.'
      }
      footer={
        alreadySignedIn ? undefined : (
          <>
            Already have an account?{' '}
            <Link to="/signin" className="font-medium text-navy-900 underline">
              Sign in
            </Link>
          </>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}
        {!alreadySignedIn && (
          <FormField label="Your name" htmlFor="fullName" error={errors.fullName?.message} required>
            <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} />
          </FormField>
        )}
        <FormField label="Company name" htmlFor="companyName" error={errors.companyName?.message} required>
          <Input id="companyName" invalid={!!errors.companyName} {...register('companyName')} />
        </FormField>
        {!alreadySignedIn && (
          <>
            <FormField label="Work email" htmlFor="email" error={errors.email?.message} required>
              <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
            </FormField>
            <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                invalid={!!errors.password}
                {...register('password')}
              />
            </FormField>
          </>
        )}
        <FormField label="Company timezone" htmlFor="timezone" error={errors.timezone?.message} required>
          <Select id="timezone" invalid={!!errors.timezone} {...register('timezone')}>
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </FormField>
        <Button type="submit" variant="primary" fullWidth size="lg" loading={isSubmitting}>
          Create company
        </Button>
      </form>
    </AuthLayout>
  );
}
