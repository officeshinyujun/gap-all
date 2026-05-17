import { API_BASE_URL } from './auth';
import type { BlankQuestion, ConceptPair, QuizCount } from '@/types/studyQuiz';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchBlankQuestions(
  subjectSlug: string,
  unitNumber: number,
  count: QuizCount = 10,
): Promise<BlankQuestion[]> {
  const data = await apiFetch<{ items: BlankQuestion[] }>(
    `/study/${subjectSlug}/${unitNumber}/blank-questions?count=${count}`,
  );
  return data.items;
}

export async function fetchConceptPairs(
  subjectSlug: string,
  unitNumber: number,
  count: QuizCount = 10,
): Promise<ConceptPair[]> {
  const data = await apiFetch<{ items: ConceptPair[] }>(
    `/study/${subjectSlug}/${unitNumber}/concept-pairs?count=${count}`,
  );
  return data.items;
}

export async function clearStudyQuizCache(
  subjectSlug: string,
  unitNumber: number,
  type?: 'blank' | 'concept',
  count?: QuizCount,
): Promise<void> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (count) params.set('count', String(count));
  const query = params.toString() ? `?${params.toString()}` : '';

  await fetch(`${API_BASE_URL}/study/${subjectSlug}/${unitNumber}/cache${query}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
