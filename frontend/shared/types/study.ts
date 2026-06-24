import type { User } from './user';
import type { ExamRecord } from './exam.ts';

export interface Subject {
  id: string;
  title: string;

  // Relations
  units?: Unit[];
  exams?: ExamRecord[];
}

export interface Unit {
  id: string;
  subjectId: string;
  unitNumber: number;
  title: string;

  // Relations
  subject?: Subject;
  progress?: StudyProgress[];
}

export enum StudyMode {
  BASIC_CONCEPT = 'BASIC_CONCEPT',
  BLANK_FILL = 'BLANK_FILL',
  INTERACTIVE_QUIZ = 'INTERACTIVE_QUIZ',
  PRACTICE_EXAM = 'PRACTICE_EXAM',
  REVIEW_INCORRECT = 'REVIEW_INCORRECT'
}

export interface StudyProgress {
  id: string;
  userId: string;
  unitId: string;
  studyMode: StudyMode;
  progressPercent: number;
  lastStudiedAt: Date | string;

  // Relations
  user?: User;
  unit?: Unit;
}
