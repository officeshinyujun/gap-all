import type { User } from './user';
import type { ExamQuestion } from './examQuestion';
import type { ConceptHighlightV2 } from '@entities/concept/model/types';

export enum ChatSender {
  USER = 'USER',
  AI = 'AI'
}

export interface ChatSession {
  id: string;
  userId: string;
  subjectId?: string | null;
  title: string;
  searchScope?: string | null;
  startUnit?: number | null;
  endUnit?: number | null;
  createdAt: Date | string;
  subject?: { title: string } | null;
  messages?: ChatMessage[];
  user?: User;
}

export interface ChatMessage {
  id: string;
  chatSessionId: string;
  sender: ChatSender;
  message: string;
  createdAt: Date | string;
  chatSession?: ChatSession;
}

export interface SimilarQuestion {
  conceptName: string;
  matchedConcepts?: string[];
  unitNumber: number;
  sourceExam: string;
  questionNumber: number | null;
  question: ExamQuestion & { correct_answer: number | null; rawStimulus?: string };
  conceptHighlightV2?: ConceptHighlightV2 | null;
}

export interface ImageQuestionResponse {
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  similarQuestions: SimilarQuestion[];
}
