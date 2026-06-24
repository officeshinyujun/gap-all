import { useState, useEffect, Dispatch, SetStateAction } from 'react';

export function useSessionCache<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const cached = sessionStorage.getItem(key);
      return cached ? (JSON.parse(cached) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
  }, [key, value]);

  return [value, setValue];
}

export function clearSessionCache(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch { /* ignore */ }
}
