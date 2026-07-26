import type { ExamQuestion } from '@shared/types/examQuestion';

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

export interface ExamItem {
  id: string;
  orderIndex: number;
  question: ExamQuestion;
  unitNumber?: number | null;
  targetConcept?: string;
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
  errorCode?: string;
  errorMessage?: string;
  errorStage?: string;
  examId?: string;
}
