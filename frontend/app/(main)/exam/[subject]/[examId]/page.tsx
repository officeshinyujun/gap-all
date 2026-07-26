'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import Typo from '@shared/ui/Typo';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { SPACING } from '@shared/constants/spacing';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import {
  fetchExam,
  submitExam,
  saveExamAnswers,
  fetchExamResult,
  flagExamItem,
  type ExamData,
  type ExamResult,
} from '@/lib/examApi';
import { fetchFrequencyConcept, type FrequencyConcept } from '@/lib/studyQuizApi';
import s from './page.module.scss';

type PageState = 'loading' | 'ready' | 'result' | 'review' | 'error';

export default function ExamDetailPage() {
  const { subject = '', examId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReviewEntry = searchParams.get('review') === '1';
  const learnedUnitsParam = searchParams.get('learnedUnits') ?? '';
  const learnedUnits = learnedUnitsParam.split(',').map(Number).filter(Boolean);

  const [pageState, setPageState] = useState<PageState>('loading');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [retriedQuestions, setRetriedQuestions] = useState<Set<number>>(new Set());
  const [hintOpen, setHintOpen] = useState(false);
  const [hintData, setHintData] = useState<FrequencyConcept | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [flaggedItems, setFlaggedItems] = useState<Set<number>>(new Set());
  const [flagging, setFlagging] = useState(false);

  const loadExam = useCallback(async () => {
    setPageState('loading');
    setCurrentIndex(0);
    setAnswers({});
    setExamResult(null);
    setRetriedQuestions(new Set());
    try {
      if (isReviewEntry) {
        const result = await fetchExamResult(examId);
        setExamResult(result);
        setReviewIndex(0);
        setPageState('review');
      } else {
        const exam = await fetchExam(examId);
        setExamData(exam);
        setPageState('ready');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '시험을 불러올 수 없습니다.');
      setPageState('error');
    }
  }, [examId, isReviewEntry]);

  useEffect(() => {
    loadExam();
  }, [loadExam]);

  useEffect(() => {
    setHintOpen(false);
    setHintData(null);
  }, [currentIndex]);

  // Restore saved answers on mount
  useEffect(() => {
    if (!examData) return;
    const saved: Record<number, number> = {};
    for (const item of examData.items) {
      if (item.userAnswer != null) {
        saved[item.orderIndex] = item.userAnswer;
      }
    }
    if (Object.keys(saved).length > 0) {
      setAnswers(saved);
    }
  }, [examData]);

  // Auto-save answers with debounce
  useEffect(() => {
    if (!examId || Object.keys(answers).length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const formatted = Object.entries(answers).map(([orderIdx, answer]) => {
          const item = examData?.items.find((i) => i.orderIndex === Number(orderIdx));
          return item ? { examItemId: item.id, answer } : null;
        }).filter(Boolean) as { examItemId: string; answer: number }[];
        if (formatted.length > 0) await saveExamAnswers(examId, formatted);
      } catch {
        // silently retry next time
      }
      setSaving(false);
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [answers, examId, examData]);

  const total = examData?.items.length ?? 0;
  const current = examData?.items[currentIndex];
  const isLast = currentIndex === total - 1;
  const currentAnswer = current ? answers[current.orderIndex] : undefined;
  const allAnswered = total > 0 && Object.keys(answers).length === total;
  const scorePercent = examResult
    ? Math.round((examResult.correctCount / examResult.totalCount) * 100)
    : 0;

  const currentUnitNumber = current?.unitNumber ?? null;
  const isUnlearned = currentUnitNumber != null
    && learnedUnits.length > 0
    && !learnedUnits.includes(currentUnitNumber);

  function handleSelectAnswer(orderIndex: number, optionNumber: number) {
    setAnswers((prev) => ({ ...prev, [orderIndex]: optionNumber }));
  }

  async function handleSubmit() {
    if (!examId || !examData) return;
    try {
      const formattedAnswers = examData.items.map((item) => ({
        examItemId: item.id,
        answer: answers[item.orderIndex] ?? 0,
      }));
      await submitExam(examId, formattedAnswers);
      const result = await fetchExamResult(examId);
      setExamResult(result);
      setPageState('result');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '제출 실패');
      setPageState('error');
    }
  }

  async function handleHint() {
    if (!currentUnitNumber) return;
    if (hintData) { setHintOpen(true); return; }
    setHintLoading(true);
    try {
      const data = await fetchFrequencyConcept(subject, currentUnitNumber);
      setHintData(data);
      setHintOpen(true);
    } catch { /* ignore */ }
    setHintLoading(false);
  }

  function handleRetry() {
    if (!current) return;
    setRetriedQuestions((prev) => new Set(prev).add(current.orderIndex));
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[current.orderIndex];
      return next;
    });
  }

  async function handleFlag() {
    if (!current || !examData || flagging) return;
    const itemId = examData.items.find((i) => i.orderIndex === current.orderIndex)?.id;
    if (!itemId || flaggedItems.has(current.orderIndex)) return;
    if (!window.confirm('이 문제가 이상한가요? 신고하면 검토할 수 있도록 저장하고, 시험에서는 제외할게요.')) return;
    setFlagging(true);
    try {
      await flagExamItem(examId, itemId);
      setFlaggedItems((prev) => new Set(prev).add(current.orderIndex));
      // 다음 문항으로 이동 (또는 총 개수 감소)
      if (currentIndex >= (examData.items.length - 1)) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch {
      alert('신고를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    setFlagging(false);
  }

  const hasRetried = current ? retriedQuestions.has(current.orderIndex) : false;
  const isWrongAfterRetry = current && hasRetried && currentAnswer !== undefined;

  return (
    <div className={s.container}>
      <div className={s.header}>
        <button className={s.backButton} onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>
          {examData?.title ?? '시험'}
        </span>
        {pageState === 'ready' && total > 0 && (
          <>
            <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
            {saving && <span className={s.savingIndicator}>저장 중...</span>}
          </>
        )}
      </div>

      <div className={s.cardArea}>
        {pageState === 'loading' && (
          <div className={s.center}>
            <div className={s.spinner} />
            <p className={s.loadingText}>시험을 불러오는 중...</p>
          </div>
        )}

        {pageState === 'error' && (
          <div className={s.center}>
            <span className={s.errorText}>{errorMsg}</span>
            <button className={s.retryButton} onClick={loadExam}>
              <Typo.MD size={14} color="primary">다시 시도</Typo.MD>
            </button>
          </div>
        )}

        {pageState === 'ready' && current && (
          <VStack gap={SPACING.s12} fullWidth>
            {isUnlearned && (
              <HStack justify="between" align="center" fullWidth className={s.unlearnedBanner}>
                <HStack gap={SPACING.s8} align="center">
                  <span className={s.unlearnedBadge}>미학습 단원</span>
                  <Typo.MD size={12} color="secondary">
                    {currentUnitNumber}단원 개념이 포함된 문제예요
                  </Typo.MD>
                </HStack>
                <button
                  className={s.hintButton}
                  onClick={handleHint}
                  disabled={hintLoading}
                >
                  {hintLoading ? '로딩 중...' : '힌트 보기'}
                </button>
              </HStack>
            )}

            <div className={s.questionWrap}>
              <QuestionRenderer
                question={current.question}
                questionNumber={current.orderIndex}
                selectedOption={currentAnswer ?? null}
                onSelect={(num) => handleSelectAnswer(current.orderIndex, num)}
                correctAnswer={isWrongAfterRetry ? (current.question.correct_answer ?? null) : null}
              />
            </div>

            <div className={s.flagArea}>
              {flaggedItems.has(current.orderIndex) ? (
                <span className={s.flaggedBadge}>✓ 신고 완료</span>
              ) : (
                <button
                  className={s.flagButton}
                  onClick={handleFlag}
                  disabled={flagging}
                >
                  {flagging ? '처리 중...' : '이 문제 신고'}
                </button>
              )}
            </div>

            {currentAnswer !== undefined && !hasRetried && isUnlearned && (
              <button className={s.retryHintButton} onClick={handleRetry}>
                개념 확인 후 재시도 →
              </button>
            )}
          </VStack>
        )}

        {pageState === 'result' && examResult && (
          <div className={s.resultArea}>
            <div className={s.resultCard}>
              <span className={s.resultEmoji}>
                {scorePercent >= 80 ? '🎉' : scorePercent >= 50 ? '👍' : '💪'}
              </span>
              <p className={s.resultLabel}>
                {scorePercent >= 80 ? '훌륭해요!' : scorePercent >= 50 ? '잘 했어요!' : '다시 도전해봐요'}
              </p>
              <p className={s.resultScore}>{scorePercent}%</p>
              <p className={s.resultSub}>
                {examResult.totalCount}문제 중 {examResult.correctCount}개 정답
              </p>
            </div>
          </div>
        )}

        {pageState === 'review' && examResult && examResult.items[reviewIndex] && (
          <VStack gap={SPACING.s16} fullWidth>
            <HStack justify="between" align="center" fullWidth>
              <Typo.MD size={14} color={examResult.items[reviewIndex].isCorrect ? 'brand' : 'secondary'} style={{ fontWeight: 600 }}>
                {examResult.items[reviewIndex].isCorrect ? '✓ 정답' : '✗ 오답'}
              </Typo.MD>
              <Typo.MD size={12} color="secondary">
                {reviewIndex + 1} / {examResult.items.length}
              </Typo.MD>
            </HStack>

            <QuestionRenderer
              question={examResult.items[reviewIndex].question}
              questionNumber={examResult.items[reviewIndex].orderIndex}
              selectedOption={examResult.items[reviewIndex].selectedAnswer}
              correctAnswer={examResult.items[reviewIndex].correctAnswer}
              showExplanation
            />
          </VStack>
        )}
      </div>

      <div className={s.footer}>
        {pageState === 'ready' && current && (
          <HStack gap={12} justify="center" align="center" fullWidth>
            {currentIndex > 0 && (
              <button
                className={s.footerButton}
                onClick={() => setCurrentIndex((i) => i - 1)}
              >
                ← 이전 문제
              </button>
            )}
            {isLast ? (
              <button
                className={`${s.footerButton} ${s.footerButtonPrimary}`}
                onClick={handleSubmit}
                disabled={!allAnswered}
              >
                {allAnswered ? '제출하기' : `${total - Object.keys(answers).length}문제 남음`}
              </button>
            ) : (
              <button
                className={`${s.footerButton} ${s.footerButtonPrimary}`}
                onClick={() => setCurrentIndex((i) => i + 1)}
                disabled={!currentAnswer}
              >
                다음 문제 →
              </button>
            )}
          </HStack>
        )}

        {pageState === 'result' && (
          <div className={s.footerButtons}>
            <button className={s.footerButton} onClick={() => { setReviewIndex(0); setPageState('review'); }}>
              해설 보기
            </button>
            <button className={s.footerButton} onClick={loadExam}>
              다시 풀기
            </button>
            <button
              className={`${s.footerButton} ${s.footerButtonNext}`}
              onClick={() => navigate(`/exam/${subject}`)}
            >
              목록으로 →
            </button>
          </div>
        )}

        {pageState === 'review' && examResult && (
          <div className={s.footerButtons}>
            <button
              className={s.footerButton}
              onClick={() => setReviewIndex((i) => Math.max(0, i - 1))}
              disabled={reviewIndex === 0}
            >
              ← 이전
            </button>
            <button
              className={s.footerButton}
              onClick={() => setPageState('result')}
            >
              결과로
            </button>
            <button
              className={`${s.footerButton} ${s.footerButtonNext}`}
              onClick={() => setReviewIndex((i) => Math.min(examResult.items.length - 1, i + 1))}
              disabled={reviewIndex === examResult.items.length - 1}
            >
              다음 →
            </button>
          </div>
        )}
      </div>

      {hintOpen && hintData && (
        <div className={s.hintOverlay} onClick={() => setHintOpen(false)}>
          <div className={s.hintModal} onClick={(e) => e.stopPropagation()}>
            <HStack justify="between" align="center" fullWidth className={s.hintModalHeader}>
              <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>
                {currentUnitNumber}단원 핵심 개념
              </Typo.MD>
              <button className={s.hintModalClose} onClick={() => setHintOpen(false)}>✕</button>
            </HStack>
            <VStack gap={SPACING.s12} fullWidth className={s.hintModalBody}>
              {hintData.concepts.slice(0, 5).map((concept, i) => (
                <VStack key={i} gap={SPACING.s6} fullWidth className={s.hintConceptItem}>
                  <HStack gap={SPACING.s8} align="center">
                    <span className={s.hintRankBadge}>{concept.rank}</span>
                    <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>{concept.name}</Typo.MD>
                    <Typo.MD size={12} color="secondary">{concept.frequency}회 출제</Typo.MD>
                  </HStack>
                  {concept.description && (
                    <Typo.MD size={12} color="secondary">{concept.description}</Typo.MD>
                  )}
                  {concept.keyPoints.length > 0 && (
                    <ul className={s.hintKeyPoints}>
                      {concept.keyPoints.slice(0, 2).map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                  )}
                </VStack>
              ))}
            </VStack>
          </div>
        </div>
      )}
    </div>
  );
}
