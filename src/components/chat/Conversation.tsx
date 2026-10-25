import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/datetime';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { OPTIMISTIC_PREFIX, type MessageWithSender, type ChannelWithDetails } from '@/hooks/useChat';
import { ChatAttachment } from './ChatAttachment';

const QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Members = ChannelWithDetails['members'];

/** Reactions grouped by emoji, with whether the current user is in each group. */
function groupReactions(msg: MessageWithSender, userId: string) {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of msg.reactions ?? []) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === userId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()];
}

export function Conversation({
  messages,
  isLoading,
  members,
  onEdit,
  onDelete,
  onReact,
}: {
  messages: MessageWithSender[];
  isLoading: boolean;
  members: Members;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const { userId, timezone } = useCompanyContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitially = useRef(false);
  const [sheetFor, setSheetFor] = useState<MessageWithSender | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to the newest message on load and when new ones arrive, but
  // never yank the view back down while the user has scrolled up to read
  // older messages (e.g. during the 5s poll or a realtime update).
  useEffect(() => {
    if (!hasScrolledInitially.current) {
      if (messages.length === 0) return;
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      hasScrolledInitially.current = true;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // "Seen" marker: the newest message of mine that every other member has read.
  const others = members.filter((m) => m.user_id !== userId);
  const lastSeenMineId = (() => {
    if (others.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.sender_id !== userId) continue;
      const seenByAll = others.every((o) => o.last_read_at >= m.created_at);
      if (seenByAll) return m.id;
    }
    return null;
  })();

  const openSheet = (msg: MessageWithSender) => {
    // Nothing to act on until the server has given the message a real id.
    if (msg.deleted_at || msg.id.startsWith(OPTIMISTIC_PREFIX)) return;
    setSheetFor(msg);
  };
  const startPress = (msg: MessageWithSender) => {
    pressTimer.current = setTimeout(() => openSheet(msg), 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const beginEdit = (msg: MessageWithSender) => {
    setEditingId(msg.id);
    setDraft(msg.content);
    setSheetFor(null);
  };
  const commitEdit = (id: string) => {
    const text = draft.trim();
    if (text) onEdit(id, text);
    setEditingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-200 border-t-volt-500" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-ink-muted">No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {messages.map((msg, i) => {
            const isMe = msg.sender_id === userId;
            const prevMsg = messages[i - 1];
            const showSender = !prevMsg || prevMsg.sender_id !== msg.sender_id;
            const reactions = groupReactions(msg, userId);
            const isEditing = editingId === msg.id;
            const isPending = msg.id.startsWith(OPTIMISTIC_PREFIX);

            return (
              <div key={msg.id}>
                {showSender && (
                  <div className={cn('mt-3 flex items-center gap-2', isMe && 'justify-end')}>
                    <span className="text-xs font-semibold text-ink-muted">
                      {isMe ? 'You' : msg.sender.full_name}
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {formatTime(msg.created_at, timezone)}
                    </span>
                  </div>
                )}

                <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                  {isEditing ? (
                    <div className="flex w-full max-w-[85%] items-center gap-2">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(msg.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 rounded-xl border border-volt-300 bg-white px-3 py-2 text-sm text-ink focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
                      />
                      <button
                        onClick={() => commitEdit(msg.id)}
                        aria-label="Save"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-volt-500 text-navy-900"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-ink-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onTouchStart={() => startPress(msg)}
                      onTouchEnd={cancelPress}
                      onTouchMove={cancelPress}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openSheet(msg);
                      }}
                      className={cn(
                        'max-w-[75%] space-y-1.5 rounded-2xl px-3.5 py-2 text-sm',
                        msg.deleted_at
                          ? 'bg-navy-50 italic text-ink-subtle'
                          : isMe
                            ? 'bg-navy-800 text-white'
                            : 'bg-navy-100 text-ink',
                        isPending && 'opacity-60',
                      )}
                    >
                      {msg.deleted_at ? (
                        'This message was deleted'
                      ) : (
                        <>
                          {msg.attachment_path && msg.attachment_type && (
                            <ChatAttachment
                              path={msg.attachment_path}
                              name={msg.attachment_name}
                              type={msg.attachment_type}
                              isMe={isMe}
                            />
                          )}
                          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                          {msg.edited_at && (
                            <span className={cn('text-[10px]', isMe ? 'text-navy-300' : 'text-ink-subtle')}>
                              edited
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Reactions */}
                {reactions.length > 0 && (
                  <div className={cn('mt-1 flex gap-1', isMe ? 'justify-end' : 'justify-start')}>
                    {reactions.map(([emoji, { count, mine }]) => (
                      <button
                        key={emoji}
                        onClick={() => onReact(msg.id, emoji)}
                        className={cn(
                          'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                          mine
                            ? 'border-volt-400 bg-volt-100 text-ink'
                            : 'border-navy-200 bg-white text-ink-muted hover:bg-navy-50',
                        )}
                      >
                        <span>{emoji}</span>
                        {count > 1 && <span className="font-semibold tabular-nums">{count}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Seen */}
                {msg.id === lastSeenMineId && (
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-ink-subtle">
                    <CheckCheck className="h-3 w-3" />
                    Seen
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Action sheet */}
      {sheetFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 animate-fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSheetFor(null);
          }}
        >
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-4 shadow-pop sm:mb-4 sm:rounded-2xl">
            <div className="mb-3 flex justify-around">
              {QUICK_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(sheetFor.id, emoji);
                    setSheetFor(null);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-xl transition-transform hover:bg-navy-50 active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {sheetFor.sender_id === userId && (
              <div className="space-y-1 border-t border-navy-100 pt-2">
                {sheetFor.content && (
                  <button
                    onClick={() => beginEdit(sheetFor)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-navy-50"
                  >
                    <Pencil className="h-4 w-4 text-ink-muted" />
                    Edit message
                  </button>
                )}
                <button
                  onClick={() => {
                    onDelete(sheetFor.id);
                    setSheetFor(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete message
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
