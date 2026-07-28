'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import { API_BASE_URL } from '@shared/lib/auth';
import { sendImageQuestion, sendChatMessage } from '@shared/lib/chatApi';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import { HighlightedStimulus } from '@shared/utils/highlightStimulus';
import { TypewriterLoader } from '@shared/ui/TypewriterLoader';
import { ArrowUp, Paperclip, X, Type, FileQuestion, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SimilarQuestion } from '@shared/types/chat';
import type { ExamQuestion } from '@shared/types/examQuestion';
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

  // ── 타자기 효과 ──
  const [typewriterEnabled, setTypewriterEnabled] = useState(() => {
    try { return localStorage.getItem('chat_typewriter') !== 'false'; } catch { return true; }
  });
  const [typingProgress, setTypingProgress] = useState<Record<string, number>>({});
  const animFrameRef = useRef<number | null>(null);

  const toggleTypewriter = useCallback(() => {
    setTypewriterEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('chat_typewriter', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── 문제 생성 모드 ──
  const [generateMode, setGenerateMode] = useState(() => {
    try { return localStorage.getItem('chat_generate_mode') === 'true'; } catch { return false; }
  });
  const [generatedQuestions, setGeneratedQuestions] = useState<Record<string, ExamQuestion>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showExplanations, setShowExplanations] = useState<Record<string, boolean>>({});

  const toggleGenerateMode = useCallback(() => {
    setGenerateMode(prev => {
      const next = !prev;
      try { localStorage.setItem('chat_generate_mode', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const convertToExamQuestion = (raw: any): ExamQuestion => ({
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
  });

  // 타자기 애니메이션: 마지막 AI 메시지를 한 글자씩 드러냄
  useEffect(() => {
    if (!typewriterEnabled) return;

    const aiMessages = messages.filter(m => m.sender === 'AI');
    if (aiMessages.length === 0) return;

    const lastAi = aiMessages[aiMessages.length - 1];
    const fullText = lastAi.message;
    const msgId = lastAi.id;

    // 이미 다 드러났으면 스킵
    if ((typingProgress[msgId] ?? 0) >= fullText.length) return;

    const CHARS_PER_SEC = 300; // 초당 300글자 (빠르게)
    const startTime = performance.now();
    const startPos = typingProgress[msgId] ?? 0;

    const animate = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const revealed = Math.min(
        startPos + Math.floor(elapsed * CHARS_PER_SEC),
        fullText.length,
      );
      setTypingProgress(prev => ({ ...prev, [msgId]: revealed }));

      if (revealed < fullText.length) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [messages, typewriterEnabled, typingProgress]);

  useEffect(() => {
    setFetching(true);
    setMessages([]);
    setSimilarQuestionsMap({});
    setGeneratedQuestions({});
    setTypingProgress({});
    fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const msgs = data.messages ?? [];
        setMessages(msgs);
        const fullProgress: Record<string, number> = {};
        const simMap: Record<string, SimilarQuestion[]> = {};
        const genMap: Record<string, ExamQuestion> = {};
        const ansMap: Record<string, number> = {};
        const expMap: Record<string, boolean> = {};
        msgs.forEach((m: any) => {
          fullProgress[m.id] = m.message.length;
          if (m.similarQuestions) {
            if (Array.isArray(m.similarQuestions) && m.similarQuestions.length > 0) {
              if (m.similarQuestions[0]?.question_stem) {
                genMap[m.id] = convertToExamQuestion(m.similarQuestions[0]);
                // 저장된 답변 복원
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
      const data = await sendChatMessage(
        sessionId,
        text,
        generateMode ? 'generate' : undefined,
      );
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), data.userMessage, data.aiMessage]);
      // 새 AI 메시지는 타자기 애니메이션 시작 (progress 0)
      setTypingProgress((prev) => ({ ...prev, [data.aiMessage.id]: 0 }));
      // 생성된 문제가 있으면 저장
      if ((data as any).generatedQuestion) {
        const eq = convertToExamQuestion((data as any).generatedQuestion);
        setGeneratedQuestions((prev) => ({ ...prev, [data.aiMessage.id]: eq }));
      }
    } catch (err: any) {
      console.error('[ChatWindow] sendMessage failed:', err);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        {
          id: `err-${Date.now()}`,
          sender: 'AI',
          message: `⚠️ 메시지 전송에 실패했어요.\n\n${err?.message ?? '네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.'}`,
          createdAt: new Date().toISOString(),
        },
      ]);
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
      setTypingProgress((prev) => ({ ...prev, [data.aiMessage.id]: 0 }));
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
                      // 생성된 문제가 있으면 마크다운 텍스트 숨기고 문제 카드만 표시
                      generatedQuestions[msg.id] ? null : (
                      (() => {
                        const fullText = msg.message;
                        const revealed = typewriterEnabled ? (typingProgress[msg.id] ?? fullText.length) : fullText.length;
                        const isTyping = typewriterEnabled && revealed < fullText.length;
                        const displayText = isTyping ? fullText.slice(0, revealed) : fullText;
                        return (
                          <div className={s.markdown}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {displayText}
                            </ReactMarkdown>
                          </div>
                        );
                      })()
                    ))}
                  </div>
                </div>

                {/* 생성된 문제 카드 (인터랙티브) */}
                {msg.sender === 'AI' && generatedQuestions[msg.id] && (() => {
                  const gq = generatedQuestions[msg.id];
                  const selected = selectedAnswers[msg.id];
                  const showExplanation = showExplanations[msg.id];
                  const correct = gq.correct_answer;
                  const isCorrect = selected ? selected === correct : undefined;

                  return (
                    <div className={s.generatedQuestionSection}>
                      <div className={s.generatedQuestionLabel}>
                        📝 문제를 풀어보세요
                      </div>
                      <div className={s.generatedQuestionCard}>
                        <QuestionRenderer
                          question={gq}
                          questionNumber={1}
                          flat
                          selectedOption={selected}
                          correctAnswer={showExplanation ? correct : undefined}
                          onSelect={(optionNumber) => {
                            if (selected) return;
                            setSelectedAnswers(prev => ({ ...prev, [msg.id]: optionNumber }));
                            setShowExplanations(prev => ({ ...prev, [msg.id]: true }));
                            // 백엔드에 답변 저장
                            fetch(`${API_BASE_URL}/chat/messages/${msg.id}/answer`, {
                              method: 'PATCH',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ answer: optionNumber }),
                            }).catch(() => {}); // 저장 실패해도 UI는 진행
                          }}
                        />
                        {selected && (
                          <div className={s.answerFeedback}>
                            <div className={isCorrect ? s.feedbackCorrect : s.feedbackWrong}>
                              {isCorrect ? '✅ 정답이야! 잘 풀었어.' : `❌ 오답이야. 정답은 ${correct}번이야.`}
                            </div>
                            {showExplanation && gq.render_ready.explanation && (
                              <div className={s.explanationBox}>
                                {typeof gq.render_ready.explanation === 'string'
                                  ? gq.render_ready.explanation
                                  : ''}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

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
        <HStack gap={SPACING.s8} align="center" className={s.inputInner}>
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
          <div className={s.toolGroup}>
            <div className={s.toolPopup}>
              <button
                className={s.toolBtn}
                data-tooltip="문제 사진을 올리면 AI가 OCR로 분석해서 해설을 제공해요"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                <Paperclip size={16} />
              </button>
              <button
                className={`${s.toolBtn} ${typewriterEnabled ? s.toolActive : ''}`}
                data-tooltip={typewriterEnabled ? '타자기 효과 ON — AI 답변이 한 글자씩 나타나요' : '타자기 효과 OFF — AI 답변이 한 번에 표시돼요'}
                onClick={toggleTypewriter}
                disabled={loading}
              >
                <Type size={16} />
              </button>
              <button
                className={`${s.toolBtn} ${generateMode ? s.toolActive : ''}`}
                data-tooltip={generateMode ? '문제 생성 ON — 기출 스타일로 문제를 만들어줘요' : '문제 생성 OFF — 일반 채팅 모드로 질문해요'}
                onClick={toggleGenerateMode}
                disabled={loading}
              >
                <FileQuestion size={16} />
              </button>
            </div>
            <button className={s.toolTrigger} disabled={loading}>
              <Plus size={20} />
            </button>
          </div>
          <textarea
            className={s.input}
            placeholder={generateMode ? '만들고 싶은 문제를 설명해주세요... (예: 근로기준법 5지선다)' : '궁금한 점을 입력하세요... (Shift+Enter 줄바꿈)'}
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
