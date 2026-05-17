import type { User } from './user';

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
  createdAt: Date | string;

  // Relations
  messages?: ChatMessage[];
  user?: User;
}

export interface ChatMessage {
  id: string;
  chatSessionId: string;
  sender: ChatSender;
  message: string;
  createdAt: Date | string;

  // Relations
  chatSession?: ChatSession;
}
