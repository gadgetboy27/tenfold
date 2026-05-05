import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isDevBypass: boolean;
  getToken: () => Promise<string | null>;
  devBypassLogin: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isDevBypass: false,
  getToken: async () => null,
  devBypassLogin: () => {},
  signOut: async () => {},
});

function slugFromUser(user: User): string {
  // Try explicit metadata first, then derive from email domain
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  if (meta?.workspace_slug && typeof meta.workspace_slug === 'string') {
    return meta.workspace_slug;
  }
  const email = user.email ?? '';
  const domain = email.split('@')[1]?.split('.')[0] ?? 'workspace';
  return domain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevBypass, setIsDevBypass] = useState(false);

  const { setWorkspaceSlug } = useAppStore.getState();

  useEffect(() => {
    if (!supabase) {
      // No Supabase configured — check for dev bypass in localStorage
      const bypass = localStorage.getItem('dev_bypass') === 'true';
      if (bypass) setIsDevBypass(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) setWorkspaceSlug(slugFromUser(session.user));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) setWorkspaceSlug(slugFromUser(session.user));
    });

    return () => subscription.unsubscribe();
  }, []);

  const getToken = async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const devBypassLogin = () => {
    localStorage.setItem('dev_bypass', 'true');
    setIsDevBypass(true);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem('dev_bypass');
    setIsDevBypass(false);
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isDevBypass, getToken, devBypassLogin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
