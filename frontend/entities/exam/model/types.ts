import type { ExamQuestion } from '@shared/types/examQuestion';

export type ExamSourceType =
  | 'ai'
  | 'reference'
  | 'simply_reference'
  | 'ai_blueprint';

export type AiGenerationStage =
  | 'queued'
  | 'profile'
  | 'blueprint'
  | 'candidate'
  | 'validation'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface ExamListItem {
  id: string;
  title: string;
  startUnitNum: number;
  endUnitNum: number;
  difficulty: string;
  questionCount: number;
  totalScore: number | null;
  sourceType: ExamSourceType;
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
  sourceType: ExamSourceType;
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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  progress: number;
  stage: string;
  message: string;
  errorCode?: string;
  errorMessage?: string;
  errorStage?: string;
  examId?: string;
  shortfall?: {
    requestedCount: number;
    generatedCount: number;
    stageCounts?: {
      source: number;
      planner: number;
      fidelity: number;
      admission?: number;
    };
    rejectionsByTemplate?: Record<string, number>;
    rejectionsByCode?: Record<string, number>;
  };
  sourceType?: ExamSourceType;
  aiProgress?: {
    stage: AiGenerationStage;
    completed: number;
    total: number;
    attempt: number;
    maxAttempts: number;
    accepted: number;
    rejected: number;
  };
}

export type ExamGenerationMode = Extract<
  ExamSourceType,
  'simply_reference' | 'ai_blueprint'
>;
