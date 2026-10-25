import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { MessageSquare, X } from 'lucide-react';

interface ToastItem {
  id: string;
  title: string;
  message: string;
}

interface ToastContextValue {
  showToast: (title: string, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((title: string, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-20 right-3 z-50 flex flex-col gap-2 lg:bottom-5 lg:right-5"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex w-72 animate-slide-in items-start gap-3 rounded-2xl bg-navy-900 px-4 py-3 shadow-pop"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-volt-500">
              <MessageSquare className="h-4 w-4 text-navy-900" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{t.title}</p>
              <p className="truncate text-xs text-navy-300">{t.message}</p>
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-navy-400 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
