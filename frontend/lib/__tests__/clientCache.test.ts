import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearClientCache,
  fetchWithClientCache,
  getClientCache,
  invalidateClientCache,
} from '../clientCache';

describe('fetchWithClientCache', () => {
  beforeEach(() => {
    clearClientCache();
  });

  it('reuses a fresh cached value', async () => {
    const load = vi.fn().mockResolvedValue({ value: 1 });

    await expect(fetchWithClientCache('key', 1_000, load)).resolves.toEqual({ value: 1 });
    await expect(fetchWithClientCache('key', 1_000, load)).resolves.toEqual({ value: 1 });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests', async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((done) => { resolve = done; }));

    const first = fetchWithClientCache('key', 1_000, load);
    const second = fetchWithClientCache('key', 1_000, load);
    resolve('done');

    await expect(Promise.all([first, second])).resolves.toEqual(['done', 'done']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refetches after invalidation', async () => {
    const load = vi.fn().mockResolvedValue('value');

    await fetchWithClientCache('key', 1_000, load);
    invalidateClientCache('key');
    await fetchWithClientCache('key', 1_000, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('getClientCache returns cached value synchronously', async () => {
    const load = vi.fn().mockResolvedValue({ data: 42 });

    // cold cache → undefined
    expect(getClientCache('sync-key')).toBeUndefined();

    // populate cache
    await fetchWithClientCache('sync-key', 10_000, load);

    // now should return the value
    expect(getClientCache<{ data: number }>('sync-key')).toEqual({ data: 42 });

    // after invalidation → undefined again
    invalidateClientCache('sync-key');
    expect(getClientCache('sync-key')).toBeUndefined();
  });

  it('getClientCache returns undefined for expired TTL', async () => {
    const load = vi.fn().mockResolvedValue('stale');

    // 1ms TTL → immediately expires
    await fetchWithClientCache('exp-key', 1, load);
    await new Promise(r => setTimeout(r, 5));

    expect(getClientCache('exp-key')).toBeUndefined();
  });
});
