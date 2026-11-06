import { API_BASE_URL } from '@/lib/auth';
import { clearClientCache } from '@/lib/clientCache';

let refreshPromise: Promise<boolean> | null = null;

/**
 * Executes a token refresh call using httpOnly cookies.
 * Concurrent callers share the single in-flight Promise to avoid race conditions.
 */
export async function performTokenRefresh(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Unified API Client with Silent Token Refresh.
 * Automatically intercepts 401 responses on protected endpoints,
 * waits for or initiates a token refresh via credentials cookie, and retries the request.
 */
export async function apiFetch<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await apiFetchResponse(path, options);

  if (res.status === 204) {
    return undefined as T;
  }

  if (typeof res.json === 'function') {
    try {
      return (await res.json()) as T;
    } catch {
      return undefined as T;
    }
  }

  return undefined as T;
}

/**
 * apiFetch와 같은 인증·재발급·오류 처리를 거친 원본 응답(파일 다운로드 등 JSON이 아닌 응답용).
 */
export async function apiFetchResponse(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  const isAuthPath =
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/refresh') ||
    path.startsWith('/auth/send-code') ||
    path.startsWith('/auth/verify-code');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  const reqOptions: RequestInit = {
    ...options,
    credentials: 'include',
    headers,
  };

  let res = await fetch(url, reqOptions);

  // Silent Refresh on 401
  if (res.status === 401 && !isAuthPath) {
    const refreshed = await performTokenRefresh();
    if (refreshed) {
      // Retry the original request with refreshed credentials
      res = await fetch(url, reqOptions);
    } else {
      clearClientCache();
    }
  }

  if (!res.ok) {
    const error = typeof res.json === 'function'
      ? await res.json().catch(() => ({ message: res.statusText }))
      : { message: res.statusText };
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }

  return res;
}

export { API_BASE_URL };
