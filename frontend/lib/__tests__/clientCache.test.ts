import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearClientCache,
  fetchWithClientCache,
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
});
