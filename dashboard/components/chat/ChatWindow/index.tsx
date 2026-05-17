'use client';

import { useState, useEffect, useRef } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './style.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Message {
  id: string;
  sender: 'USER' | 'AI';
  message: string;
  createdAt: string;
}

interface ChatWindowProps {
  sessionId: string;
  sessionTitle: string;
}

export function ChatWindow({ sessionId, sessionTitle }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 세션 메시지 로드
  useEffect(() => {
    setFetching(true);
    fetch(`${API_URL}/chat/sessions/${sessionId}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages ?? []);
      })
      .finally(() => setFetching(false));
  }, [sessionId]);

  // 새 메시지 오면 스크롤 하단으로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);

    // 낙관적 업데이트 — 유저 메시지 즉시 표시
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sender: 'USER',
      message: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`${API_URL}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error('메시지 전송 실패');
      const data = await res.json();
      // 임시 메시지 제거 후 실제 메시지 추가
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.aiMessage,
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <VStack fullWidth fullHeight className={s.container}>
      {/* 헤더 */}
      <HStack align="center" className={s.header} fullWidth>
        <Typo.SM size={16} color="primary">{sessionTitle}</Typo.SM>
      </HStack>

      {/* 메시지 목록 */}
      <div className={s.messageList}>
        {fetching ? (
          <div className={s.center}>
            <Typo.MD size={14} color="secondary">불러오는 중...</Typo.MD>
          </div>
        ) : messages.length === 0 ? (
          <div className={s.center}>
            <Typo.MD size={14} color="secondary">첫 질문을 입력해보세요.</Typo.MD>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${s.messageRow} ${msg.sender === 'USER' ? s.user : s.ai}`}
              style={{ width: '100%', display: 'flex', justifyContent: msg.sender === 'USER' ? 'flex-end' : 'flex-start' }}
            >
              <div className={`${s.bubble} ${msg.sender === 'USER' ? s.userBubble : s.aiBubble}`}>
                {msg.sender === 'USER' ? (
                  <Typo.MD size={14} color="primary" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {msg.message}
                  </Typo.MD>
                ) : (
                  <div className={s.markdown}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.message}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className={`${s.messageRow} ${s.ai}`} style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
            <div className={`${s.bubble} ${s.aiBubble}`}>
              <Typo.MD size={14} color="secondary">답변 생성 중...</Typo.MD>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className={s.inputArea}>
        <HStack gap={SPACING.s8} align="end" fullWidth className={s.inputRow}>
          <textarea
            className={s.input}
            placeholder="궁금한 점을 입력하세요... (Shift+Enter 줄바꿈)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            className={`${s.sendButton} ${loading || !input.trim() ? s.disabled : ''}`}
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <ArrowUp size={18} color="#FFFFFF" strokeWidth={3} />
          </button>
        </HStack>
      </div>
    </VStack>
  );
}
