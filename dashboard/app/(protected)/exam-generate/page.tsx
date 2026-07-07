'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import { getTemplateLabel } from '@/utils/examParser';
import type { ComboBlock, ExamQuestion } from '@/types/examQuestion';
import { toExamQuestionFromApiItem } from '@/utils/examQuestionAdapter';
import s from './page.module.scss';

interface UnitConcepts {
  unitName: string;
  concepts: string[];
}

import { apiFetch } from '@/lib/api';

const SUBJECTS = [
  { id: '', slug: 'success', title: '성공적인 직업생활' },
  { id: '', slug: 'industry', title: '공업 일반' },
];

const DIFFICULTIES = [
  { value: 'LOW', label: '하' },
  { value: 'MIDDLE', label: '중' },
  { value: 'HIGH', label: '상' },
  { value: 'INTERGRATE', label: '통합 (난이도 혼합)' },
];

interface ApiExamItem {
  id: string;
  orderIndex: number;
  question: {
    id: string;
    targetConcept: string;
    itemType: string;
    difficulty: string;
    recommendedTemplate: string;
    questionStem: string;
    stimulusData: unknown;
    optionsList: string[];
    explanation: unknown;
    correctAnswer?: number;
    comboBlock?: ComboBlock | null;
  };
}

interface GenerationJobLog {
  stage: string;
  progress: number;
  message: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  detail?: string;
  timestamp: string;
}

interface GenerationJobState {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  message: string;
  error?: string;
  examId?: string;
  logs: GenerationJobLog[];
}

export default function DevExamGeneratePage() {
  const [subjectSlug, setSubjectSlug] = useState('success');
  const [startUnit, setStartUnit] = useState(1);
  const [endUnit, setEndUnit] = useState(4);
  const [difficulty, setDifficulty] = useState('MIDDLE');
  const [questionCount, setQuestionCount] = useState(5);
  const [customPrompt, setCustomPrompt] = useState('');

  const [concepts, setConcepts] = useState<UnitConcepts[]>([]);
  const [selectedConcepts, setSelectedConcepts] = useState<string[]>([]);
  const [loadingConcepts, setLoadingConcepts] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null);
  const [examTitle, setExamTitle] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [jobState, setJobState] = useState<GenerationJobState | null>(null);
  const pollingRef = useRef<number | null>(null);
  const pollingStartRef = useRef<number | null>(null);
  const POLLING_TIMEOUT_MS = 5 * 60 * 1000; // 5분

  const resetConcepts = () => {
    setConcepts([]);
    setSelectedConcepts([]);
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const loadExamResult = useCallback(
    async (examId: string, subjectTitleFallback: string) => {
      const data = await apiFetch<{ items: ApiExamItem[]; title?: string }>(`/exams/${examId}`);
      const items: ApiExamItem[] = data.items ?? [];
      const unitName = `${startUnit}~${endUnit}단원`;

      setExamTitle(data.title ?? `${subjectTitleFallback} ${unitName}`);
      setQuestions(items.map((item) => toExamQuestionFromApiItem(item, { unitName })));
      setCurrentIndex(0);
    },
    [startUnit, endUnit],
  );

  const pollJob = useCallback(
    async (jobId: string, subjectTitleFallback: string) => {
      const job: GenerationJobState = await apiFetch(`/exams/jobs/${jobId}`);
      setJobState(job);

      if (job.status === 'completed' && job.examId) {
        stopPolling();
        await loadExamResult(job.examId, subjectTitleFallback);
        setLoading(false);
      }

      if (job.status === 'failed') {
        stopPolling();
        setError(job.error ?? job.message ?? '시험 생성 중 오류가 발생했습니다.');
        setLoading(false);
      }

      return job;
    },
    [stopPolling, loadExamResult],
  );

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const handleLoadConcepts = async () => {
    setLoadingConcepts(true);
    setError(null);
    resetConcepts();

    try {
      const data: UnitConcepts[] = await apiFetch(
        `/exams/concepts?subjectSlug=${subjectSlug}&startUnitNum=${startUnit}&endUnitNum=${endUnit}`,
      );
      setConcepts(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoadingConcepts(false);
    }
  };

  const toggleConcept = (concept: string) => {
    setSelectedConcepts((prev) =>
      prev.includes(concept) ? prev.filter((c) => c !== concept) : [...prev, concept],
    );
  };

  const handleGenerate = async () => {
    stopPolling();
    setLoading(true);
    setError(null);
    setQuestions(null);
    setExamTitle('');
    setJobState(null);

    try {
      // 1. subjectId 조회
      const subjects: { id: string; slug: string; title: string }[] = await apiFetch('/subjects');
      const subject = subjects.find((s) => s.slug === subjectSlug);
      if (!subject) throw new Error(`과목을 찾을 수 없습니다: ${subjectSlug}`);

      // 2. 생성 job 시작
      const data: {
        jobId: string;
        status: GenerationJobState['status'];
        progress: number;
        stage: string;
        message: string;
      } = await apiFetch('/exams/jobs', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: subject.id,
          startUnitNum: startUnit,
          endUnitNum: endUnit,
          difficulty,
          questionCount,
          customPrompt: customPrompt.trim() || undefined,
          targetConcepts: selectedConcepts.length > 0 ? selectedConcepts : undefined,
        }),
      });

      setJobState({
        id: data.jobId,
        status: data.status,
        progress: data.progress,
        stage: data.stage,
        message: data.message,
        logs: [
          {
            stage: data.stage,
            progress: data.progress,
            message: data.message,
            status: 'info',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      const initialJob = await pollJob(data.jobId, subject.title);

      if (!initialJob || initialJob.status === 'completed' || initialJob.status === 'failed') {
        return;
      }

      pollingStartRef.current = Date.now();

      pollingRef.current = window.setInterval(() => {
        // 타임아웃 체크 (5분)
        if (pollingStartRef.current && Date.now() - pollingStartRef.current > POLLING_TIMEOUT_MS) {
          stopPolling();
          setLoading(false);
          setError('생성 시간이 초과되었습니다. 백엔드가 재시작되었거나 응답이 없습니다.');
          return;
        }

        void pollJob(data.jobId, subject.title).catch((pollError: unknown) => {
          stopPolling();
          setLoading(false);
          setError(
            pollError instanceof Error
              ? pollError.message
              : '생성 상태 조회 중 오류가 발생했습니다.',
          );
        });
      }, 1200);
    } catch (e: unknown) {
      stopPolling();
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  const goTo = (index: number) => {
    if (questions && index >= 0 && index < questions.length) {
      setCurrentIndex(index);
    }
  };

  return (
    <VStack gap={0} fullWidth fullHeight className={s.page}>
      {/* 헤더 */}
      <HStack gap={0} align="center" justify="between" fullWidth className={s.header}>
        <VStack gap={4}>
          <Typo.BD size={16} color="primary">시험 생성 테스트</Typo.BD>
          <Typo.TH size={12} color="secondary">
            백엔드 API를 직접 호출하여 AI 문제 생성을 테스트합니다
          </Typo.TH>
        </VStack>
        {questions && (
          <HStack gap={8} align="center">
            <button
              className={s.navBtn}
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              ← 이전
            </button>
            <span className={s.pageIndicator}>
              {currentIndex + 1} / {questions.length}
            </span>
            <button
              className={s.navBtn}
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === questions.length - 1}
            >
              다음 →
            </button>
          </HStack>
        )}
      </HStack>

      {/* 본문 */}
      <HStack gap={20} align="start" fullWidth fullHeight className={s.body}>
        {/* 좌측: 설정 패널 */}
        <VStack gap={16} fullWidth className={s.sidebar}>
          <Typo.SM size={12} color="secondary" className={s.sidebarTitle}>
            생성 설정
          </Typo.SM>

          {/* 과목 */}
          <VStack gap={6} fullWidth>
            <Typo.MD size={12} color="primary">과목</Typo.MD>
            <select
              className={s.select}
              value={subjectSlug}
              onChange={(e) => setSubjectSlug(e.target.value)}
            >
              {SUBJECTS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </select>
          </VStack>

          {/* 단원 범위 */}
          <VStack gap={6} fullWidth>
            <Typo.MD size={12} color="primary">단원 범위</Typo.MD>
            <HStack gap={8} align="center" fullWidth>
              <input
                className={s.inputSmall}
                type="number"
                min={1}
                max={20}
                value={startUnit}
                onChange={(e) => { setStartUnit(Number(e.target.value)); resetConcepts(); }}
              />
              <Typo.TH size={12} color="secondary">~</Typo.TH>
              <input
                className={s.inputSmall}
                type="number"
                min={1}
                max={20}
                value={endUnit}
                onChange={(e) => { setEndUnit(Number(e.target.value)); resetConcepts(); }}
              />
              <Typo.TH size={12} color="secondary">단원</Typo.TH>
            </HStack>
            <button
              className={s.loadConceptsBtn}
              onClick={handleLoadConcepts}
              disabled={loadingConcepts}
            >
              {loadingConcepts ? '불러오는 중...' : '개념 불러오기'}
            </button>
          </VStack>

          {/* 핵심 개념 선택 */}
          {concepts.length > 0 && (
            <VStack gap={8} fullWidth>
              <HStack gap={0} align="center" justify="between" fullWidth>
                <Typo.MD size={12} color="primary">핵심 개념 선택</Typo.MD>
                {selectedConcepts.length > 0 && (
                  <button className={s.clearBtn} onClick={() => setSelectedConcepts([])}>
                    전체 해제
                  </button>
                )}
              </HStack>
              <VStack gap={6} fullWidth className={s.conceptList}>
                {concepts.map((unit) => (
                  <VStack key={unit.unitName} gap={4} fullWidth>
                    <span className={s.conceptUnitLabel}>{unit.unitName}</span>
                    {unit.concepts.map((concept) => (
                      <HStack
                        key={concept}
                        gap={6}
                        align="center"
                        fullWidth
                        as="label"
                        className={s.conceptItem}
                      >
                        <input
                          type="checkbox"
                          className={s.conceptCheckbox}
                          checked={selectedConcepts.includes(concept)}
                          onChange={() => toggleConcept(concept)}
                        />
                        <span className={s.conceptName}>{concept}</span>
                      </HStack>
                    ))}
                  </VStack>
                ))}
              </VStack>
              {selectedConcepts.length > 0 && (
                <HStack gap={0} align="center" justify="center" fullWidth className={s.selectedBadge}>
                  <Typo.TH size={12} color="secondary">
                    {selectedConcepts.length}개 선택됨
                  </Typo.TH>
                </HStack>
              )}
            </VStack>
          )}

          {/* 난이도 */}
          <VStack gap={6} fullWidth>
            <Typo.MD size={12} color="primary">난이도</Typo.MD>
            <select
              className={s.select}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </VStack>

          {/* 문항 수 */}
          <VStack gap={6} fullWidth>
            <Typo.MD size={12} color="primary">문항 수</Typo.MD>
            <input
              className={s.input}
              type="number"
              min={1}
              max={20}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
            />
          </VStack>

          {/* 커스텀 프롬프트 */}
          <VStack gap={6} fullWidth>
            <Typo.MD size={12} color="primary">커스텀 프롬프트 (선택)</Typo.MD>
            <textarea
              className={s.textarea}
              placeholder="추가 지시사항 입력..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
            />
          </VStack>

          {/* 생성 버튼 */}
          <button
            className={s.generateBtn}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? '생성 중...' : '시험 생성'}
          </button>

          {/* 에러 */}
          {error && (
            <VStack gap={0} fullWidth className={s.errorBox}>
              <Typo.MD size={12} color="wrong">{error}</Typo.MD>
            </VStack>
          )}

          {jobState && (
            <VStack gap={10} fullWidth className={s.progressBox}>
              <VStack gap={4} fullWidth>
                <HStack gap={8} align="center" justify="between" fullWidth>
                  <Typo.MD size={12} color="primary">생성 진행 상황</Typo.MD>
                  <Typo.TH size={12} color="secondary">{jobState.progress}%</Typo.TH>
                </HStack>
                <div className={s.progressBarTrack}>
                  <div
                    className={s.progressBarFill}
                    style={{ width: `${Math.max(0, Math.min(100, jobState.progress))}%` }}
                  />
                </div>
                <Typo.TH size={12} color="secondary">{jobState.message}</Typo.TH>
              </VStack>

              <VStack gap={6} fullWidth className={s.progressLogList}>
                {jobState.logs.map((log, index) => (
                  <VStack
                    key={`${log.timestamp}-${index}`}
                    gap={2}
                    fullWidth
                    className={`${s.progressLogItem} ${
                      log.status === 'error'
                        ? s.progressLogError
                        : log.status === 'warning'
                          ? s.progressLogWarning
                          : log.status === 'success'
                            ? s.progressLogSuccess
                            : ''
                    }`}
                  >
                    <HStack gap={8} align="center" justify="between" fullWidth>
                      <span className={s.progressLogStage}>{log.stage}</span>
                      <span className={s.progressLogTime}>
                        {new Date(log.timestamp).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </HStack>
                    <span className={s.progressLogMessage}>{log.message}</span>
                    {log.detail && <span className={s.progressLogDetail}>{log.detail}</span>}
                  </VStack>
                ))}
              </VStack>
            </VStack>
          )}

          {/* 문항 목록 (생성 후) */}
          {questions && (
            <VStack gap={4} fullWidth>
              <Typo.SM size={12} color="secondary" className={s.sidebarTitle}>
                문항 목록
              </Typo.SM>
              {questions.map((q, index) => (
                <button
                  key={index}
                  className={`${s.sidebarItem} ${currentIndex === index ? s.sidebarItemActive : ''}`}
                  onClick={() => goTo(index)}
                >
                  <HStack gap={8} align="center" fullWidth>
                    <span className={s.sidebarNum}>{index + 1}</span>
                    <VStack gap={2}>
                      <span className={s.sidebarConcept}>
                        {q.metadata.target_concept}
                      </span>
                      <span className={s.sidebarTemplate}>
                        {getTemplateLabel(q.metadata.recommended_template ?? '')}
                      </span>
                    </VStack>
                  </HStack>
                </button>
              ))}
            </VStack>
          )}
        </VStack>

        {/* 우측: 문항 렌더러 */}
        <VStack gap={0} fullWidth fullHeight className={s.main}>
          {loading && (
            <VStack gap={16} align="center" justify="center" fullWidth fullHeight>
              <div className={s.spinner} />
              <Typo.MD size={14} color="secondary">
                AI가 문제를 생성하고 있습니다...
              </Typo.MD>
              <Typo.TH size={12} color="secondary">
                {jobState?.message ?? 'GPT-4o 기반 2단계 파이프라인 실행 중'}
              </Typo.TH>
            </VStack>
          )}

          {!loading && !questions && !error && (
            <VStack gap={8} align="center" justify="center" fullWidth fullHeight>
              <Typo.MD size={14} color="secondary">
                좌측에서 설정 후 시험 생성 버튼을 눌러주세요
              </Typo.MD>
            </VStack>
          )}

          {!loading && questions && questions.length > 0 && (
            <VStack gap={0} fullWidth fullHeight>
              <HStack gap={0} align="center" justify="between" fullWidth className={s.examTitle}>
                <Typo.SM size={14} color="primary">{examTitle}</Typo.SM>
                <HStack gap={8} align="center">
                  <Typo.TH size={12} color="secondary">
                    총 {questions.length}문항
                  </Typo.TH>
                  <button className={s.regenerateBtn} onClick={handleGenerate}>
                    재생성
                  </button>
                </HStack>
              </HStack>
              <VStack gap={16} fullWidth fullHeight className={s.questionArea}>
                <QuestionRenderer
                  key={currentIndex}
                  question={questions[currentIndex]}
                  questionNumber={currentIndex + 1}
                />
                <HStack gap={12} justify="between" fullWidth className={s.bottomNav}>
                  <button
                    className={`${s.bottomNavBtn} ${currentIndex === 0 ? s.bottomNavBtnDisabled : ''}`}
                    onClick={() => goTo(currentIndex - 1)}
                    disabled={currentIndex === 0}
                  >
                    ← 이전 문항
                  </button>
                  <Typo.TH size={12} color="secondary">
                    {currentIndex + 1} / {questions.length}
                  </Typo.TH>
                  <button
                    className={`${s.bottomNavBtn} ${currentIndex === questions.length - 1 ? s.bottomNavBtnDisabled : ''}`}
                    onClick={() => goTo(currentIndex + 1)}
                    disabled={currentIndex === questions.length - 1}
                  >
                    다음 문항 →
                  </button>
                </HStack>
              </VStack>
            </VStack>
          )}
        </VStack>
      </HStack>
    </VStack>
  );
}
