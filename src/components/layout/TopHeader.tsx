import { useEffect, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound, Settings, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { navFor } from './nav';
import { Avatar } from '@/components/ui/widgets';
import { Logo } from './Logo';
import { NotificationsBell } from './NotificationsBell';
import { ChatBadge } from '@/components/chat/ChatBadge';

export function TopHeader() {
  const { profile, membership, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const name = profile?.full_name ?? 'Account';
  const items = navFor(role ?? 'employee');

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/signin', { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-navy-100 bg-white px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-1 hover:bg-navy-100 lg:hidden"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <span className="lg:hidden">
            <Logo compact />
          </span>
          {membership?.company.logo_url && (
            <img
              src={membership.company.logo_url}
              alt=""
              className="hidden h-8 w-8 shrink-0 rounded-lg object-cover sm:block"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {membership?.company.name ?? 'VoltTrack'}
            </p>
            <p className="text-xs capitalize text-ink-subtle">{role} workspace</p>
          </div>
        </div>

      <div className="flex items-center gap-1.5">
        <NotificationsBell />
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-navy-100"
          >
            <Avatar name={name} url={profile?.avatar_url} id={profile?.id} size="sm" />
            <span className="hidden max-w-32 truncate text-sm font-medium text-ink sm:block">
              {name}
            </span>
            <ChevronDown className="h-4 w-4 text-ink-subtle" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-pop">
                <div className="flex items-center gap-3 border-b border-navy-100 px-4 py-3">
                  <Avatar name={name} url={profile?.avatar_url} id={profile?.id} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{name}</p>
                    <p className="truncate text-xs capitalize text-ink-subtle">{role}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(role === 'owner' ? '/app/profile' : '/me/profile');
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-navy-50"
                >
                  <UserRound className="h-4 w-4 text-ink-muted" />
                  My profile
                </button>
                {role === 'owner' && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/app/settings');
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-navy-50"
                  >
                    <Settings className="h-4 w-4 text-ink-muted" />
                    Company settings
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>

    {mobileMenuOpen && (
      <>
        <div
          className="fixed inset-0 top-16 z-40 bg-navy-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden
        />
        <nav className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-navy-100 bg-white shadow-pop lg:hidden">
          <div className="space-y-1 px-3 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-volt-500 text-navy-900'
                        : 'text-navy-700 hover:bg-navy-100',
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
          </div>
        </nav>
      </>
    )}
    </>
  );
}
