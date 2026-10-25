import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from './useCompanyContext';
import { useChannels } from './useChat';

export function useRealtimeMessages(activeChannelId: string | null) {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      if (activeChannelId) {
        void qc.invalidateQueries({ queryKey: ['chat-messages', activeChannelId] });
      }
      void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
    };

    const channel = supabase
      .channel('chat-realtime')
      // inserts, plus edits and soft deletes
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, refresh)
      // read receipts drive the "Seen" marker
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_channel_members' }, () => {
        void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeChannelId, companyId, qc]);
}

export function useUnreadCount(): number {
  const { userId } = useCompanyContext();
  const channels = useChannels();

  if (!channels.data) return 0;

  let count = 0;
  for (const ch of channels.data) {
    const membership = ch.members.find((m) => m.user_id === userId);
    if (!membership) continue;
    if (ch.last_message && ch.last_message.created_at > membership.last_read_at) {
      count++;
    }
  }
  return count;
}
