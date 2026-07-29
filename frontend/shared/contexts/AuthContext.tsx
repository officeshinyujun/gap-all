'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { API_BASE_URL } from '@/lib/auth';
import { clearClientCache } from '@/lib/clientCache';

interface User {
  id: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  studyStreakDays: number;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => Promise<User | null>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string, birthday: string, verificationToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const res = await fetch(`${API_BASE_URL}/users/me`, {
      credentials: 'include',
    });

    if (!res.ok) {
      setUser(null);
      return null;
    }

    const data = await res.json() as User;
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? '로그인에 실패했습니다.');
    }

    const data = await res.json();
    clearClientCache();
    setUser(data.user);
    navigate('/', { replace: true });
  }, [navigate]);

  const register = useCallback(async (email: string, name: string, password: string, birthday: string, verificationToken: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, name, password, birthday, verificationToken }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? '회원가입에 실패했습니다.');
    }

    const data = await res.json();
    clearClientCache();
    setUser(data.user);
    navigate('/', { replace: true });
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    clearClientCache();
    setUser(null);
    navigate('/landing', { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, isLoading, refreshUser, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
