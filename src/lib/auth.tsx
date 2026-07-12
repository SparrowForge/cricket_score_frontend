'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api';

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
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: async () => {}, register: async () => {}, logout: () => {},
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
    const res = await api<{ access_token: string }>('/auth/login', { method: 'POST', body: { email, password } });
    setToken(res.access_token);
    await loadMe();
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await api<{ access_token: string }>('/auth/register', {
      method: 'POST', body: { email, password, full_name: fullName },
    });
    setToken(res.access_token);
    await loadMe();
  };

  const logout = () => { setToken(null); setUser(null); };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
