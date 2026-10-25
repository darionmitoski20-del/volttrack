import { useQuery } from '@tanstack/react-query';
import { Phone, User as UserIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/database.types';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/widgets';
import { Spinner } from '@/components/ui/Spinner';

function useMemberProfile(userId: string | null) {
  return useQuery({
    queryKey: ['member-profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'phone'>> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function MemberProfileModal({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const profile = useMemberProfile(userId);
  const p = profile.data;

  return (
    <Modal open={!!userId} onClose={onClose} title="Profile" className="max-w-sm">
      {profile.isLoading || !p ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6 text-volt-500" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar name={p.full_name} url={p.avatar_url} id={p.id} size="lg" />
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">{p.full_name}</p>
          </div>

          <div className="w-full space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-navy-50 px-4 py-3">
              <UserIcon className="h-4 w-4 shrink-0 text-ink-subtle" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Name</p>
                <p className="truncate text-sm font-medium text-ink">{p.full_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-navy-50 px-4 py-3">
              <Phone className="h-4 w-4 shrink-0 text-ink-subtle" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">Phone</p>
                {p.phone ? (
                  <a href={`tel:${p.phone}`} className="text-sm font-medium text-navy-700 underline">
                    {p.phone}
                  </a>
                ) : (
                  <p className="text-sm text-ink-muted">Not set</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
