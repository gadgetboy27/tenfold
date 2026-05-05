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
  // 1. app_metadata — set by the backend/admin after workspace creation
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  if (appMeta?.workspace_slug && typeof appMeta.workspace_slug === 'string') {
    return appMeta.workspace_slug;
  }
  // 2. user_metadata — may be set during sign-up
  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  if (userMeta?.workspace_slug && typeof userMeta.workspace_slug === 'string') {
    return userMeta.workspace_slug;
  }
  // 3. Keep whatever slug is already in the store — don't guess from email domain
  const storeSlug = useAppStore.getState().workspaceSlug;
  if (storeSlug) return storeSlug;
  // 4. No slug available — return empty, API calls will fail until user sets workspace
  return '';
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

    // getUser() makes a live server request — always returns current user_metadata
    // (getSession() returns a cached JWT that may predate admin.updateUserById calls)
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        if (user) setWorkspaceSlug(slugFromUser(user));
      } else {
        setUser(null);
      }
      setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        if (user) setWorkspaceSlug(slugFromUser(user));
      } else {
        setUser(null);
      }
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
