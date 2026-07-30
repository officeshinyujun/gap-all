import { API_BASE_URL } from './auth';
import {
  fetchWithClientCache,
  invalidateClientCache,
} from './clientCache';
import type { ExamQuestion } from '@/types/examQuestion';

const EXAM_TTL_MS = 30_000;

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

// 백엔드 question 응답 → QuestionRenderer가 기대하는 ExamQuestion 형태로 변환
function normalizeQuestion(raw: Record<string, unknown>): ExamQuestion {
  if (raw.render_ready) return raw as unknown as ExamQuestion;

  return {
    metadata: {
      unit_name: '',
      target_concept: (raw.targetConcept as string) ?? '',
      item_type: (raw.itemType as string) ?? '',
      difficulty: (raw.difficulty as string) ?? '',
      recommended_template: (raw.recommendedTemplate as string) ?? '',
    },
    render_ready: {
      question_stem: (raw.questionStem as string) ?? '',
      stimulus_data: raw.stimulusData ?? {},
      options_list: (raw.optionsList as string[]) ?? [],
    },
    explanation: raw.explanation as any,
    correct_answer: raw.correctAnswer as number | undefined,
    combo_block: raw.comboBlock as any ?? raw.combo_block as any ?? undefined,
  } as ExamQuestion;
}

export interface ExamListItem {
  id: string;
  title: string;
  startUnitNum: number;
  endUnitNum: number;
  difficulty: string;
  questionCount: number;
  totalScore: number | null;
  sourceType: 'ai' | 'reference';
  createdAt: string;
  subject?: { id: string; slug: string; title: string };
  tags?: { id: string; tagName: string }[];
}

// GET /exams?subject={slug} — 사용자 시험 목록
export async function fetchExams(subjectSlug?: string): Promise<ExamListItem[]> {
  const query = subjectSlug ? `?subject=${subjectSlug}` : '';
  const cacheKey = subjectSlug ? `exam:list:${subjectSlug}` : 'exam:list:all';
  return fetchWithClientCache(
    cacheKey,
    EXAM_TTL_MS,
    () => apiFetch<ExamListItem[]>(`/exams${query}`),
  );
}

export function invalidateExamListCache(subjectSlug?: string): void {
  if (subjectSlug) {
    invalidateClientCache(`exam:list:${subjectSlug}`);
  }
  invalidateClientCache('exam:list:all');
}

export interface SubjectInfo {
  id: string;
  slug: string;
  title: string;
}

export interface ExamJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  message: string;
  examId?: string;
}

export interface ExamItem {
  id: string;
  orderIndex: number;
  question: ExamQuestion;
  unitNumber?: number | null;
  targetConcept?: string;
  userAnswer?: number | null;
}

export interface ExamData {
  id: string;
  title: string;
  difficulty: string;
  questionCount: number;
  sourceType: 'ai' | 'reference';
  items: ExamItem[];
}

export interface ExamResultItem {
  orderIndex: number;
  isCorrect: boolean;
  selectedAnswer: number | null;
  correctAnswer: number;
  question: ExamQuestion;
}

export interface ExamResult {
  examId: string;
  score: number;
  totalCount: number;
  correctCount: number;
  items: ExamResultItem[];
}

// slug로 과목 정보(subjectId) 조회
export async function fetchSubjectBySlug(slug: string): Promise<SubjectInfo> {
  return apiFetch<SubjectInfo>(`/subjects/${slug}`);
}

// 비동기 시험 생성 job 시작
export async function createExamJob(
  subjectId: string,
  unitNumber: number,
  questionCount = 10,
): Promise<{ jobId: string }> {
  const request = {
    subjectId,
    startUnitNum: unitNumber,
    endUnitNum: unitNumber,
    difficulty: 'MIDDLE',
    questionCount,
    sourceType: 'simply_reference',
  };
  return apiFetch<{ jobId: string }>('/exams/jobs', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// job 상태 폴링
export async function pollExamJob(jobId: string): Promise<ExamJobStatus> {
  return apiFetch<ExamJobStatus>(`/exams/jobs/${jobId}`);
}

// 시험 데이터 조회 (question 구조 정규화 포함)
export async function fetchExam(examId: string): Promise<ExamData> {
  const data = await apiFetch<ExamData>(`/exams/${examId}`);
  return {
    ...data,
    items: data.items.map((item) => ({
      ...item,
      unitNumber: (item as any).unitNumber ?? null,
      targetConcept: (item as any).targetConcept ?? '',
      question: normalizeQuestion(item.question as unknown as Record<string, unknown>),
    })),
  };
}

// 답안 제출
export async function saveExamAnswers(
  examId: string,
  answers: { examItemId: string; answer: number }[],
): Promise<{ saved: number }> {
  return apiFetch<{ saved: number }>(`/exams/${examId}/answers`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  });
}

export async function submitExam(
  examId: string,
  answers: { examItemId: string; answer: number }[],
): Promise<void> {
  await apiFetch(`/exams/${examId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

// 문항 플래그 (문제 삭제 + 데이터 저장)
export async function flagExamItem(
  examId: string,
  itemId: string,
  reason?: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/exams/${examId}/items/${itemId}/flag`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// 결과 조회
export async function fetchExamResult(examId: string): Promise<ExamResult> {
  const data = await apiFetch<any>(`/exams/${examId}/result`);
  return {
    examId: data.exam?.id ?? examId,
    score: data.score ?? 0,
    totalCount: data.totalCount ?? 0,
    correctCount: data.correctCount ?? 0,
    items: (data.items ?? []).map((item: any) => ({
      orderIndex: item.orderIndex,
      isCorrect: item.isCorrect ?? false,
      selectedAnswer: item.userAnswer ?? null,
      correctAnswer: item.question?.correctAnswer ?? 0,
      question: normalizeQuestion(item.question as Record<string, unknown>),
    })),
  };
}
