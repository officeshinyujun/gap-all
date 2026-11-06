import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, performTokenRefresh } from '../apiClient';
import * as clientCache from '@/lib/clientCache';

describe('apiClient with Silent Token Refresh', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return response json on successful 200 request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'success' }),
    });

    const result = await apiFetch('/test');
    expect(result).toEqual({ message: 'success' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should silently refresh token and retry on 401 response', async () => {
    const fetchMock = vi
      .fn()
      // 1st call: /protected returns 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      })
      // 2nd call: /auth/refresh returns 200
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'new-token' }),
      })
      // 3rd call: retry /protected returns 200
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'secret data' }),
      });

    global.fetch = fetchMock;

    const result = await apiFetch('/protected');

    expect(result).toEqual({ data: 'secret data' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain('/protected');
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(fetchMock.mock.calls[2][0]).toContain('/protected');
  });

  it('should deduplicate simultaneous 401 refreshes (Mutex Queue)', async () => {
    let refreshCount = 0;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ refreshed: true }),
        };
      }

      if (refreshCount === 0) {
        // First attempt: all return 401
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: 'Token expired' }),
        };
      }

      // After refresh: all succeed
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: 'ok from ' + url }),
      };
    });

    // Fire 3 parallel requests
    const [res1, res2, res3] = await Promise.all([
      apiFetch('/users/me'),
      apiFetch('/study/progress'),
      apiFetch('/exams/123'),
    ]);

    expect((res1 as any).result).toContain('/users/me');
    expect((res2 as any).result).toContain('/study/progress');
    expect((res3 as any).result).toContain('/exams/123');

    // Ensure /auth/refresh was only called ONCE despite 3 parallel 401s
    expect(refreshCount).toBe(1);
  });

  it('should not attempt refresh on auth endpoints (e.g. /auth/login)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    });
    global.fetch = fetchMock;

    await expect(apiFetch('/auth/login')).rejects.toThrow('Invalid credentials');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should throw and clear cache when refresh fails', async () => {
    const clearCacheSpy = vi.spyOn(clientCache, 'clearClientCache');

    global.fetch = vi
      .fn()
      // Initial 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Token expired' }),
      })
      // /auth/refresh fails with 401 (refresh token expired)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Refresh token expired' }),
      });

    await expect(apiFetch('/protected-endpoint')).rejects.toThrow('Token expired');
    expect(clearCacheSpy).toHaveBeenCalled();
  });
});
