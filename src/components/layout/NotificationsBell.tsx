import { useState } from 'react';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/datetime';
import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { pushSupported, usePushNotifications } from '@/hooks/usePushNotifications';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const { timezone } = useCompanyContext();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const push = usePushNotifications();
  const unread = notifications.data?.filter((n) => !n.is_read).length ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-muted hover:bg-navy-100"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
            <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Notifications</h3>
              {unread > 0 && (
                <button
                  onClick={() => markRead.mutate({ all: true })}
                  className="flex items-center gap-1 text-xs font-medium text-navy-700 hover:text-ink"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            {pushSupported && !push.loading && !push.subscribed && (
              <button
                onClick={() => {
                  setPushError(null);
                  push.subscribe().catch((e) => setPushError(e instanceof Error ? e.message : 'Could not enable notifications.'));
                }}
                className="flex w-full items-center gap-2.5 border-b border-navy-100 bg-volt-400/10 px-4 py-2.5 text-left text-xs font-medium text-ink hover:bg-volt-400/20"
              >
                <BellRing className="h-4 w-4 shrink-0 text-navy-700" />
                Enable push notifications for this device
              </button>
            )}
            {pushError && (
              <p role="alert" className="border-b border-navy-100 px-4 py-2 text-xs text-red-600">
                {pushError}
              </p>
            )}
            <div className="max-h-96 overflow-y-auto scroll-touch">
              {notifications.data && notifications.data.length > 0 ? (
                notifications.data.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.is_read && markRead.mutate({ id: n.id })}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 border-b border-navy-50 px-4 py-3 text-left last:border-0 hover:bg-navy-50',
                      !n.is_read && 'bg-volt-400/5',
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{n.title}</span>
                      {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-volt-500" />}
                    </div>
                    <span className="text-xs text-ink-muted">{n.message}</span>
                    <span className="text-[11px] text-ink-subtle">
                      {formatDateTime(n.created_at, timezone)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">No notifications yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
