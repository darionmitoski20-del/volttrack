import { useUnreadCount } from '@/hooks/useRealtimeMessages';

export function ChatBadge() {
  const count = useUnreadCount();
  if (count <= 0) return null;

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
}
