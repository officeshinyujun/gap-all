import { API_BASE_URL } from '@shared/lib/auth';
import type { ExamQuestion } from '@entities/question/model/types';
import type { ExamListItem, ExamData, ExamResult, SubjectInfo, ExamJobStatus } from '../model/types';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

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

export async function fetchExams(subjectSlug?: string): Promise<ExamListItem[]> {
  const query = subjectSlug ? `?subject=${subjectSlug}` : '';
  return apiFetch<ExamListItem[]>(`/exams${query}`);
}

export async function fetchSubjectBySlug(slug: string): Promise<SubjectInfo> {
  return apiFetch<SubjectInfo>(`/subjects/${slug}`);
}

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

export async function pollExamJob(jobId: string): Promise<ExamJobStatus> {
  return apiFetch<ExamJobStatus>(`/exams/jobs/${jobId}`);
}

export async function cancelExamJob(jobId: string): Promise<ExamJobStatus> {
  return apiFetch<ExamJobStatus>(`/exams/jobs/${jobId}/cancel`, {
    method: 'POST',
  });
}

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

export async function submitExam(
  examId: string,
  answers: { examItemId: string; answer: number }[],
): Promise<void> {
  await apiFetch(`/exams/${examId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

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
