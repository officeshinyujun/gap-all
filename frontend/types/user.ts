import type { StudyProgress } from './study.ts';
import type { ExamRecord } from './exam.ts';
import type { ChatSession } from './chat.ts';

export interface User {
  id: string;
  email: string;
  name: string;
  profileImageUrl?: string | null;
  studyStreakDays: number;
  createdAt: Date | string;
  progress?: StudyProgress[];
  exams?: ExamRecord[];
  chats?: ChatSession[];
}
