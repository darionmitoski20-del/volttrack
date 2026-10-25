import { useState, useEffect } from 'react';
import { Phone, Save, Check } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Profile } from '@/lib/database.types';
import { useUpdateProfile } from '@/hooks/useProfile';
import { PageHeader } from '@/components/ui/widgets';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';

export function OwnerProfilePage() {
  const { profile, session, refresh } = useAuth();
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
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not update profile.'));
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="My profile" subtitle="Edit your personal information." />

      <Card>
        <CardBody className="space-y-4">
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Changes saved.
            </p>
          )}
          <FormField label="Full name" htmlFor="owner-profile-name" required>
            <Input
              id="owner-profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </FormField>
          <FormField label="Phone" htmlFor="owner-profile-phone" hint="Optional">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                id="owner-profile-phone"
                type="tel"
                className="pl-10"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </FormField>
          <FormField label="Email" htmlFor="owner-profile-email">
            <Input id="owner-profile-email" disabled value={session?.user.email ?? '—'} />
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
