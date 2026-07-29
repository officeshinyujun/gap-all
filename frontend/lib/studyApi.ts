import { API_BASE_URL } from './auth';
import {
  fetchWithClientCache,
  invalidateClientCache,
  invalidateClientCachePrefix,
} from './clientCache';

const USER_STUDY_TTL_MS = 30_000;
const CONTENT_TTL_MS = 60 * 60 * 1_000;

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
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface ApiSubUnit {
  studyMode: string;
  title: string;
  progressPercent: number;
  status: 'completed' | 'in_progress' | 'not_started';
  lastStudiedAt?: string;
}

export interface ApiUnit {
  id: string;
  unitNumber: number;
  title: string;
  progress: number;
  subUnits: ApiSubUnit[];
}

export interface UnitsWithProgressResponse {
  units: ApiUnit[];
}

export interface StreakResponse {
  studyStreakDays: number;
}

export interface UnitConceptsResponse {
  unitName: string;
  concepts: string[];
}

// GET /study/:subjectSlug/units — 실제 진척도 포함 단원 목록
export async function fetchUnitsWithProgress(
  subjectSlug: string,
): Promise<UnitsWithProgressResponse> {
  return fetchWithClientCache(
    `study:units:${subjectSlug}`,
    USER_STUDY_TTL_MS,
    () => apiFetch<UnitsWithProgressResponse>(`/study/${subjectSlug}/units`),
  );
}

// GET /study/streak — 현재 유저의 스트릭 일수
export async function fetchStreak(): Promise<StreakResponse> {
  return fetchWithClientCache(
    'study:streak',
    USER_STUDY_TTL_MS,
    () => apiFetch<StreakResponse>('/study/streak'),
  );
}

// GET /exams/concepts — 단원 핵심 개념 목록 (태그용, 인증 불필요)
export async function fetchUnitConcepts(
  subjectSlug: string,
  unitNumber: number,
): Promise<string[]> {
  return fetchWithClientCache(
    `content:concepts:${subjectSlug}:${unitNumber}`,
    CONTENT_TTL_MS,
    async () => {
      const res = await fetch(
        `${API_BASE_URL}/exams/concepts?subjectSlug=${subjectSlug}&startUnitNum=${unitNumber}&endUnitNum=${unitNumber}`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const data: UnitConceptsResponse[] = await res.json();
      return data[0]?.concepts ?? [];
    },
  ).catch(() => []);
}

export function invalidateStudyCache(subjectSlug?: string): void {
  if (subjectSlug) {
    invalidateClientCache(`study:units:${subjectSlug}`);
  } else {
    invalidateClientCachePrefix('study:units:');
  }
  invalidateClientCache('study:streak');
}

// GET /study/:subjectSlug/units → unitNumber로 unitId 조회
export async function fetchUnitId(
  subjectSlug: string,
  unitNumber: number,
): Promise<string | null> {
  try {
    const data = await fetchUnitsWithProgress(subjectSlug);
    const unit = data.units.find((u) => u.unitNumber === unitNumber);
    return unit?.id ?? null;
  } catch {
    return null;
  }
}
