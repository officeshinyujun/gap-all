'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import { fetchBlankQuestions, updateStudyProgress, postIncorrectRecords } from '@/lib/studyQuizApi';
import { fetchUnitId } from '@/lib/studyApi';
import type { BlankQuestion, QuizCount } from '@/types/studyQuiz';
import { QuestionCard } from '@/components/study/BlankQuiz/QuestionCard';
import { OptionChip } from '@/components/study/BlankQuiz/OptionChip';
import s from './page.module.scss';

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

type PageState = 'loading' | 'error' | 'quiz' | 'result';
type ChipState = 'default' | 'correct' | 'wrong' | 'disabled';

export default function StudyQ1Page({
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
  const [questions, setQuestions] = useState<BlankQuestion[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectItems, setIncorrectItems] = useState<number[]>([]);

  function loadQuestions() {
    setPageState('loading');
    setCurrentIndex(0);
    setSelectedOption(null);
    setCorrectCount(0);
    setIncorrectItems([]);
    fetchBlankQuestions(subject, unitNumber, count)
      .then((items) => {
        setQuestions(items);
        setPageState('quiz');
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setPageState('error');
      });
  }

  useEffect(() => {
    loadQuestions();
  }, [subject, unitNumber, count]);

  const current = questions[currentIndex];
  const isAnswered = selectedOption !== null;
  const isLast = currentIndex === questions.length - 1;
  const total = questions.length;

  function getChipState(option: string): ChipState {
    if (!isAnswered) return 'default';
    if (option === current?.correct_answer) return 'correct';
    if (option === selectedOption) return 'wrong';
    return 'disabled';
  }

  function handleSelect(option: string) {
    if (isAnswered) return;
    setSelectedOption(option);
    if (option === current?.correct_answer) {
      setCorrectCount((c) => c + 1);
    } else {
      setIncorrectItems((prev) => [...prev, currentIndex]);
    }
  }

  async function handleNext() {
    if (isLast) {
      setPageState('result');
      try {
        const unitId = await fetchUnitId(subject, unitNumber);
        if (unitId) await updateStudyProgress(unitId, 'BLANK_FILL', 100);
      } catch { /* 무시 */ }
      const wrongQuestions = incorrectItems.map((idx) => questions[idx]);
      if (wrongQuestions.length > 0) {
        postIncorrectRecords(
          wrongQuestions.map((q) => ({
            subjectSlug: subject,
            unitNumber,
            targetConcept: q.correct_answer,
            source: 'BLANK_FILL' as const,
          }))
        ).catch(() => {});
      }
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
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
        <span className={s.headerTitle}>{unitNumber}단원 · 빈칸 문제</span>
        {pageState === 'quiz' && total > 0 && (
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        )}
      </div>

      {/* 콘텐츠 영역 */}
      <div className={s.cardArea}>
        {/* 로딩 */}
        {pageState === 'loading' && (
          <div className={s.center}>
            <div className={s.spinner} />
            <p className={s.loadingText}>AI가 문제를 생성하는 중입니다... (최초 1회)</p>
          </div>
        )}

        {/* 에러 */}
        {pageState === 'error' && (
          <div className={s.center}>
            <span className={s.errorText}>{errorMsg}</span>
            <button className={s.retryButton} onClick={loadQuestions}>
              <Typo.MD size={14} color="primary">다시 시도</Typo.MD>
            </button>
          </div>
        )}

        {/* 퀴즈 */}
        {pageState === 'quiz' && current && (
          <div className={s.quizArea}>
            <QuestionCard
              index={currentIndex}
              total={total}
              sentenceTemplate={current.sentence_template}
              correctAnswer={current.correct_answer}
              explanation={current.explanation}
              showExplanation={isAnswered}
            />
            <div className={s.chipsRow}>
              {current.options.map((option) => (
                <OptionChip
                  key={option}
                  label={option}
                  state={getChipState(option)}
                  onClick={() => handleSelect(option)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 결과 */}
        {pageState === 'result' && (
          <div className={s.resultArea}>
            <div className={s.resultCard}>
              <span className={s.resultEmoji}>
                {scorePercent >= 80 ? '🎉' : scorePercent >= 50 ? '👍' : '💪'}
              </span>
              <p className={s.resultLabel}>
                {scorePercent >= 80 ? '훌륭해요!' : scorePercent >= 50 ? '잘 했어요!' : '다시 도전해봐요'}
              </p>
              <p className={s.resultScore}>{scorePercent}%</p>
              <p className={s.resultSub}>{total}문제 중 {correctCount}개 정답</p>
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className={s.footer}>
        {pageState === 'quiz' && isAnswered && (
          <button className={`${s.footerButton} ${s.footerButtonPrimary}`} onClick={handleNext}>
            {isLast ? '완료' : '다음 문제 →'}
          </button>
        )}
        {pageState === 'quiz' && !isAnswered && (
          <div className={s.footerHint}>선택지를 골라보세요</div>
        )}
        {pageState === 'result' && (
          <div className={s.footerButtons}>
            <button className={s.footerButton} onClick={loadQuestions}>
              다시 풀기
            </button>
            <button
              className={`${s.footerButton} ${s.footerButtonNext}`}
              onClick={() => router.push(`/study/${subject}/${chapter}/q2?count=10`)}
            >
              양방향 개념 풀기 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
