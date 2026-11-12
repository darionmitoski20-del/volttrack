import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyMember, Profile, Role } from '@/lib/database.types';

interface Membership {
  member: CompanyMember;
  company: Company;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  membership: Membership | null;
  role: Role | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  enterDemo: (role: Role) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadContext(userId: string): Promise<Pick<AuthState, 'profile' | 'membership'>> {
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase
      .from('company_members')
      .select('*, companies(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1),
  ]);

  const row = members?.[0] as (CompanyMember & { companies: Company }) | undefined;
  const membership: Membership | null = row
    ? { member: row, company: row.companies }
    : null;

  return { profile: profile ?? null, membership };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    membership: null,
    role: null,
    loading: true,
  });

  // Only the latest applySession call may write state (avoids a stale load
  // overwriting a newer one, e.g. right after a demo join).
  const seq = useRef(0);
  const applySession = useCallback(async (session: Session | null) => {
    const mine = ++seq.current;
    if (!session) {
      setState({ session: null, profile: null, membership: null, role: null, loading: false });
      return;
    }
    const { profile, membership } = await loadContext(session.user.id);
    if (mine !== seq.current) return;
    setState({
      session,
      profile,
      membership,
      role: membership?.member.role ?? null,
      loading: false,
    });
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await applySession(data.session);
  }, [applySession]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) void applySession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) void applySession(session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySession(data.session);
  }, [applySession]);

  // One-tap entry: anonymous session + join the demo company with the chosen role.
  const enterDemo = useCallback(async (role: Role) => {
    let { data } = await supabase.auth.getSession();
    if (!data.session || !data.session.user.is_anonymous) {
      if (data.session) await supabase.auth.signOut();
      const res = await supabase.auth.signInAnonymously();
      if (res.error) throw res.error;
      data = { session: res.data.session! };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('demo_join', { p_role: role });
    if (error) throw error;
    await applySession(data.session);
  }, [applySession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ session: null, profile: null, membership: null, role: null, loading: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refresh, signIn, enterDemo, signOut }),
    [state, refresh, signIn, enterDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
