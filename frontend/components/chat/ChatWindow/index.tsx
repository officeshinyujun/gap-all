'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { API_BASE_URL } from '@shared/lib/auth';
import { sendImageQuestion, sendChatMessage } from '@shared/lib/chatApi';
import { TypewriterLoader } from '@shared/ui/TypewriterLoader';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatInputArea } from './ChatInputArea';
import { GeneratedQuestionCard, saveAnswerToServer } from './GeneratedQuestionCard';
import { SimilarQuestionsSection } from './SimilarQuestionsSection';
import { useTypewriter } from './useTypewriter';
import type { Message, ChatWindowProps } from './types';
import type { SimilarQuestion } from '@shared/types/chat';
import type { ExamQuestion } from '@shared/types/examQuestion';
import s from './style.module.scss';

function convertToExamQuestion(raw: any): ExamQuestion {
  return {
    metadata: {
      unit_name: '',
      target_concept: raw.target_concept ?? '',
      item_type: raw.difficulty ?? '중',
      difficulty: raw.difficulty ?? '중',
    },
    render_ready: {
      question_stem: raw.question_stem ?? '',
      stimulus_data: raw.stimulus ?? '',
      options: (raw.options ?? []).map((opt: string, i: number) => ({
        id: i + 1,
        text: opt.replace(/^[①②③④⑤]\s*/, ''),
      })),
      explanation: raw.explanation ?? '',
    },
    correct_answer: raw.correct_answer ?? undefined,
    combo_block: raw.combo_items?.length > 0
      ? { title: raw.combo_title || '보기', items: raw.combo_items ?? [] }
      : undefined,
  };
}

export function ChatWindow({ sessionId, sessionTitle }: ChatWindowProps) {
  // ── state ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  const [similarQuestionsMap, setSimilarQuestionsMap] = useState<Record<string, SimilarQuestion[]>>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [explanationOpen, setExplanationOpen] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const [typewriterEnabled, setTypewriterEnabled] = useState(() => {
    try { return localStorage.getItem('chat_typewriter') !== 'false'; } catch { return true; }
  });
  const [typingProgress, setTypingProgress] = useState<Record<string, number>>({});

  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  const [generateMode, setGenerateMode] = useState(() => {
    try { return localStorage.getItem('chat_generate_mode') === 'true'; } catch { return false; }
  });
  const [generatedQuestions, setGeneratedQuestions] = useState<Record<string, ExamQuestion>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showExplanations, setShowExplanations] = useState<Record<string, boolean>>({});

  // ── hooks ──
  useTypewriter(messages, typewriterEnabled, typingProgress, setTypingProgress);

  // ── session load ──
  useEffect(() => {
    setFetching(true);
    setMessages([]);
    setSimilarQuestionsMap({});
    setGeneratedQuestions({});
    setTypingProgress({});
    fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const msgs: any[] = data.messages ?? [];
        setMessages(msgs);
        const fullProgress: Record<string, number> = {};
        const simMap: Record<string, SimilarQuestion[]> = {};
        const genMap: Record<string, ExamQuestion> = {};
        const ansMap: Record<string, number> = {};
        const expMap: Record<string, boolean> = {};
        msgs.forEach((m) => {
          fullProgress[m.id] = m.message.length;
          if (m.similarQuestions) {
            if (Array.isArray(m.similarQuestions) && m.similarQuestions.length > 0) {
              if (m.similarQuestions[0]?.question_stem) {
                genMap[m.id] = convertToExamQuestion(m.similarQuestions[0]);
                if (m.similarQuestions[0]?.userAnswer) {
                  ansMap[m.id] = m.similarQuestions[0].userAnswer;
                  expMap[m.id] = true;
                }
              } else {
                simMap[m.id] = m.similarQuestions;
              }
            } else if (!Array.isArray(m.similarQuestions) && m.similarQuestions.question_stem) {
              genMap[m.id] = convertToExamQuestion(m.similarQuestions);
              if (m.similarQuestions.userAnswer) {
                ansMap[m.id] = m.similarQuestions.userAnswer;
                expMap[m.id] = true;
              }
            }
          }
        });
        setTypingProgress(fullProgress);
        setSimilarQuestionsMap(simMap);
        setGeneratedQuestions(genMap);
        setSelectedAnswers(ansMap);
        setShowExplanations(expMap);
      })
      .finally(() => setFetching(false));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── toggles ──
  const toggleTypewriter = useCallback(() => {
    setTypewriterEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('chat_typewriter', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleGenerateMode = useCallback(() => {
    setGenerateMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('chat_generate_mode', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
      (key: string) => {
        setter((prev) => {
          const next = new Set(prev);
          next.has(key) ? next.delete(key) : next.add(key);
          return next;
        });
      },
    [],
  );

  // ── send ──
  const handleSend = useCallback(async () => {
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
      const data = await sendChatMessage(sessionId, text, generateMode ? 'generate' : undefined);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.aiMessage,
      ]);
      setTypingProgress((prev) => ({ ...prev, [data.aiMessage.id]: 0 }));
      if ((data as any).generatedQuestion) {
        setGeneratedQuestions((prev) => ({
          ...prev,
          [data.aiMessage.id]: convertToExamQuestion((data as any).generatedQuestion),
        }));
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        {
          id: `err-${Date.now()}`,
          sender: 'AI',
          message: `⚠️ 메시지 전송에 실패했어요.\n\n${err?.message ?? '네트워크 오류'}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, generateMode]);

  const handleImageSend = useCallback(async () => {
    if (!pendingImage || loading) return;
    const imageFile = pendingImage;
    setLoading(true);
    setImageError('');
    const localImageUrl = URL.createObjectURL(imageFile);
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sender: 'USER',
      message: `[LOCAL_IMAGE:${localImageUrl}]`,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setPendingImage(null);
    try {
      const data = await sendImageQuestion(sessionId, imageFile);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.aiMessage,
      ]);
      setTypingProgress((prev) => ({ ...prev, [data.aiMessage.id]: 0 }));
      if (data.similarQuestions?.length) {
        setSimilarQuestionsMap((prev) => ({
          ...prev,
          [data.aiMessage.id]: data.similarQuestions,
        }));
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      setPendingImage(imageFile);
      setImageError(error instanceof Error ? error.message : '이미지 분석에 실패했습니다.');
    } finally {
      URL.revokeObjectURL(localImageUrl);
      setLoading(false);
    }
  }, [pendingImage, loading, sessionId]);

  // ── render ──
  const formatDate = (dateStr: string | Date): string => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const messagesWithSeparators = messages.reduce<Array<Message | { type: 'separator'; date: string }>>((acc, msg, i) => {
    const date = formatDate(msg.createdAt);
    if (i === 0 || formatDate(messages[i - 1].createdAt) !== date) {
      acc.push({ type: 'separator', date });
    }
    acc.push(msg);
    return acc;
  }, []);

  return (
    <VStack fullWidth fullHeight className={s.container}>
      <div className={s.messageList}>
        {fetching ? (
          <div className={s.center}>
            <Typo.MD size={14} color="secondary">불러오는 중...</Typo.MD>
          </div>
        ) : messages.length === 0 ? (
          <div className={s.center}>
            <Typo.MD size={14} color="secondary">첫 질문을 입력하거나 문제 이미지를 올려보세요.</Typo.MD>
          </div>
        ) : (
          <div className={s.messageInner}>
            {messagesWithSeparators.map((item) => {
              if ('type' in item && item.type === 'separator') {
                return (
                  <div key={`sep-${item.date}`} className={s.dateSeparator}>
                    <Typo.MD size={12} color="secondary">{item.date}</Typo.MD>
                  </div>
                );
              }
              const msg = item as Message;
              return (
                <div key={msg.id}>
                <HStack
                  className={s.messageRow}
                  justify={msg.sender === 'USER' ? 'end' : 'start'}
                >
                  {/* 생성된 문제일 경우 AI 말풍선 숨김 */}
                  {!(msg.sender === 'AI' && generatedQuestions[msg.id]) && (
                    <ChatMessageBubble
                      msg={msg}
                      typewriterEnabled={typewriterEnabled}
                      typingProgress={typingProgress}
                    />
                  )}
                </HStack>

                {msg.sender === 'AI' && generatedQuestions[msg.id] && (
                  <GeneratedQuestionCard
                    question={generatedQuestions[msg.id]}
                    messageId={msg.id}
                    selectedAnswer={selectedAnswers[msg.id]}
                    showExplanation={showExplanations[msg.id]}
                    onSelectAnswer={(optionNumber) => {
                      setSelectedAnswers((prev) => ({ ...prev, [msg.id]: optionNumber }));
                      setShowExplanations((prev) => ({ ...prev, [msg.id]: true }));
                      saveAnswerToServer(msg.id, optionNumber);
                    }}
                  />
                )}

                {msg.sender === 'AI' && similarQuestionsMap[msg.id]?.length > 0 && (
                  <SimilarQuestionsSection
                    questions={similarQuestionsMap[msg.id]}
                    messageId={msg.id}
                    expandedCards={expandedCards}
                    explanationOpen={explanationOpen}
                    onToggleCard={toggleSet(setExpandedCards)}
                    onToggleExplanation={toggleSet(setExplanationOpen)}
                  />
                )}
              </div>
              );
            })}
            {loading && (
              <HStack className={s.messageRow}>
                <div className={`${s.loaderBubble}`}>
                  <TypewriterLoader text="로딩중.." size={14} color="secondary" />
                </div>
              </HStack>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <ChatInputArea
        input={input}
        onInputChange={setInput}
        onSubmit={() => (pendingImage ? handleImageSend() : handleSend())}
        onImageSelect={(file) => { setPendingImage(file); setImageError(''); }}
        loading={loading}
        pendingImage={pendingImage}
        imageError={imageError}
        onClearImage={() => { setPendingImage(null); setImageError(''); }}
        typewriterEnabled={typewriterEnabled}
        onToggleTypewriter={toggleTypewriter}
        generateMode={generateMode}
        onToggleGenerateMode={toggleGenerateMode}
        mobileToolsOpen={mobileToolsOpen}
        onToggleMobileTools={() => setMobileToolsOpen((prev) => !prev)}
      />
    </VStack>
  );
}
