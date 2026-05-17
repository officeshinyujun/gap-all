import type { User } from './user';
import type { Subject } from './study';

export enum Difficulty {
  LOW = 'LOW',
  MIDDLE = 'MIDDLE',
  HIGH = 'HIGH',
  INTERGRATE = 'INTERGRATE',
}

export interface ExamRecord {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  startUnitNum: number;
  endUnitNum: number;
  difficulty: Difficulty;
  questionCount: number;
  customPrompt?: string | null;
  
  totalScore?: number | null;
  createdAt: Date | string;

  // Relations
  tags?: ExamTag[];
  questions?: ExamQuestion[];
  user?: User;
  subject?: Subject;
}

export interface ExamTag {
  id: string;
  examId: string;
  tagName: string;

  // Relations
  exam?: ExamRecord;
}

export enum QuestionType {
  BLANK_FILL = 'BLANK_FILL',
  INTERACTIVE = 'INTERACTIVE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE'
}

export interface Question {
  id: string;
  subjectId: string;
  unitId: string;
  type: QuestionType;
  content: string;
  correctAnswer: string;
  explanation?: string | null;

  // Relations
  examQuestions?: ExamQuestion[];
}

export interface ExamQuestion {
  id: string;
  examId: string;
  questionId: string;
  orderIndex: number;
  
  userAnswer?: string | null;
  isCorrect: boolean;

  // Relations
  exam?: ExamRecord;
  question?: Question;
}
