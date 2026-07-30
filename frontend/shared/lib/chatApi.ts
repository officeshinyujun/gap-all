import { API_BASE_URL } from './auth';
import {
  fetchWithClientCache,
  invalidateClientCache,
} from '@/lib/clientCache';
import type { ChatSession, ChatMessage, ImageQuestionResponse } from '@shared/types/chat';

const CHAT_TTL_MS = 30_000;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchChatSessions(): Promise<ChatSession[]> {
  return fetchWithClientCache(
    'chat:sessions',
    CHAT_TTL_MS,
    () => apiFetch<ChatSession[]>('/chat/sessions'),
  );
}

export function invalidateChatSessionsCache(): void {
  invalidateClientCache('chat:sessions');
}

export async function createChatSession(data: {
  subjectId: string;
  title: string;
  startUnit?: number;
  endUnit?: number;
}): Promise<{ session: ChatSession }> {
  const result = await apiFetch<{ session: ChatSession }>('/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  invalidateChatSessionsCache();
  return result;
}

export async function fetchChatSession(sessionId: string): Promise<ChatSession> {
  return apiFetch<ChatSession>(`/chat/sessions/${sessionId}`);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await apiFetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
  invalidateChatSessionsCache();
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
  mode?: 'chat' | 'generate',
): Promise<{ userMessage: ChatMessage; aiMessage: ChatMessage; generatedQuestion?: any }> {
  return apiFetch(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode }),
  });
}

export async function sendImageQuestion(
  sessionId: string,
  imageFile: File,
): Promise<ImageQuestionResponse> {
  const formData = new FormData();
  formData.append('image', imageFile);
  const res = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/image-question`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }
  return res.json() as Promise<ImageQuestionResponse>;
}
