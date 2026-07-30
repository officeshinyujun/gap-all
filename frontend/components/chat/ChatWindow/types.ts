import type { SimilarQuestion } from '@shared/types/chat';
import type { ExamQuestion } from '@shared/types/examQuestion';

export interface Message {
  id: string;
  sender: 'USER' | 'AI';
  message: string;
  createdAt: string | Date;
  similarQuestions?: SimilarQuestion[];
}

export interface ChatWindowProps {
  sessionId: string;
  sessionTitle: string;
}
