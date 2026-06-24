'use client';

import { useState, useEffect, useRef } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import { API_BASE_URL } from '@shared/lib/auth';
import { sendImageQuestion } from '@shared/lib/chatApi';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import { HighlightedStimulus } from '@shared/utils/highlightStimulus';
import { TypewriterLoader } from '@shared/ui/TypewriterLoader';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SimilarQuestion } from '@shared/types/chat';
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
  createdAt: string | Date;
  similarQuestions?: SimilarQuestion[];
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
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [similarQuestionsMap, setSimilarQuestionsMap] = useState<Record<string, SimilarQuestion[]>>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [explanationOpen, setExplanationOpen] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFetching(true);
    setMessages([]);
    setSimilarQuestionsMap({});
    fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const msgs = data.messages ?? [];
        setMessages(msgs);
        
        // Populate similarQuestionsMap from fetched messages
        const initialMap: Record<string, SimilarQuestion[]> = {};
        msgs.forEach((m: Message) => {
          if (m.similarQuestions && m.similarQuestions.length > 0) {
            initialMap[m.id] = m.similarQuestions;
          }
        });
        setSimilarQuestionsMap(initialMap);
      })
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), data.userMessage, data.aiMessage]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
    }
  };

  const handleImageSend = async () => {
    if (!pendingImage || loading) return;
    setLoading(true);
    
    const localImageUrl = URL.createObjectURL(pendingImage);
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sender: 'USER',
      message: `[LOCAL_IMAGE:${localImageUrl}]`,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setPendingImage(null);
    try {
      const data = await sendImageQuestion(sessionId, pendingImage);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.aiMessage,
      ]);
      if (data.similarQuestions?.length > 0) {
        setSimilarQuestionsMap((prev) => ({
          ...prev,
          [data.aiMessage.id]: data.similarQuestions,
        }));
      }
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

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleExplanation = (key: string) => {
    setExplanationOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const renderExplanation = (sq: SimilarQuestion, cardKey: string) => {
    const v2 = sq.conceptHighlightV2;
    if (!v2) return null;
    const hasClues = v2.stimulusClues?.length > 0;
    const hasFlow = v2.solvingFlow?.length > 0;
    const hasOptions = v2.optionAnalysis?.length > 0;
    const hasTakeaway = !!v2.takeaway;
    const hasSimilarity = (sq.matchedConcepts?.length ?? 0) > 0;
    if (!hasClues && !hasFlow && !hasOptions && !hasTakeaway && !hasSimilarity) return null;
    const isOpen = explanationOpen.has(cardKey);

    const hasCombo = (sq.question?.combo_block?.items?.length ?? 0) > 0;
    const markers = hasCombo ? ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'] : ['①', '②', '③', '④', '⑤'];

    return (
      <>
        <button className={s.explanationBtn} onClick={() => toggleExplanation(cardKey)}>
          {isOpen ? '▲ 해설 닫기' : '▼ 해설 보기'}
        </button>
        {isOpen && (
          <div className={s.explanationPanel}>
            {hasSimilarity && (
              <div>
                <div className={s.sectionTitle}>📎 이 문제와의 공통점</div>
                {sq.matchedConcepts?.map((inputConcept, i) => (
                  <div key={i} className={s.similarityRow}>
                    <span className={s.similarityIcon}>↔</span>
                    <span className={s.similarityText}>
                      <strong>내 문제:</strong> 《{inputConcept}》 ↔ <strong>이 문제:</strong> 《{sq.conceptName}》
                    </span>
                  </div>
                ))}
              </div>
            )}
            {hasClues && (
              <div>
                <div className={s.sectionTitle}>지문 단서</div>
                {sq.question?.rawStimulus && (
                  <div className={s.rawStimulusBox}>
                    <HighlightedStimulus
                      text={sq.question.rawStimulus}
                      quotes={v2.stimulusClues!.map(c => c.quote)}
                      highlightClassName={s.stimulusHighlight}
                    />
                  </div>
                )}
                <div className={s.clueList}>
                  {v2.stimulusClues!.map((clue, i) => (
                    <div key={i} className={s.clueBox}>
                      <span className={s.clueQuote}><mark className={s.stimulusHighlight}>{clue.quote}</mark></span>
                      <span className={s.clueWhy}>{clue.why}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hasFlow && (
              <div>
                <div className={s.sectionTitle}>풀이 흐름</div>
                {v2.solvingFlow.map((step, i) => (
                  <div key={i} className={s.solvingStep}>
                    <span className={s.stepNum}>{step.step}.</span>
                    <span className={s.stepText}>{step.action}</span>
                  </div>
                ))}
              </div>
            )}
            {hasOptions && (
              <div>
                <div className={s.sectionTitle}>선택지 분석</div>
                {v2.optionAnalysis.map((opt, i) => (
                  <div key={i} className={`${s.optionRow} ${opt.verdict === 'O' ? s.optionCorrectRow : s.optionWrongRow}`}>
                    <span className={s.optionLabel}>{markers[opt.optionNum - 1] ?? opt.optionNum}</span>
                    <span className={opt.verdict === 'O' ? s.verdictO : s.verdictX}>{opt.verdict}</span>
                    <span className={s.optionReasoning}>{opt.reasoning}</span>
                  </div>
                ))}
              </div>
            )}
            {hasTakeaway && (
              <div>
                <div className={s.sectionTitle}>핵심 교훈</div>
                <div className={s.takeawayText}>{v2.takeaway}</div>
              </div>
            )}
          </div>
        )}
      </>
    );
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
            <Typo.MD size={14} color="secondary">첫 질문을 입력하거나 문제 이미지를 올려보세요.</Typo.MD>
          </div>
        ) : (
          <div className={s.messageInner}>
            {messages.map((msg) => (
              <div key={msg.id}>
                <div
                  className={s.messageRow}
                  style={{ width: '100%', display: 'flex', justifyContent: msg.sender === 'USER' ? 'flex-end' : 'flex-start' }}
                >
                  <div className={`${s.bubble} ${msg.sender === 'USER' ? s.userBubble : s.aiBubble}`}>
                    {msg.sender === 'USER' ? (
                      msg.message.startsWith('[IMAGE:') ? (
                        <img 
                          src={`${API_BASE_URL}/chat/images/${msg.message.slice(7, -1)}`} 
                          alt="Uploaded" 
                          style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} 
                        />
                      ) : msg.message.startsWith('[LOCAL_IMAGE:') ? (
                        <VStack gap={4} align="end">
                          <img 
                            src={msg.message.slice(13, -1)} 
                            alt="Uploading" 
                            style={{ maxWidth: '100%', borderRadius: 8, display: 'block', opacity: 0.6 }} 
                          />
                          <TypewriterLoader text="이미지 분석 중.." size={12} color="secondary" />
                        </VStack>
                      ) : (
                        <Typo.MD size={14} color="primary" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {msg.message}
                        </Typo.MD>
                      )
                    ) : (
                      <div className={s.markdown}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {msg.message}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>

                {/* 유사 문제 카드 */}
                {msg.sender === 'AI' && similarQuestionsMap[msg.id]?.length > 0 && (
                  <div className={s.similarSection}>
                    <div className={s.similarTitle}>
                      📚 유사 문제 ({similarQuestionsMap[msg.id][0].conceptName})
                    </div>
                    <div className={s.similarCards}>
                      {similarQuestionsMap[msg.id].map((sq, i) => {
                        const cardKey = `${msg.id}-${i}`;
                        const isExpanded = expandedCards.has(cardKey);
                        return (
                          <div key={cardKey} className={s.similarCard}>
                            <button
                              className={s.similarCardHeader}
                              onClick={() => toggleCard(cardKey)}
                            >
                              <div>
                                <div className={s.similarCardSource}>
                                  {sq.sourceExam ? `${sq.sourceExam.replace('학년도 대학수학능력시험 성공적인 직업생활', '수능').replace('학년도 대학수학능력시험 직업탐구 영역(성공적인 직업생활)', '수능')} ${sq.questionNumber ?? ''}번` : '유사 문제'}
                                </div>
                                <div className={s.similarCardConcept}>{sq.conceptName}</div>
                              </div>
                              <span className={s.similarCardChevron}>{isExpanded ? '▲' : '▼'}</span>
                            </button>
                            {isExpanded && (
                              <div className={s.similarCardBody}>
                                <QuestionRenderer
                                  question={sq.question as any}
                                  questionNumber={i + 1}
                                  correctAnswer={sq.question.correct_answer ?? undefined}
                                  flat
                                />
                                {renderExplanation(sq, cardKey)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
                <div className={`${s.bubble} ${s.aiBubble}`}>
                  <TypewriterLoader text="로딩중.." size={14} color="secondary" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* 이미지 미리보기 */}
      {pendingImage && (
        <div className={s.imagePreviewArea}>
          <div className={s.imagePreview}>
            <img src={URL.createObjectURL(pendingImage)} alt="문제 이미지" />
            <button className={s.imageRemoveBtn} onClick={() => setPendingImage(null)}>
              <X size={12} />
            </button>
          </div>
          <Typo.MD size={12} color="secondary">이미지를 전송하면 문제를 분석합니다.</Typo.MD>
        </div>
      )}

      {/* 입력창 */}
      <div className={s.inputArea}>
        <HStack gap={SPACING.s8} align="end" className={s.inputInner}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPendingImage(file);
              e.target.value = '';
            }}
          />
          <button
            className={s.imageBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="문제 이미지 업로드"
          >
            <Paperclip size={18} />
          </button>
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
            className={`${s.sendButton} ${(loading || (!input.trim() && !pendingImage)) ? s.disabled : ''}`}
            onClick={pendingImage ? handleImageSend : handleSend}
            disabled={loading || (!input.trim() && !pendingImage)}
          >
            <ArrowUp size={18} color="#FFFFFF" strokeWidth={3} />
          </button>
        </HStack>
      </div>
    </VStack>
  );
}
