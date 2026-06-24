export type StudyMode =
  | 'BASIC_CONCEPT'
  | 'BLANK_FILL'
  | 'INTERACTIVE_QUIZ'
  | 'PRACTICE_EXAM'
  | 'REVIEW_INCORRECT';

export interface ApiSubUnit {
  studyMode: string;
  title: string;
  progressPercent: number;
  status: 'completed' | 'in_progress' | 'not_started';
  lastStudiedAt?: string;
}

export interface ApiUnit {
  id: string;
  unitNumber: number;
  title: string;
  progress: number;
  subUnits: ApiSubUnit[];
}

export interface UnitsWithProgressResponse {
  units: ApiUnit[];
}

export interface StreakResponse {
  studyStreakDays: number;
}
