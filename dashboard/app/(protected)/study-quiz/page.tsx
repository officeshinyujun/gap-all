'use client';

import { useState, useCallback, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { BlankQuiz } from '@/components/study/BlankQuiz';
import { ConceptQuiz } from '@/components/study/ConceptQuiz';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import { fetchBlankQuestions, fetchConceptPairs, clearStudyQuizCache } from '@/lib/studyQuizApi';
import { apiFetch } from '@/lib/api';
import type { BlankQuestion, ConceptPair, QuizCount } from '@/types/studyQuiz';
import type { ExamQuestion } from '@/types/examQuestion';
import { toExamQuestionFromApiQuestion } from '@/utils/examQuestionAdapter';
import s from './page.module.scss';

const SUBJECTS = [
  { value: 'success', label: '성공적인 직업생활' },
  { value: 'industry', label: '공업 일반' },
];

const UNITS = Array.from({ length: 20 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}단원`,
}));

const COUNTS: { value: QuizCount; label: string }[] = [
  { value: 10, label: '10문제' },
  { value: 20, label: '20문제' },
];

type QuizMode = 'blank' | 'concept' | 'exam';
type PageState = 'idle' | 'loading' | 'error' | 'quiz' | 'result';

const HISTORY_KEY = 'gap_quiz_history';
const MAX_HISTORY = 20;

interface QuizHistoryEntry {
  timestamp: number;
  mode: QuizMode;
  subject: string;
  unit: number;
  count: number;
  correct: number;
  total: number;
  percent: number;
}

function loadHistory(): QuizHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as QuizHistoryEntry[]) : [];
  } catch { return []; }
}

function saveHistory(entry: QuizHistoryEntry) {
  const history = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
}

interface ExamItem {
  id: string;
  orderIndex: number;
  question: ExamQuestion;
}

function normalizeQuestion(raw: Record<string, unknown>): ExamQuestion {
  if (raw.render_ready) return raw as unknown as ExamQuestion;
  return toExamQuestionFromApiQuestion(raw);
}

export default function StudyQuizPage() {
  const [subject, setSubject] = useState('success');
  const [unit, setUnit] = useState(1);
  const [count, setCount] = useState<QuizCount>(10);
  const [mode, setMode] = useState<QuizMode>('blank');
  const [pageState, setPageState] = useState<PageState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [blankQuestions, setBlankQuestions] = useState<BlankQuestion[]>([]);
  const [conceptPairs, setConceptPairs] = useState<ConceptPair[]>([]);
  const [examItems, setExamItems] = useState<ExamItem[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examIndex, setExamIndex] = useState(0);
  const [examId, setExamId] = useState<string | null>(null);
  const [pollMsg, setPollMsg] = useState('');
  const [pollProgress, setPollProgress] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [cacheMsg, setCacheMsg] = useState('');

  function handleReset() {
    setPageState('idle');
    setBlankQuestions([]);
    setConceptPairs([]);
    setExamItems([]);
    setExamAnswers({});
    setExamIndex(0);
    setExamId(null);
    setCorrectCount(0);
    setTotal(0);
  }

  async function handleStart(selectedMode: QuizMode) {
    setMode(selectedMode);
    setPageState('loading');
    setErrorMsg('');
    setCacheMsg('');
    setExamAnswers({});
    setExamIndex(0);

    try {
      if (selectedMode === 'blank') {
        const items = await fetchBlankQuestions(subject, unit, count);
        setBlankQuestions(items);
        setTotal(items.length);
        setPageState('quiz');
      } else if (selectedMode === 'concept') {
        const items = await fetchConceptPairs(subject, unit, count);
        setConceptPairs(items);
        setTotal(items.length);
        setPageState('quiz');
      } else {
        // exam: subjectId 조회 → job 생성 → 폴링
        setPollMsg('과목 정보를 불러오는 중...');
        setPollProgress(0);

        const subjectInfo = await apiFetch<{ id: string }>(`/subjects/${subject}`);

        setPollMsg('시험을 생성하는 중...');
        const { jobId } = await apiFetch<{ jobId: string }>('/exams/jobs', {
          method: 'POST',
          body: JSON.stringify({
            subjectId: subjectInfo.id,
            startUnitNum: unit,
            endUnitNum: unit,
            difficulty: 'MIDDLE',
            questionCount: count,
          }),
        });

        // 폴링
        const poll = async (): Promise<void> => {
          const job = await apiFetch<{ progress: number; message: string; status: string; examId?: string }>(`/exams/jobs/${jobId}`);
          setPollProgress(job.progress ?? 0);
          setPollMsg(job.message || '생성 중...');

          if (job.status === 'completed' && job.examId) {
            const examData = await apiFetch<{ items: Record<string, unknown>[] }>(`/exams/${job.examId}`);
            const items = (examData.items ?? []).map((item) => ({
              ...item,
              question: normalizeQuestion(item.question as Record<string, unknown>),
            })) as ExamItem[];
            setExamItems(items);
            setExamId(job.examId);
            setTotal(items.length);
            setPageState('quiz');
          } else if (job.status === 'failed') {
            throw new Error('시험 생성에 실패했습니다.');
          } else {
            await new Promise((r) => setTimeout(r, 2000));
            return poll();
          }
        };
        await poll();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류');
      setPageState('error');
    }
  }

  async function handleExamSubmit() {
    if (!examId) return;
    try {
      await apiFetch(`/exams/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: examAnswers }),
      });
      const result = await apiFetch<{ correctCount: number; totalCount: number }>(`/exams/${examId}/result`);
      setCorrectCount(result.correctCount ?? 0);
      setTotal(result.totalCount ?? total);
      setPageState('result');
    } catch {
      setPageState('result');
    }
  }

  async function handleClearCache(type?: 'blank' | 'concept', cacheCount?: QuizCount) {
    try {
      await clearStudyQuizCache(subject, unit, type, cacheCount);
      setCacheMsg(`캐시 삭제 완료 (${type ?? '전체'} / ${cacheCount ?? '전체'})`);
      handleReset();
    } catch {
      setCacheMsg('캐시 삭제 실패');
    }
  }

  function handleComplete(cnt: number) {
    setCorrectCount(cnt);
    setPageState('result');
  }

  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const subjectLabel = SUBJECTS.find((s) => s.value === subject)?.label ?? subject;
  const modeLabel = mode === 'blank' ? 'Level 2: 빈칸 문제' : mode === 'concept' ? 'Level 3: 양방향 개념' : 'Level 4: 실전 문제';

  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    if (pageState === 'result') {
      saveHistory({ timestamp: Date.now(), mode, subject, unit, count, correct: correctCount, total, percent: scorePercent });
      setHistory(loadHistory());
    }
  }, [pageState]);

  const currentExamItem = examItems[examIndex];
  const currentAnswer = currentExamItem ? examAnswers[currentExamItem.orderIndex] : undefined;
  const allAnswered = examItems.length > 0 && Object.keys(examAnswers).length === examItems.length;

  return (
    <VStack gap={SPACING.s24} fullWidth className={s.page}>
      {/* 헤더 */}
      <VStack gap={SPACING.s6}>
        <Typo.BD size={24} color="primary">Study Quiz 테스트</Typo.BD>
        <Typo.TH size={12} color="secondary">
          과목과 단원을 선택하고 Level 2 / Level 3 / Level 4 문제를 테스트합니다
        </Typo.TH>
      </VStack>

      {/* 선택 패널 */}
      <div className={s.controlPanel}>
        <VStack gap={SPACING.s16} fullWidth>
          <HStack gap={SPACING.s16} align="end" wrap="wrap" fullWidth>
            <VStack gap={SPACING.s6}>
              <Typo.MD size={12} color="secondary">과목</Typo.MD>
              <select className={s.select} value={subject} onChange={(e) => { setSubject(e.target.value); handleReset(); }}>
                {SUBJECTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </VStack>

            <VStack gap={SPACING.s6}>
              <Typo.MD size={12} color="secondary">단원</Typo.MD>
              <select className={s.select} value={unit} onChange={(e) => { setUnit(Number(e.target.value)); handleReset(); }}>
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </VStack>

            <VStack gap={SPACING.s6}>
              <Typo.MD size={12} color="secondary">문제 수</Typo.MD>
              <select className={s.select} value={count} onChange={(e) => { setCount(Number(e.target.value) as QuizCount); handleReset(); }}>
                {COUNTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </VStack>

            <HStack gap={SPACING.s10} wrap="wrap">
              <button className={`${s.startButton} ${s.level2}`} onClick={() => handleStart('blank')} disabled={pageState === 'loading'}>
                <Typo.MD size={14} color="inverse" style={{ fontWeight: 600 }}>Level 2: 빈칸</Typo.MD>
              </button>
              <button className={`${s.startButton} ${s.level3}`} onClick={() => handleStart('concept')} disabled={pageState === 'loading'}>
                <Typo.MD size={14} color="inverse" style={{ fontWeight: 600 }}>Level 3: 개념</Typo.MD>
              </button>
              <button className={`${s.startButton} ${s.level4}`} onClick={() => handleStart('exam')} disabled={pageState === 'loading'}>
                <Typo.MD size={14} color="inverse" style={{ fontWeight: 600 }}>Level 4: 실전</Typo.MD>
              </button>
            </HStack>
          </HStack>

          {/* 캐시 삭제 */}
          <HStack gap={SPACING.s8} align="center" wrap="wrap">
            <Typo.MD size={12} color="secondary">캐시 삭제:</Typo.MD>
            <button className={s.cacheButton} onClick={() => handleClearCache('blank', 10)}><Typo.MD size={12} color="secondary">빈칸 10개</Typo.MD></button>
            <button className={s.cacheButton} onClick={() => handleClearCache('blank', 20)}><Typo.MD size={12} color="secondary">빈칸 20개</Typo.MD></button>
            <button className={s.cacheButton} onClick={() => handleClearCache('concept', 10)}><Typo.MD size={12} color="secondary">개념 10개</Typo.MD></button>
            <button className={s.cacheButton} onClick={() => handleClearCache('concept', 20)}><Typo.MD size={12} color="secondary">개념 20개</Typo.MD></button>
            <button className={`${s.cacheButton} ${s.cacheAll}`} onClick={() => handleClearCache()}><Typo.MD size={12} color="wrong">전체 삭제</Typo.MD></button>
            {cacheMsg && <Typo.MD size={12} color="secondary">{cacheMsg}</Typo.MD>}
          </HStack>

          {/* 기록 */}
          {history.length > 0 && (
            <VStack gap={SPACING.s6} className={s.historySection}>
              <Typo.MD size={12} color="secondary" style={{ fontWeight: 600 }}>최근 퀴즈 기록 (최대 20개)</Typo.MD>
              <div className={s.historyList}>
                {history.map((h, i) => (
                  <div key={`${h.timestamp}-${i}`} className={s.historyRow}>
                    <span className={`${s.historyPercent} ${h.percent >= 70 ? s.historyHigh : h.percent >= 40 ? s.historyMid : s.historyLow}`}>
                      {h.percent}%
                    </span>
                    <span className={s.historyMeta}>
                      {h.mode === 'blank' ? '빈칸' : h.mode === 'concept' ? '개념' : '실전'}
                      {' · '}{h.subject === 'success' ? '성직' : '공일'}{h.unit}단원
                      {' · '}{h.correct}/{h.total}
                    </span>
                    <span className={s.historyDate}>
                      {new Date(h.timestamp).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </VStack>
          )}
        </VStack>
      </div>

      {pageState !== 'idle' && <div className={s.divider} />}

      {/* 로딩 */}
      {pageState === 'loading' && (
        <VStack align="center" justify="center" fullWidth gap={SPACING.s12} style={{ minHeight: 200 }}>
          <div className={s.spinner} />
          <Typo.MD size={14} color="secondary">
            {mode === 'exam' ? pollMsg || '시험을 생성하는 중...' : 'AI가 문제를 생성하는 중입니다... (최초 1회)'}
          </Typo.MD>
          {mode === 'exam' && pollProgress > 0 && (
            <div className={s.progressBarWrap}>
              <div className={s.progressBarFill} style={{ width: `${pollProgress}%` }} />
            </div>
          )}
        </VStack>
      )}

      {/* 에러 */}
      {pageState === 'error' && (
        <VStack align="center" justify="center" fullWidth gap={SPACING.s12} style={{ minHeight: 200 }}>
          <Typo.MD size={16} color="wrong">{errorMsg}</Typo.MD>
          <button className={s.retryButton} onClick={() => handleStart(mode)}>
            <Typo.MD size={14} color="primary">다시 시도</Typo.MD>
          </button>
        </VStack>
      )}

      {/* 퀴즈 */}
      {pageState === 'quiz' && (
        <VStack gap={SPACING.s16} fullWidth>
          <HStack gap={SPACING.s8} align="center">
            <span className={s.modeBadge}>{modeLabel}</span>
            <Typo.MD size={12} color="secondary">{subjectLabel} · {unit}단원 · {total}문제</Typo.MD>
            {mode === 'exam' && <Typo.MD size={12} color="secondary">{examIndex + 1} / {total}</Typo.MD>}
          </HStack>

          {mode === 'blank' && blankQuestions.length > 0 && (
            <BlankQuiz questions={blankQuestions} onComplete={handleComplete} />
          )}
          {mode === 'concept' && conceptPairs.length > 0 && (
            <ConceptQuiz pairs={conceptPairs} onComplete={handleComplete} />
          )}
          {mode === 'exam' && currentExamItem && (
            <VStack gap={SPACING.s16} fullWidth>
              <QuestionRenderer
                question={currentExamItem.question}
                questionNumber={currentExamItem.orderIndex}
                selectedOption={currentAnswer ?? null}
                onSelect={(num) => setExamAnswers((prev) => ({ ...prev, [currentExamItem.orderIndex]: num }))}
              />
              <HStack gap={SPACING.s10} fullWidth>
                {examIndex < examItems.length - 1 ? (
                  <button
                    className={`${s.startButton} ${s.level4}`}
                    onClick={() => setExamIndex((i) => i + 1)}
                    disabled={!currentAnswer}
                  >
                    <Typo.MD size={14} color="inverse" style={{ fontWeight: 600 }}>다음 문제 →</Typo.MD>
                  </button>
                ) : (
                  <button
                    className={`${s.startButton} ${s.level4}`}
                    onClick={handleExamSubmit}
                    disabled={!allAnswered}
                  >
                    <Typo.MD size={14} color="inverse" style={{ fontWeight: 600 }}>
                      {allAnswered ? '제출하기' : `${total - Object.keys(examAnswers).length}문제 남음`}
                    </Typo.MD>
                  </button>
                )}
              </HStack>
            </VStack>
          )}
        </VStack>
      )}

      {/* 결과 */}
      {pageState === 'result' && (
        <VStack align="center" gap={SPACING.s20} fullWidth>
          <div className={s.resultCard}>
            <VStack align="center" gap={SPACING.s16}>
              <span className={s.modeBadge}>{modeLabel}</span>
              <Typo.BD size={32} color="brand" style={{ fontWeight: 700 }}>{scorePercent}%</Typo.BD>
              <Typo.MD size={14} color="secondary">
                {total}문제 중 {correctCount}개 정답 · {subjectLabel} {unit}단원
              </Typo.MD>
            </VStack>
          </div>
          <HStack gap={SPACING.s10}>
            <button className={s.retryButton} onClick={() => handleStart(mode)}>
              <Typo.MD size={14} color="primary">같은 문제 다시 풀기</Typo.MD>
            </button>
            <button className={s.retryButton} onClick={handleReset}>
              <Typo.MD size={14} color="secondary">처음으로</Typo.MD>
            </button>
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}
