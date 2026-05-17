'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Typo from '@/components/general/Typo';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import { SPACING } from '@/constants/spacing';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import {
  fetchExam,
  submitExam,
  fetchExamResult,
  type ExamData,
  type ExamResult,
} from '@/lib/examApi';
import s from './page.module.scss';

type PageState = 'loading' | 'ready' | 'result' | 'review' | 'error';

export default function ExamDetailPage({
  params,
}: {
  params: Promise<{ subject: string; examId: string }>;
}) {
  const { subject, examId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReviewEntry = searchParams.get('review') === '1';

  const [pageState, setPageState] = useState<PageState>('loading');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [errorMsg, setErrorMsg] = useState('');

  const loadExam = useCallback(async () => {
    setPageState('loading');
    setCurrentIndex(0);
    setAnswers({});
    setExamResult(null);
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

  const total = examData?.items.length ?? 0;
  const current = examData?.items[currentIndex];
  const isLast = currentIndex === total - 1;
  const currentAnswer = current ? answers[current.orderIndex] : undefined;
  const allAnswered = total > 0 && Object.keys(answers).length === total;
  const scorePercent = examResult
    ? Math.round((examResult.correctCount / examResult.totalCount) * 100)
    : 0;

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

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <button className={s.backButton} onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>
          {examData?.title ?? '시험'}
        </span>
        {pageState === 'ready' && total > 0 && (
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        )}
      </div>

      {/* 콘텐츠 */}
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
          <div className={s.questionWrap}>
            <QuestionRenderer
              question={current.question}
              questionNumber={current.orderIndex}
              selectedOption={currentAnswer ?? null}
              onSelect={(num) => handleSelectAnswer(current.orderIndex, num)}
            />
          </div>
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

      {/* 푸터 */}
      <div className={s.footer}>
        {pageState === 'ready' && current && (
          <>
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
          </>
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
              onClick={() => router.push(`/exam/${subject}`)}
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
    </div>
  );
}
