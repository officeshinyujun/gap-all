'use client';

import { use, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Typo from '@shared/ui/Typo';
import { fetchConceptPairs, updateStudyProgress, postIncorrectRecords } from '@/lib/studyQuizApi';
import { fetchUnitId } from '@/lib/studyApi';
import type { ConceptPair, QuizCount } from '@/types/studyQuiz';
import s from './page.module.scss';

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

type PageState = 'loading' | 'error' | 'quiz' | 'result';
type AnswerState = 'idle' | 'submitted';

export default function StudyQ2Page({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  const { subject, chapter } = use(params);
  const unitNumber = parseUnitNumber(chapter);
  const router = useRouter();
  const searchParams = useSearchParams();
  const count = (searchParams.get('count') === '20' ? 20 : 10) as QuizCount;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [pairs, setPairs] = useState<ConceptPair[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectIndices, setIncorrectIndices] = useState<number[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function loadPairs() {
    setPageState('loading');
    setCurrentIndex(0);
    setInputValue('');
    setAnswerState('idle');
    setCorrectCount(0);
    setIncorrectIndices([]);
    fetchConceptPairs(subject, unitNumber, count)
      .then((items) => {
        setPairs(items);
        setPageState('quiz');
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setPageState('error');
      });
  }

  useEffect(() => {
    loadPairs();
  }, [subject, unitNumber, count]);

  useEffect(() => {
    if (pageState === 'quiz' && answerState === 'idle') {
      inputRef.current?.focus();
    }
  }, [currentIndex, pageState, answerState]);

  const current = pairs[currentIndex];
  const isLast = currentIndex === pairs.length - 1;
  const total = pairs.length;

  // hidden_field는 항상 'definition' — 개념을 보고 뜻을 입력
  const visibleLabel = '개념';
  const visibleValue = current?.concept;
  const hiddenLabel = '뜻';

  function handleSubmit() {
    if (!inputValue.trim() || !current) return;
    setAnswerState('submitted');
  }

  function handleJudge(isCorrect: boolean) {
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
    } else {
      setIncorrectIndices((prev) => [...prev, currentIndex]);
    }
    handleNext();
  }

  function handleNext() {
    if (isLast) {
      setPageState('result');
      fetchUnitId(subject, unitNumber)
        .then((unitId) => {
          if (unitId) return updateStudyProgress(unitId, 'INTERACTIVE_QUIZ', 100);
        })
        .catch(() => {});
      const wrongPairs = incorrectIndices.map((idx) => pairs[idx]);
      if (wrongPairs.length > 0) {
        postIncorrectRecords(
          wrongPairs.map((p) => ({
            subjectSlug: subject,
            unitNumber,
            targetConcept: p.concept,
            source: 'INTERACTIVE_QUIZ' as const,
          }))
        ).catch(() => {});
      }
    } else {
      setCurrentIndex((i) => i + 1);
      setInputValue('');
      setAnswerState('idle');
    }
  }

  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <button className={s.backButton} onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>{unitNumber}단원 · 양방향 개념</span>
        {pageState === 'quiz' && total > 0 && (
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        )}
      </div>

      {/* 콘텐츠 영역 */}
      <div className={s.cardArea}>
        {pageState === 'loading' && (
          <div className={s.center}>
            <div className={s.spinner} />
            <p className={s.loadingText}>AI가 문제를 생성하는 중입니다... (최초 1회)</p>
          </div>
        )}

        {pageState === 'error' && (
          <div className={s.center}>
            <span className={s.errorText}>{errorMsg}</span>
            <button className={s.retryButton} onClick={loadPairs}>
              <Typo.MD size={14} color="primary">다시 시도</Typo.MD>
            </button>
          </div>
        )}

        {pageState === 'quiz' && current && (
          <div className={s.quizArea}>
            {/* 힌트 카드 */}
            <div className={s.hintCard}>
              <span className={s.cardLabel}>{visibleLabel}</span>
              <p className={s.cardValue}>{visibleValue}</p>
            </div>

            {/* 입력 카드 */}
            <div className={`${s.inputCard} ${answerState === 'submitted' ? s.inputSubmitted : ''}`}>
              <span className={s.cardLabel}>{hiddenLabel}을 입력하세요</span>
              <textarea
                ref={inputRef}
                className={s.textarea}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && answerState === 'idle') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={`${hiddenLabel}을 직접 입력해보세요...`}
                disabled={answerState !== 'idle'}
                rows={3}
              />
            </div>

            {/* 채점 결과 */}
            {answerState === 'submitted' && (
              <div className={s.resultBox}>
                <div className={s.resultBoxHeader}>
                  <span className={s.resultBoxTitle}>📖 정답 확인</span>
                </div>
                <div className={s.correctAnswerRow}>
                  <span className={s.correctAnswerLabel}>정답</span>
                  <span className={s.correctAnswerValue}>{current.correct_value}</span>
                </div>
                <p className={s.explanationText}>{current.explanation}</p>
              </div>
            )}
          </div>
        )}

        {pageState === 'result' && (
          <div className={s.resultArea}>
            <div className={s.resultCard}>
              <span className={s.resultEmoji}>{scorePercent >= 80 ? '🎉' : scorePercent >= 50 ? '👍' : '💪'}</span>
              <p className={s.resultLabel}>{scorePercent >= 80 ? '완벽해요!' : scorePercent >= 50 ? '잘 했어요!' : '다시 도전해봐요'}</p>
              <p className={s.resultScore}>{scorePercent}%</p>
              <p className={s.resultSub}>{total}문제 중 {correctCount}개 정답</p>
            </div>
          </div>
        )}
      </div>

      {/* 하단 푸터 */}
      <div className={s.footer}>
        {pageState === 'quiz' && answerState === 'idle' && (
          <button
            className={`${s.footerButton} ${s.footerButtonPrimary}`}
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
          >
            제출
          </button>
        )}
        {pageState === 'quiz' && answerState === 'submitted' && (
          <div className={s.footerButtons}>
            <button
              className={`${s.footerButton} ${s.footerButtonWrong}`}
              onClick={() => handleJudge(false)}
            >
              틀렸어요
            </button>
            <button
              className={`${s.footerButton} ${s.footerButtonCorrect}`}
              onClick={() => handleJudge(true)}
            >
              맞았어요
            </button>
          </div>
        )}
        {pageState === 'result' && (
          <div className={s.footerButtons}>
            <button className={s.footerButton} onClick={loadPairs}>다시 풀기</button>
            <button
              className={`${s.footerButton} ${s.footerButtonNext}`}
              onClick={() => router.push(`/study/${subject}`)}
            >
              학습 완료 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
