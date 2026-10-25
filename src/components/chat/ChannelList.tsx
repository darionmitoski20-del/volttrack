import { MessageSquare, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { messagePreview, type ChannelWithDetails } from '@/hooks/useChat';

function channelDisplayName(ch: ChannelWithDetails, currentUserId: string): string {
  if (ch.type === 'group') return ch.name ?? 'Group';
  const other = ch.members.find((m) => m.user_id !== currentUserId);
  return other?.profile.full_name ?? 'Direct Message';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function ChannelList({
  channels,
  activeId,
  onSelect,
}: {
  channels: ChannelWithDetails[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { userId } = useCompanyContext();

  return (
    <ul className="divide-y divide-navy-50">
      {channels.map((ch) => {
        const name = channelDisplayName(ch, userId);
        const membership = ch.members.find((m) => m.user_id === userId);
        const hasUnread =
          membership && ch.last_message && ch.last_message.created_at > membership.last_read_at;
        const isActive = ch.id === activeId;

        return (
          <li key={ch.id}>
            <button
              onClick={() => onSelect(ch.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                isActive ? 'bg-volt-50' : 'hover:bg-navy-50/50',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  ch.type === 'dm' ? 'bg-navy-100' : 'bg-volt-100',
                )}
              >
                {ch.type === 'dm' ? (
                  <MessageSquare className="h-5 w-5 text-navy-600" />
                ) : (
                  <Users className="h-5 w-5 text-volt-700" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p
                    className={cn(
                      'truncate text-sm',
                      hasUnread ? 'font-bold text-ink' : 'font-medium text-ink',
                    )}
                  >
                    {name}
                  </p>
                  {ch.last_message && (
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {timeAgo(ch.last_message.created_at)}
                    </span>
                  )}
                </div>
                {ch.last_message && (
                  <p
                    className={cn(
                      'truncate text-xs',
                      hasUnread ? 'font-semibold text-ink-muted' : 'text-ink-subtle',
                    )}
                  >
                    {messagePreview(ch.last_message)}
                  </p>
                )}
              </div>
              {hasUnread && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-volt-500" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
