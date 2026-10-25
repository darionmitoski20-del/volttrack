import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { MobileNav } from './MobileNav';
import { ChatWatcher } from './ChatWatcher';
import { ToastProvider } from '@/components/ui/Toast';

export function AppShell() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-navy-50">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader />
          <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
            <div className="mx-auto w-full max-w-6xl">
              <Outlet />
            </div>
          </main>
          <MobileNav />
        </div>
      </div>
      <ChatWatcher />
    </ToastProvider>
  );
}
