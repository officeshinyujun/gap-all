'use client';

import { useState, useCallback } from 'react';
import { fetchExam, submitExam, fetchExamResult } from '@entities/exam/api/examApi';
import type { ExamData, ExamResult } from '@entities/exam/model/types';

export type PageState = 'loading' | 'ready' | 'result' | 'review' | 'error';

export function useExamSession(examId: string, isReviewEntry: boolean) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [retriedQuestions, setRetriedQuestions] = useState<Set<number>>(new Set());

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

  function handleSelectAnswer(orderIndex: number, optionNumber: number) {
    setAnswers((prev) => ({ ...prev, [orderIndex]: optionNumber }));
  }

  function handleRetry(orderIndex: number) {
    setRetriedQuestions((prev) => new Set(prev).add(orderIndex));
    setAnswers((prev) => { const next = { ...prev }; delete next[orderIndex]; return next; });
  }

  const total = examData?.items.length ?? 0;
  const current = examData?.items[currentIndex];
  const isLast = currentIndex === total - 1;
  const currentAnswer = current ? answers[current.orderIndex] : undefined;
  const allAnswered = total > 0 && Object.keys(answers).length === total;
  const scorePercent = examResult ? Math.round((examResult.correctCount / examResult.totalCount) * 100) : 0;

  return {
    pageState, setPageState,
    examData, examResult,
    currentIndex, setCurrentIndex,
    reviewIndex, setReviewIndex,
    answers, errorMsg,
    retriedQuestions, handleRetry,
    loadExam, handleSubmit, handleSelectAnswer,
    total, current, isLast, currentAnswer, allAnswered, scorePercent,
  };
}
