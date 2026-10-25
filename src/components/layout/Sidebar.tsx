import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { navFor } from './nav';
import { Logo } from './Logo';
import { ChatBadge } from '@/components/chat/ChatBadge';

export function Sidebar() {
  const { role } = useAuth();
  const items = navFor(role ?? 'employee');

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-volt-500 text-navy-900'
                    : 'text-navy-300 hover:bg-navy-800 hover:text-white',
                )
              }
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.to.endsWith('/chat') && <ChatBadge />}
              </div>
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-navy-400">VoltTrack · v1.0</div>
    </aside>
  );
}
