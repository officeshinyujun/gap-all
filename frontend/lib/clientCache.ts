type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const values = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * A per-tab cache for safe-to-repeat GET requests. It intentionally never
 * persists to storage so one user's data cannot be shown after an account
 * switch on a shared browser.
 */
export function fetchWithClientCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const cached = values.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = load()
    .then((value) => {
      values.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function invalidateClientCache(key: string): void {
  values.delete(key);
}

export function invalidateClientCachePrefix(prefix: string): void {
  for (const key of values.keys()) {
    if (key.startsWith(prefix)) values.delete(key);
  }
}

export function clearClientCache(): void {
  values.clear();
  inFlight.clear();
}
