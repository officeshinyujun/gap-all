import { API_BASE_URL } from '@shared/lib/auth';
import type {
  FrequencyConcept,
  ConceptExplanation,
  ConceptBookmark,
  StructuredConcept,
  SummationV2Data,
} from '../model/types';

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

export async function fetchFrequencyConcept(
  subjectSlug: string,
  unitNumber: number,
): Promise<FrequencyConcept> {
  return apiFetch<FrequencyConcept>(`/study/${subjectSlug}/${unitNumber}/frequency-concept`);
}

export async function fetchConceptByName(
  subjectSlug: string,
  unitNumber: number,
  conceptName: string,
): Promise<ConceptExplanation> {
  return apiFetch<ConceptExplanation>(
    `/study/${subjectSlug}/${unitNumber}/concept?name=${encodeURIComponent(conceptName)}`,
  );
}

export async function fetchStructuredConcept(
  subjectSlug: string,
  unitNumber: number,
): Promise<StructuredConcept | null> {
  try {
    return await apiFetch<StructuredConcept>(`/study/${subjectSlug}/${unitNumber}/structured-concept`);
  } catch {
    return null;
  }
}

export async function fetchSummationV2Cards(
  subjectSlug: string,
  unitNumber: number,
): Promise<SummationV2Data> {
  return apiFetch<SummationV2Data>(`/study/${subjectSlug}/summation-v2/${unitNumber}`);
}

export async function fetchConceptBookmarks(): Promise<ConceptBookmark[]> {
  return apiFetch<ConceptBookmark[]>('/study/concept-bookmarks');
}

export async function addConceptBookmark(data: {
  subjectSlug: string;
  unitNumber: number;
  conceptName: string;
  description?: string;
}): Promise<ConceptBookmark> {
  const res = await fetch(`${API_BASE_URL}/study/concept-bookmarks`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json();
}

export async function removeConceptBookmark(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/study/concept-bookmarks/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
}
