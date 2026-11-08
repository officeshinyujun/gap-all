import { apiFetch } from '@/shared/lib/apiClient';

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
  await apiFetch('/users/me', {
    method: 'DELETE',
  });
}

export async function updateUserProfile(data: { name?: string; school?: string; grade?: string }): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
