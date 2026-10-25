import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, MessageSquare } from 'lucide-react';
import {
  useChannels,
  useMessages,
  useSendMessage,
  useMarkRead,
  useEditMessage,
  useDeleteMessage,
  useToggleReaction,
} from '@/hooks/useChat';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { ChannelList } from '@/components/chat/ChannelList';
import { Conversation } from '@/components/chat/Conversation';
import { MessageInput, type PendingAttachment } from '@/components/chat/MessageInput';
import { NewChatModal } from '@/components/chat/NewChatModal';
import { MemberProfileModal } from '@/components/chat/MemberProfileModal';
import { Avatar } from '@/components/ui/widgets';
import { Button } from '@/components/ui/Button';
import type { ChannelWithDetails } from '@/hooks/useChat';

function channelTitle(ch: ChannelWithDetails, userId: string): string {
  if (ch.type === 'group') return ch.name ?? 'Group';
  const other = ch.members.find((m) => m.user_id !== userId);
  return other?.profile.full_name ?? 'Chat';
}

export function ChatPage() {
  const { userId } = useCompanyContext();
  const channels = useChannels();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const location = useLocation();

  // Opened via "Message" from an employee profile — jump straight to that DM.
  const stateChannelId = (location.state as { channelId?: string } | null)?.channelId;
  useEffect(() => {
    if (stateChannelId) {
      setActiveId(stateChannelId);
      void markRead.mutateAsync(stateChannelId);
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateChannelId]);
  const messages = useMessages(activeId);
  const sendMessage = useSendMessage();
  const markRead = useMarkRead();
  const editMessage = useEditMessage(activeId);
  const deleteMessage = useDeleteMessage(activeId);
  const toggleReaction = useToggleReaction(activeId);

  useRealtimeMessages(activeId);

  const activeChannel = (channels.data ?? []).find((c) => c.id === activeId);

  const selectChannel = (id: string) => {
    setActiveId(id);
    void markRead.mutateAsync(id);
  };

  const handleSend = (content: string, attachment: PendingAttachment | null) => {
    if (!activeId) return;
    sendMessage.mutate({
      channelId: activeId,
      content,
      attachmentPath: attachment?.path ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentType: attachment?.type ?? null,
    });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white lg:flex-row">
      {/* Channel list — hidden on mobile when a channel is active */}
      <div
        className={`w-full shrink-0 border-b border-navy-100 lg:w-80 lg:border-b-0 lg:border-r ${
          activeId ? 'hidden lg:block' : ''
        }`}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-ink">Chat</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {channels.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-navy-200 border-t-volt-500" />
          </div>
        ) : (channels.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MessageSquare className="h-10 w-10 text-ink-subtle" />
            <p className="text-sm text-ink-muted">No conversations yet</p>
            <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
              Start a chat
            </Button>
          </div>
        ) : (
          <ChannelList
            channels={channels.data ?? []}
            activeId={activeId}
            onSelect={selectChannel}
          />
        )}
      </div>

      {/* Conversation — hidden on mobile when no channel is active */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${
          !activeId ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {activeChannel ? (
          <>
            <div className="border-b border-navy-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveId(null)}
                  className="lg:hidden"
                  aria-label="Back to channels"
                >
                  <ArrowLeft className="h-5 w-5 text-ink-muted" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-ink">
                    {channelTitle(activeChannel, userId)}
                  </h3>
                  <p className="truncate text-xs text-ink-subtle">
                    {activeChannel.members.map((m) => m.profile.full_name.split(' ')[0]).join(', ')}
                  </p>
                </div>
                {/* Member avatars — tap to open profile */}
                <div className="flex shrink-0 -space-x-2">
                  {activeChannel.members.slice(0, 4).map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => setProfileUserId(m.user_id)}
                      aria-label={`View ${m.profile.full_name}'s profile`}
                      className="rounded-full ring-2 ring-white transition-transform hover:z-10 hover:scale-110"
                    >
                      <Avatar
                        name={m.profile.full_name}
                        url={m.profile.avatar_url}
                        id={m.user_id}
                        size="sm"
                      />
                    </button>
                  ))}
                  {activeChannel.members.length > 4 && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-ink-muted ring-2 ring-white">
                      +{activeChannel.members.length - 4}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Conversation
              messages={messages.data ?? []}
              isLoading={messages.isLoading}
              members={activeChannel.members}
              onEdit={(messageId, content) => editMessage.mutate({ messageId, content })}
              onDelete={(messageId) => deleteMessage.mutate(messageId)}
              onReact={(messageId, emoji) => toggleReaction.mutate({ messageId, emoji })}
            />
            {/* Not disabled while sending — the bubble is already on screen. */}
            <MessageInput onSend={handleSend} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-ink-muted">Select a conversation to start chatting</p>
          </div>
        )}
      </div>

      <NewChatModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={selectChannel}
      />

      <MemberProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}
