const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let refreshPromise: Promise<boolean> | null = null;

export async function performTokenRefresh(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
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

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const { headers: customHeaders, ...restOptions } = options ?? {};
  const isAuthPath =
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/refresh');

  const reqOptions: RequestInit = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...customHeaders },
    ...restOptions,
  };

  let res = await fetch(`${API_BASE}${path}`, reqOptions);

  if (res.status === 401 && !isAuthPath) {
    const refreshed = await performTokenRefresh();
    if (refreshed) {
      res = await fetch(`${API_BASE}${path}`, reqOptions);
    }
  }

  if (!res.ok) {
    const body = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
    throw new Error(body?.message ?? `API 오류 (${res.status})`);
  }

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

export { API_BASE };
