'use client';
// src/hooks/useAuth.ts
// Central auth hook. Components import this — never read localStorage directly.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth as authApi, type User } from '@/lib/api';
import { saveSession, getToken, getUser, clearSession } from '@/lib/auth';

interface UseAuthReturn {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login:    (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout:   () => void;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [user,      setUser]      = useState<User | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (t && u) { setToken(t); setUser(u); }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    saveSession(result.token, result.user);
    setToken(result.token);
    setUser(result.user);
    router.push('/dashboard');
  }, [router]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await authApi.register({ name, email, password });
    saveSession(result.token, result.user);
    setToken(result.token);
    setUser(result.user);
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
    router.push('/');
  }, [router]);

  return { user, token, isLoading, login, register, logout };
}

// Route guard — wrap any page that requires auth
// Usage: const { user, token } = useRequireAuth();
export function useRequireAuth() {
  const router = useRouter();
  const auth   = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.token) {
      router.replace('/');
    }
  }, [auth.isLoading, auth.token, router]);

  return auth;
}
