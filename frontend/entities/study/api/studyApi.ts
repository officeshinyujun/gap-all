import { API_BASE_URL } from '@shared/lib/auth';
import type { ApiUnit, UnitsWithProgressResponse, StreakResponse } from '../model/types';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchUnitsWithProgress(subjectSlug: string): Promise<UnitsWithProgressResponse> {
  return apiFetch<UnitsWithProgressResponse>(`/study/${subjectSlug}/units`);
}

export async function fetchStreak(): Promise<StreakResponse> {
  return apiFetch<StreakResponse>('/study/streak');
}

export async function fetchUnitConcepts(subjectSlug: string, unitNumber: number): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/exams/concepts?subjectSlug=${subjectSlug}&startUnitNum=${unitNumber}&endUnitNum=${unitNumber}`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (!res.ok) return [];
    const data: { unitName: string; concepts: string[] }[] = await res.json();
    return data[0]?.concepts ?? [];
  } catch {
    return [];
  }
}

export async function fetchUnitId(subjectSlug: string, unitNumber: number): Promise<string | null> {
  try {
    const data = await fetchUnitsWithProgress(subjectSlug);
    const unit = data.units.find((u) => u.unitNumber === unitNumber);
    return unit?.id ?? null;
  } catch {
    return null;
  }
}

export async function updateStudyProgress(unitId: string, studyMode: string, progressPercent: number): Promise<void> {
  await fetch(`${API_BASE_URL}/study/progress`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitId, studyMode, progressPercent }),
  });
}
