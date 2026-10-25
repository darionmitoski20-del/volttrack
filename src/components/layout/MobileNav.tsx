import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { mobileNavFor, type NavItem } from './nav';
import { ChatBadge } from '@/components/chat/ChatBadge';
import { AddHoursModal } from '@/components/forms/AddHoursModal';

export function MobileNav() {
  const { role } = useAuth();
  const isEmployee = role === 'employee';
  const items = mobileNavFor(role ?? 'employee');
  const [showAddHours, setShowAddHours] = useState(false);

  return (
    <>
      <nav
        className="sticky bottom-0 z-30 border-t border-navy-100 bg-white lg:hidden"
        aria-label="Primary"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around">
          {isEmployee ? (
            <>
              <BottomLink item={items[0]} />
              <BottomLink item={items[6]} />
              <div className="relative -mt-5 flex flex-1 flex-col items-center">
                <button
                  onClick={() => setShowAddHours(true)}
                  aria-label="Add work hours"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-volt-500 shadow-pop transition-transform active:scale-95"
                >
                  <Plus className="h-7 w-7 text-navy-900" strokeWidth={2.5} />
                </button>
                <span className="mt-0.5 text-[11px] font-medium text-ink-muted">Add</span>
              </div>
              <BottomLink item={items[5]} badge />
              <BottomLink item={items[8]} />
            </>
          ) : (
            <>
              <BottomLink item={items[0]} />
              <BottomLink item={items[3]} />
              <BottomLink item={items[6]} />
              <BottomLink item={items[10]} badge />
              <BottomLink item={items[11]} />
            </>
          )}
        </div>
      </nav>

      {isEmployee && (
        <AddHoursModal open={showAddHours} onClose={() => setShowAddHours(false)} />
      )}
    </>
  );
}

function BottomLink({ item, badge }: { item: NavItem | undefined; badge?: boolean }) {
  if (!item) return null;
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium',
          isActive ? 'text-navy-900' : 'text-ink-subtle',
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className="relative">
            <Icon className={cn('h-5 w-5', isActive && 'text-volt-600')} />
            {badge && <ChatBadge />}
          </div>
          {item.label}
        </>
      )}
    </NavLink>
  );
}
