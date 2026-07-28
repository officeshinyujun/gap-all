import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock must be before imports (vi.mock is hoisted)
vi.mock('../../lib/auth', () => ({
  API_BASE_URL: 'http://localhost:3001',
}));

import { fetchUserProfile, fetchUserStats, updateUserProfile, deleteAccount } from '../userApi';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('userApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchUserProfile', () => {
    it('GET /users/me를 호출하여 프로필 반환', async () => {
      const mockProfile = {
        id: 'user-1',
        name: '홍길동',
        email: 'test@example.com',
        role: 'user',
        studyStreakDays: 7,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const result = await fetchUserProfile();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/users/me',
        expect.objectContaining({
          credentials: 'include',
        }),
      );
      expect(result).toEqual(mockProfile);
    });

    it('에러 발생 시 throw', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      await expect(fetchUserProfile()).rejects.toThrow('Unauthorized');
    });
  });

  describe('fetchUserStats', () => {
    it('GET /users/me/stats 호출', async () => {
      const mockStats = {
        studyStreakDays: 5,
        totalStudyDays: 30,
        completedUnits: 10,
        examsTaken: 5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const result = await fetchUserStats();
      expect(result).toEqual(mockStats);
    });
  });

  describe('updateUserProfile', () => {
    it('PATCH /users/me 호출', async () => {
      const updateData = { name: '새이름' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'user-1',
            name: '새이름',
            email: 'test@example.com',
            role: 'user',
            studyStreakDays: 7,
          }),
      });

      const result = await updateUserProfile(updateData);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/users/me',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
      expect(result.name).toBe('새이름');
    });
  });

  describe('deleteAccount', () => {
    it('DELETE /users/me 호출', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await deleteAccount();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/users/me',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
        }),
      );
    });

    it('실패 시 에러 throw', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      });
      await expect(deleteAccount()).rejects.toThrow('Server error');
    });
  });
});
