'use client';

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import Typo from '@shared/ui/Typo';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import {
  fetchSubjectBySlug,
  createExamJob,
  pollExamJob,
  fetchExam,
  fetchExams,
  submitExam,
  fetchExamResult,
  type ExamData,
  type ExamResult,
} from '@/lib/examApi';
import { fetchUnitId } from '@/lib/studyApi';
import { updateStudyProgress } from '@/lib/studyQuizApi';
import s from './page.module.scss';

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

type PageState = 'init' | 'polling' | 'ready' | 'submitted' | 'result' | 'error';

const QUESTION_COUNT = 10;
const POLL_INTERVAL_MS = 2000;

export default function StudyQ3Page() {
  const { subject = '', chapter = '' } = useParams();
  const unitNumber = parseUnitNumber(chapter);
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('init');
  const [errorMsg, setErrorMsg] = useState('');
  const [pollMsg, setPollMsg] = useState('시험을 생성하는 중입니다...');
  const [pollProgress, setPollProgress] = useState(0);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [examId, setExamId] = useState<string | null>(null);

  const startExam = useCallback(async () => {
    setPageState('init');
    setErrorMsg('');
    setCurrentIndex(0);
    setAnswers({});
    setExamData(null);
    setExamResult(null);
    setExamId(null);

    try {
      // 1. subjectId 조회
      const subjectInfo = await fetchSubjectBySlug(subject);

      // 2. 기존 시험 캐시 확인 — 같은 단원 MIDDLE 난이도 시험이 있으면 재사용
      const existingExams = await fetchExams(subject);
      const cached = existingExams.find(
        (e) =>
          e.startUnitNum === unitNumber &&
          e.endUnitNum === unitNumber &&
          e.difficulty === 'MIDDLE' &&
          e.sourceType === 'reference',
      );

      if (cached) {
        const exam = await fetchExam(cached.id);
        setExamId(cached.id);
        setExamData(exam);
        setPageState('ready');
        return;
      }

      // 3. 없으면 새로 생성
      const { jobId } = await createExamJob(
        subjectInfo.id,
        unitNumber,
        QUESTION_COUNT,
      );
      setPageState('polling');

      // 3. 폴링
      const poll = async (): Promise<void> => {
        const job = await pollExamJob(jobId);
        setPollProgress(job.progress);
        setPollMsg(job.message || '시험을 생성하는 중입니다...');

        if (job.status === 'completed' && job.examId) {
          const exam = await fetchExam(job.examId);
          setExamId(job.examId);
          setExamData(exam);
          setPageState('ready');
        } else if (job.status === 'failed') {
          throw new Error('시험 생성에 실패했습니다.');
        } else {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          return poll();
        }
      };

      await poll();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류');
      setPageState('error');
    }
  }, [subject, unitNumber]);

  useEffect(() => {
    startExam();
  }, [startExam]);

  const total = examData?.items.length ?? 0;
  const current = examData?.items[currentIndex];

  function handleSelectAnswer(orderIndex: number, optionNumber: number) {
    setAnswers((prev) => ({ ...prev, [orderIndex]: optionNumber }));
  }

  function handleNext() {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    }
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
      const unitId = await fetchUnitId(subject, unitNumber);
      if (unitId) await updateStudyProgress(unitId, 'PRACTICE_EXAM', 100);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '제출 실패');
      setPageState('error');
    }
  }

  const currentAnswer = current ? answers[current.orderIndex] : undefined;
  const isLast = currentIndex === total - 1;
  const allAnswered = total > 0 && Object.keys(answers).length === total;
  const scorePercent = examResult
    ? Math.round((examResult.correctCount / examResult.totalCount) * 100)
    : 0;

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <button className={s.backButton} onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>{unitNumber}단원 · 실전 문제</span>
        {pageState === 'ready' && total > 0 && (
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        )}
      </div>

      {/* 콘텐츠 */}
      <div className={s.cardArea}>
        {/* 생성 중 */}
        {(pageState === 'init' || pageState === 'polling') && (
          <div className={s.center}>
            <div className={s.spinner} />
            <p className={s.loadingText}>{pollMsg}</p>
            {pollProgress > 0 && (
              <div className={s.progressBarWrap}>
                <div className={s.progressBarFill} style={{ width: `${pollProgress}%` }} />
              </div>
            )}
            <p className={s.loadingHint}>AI가 {unitNumber}단원 기반으로 문제를 생성하고 있습니다</p>
          </div>
        )}

        {/* 에러 */}
        {pageState === 'error' && (
          <div className={s.center}>
            <span className={s.errorText}>{errorMsg}</span>
            <button className={s.retryButton} onClick={startExam}>
              <Typo.MD size={14} color="primary">다시 시도</Typo.MD>
            </button>
          </div>
        )}

        {/* 문제 */}
        {(pageState === 'ready' || pageState === 'submitted') && current && (
          <div className={s.questionWrap}>
            <QuestionRenderer
              question={current.question}
              questionNumber={current.orderIndex}
              selectedOption={currentAnswer ?? null}
              onSelect={(num) => handleSelectAnswer(current.orderIndex, num)}
            />
          </div>
        )}

        {/* 결과 */}
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
                onClick={handleNext}
                disabled={!currentAnswer}
              >
                다음 문제 →
              </button>
            )}
          </>
        )}

        {pageState === 'result' && (
          <div className={s.footerButtons}>
            <button className={s.footerButton} onClick={startExam}>
              다시 풀기
            </button>
            <button
              className={`${s.footerButton} ${s.footerButtonNext}`}
              onClick={() => navigate(`/study/${subject}`)}
            >
              학습 완료 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
