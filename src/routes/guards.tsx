import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Role } from '@/lib/database.types';
import { FullPageSpinner } from '@/components/ui/Spinner';

/** Requires an authenticated session. */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location }} />;
  return <Outlet />;
}

/**
 * Requires an active company membership. Authenticated users with no company
 * are sent to create one (owner onboarding entry point).
 */
export function RequireCompany() {
  const { membership, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!membership) return <Navigate to="/create-company" replace />;
  return <Outlet />;
}

/** Restricts a subtree to a single role, redirecting others to their home. */
export function RoleRoute({ role }: { role: Role }) {
  const { role: current, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (current !== role) {
    return <Navigate to={current === 'owner' ? '/app' : '/me'} replace />;
  }
  return <Outlet />;
}
