import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useToast } from '@/components/ui/Toast';
import type { ChannelWithDetails } from '@/hooks/useChat';

export function ChatWatcher() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const location = useLocation();

  // Keep a ref so the subscription callback always reads the latest pathname
  // without needing to re-subscribe on every navigation.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  });

  useEffect(() => {
    const channel = supabase
      .channel('chat-global-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as {
            sender_id: string;
            channel_id: string;
            content: string;
            attachment_type: 'image' | 'file' | null;
          };

          // Refresh channels list so badge count updates everywhere.
          void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });

          // Show toast only for messages from other people, and only when
          // the user is not already on the chat page reading that channel.
          const isOnChatPage = pathnameRef.current.includes('/chat');
          if (msg.sender_id === userId || isOnChatPage) return;

          const channels = qc.getQueryData<ChannelWithDetails[]>([
            'chat-channels',
            companyId,
          ]);
          const ch = channels?.find((c) => c.id === msg.channel_id);
          const sender = ch?.members.find((m) => m.user_id === msg.sender_id);
          const senderName = sender?.profile?.full_name?.split(' ')[0] ?? 'Someone';
          const title = ch?.type === 'group' ? (ch.name ?? 'Group') : senderName;
          const body =
            msg.content ||
            (msg.attachment_type === 'image' ? '📷 Photo' : msg.attachment_type === 'file' ? '📎 File' : '');
          const preview = body.length > 70 ? body.slice(0, 70) + '…' : body;

          showToast(title, preview);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, userId, qc, showToast]);

  return null;
}
