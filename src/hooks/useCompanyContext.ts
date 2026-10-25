import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Convenience accessor for the active company context. Throws if used outside
 * an authenticated + company-scoped subtree (guards guarantee this in-app).
 */
export function useCompanyContext() {
  const { membership, session, role } = useAuth();
  if (!membership || !session) {
    throw new Error('useCompanyContext used outside of a company-scoped route');
  }
  return {
    companyId: membership.member.company_id,
    company: membership.company,
    timezone: membership.company.timezone,
    userId: session.user.id,
    role: role ?? membership.member.role,
  };
}
