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
  return apiFetch<UnitsWithProgressResponse>(`/study/${subjectSlug}/units`);
}

// GET /study/streak — 현재 유저의 스트릭 일수
export async function fetchStreak(): Promise<StreakResponse> {
  return apiFetch<StreakResponse>('/study/streak');
}

// GET /exams/concepts — 단원 핵심 개념 목록 (태그용, 인증 불필요)
export async function fetchUnitConcepts(
  subjectSlug: string,
  unitNumber: number,
): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/exams/concepts?subjectSlug=${subjectSlug}&startUnitNum=${unitNumber}&endUnitNum=${unitNumber}`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (!res.ok) return [];
    const data: UnitConceptsResponse[] = await res.json();
    return data[0]?.concepts ?? [];
  } catch {
    return [];
  }
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
