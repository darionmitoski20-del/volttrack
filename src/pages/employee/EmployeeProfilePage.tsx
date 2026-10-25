import { useState, useEffect } from 'react';
import { User, Phone, Save, Check, DollarSign } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { formatDuration } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Profile } from '@/lib/database.types';
import { useMyHours } from '@/hooks/useClock';
import { useMyRate } from '@/hooks/useRates';
import { useUpdateProfile } from '@/hooks/useProfile';
import { PageHeader, StatCard } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';

export function EmployeeProfilePage() {
  const { profile, session } = useAuth();
  const hours = useMyHours();
  const myRate = useMyRate();
  const update = useUpdateProfile();
  const typedProfile = profile as Profile | null;

  const [fullName, setFullName] = useState(typedProfile?.full_name ?? '');
  const [phone, setPhone] = useState(typedProfile?.phone ?? '');
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (typedProfile) {
      setFullName(typedProfile.full_name);
      setPhone(typedProfile.phone ?? '');
    }
  }, [typedProfile]);

  const submit = async () => {
    setFormError(null);
    setSaved(false);
    if (!fullName.trim()) {
      setFormError('Name is required.');
      return;
    }
    try {
      await update.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        avatar_url: typedProfile?.avatar_url ?? null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not update profile.'));
    }
  };

  return (
    <div>
      <PageHeader title="My profile" subtitle="Edit your personal information." />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          label="Today"
          value={hours.data ? formatDuration(hours.data.todayMinutes) : '—'}
          icon={User}
          tone="volt"
        />
        <StatCard
          label="This week"
          value={hours.data ? formatDuration(hours.data.weekMinutes) : '—'}
          icon={User}
          tone="success"
        />
        {myRate.data != null && (
          <div className="col-span-2 rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt-100">
                  <DollarSign className="h-4.5 w-4.5 text-volt-700" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                    Hourly rate
                  </p>
                  <p className="text-xs text-ink-muted">Set by your employer</p>
                </div>
              </div>
              <p className="text-2xl font-bold tabular-nums text-ink">
                {formatMoney(myRate.data)}
                <span className="text-sm font-medium text-ink-muted">/h</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <Card>
        <CardBody className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          <FormField label="Full name" htmlFor="profile-name" required>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </FormField>
          <FormField label="Phone" htmlFor="profile-phone" hint="Optional">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                id="profile-phone"
                type="tel"
                className="pl-10"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </FormField>
          <FormField label="Email" htmlFor="profile-email">
            <Input
              id="profile-email"
              disabled
              value={session?.user.email ?? '—'}
            />
          </FormField>
          <div className="flex justify-end pt-1">
            <Button
              variant="primary"
              onClick={submit}
              loading={update.isPending}
              icon={saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            >
              {saved ? 'Saved!' : 'Save changes'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
