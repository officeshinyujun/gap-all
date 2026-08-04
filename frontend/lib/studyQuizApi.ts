import { API_BASE_URL } from './auth';
import {
  fetchWithClientCache,
  invalidateClientCache,
} from './clientCache';
import { invalidateStudyCache } from './studyApi';
import type { BlankQuestion, ConceptPair, QuizCount } from '@/types/studyQuiz';
import type { ExamQuestion } from '@/types/examQuestion';
export { fetchUnitId } from './studyApi';

// 타입은 entities/concept에서 재익스포트
import type {
  FrequencyConcept,
  FrequencyConceptItem,
  ConceptHighlightV2,
  ConceptExplanation,
  ConceptBookmark,
  StructuredConcept,
  StructuredSection,
  StructuredSubsection,
  SummationData,
  SummationCard,
  SummationCardContent,
  SummationV2Data,
  SummationV2Card,
  SummationV2CardContent,
  SummationV2KeyConcept,
  RelatedConceptQuestion,
} from '@entities/concept/model/types';

export type {
  FrequencyConcept,
  FrequencyConceptItem,
  ConceptHighlightV2,
  ConceptExplanation,
  ConceptBookmark,
  StructuredConcept,
  StructuredSection,
  StructuredSubsection,
  SummationData,
  SummationCard,
  SummationCardContent,
  SummationV2Data,
  SummationV2Card,
  SummationV2CardContent,
  SummationV2KeyConcept,
  RelatedConceptQuestion,
};

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

const FREQ_CONCEPT_TTL_MS = 5 * 60 * 1_000; // 5분 — 개념 데이터는 자주 안 바뀜
const BOOKMARK_TTL_MS = 30_000;

export async function fetchFrequencyConcept(
  subjectSlug: string,
  unitNumber: number,
): Promise<FrequencyConcept> {
  return fetchWithClientCache(
    `concept:frequency:${subjectSlug}:${unitNumber}`,
    FREQ_CONCEPT_TTL_MS,
    () => apiFetch<FrequencyConcept>(
      `/study/${subjectSlug}/${unitNumber}/frequency-concept`,
    ),
  );
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
  invalidateStudyCache();
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
  const data = await res.json() as { saved: number };
  invalidateClientCache('study:review-recommendations');
  return data;
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
  return fetchWithClientCache(
    'study:review-recommendations',
    30_000,
    async () => {
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
      return res.json() as Promise<ReviewRecommendationsResponse>;
    },
  );
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
  const data = await res.json() as { updated: number; graduated: number };
  invalidateClientCache('study:review-recommendations');
  return data;
}

// 오답 기반 새 문제 생성 요청
export interface ReviewQuestion {
  id: string;
  metadata: ExamQuestion['metadata'];
  render_ready: Omit<ExamQuestion['render_ready'], 'explanation'>;
}

export interface ReviewAnswerFeedback {
  correctAnswer: number;
  explanation: ExamQuestion['explanation'];
  isCorrect: boolean;
}

export async function fetchReviewQuestions(questionIds: string[]): Promise<ReviewQuestion[]> {
  const res = await fetch(`${API_BASE_URL}/study/review-questions`, {
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

export async function submitReviewAnswer(
  questionId: string,
  answer: number,
): Promise<ReviewAnswerFeedback> {
  const res = await fetch(`${API_BASE_URL}/study/review-questions/${questionId}/answer`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ answer }),
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

export async function fetchConceptBookmarks(): Promise<ConceptBookmark[]> {
  return fetchWithClientCache(
    'concept:bookmarks',
    BOOKMARK_TTL_MS,
    () => apiFetch<ConceptBookmark[]>('/study/concept-bookmarks'),
  );
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
  invalidateClientCache('concept:bookmarks');
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
  invalidateClientCache('concept:bookmarks');
}

export async function fetchStructuredConcept(
  subjectSlug: string,
  unitNumber: number,
): Promise<StructuredConcept | null> {
  try {
    return await apiFetch<StructuredConcept>(
      `/study/${subjectSlug}/${unitNumber}/structured-concept`,
    );
  } catch {
    return null;
  }
}

export async function fetchSummationCards(
  subjectSlug: string,
  unitNumber: number,
): Promise<SummationData> {
  return apiFetch<SummationData>(`/study/${subjectSlug}/summation/${unitNumber}`);
}

export async function fetchSummationV2Cards(
  subjectSlug: string,
  unitNumber: number,
): Promise<SummationV2Data> {
  return apiFetch<SummationV2Data>(`/study/${subjectSlug}/summation-v2/${unitNumber}`);
}
