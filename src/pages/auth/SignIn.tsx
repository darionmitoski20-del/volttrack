import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, HardHat } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from './AuthLayout';

type Who = 'owner' | 'employee';

export function SignIn() {
  const { enterDemo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Who | null>(null);

  const enter = async (who: Who) => {
    setError(null);
    setBusy(who);
    try {
      await enterDemo(who);
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
