import { API_BASE_URL } from './auth';
import type { BlankQuestion, ConceptPair, QuizCount } from '@/types/studyQuiz';
import type { ExamQuestion } from '@/types/examQuestion';
export { fetchUnitId } from './studyApi';

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

export async function fetchConceptMd(
  subjectSlug: string,
  unitNumber: number,
): Promise<string> {
  const data = await apiFetch<{ md: string }>(
    `/study/${subjectSlug}/${unitNumber}/concept-md`,
  );
  return data.md;
}

export interface ConceptExplanation {
  found: boolean;
  title: string;
  description: string;
  bulletPoints: string[];
  trapPoints: string[];
  logicFlow: string;
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

export async function updateStudyProgress(
  unitId: string,
  studyMode: string,
  progressPercent: number,
): Promise<void> {
  await fetch(`${API_BASE_URL}/study/progress`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ unitId, studyMode, progressPercent }),
  });
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

// 오답 기록 일괄 저장
export async function postIncorrectRecords(
  records: {
    subjectSlug: string;
    unitNumber: number;
    targetConcept: string;
    source: 'EXAM' | 'BLANK_FILL' | 'INTERACTIVE_QUIZ' | 'PRACTICE_EXAM';
    questionId?: string;
  }[],
): Promise<{ saved: number }> {
  const res = await fetch(`${API_BASE_URL}/study/incorrect-records`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json();
}

// 복습 추천 조회
export interface ReviewRecommendation {
  targetConcept: string;
  subjectSlug: string;
  subjectTitle: string;
  unitNumber: number;
  unitTitle: string;
  incorrectCount: number;
  daysSinceLastReview: number | null;
  source: string;
  score: number;
  questionIds: string[];
}

export interface ReviewRecommendationsResponse {
  totalIncorrectConcepts: number;
  recommendations: ReviewRecommendation[];
}

export async function fetchReviewRecommendations(): Promise<ReviewRecommendationsResponse> {
  const res = await fetch(`${API_BASE_URL}/study/review-recommendations`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json();
}

// 복습 결과 제출
export async function submitReviewResult(
  results: {
    targetConcept: string;
    unitId: string;
    source: 'EXAM' | 'BLANK_FILL' | 'INTERACTIVE_QUIZ' | 'PRACTICE_EXAM';
    isCorrect: boolean;
  }[],
): Promise<{ updated: number; graduated: number }> {
  const res = await fetch(`${API_BASE_URL}/study/review-result`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json();
}

// 오답 기반 새 문제 생성 요청
export interface ReviewQuestion {
  id: string;
  correctAnswer: number;
  metadata: ExamQuestion['metadata'];
  render_ready: ExamQuestion['render_ready'];
}

export async function fetchQuestionsByIds(questionIds: string[]): Promise<ReviewQuestion[]> {
  const res = await fetch(`${API_BASE_URL}/study/questions-by-ids`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questionIds }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json();
}

export async function createReviewExamJob(
  subjectSlug: string,
  options?: {
    unitRange?: { start: number; end: number };
    questionCount?: number;
    difficulty?: string;
  },
): Promise<{ jobId: string; status: string; progress: number; stage: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/study/review-generate`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subjectSlug, ...options }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json();
}

export interface ConceptBookmark {
  id: string;
  subjectSlug: string;
  unitNumber: number;
  conceptName: string;
  description: string | null;
  createdAt: string;
}

export async function fetchConceptBookmarks(): Promise<ConceptBookmark[]> {
  return apiFetch<ConceptBookmark[]>('/study/concept-bookmarks');
}

export async function addConceptBookmark(data: { subjectSlug: string; unitNumber: number; conceptName: string; description?: string }): Promise<ConceptBookmark> {
  const res = await fetch(`${API_BASE_URL}/study/concept-bookmarks`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
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
