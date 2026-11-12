import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, HardHat } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from './AuthLayout';

// One-tap sign-in as Owner or Employee. Accounts come from build-time env (GitHub secrets).
const ACCOUNTS = {
  owner: {
    email: import.meta.env.VITE_DEMO_OWNER_EMAIL as string | undefined,
    password: import.meta.env.VITE_DEMO_OWNER_PASSWORD as string | undefined,
  },
  employee: {
    email: import.meta.env.VITE_DEMO_EMPLOYEE_EMAIL as string | undefined,
    password: import.meta.env.VITE_DEMO_EMPLOYEE_PASSWORD as string | undefined,
  },
};

type Who = keyof typeof ACCOUNTS;

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Who | null>(null);

  const enter = async (who: Who) => {
    setError(null);
    const { email, password } = ACCOUNTS[who];
    if (!email || !password) {
      setError('Sign-in is not set up yet.');
      return;
    }
    setBusy(who);
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Choose how you want to enter.">
      <div className="space-y-3">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="primary"
          fullWidth
          size="lg"
          loading={busy === 'owner'}
          disabled={busy !== null}
          onClick={() => enter('owner')}
        >
          <Briefcase className="mr-2 h-5 w-5" aria-hidden /> Owner
        </Button>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          size="lg"
          loading={busy === 'employee'}
          disabled={busy !== null}
          onClick={() => enter('employee')}
        >
          <HardHat className="mr-2 h-5 w-5" aria-hidden /> Employee
        </Button>
      </div>
    </AuthLayout>
  );
}
