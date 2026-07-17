'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken, setRefreshToken, getRefreshToken } from './api';

interface TokenPair { access_token: string; refresh_token?: string }

function storeTokens(res: TokenPair) {
  setToken(res.access_token);
  if (res.refresh_token) setRefreshToken(res.refresh_token);
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, termsAccepted: boolean) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: async () => {}, register: async () => {}, loginWithGoogle: async () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);

  const login = async (email: string, password: string) => {
    const res = await api<TokenPair>('/auth/login', { method: 'POST', body: { email, password } });
    storeTokens(res);
    await loadMe();
  };

  const register = async (email: string, password: string, fullName: string, termsAccepted: boolean) => {
    if (!termsAccepted) {
      throw new Error('You must accept the CricLive terms to create an account.');
    }
    const res = await api<TokenPair>('/auth/register', {
      method: 'POST', body: { email, password, full_name: fullName, terms_accepted: termsAccepted },
    });
    storeTokens(res);
    await loadMe();
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await api<TokenPair>('/auth/google', { method: 'POST', body: { id_token: idToken } });
    storeTokens(res);
    await loadMe();
  };

  const logout = () => {
    const rt = getRefreshToken();
    if (rt) void api('/auth/logout', { method: 'POST', body: { refresh_token: rt } }).catch(() => {});
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
