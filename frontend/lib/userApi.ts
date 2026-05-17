import { API_BASE_URL } from './auth';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'API Error');
  }

  return res.json();
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  school?: string;
  grade?: string;
  role: string;
  studyStreakDays: number;
}

export interface UserStats {
  studyStreakDays: number;
  totalStudyDays: number;
  completedUnits: number;
  examsTaken: number;
}

export async function fetchUserProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me');
}

export async function fetchUserStats(): Promise<UserStats> {
  return apiFetch<UserStats>('/users/me/stats');
}

export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? '계정 삭제에 실패했습니다.');
  }
}

export async function updateUserProfile(data: { name?: string; school?: string; grade?: string }): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
