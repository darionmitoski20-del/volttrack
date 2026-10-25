import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, errorMessage } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import type { InvitationPreview } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { Spinner } from '@/components/ui/Spinner';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ password: z.string().min(8, 'Use at least 8 characters') });
type Values = z.infer<typeof schema>;

const REASON_TEXT: Record<string, string> = {
  not_found: 'This invitation link is invalid.',
  expired: 'This invitation has expired. Ask your employer to resend it.',
  accepted: 'This invitation has already been accepted. Try signing in.',
  revoked: 'This invitation was revoked. Contact your employer.',
};

export function AcceptInvitation() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { refresh, session } = useAuth();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc('invitation_preview', { p_token: token });
      if (active) {
        if (error) setFormError(errorMessage(error));
        else setPreview(data);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!preview?.email) return;
    try {
      const sessionEmail = session?.user.email?.toLowerCase();
      const inviteEmail = preview.email.toLowerCase();
      const needsAuth = !session || sessionEmail !== inviteEmail;

      // Establish a session as the invited email, then accept server-side.
      if (needsAuth) {
        // If logged in as someone else, sign out first.
        if (session) await supabase.auth.signOut();

        const { error: signUpError } = await supabase.auth.signUp({
          email: preview.email,
          password: values.password,
          options: { data: { full_name: preview.full_name ?? '' } },
        });
        if (signUpError) {
          // Existing account — try to sign in with the supplied password.
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: preview.email,
            password: values.password,
          });
          if (signInError) throw signInError;
        } else {
          const { data: sess } = await supabase.auth.getSession();
          if (!sess.session) {
            await supabase.auth.signInWithPassword({
              email: preview.email,
              password: values.password,
            });
          }
        }
      }

      const { error: acceptError } = await supabase.rpc('accept_invitation', { p_token: token });
      if (acceptError) throw acceptError;

      await refresh();
      window.location.replace('/me');
    } catch (err) {
      setFormError(errorMessage(err, 'Could not accept the invitation.'));
    }
  });

  if (loading) {
    return (
      <AuthLayout title="Loading invitation…">
        <div className="flex justify-center py-8">
          <Spinner className="h-7 w-7 text-volt-500" />
        </div>
      </AuthLayout>
    );
  }

  if (!token || !preview || !preview.valid) {
    return (
      <AuthLayout
        title="Invitation unavailable"
        footer={
          <Link to="/signin" className="font-medium text-navy-900 underline">
            Go to sign in
          </Link>
        }
      >
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
          {formError ?? REASON_TEXT[preview?.reason ?? 'not_found'] ?? 'This invitation link is invalid.'}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Accept your invitation"
      subtitle={`You've been invited to join ${preview.company_name ?? 'a company'} on VoltTrack.`}
      footer={
        <>
          Already set up?{' '}
          <Link to="/signin" className="font-medium text-navy-900 underline">
            Sign in instead
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
        <FormField label="Name" htmlFor="name">
          <Input id="name" value={preview.full_name ?? ''} readOnly className="bg-navy-50" />
        </FormField>
        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" value={preview.email ?? ''} readOnly className="bg-navy-50" />
        </FormField>
        <FormField
          label="Create a password"
          htmlFor="password"
          error={errors.password?.message}
          hint="You'll use this to sign in from now on."
          required
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" variant="primary" fullWidth size="lg" loading={isSubmitting}>
          Join {preview.company_name ?? 'company'}
        </Button>
      </form>
    </AuthLayout>
  );
}
