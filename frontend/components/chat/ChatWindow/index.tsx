'use client';

import { useState, useEffect, useRef } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { API_BASE_URL } from '@/lib/auth';
import { ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './style.module.scss';

const markdownComponents = {
  a: ({ href, children, ...props }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

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

  useEffect(() => {
    setFetching(true);
    setMessages([]);
    fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setFetching(false));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sender: 'USER',
      message: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
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
          <div className={s.messageInner}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={s.messageRow}
                style={{ width: '100%', display: 'flex', justifyContent: msg.sender === 'USER' ? 'flex-end' : 'flex-start' }}
              >
                <div className={`${s.bubble} ${msg.sender === 'USER' ? s.userBubble : s.aiBubble}`}>
                  {msg.sender === 'USER' ? (
                    <Typo.MD size={14} color="primary" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {msg.message}
                    </Typo.MD>
                  ) : (
                    <div className={s.markdown}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {msg.message}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
                <div className={`${s.bubble} ${s.aiBubble}`}>
                  <Typo.MD size={14} color="secondary">답변 생성 중...</Typo.MD>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* 입력창 */}
      <div className={s.inputArea}>
        <HStack gap={SPACING.s8} align="end" className={s.inputInner}>
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
