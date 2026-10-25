import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { randomId } from '@/lib/utils';
import type { AttachmentType, ChatChannel, ChatMessage, Profile } from '@/lib/database.types';
import { useCompanyContext } from './useCompanyContext';

export interface ChannelWithDetails extends ChatChannel {
  members: {
    user_id: string;
    last_read_at: string;
    profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
  }[];
  last_message?: {
    content: string;
    created_at: string;
    sender_id: string;
    attachment_type: AttachmentType | null;
    deleted_at: string | null;
  } | null;
}

/** One-line preview for the channel list (handles attachments & deletions). */
export function messagePreview(m: NonNullable<ChannelWithDetails['last_message']>): string {
  if (m.deleted_at) return 'Message deleted';
  if (m.content) return m.content;
  if (m.attachment_type === 'image') return '📷 Photo';
  if (m.attachment_type === 'file') return '📎 File';
  return '';
}

export interface MessageWithSender extends ChatMessage {
  sender: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
  reactions: { emoji: string; user_id: string }[];
}

export function useChannels() {
  const { companyId } = useCompanyContext();
  return useQuery({
    queryKey: ['chat-channels', companyId],
    queryFn: async (): Promise<ChannelWithDetails[]> => {
      const { data, error } = await supabase
        .from('chat_channels')
        .select(
          '*, members:chat_channel_members(user_id, last_read_at, profile:profiles!chat_channel_members_user_id_profiles_fkey(id, full_name, avatar_url))',
        )
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .returns<ChannelWithDetails[]>();
      if (error) throw error;

      // Fetch last message per channel
      const channelIds = data.map((c) => c.id);
      if (channelIds.length > 0) {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('channel_id, content, created_at, sender_id, attachment_type, deleted_at')
          .in('channel_id', channelIds)
          .order('created_at', { ascending: false })
          .limit(1000);

        const lastMsgMap = new Map<string, NonNullable<ChannelWithDetails['last_message']>>();
        for (const msg of msgs ?? []) {
          if (!lastMsgMap.has(msg.channel_id)) {
            lastMsgMap.set(msg.channel_id, msg);
          }
        }
        for (const ch of data) {
          ch.last_message = lastMsgMap.get(ch.id) ?? null;
        }
      }

      return data;
    },
    refetchInterval: 30000,
  });
}

export function useMessages(channelId: string | null) {
  return useQuery({
    queryKey: ['chat-messages', channelId],
    enabled: !!channelId,
    queryFn: async (): Promise<MessageWithSender[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, sender:profiles!chat_messages_sender_id_profiles_fkey(id, full_name, avatar_url)')
        .eq('channel_id', channelId!)
        .order('created_at', { ascending: true })
        .limit(500)
        .returns<MessageWithSender[]>();
      if (error) throw error;

      // Reactions are fetched separately rather than embedded: no FK-hint
      // guessing, and a missing table degrades to "no reactions" instead of
      // failing the whole conversation.
      for (const m of data) m.reactions = [];
      if (data.length > 0) {
        const { data: reactions, error: reactionsError } = await supabase
          .from('chat_reactions')
          .select('message_id, emoji, user_id')
          .in('message_id', data.map((m) => m.id));

        if (reactionsError) {
          console.warn('Reactions unavailable:', reactionsError.message);
        } else {
          const byMessage = new Map<string, { emoji: string; user_id: string }[]>();
          for (const r of reactions ?? []) {
            const list = byMessage.get(r.message_id) ?? [];
            list.push({ emoji: r.emoji, user_id: r.user_id });
            byMessage.set(r.message_id, list);
          }
          for (const m of data) m.reactions = byMessage.get(m.id) ?? [];
        }
      }

      return data;
    },
    refetchInterval: 5000,
  });
}

export interface SendMessageInput {
  channelId: string;
  content: string;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentType?: AttachmentType | null;
}

/** Client-side id prefix for a message that has not been confirmed yet. */
export const OPTIMISTIC_PREFIX = 'pending-';

export function useSendMessage() {
  const { companyId, userId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const { data, error } = await supabase.rpc('send_message', {
        p_channel_id: input.channelId,
        p_content: input.content,
        p_attachment_path: input.attachmentPath ?? null,
        p_attachment_name: input.attachmentName ?? null,
        p_attachment_type: input.attachmentType ?? null,
      });
      if (!error) return data;

      // Attachment columns land with migration 0012. Until it is applied the
      // database only has send_message(channel, content) — fall back to it so
      // plain messages keep working.
      const missingFunction = error.code === 'PGRST202';
      if (!missingFunction || input.attachmentPath) throw error;

      const legacy = await supabase.rpc('send_message', {
        p_channel_id: input.channelId,
        p_content: input.content,
      } as never);
      if (legacy.error) throw legacy.error;
      return legacy.data;
    },

    // Show the bubble immediately; the round-trip reconciles it afterwards.
    onMutate: async (input) => {
      const key = ['chat-messages', input.channelId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MessageWithSender[]>(key);

      const channels = qc.getQueryData<ChannelWithDetails[]>(['chat-channels', companyId]);
      const me = channels
        ?.find((c) => c.id === input.channelId)
        ?.members.find((m) => m.user_id === userId);

      const optimistic: MessageWithSender = {
        id: `${OPTIMISTIC_PREFIX}${randomId()}`,
        channel_id: input.channelId,
        sender_id: userId,
        content: input.content,
        attachment_path: input.attachmentPath ?? null,
        attachment_name: input.attachmentName ?? null,
        attachment_type: input.attachmentType ?? null,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        sender: me?.profile ?? { id: userId, full_name: 'You', avatar_url: null },
        reactions: [],
      };

      qc.setQueryData<MessageWithSender[]>(key, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },

    onError: (_err, input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['chat-messages', input.channelId], ctx.previous);
      }
    },

    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ['chat-messages', vars.channelId] });
      void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
    },
  });
}

/** Uploads to the private chat-attachments bucket, returns the storage path. */
export function useUploadAttachment() {
  const { companyId, userId } = useCompanyContext();
  return useMutation({
    mutationFn: async (file: File): Promise<{ path: string; type: AttachmentType }> => {
      if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB.');
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${companyId}/${userId}/${randomId()}.${ext}`;
      const { error } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return { path, type: file.type.startsWith('image/') ? 'image' : 'file' };
    },
  });
}

export function useEditMessage(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; content: string }) => {
      const { data, error } = await supabase.rpc('edit_message', {
        p_message_id: input.messageId,
        p_content: input.content,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-messages', channelId] });
    },
  });
}

export function useDeleteMessage(channelId: string | null) {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc('delete_message', { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-messages', channelId] });
      void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
    },
  });
}

export function useToggleReaction(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; emoji: string }) => {
      const { error } = await supabase.rpc('toggle_reaction', {
        p_message_id: input.messageId,
        p_emoji: input.emoji,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-messages', channelId] });
    },
  });
}

export function useCreateDm() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc('create_dm_channel', {
        p_other_user_id: otherUserId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
    },
  });
}

export function useCreateGroupChannel() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; memberIds: string[] }) => {
      const { data, error } = await supabase.rpc('create_group_channel', {
        p_name: input.name,
        p_member_ids: input.memberIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
    },
  });
}

export function useMarkRead() {
  const { companyId } = useCompanyContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.rpc('mark_channel_read', {
        p_channel_id: channelId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat-channels', companyId] });
    },
  });
}
