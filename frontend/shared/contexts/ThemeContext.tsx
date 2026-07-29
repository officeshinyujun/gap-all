'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Theme;
  isSystem: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  isSystem: false,
  toggleTheme: () => {},
});

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<Theme>('light');
  const [storedTheme, setStoredTheme] = useState<Theme | null>(null);
  const [isSystem, setIsSystem] = useState(true);

  // 초기화: localStorage → 없으면 시스템 설정 따름
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') {
      setStoredTheme(stored);
      setIsSystem(false);
      applyTheme(stored);
      setResolvedTheme(stored);
    } else {
      const sys = getSystemTheme();
      setIsSystem(true);
      applyTheme(sys);
      setResolvedTheme(sys);
    }
  }, []);

  // 시스템 테마 변경 감지 (사용자가 명시적 선택 안 했을 때만)
  useEffect(() => {
    if (!isSystem) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const sys = e.matches ? 'dark' : 'light';
      applyTheme(sys);
      setResolvedTheme(sys);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [isSystem]);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setResolvedTheme(next);
    setStoredTheme(next);
    setIsSystem(false);
    localStorage.setItem('theme', next);
  }, [resolvedTheme]);

  const theme = storedTheme ?? resolvedTheme;

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, isSystem, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
