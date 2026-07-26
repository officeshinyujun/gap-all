'use client';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import { HeaderActions } from '@shared/ui/HeaderActions';
import {
  fetchReviewRecommendations,
  submitReviewResult,
  fetchConceptByName,
  fetchUnitId,
  createReviewExamJob,
  fetchQuestionsByIds,
  addConceptBookmark,
  type ReviewRecommendation,
  type ReviewQuestion,
  type ConceptExplanation,
} from '@/lib/studyQuizApi';
import { pollExamJob, fetchExam, type ExamData } from '@/lib/examApi';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import s from './page.module.scss';

const markdownComponents = {
  a: ({ href, children, ...props }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

type PageState = 'loading' | 'empty' | 'list' | 'retake' | 'concept' | 'result';

interface GroupedRecommendation {
  subjectSlug: string;
  subjectTitle: string;
  unitNumber: number;
  unitTitle: string;
  items: ReviewRecommendation[];
}

interface ReviewAnswer {
  targetConcept: string;
  unitId: string;
  source: 'EXAM' | 'BLANK_FILL' | 'INTERACTIVE_QUIZ' | 'PRACTICE_EXAM';
  isCorrect: boolean;
}

interface ReviewProgress {
  groupKey: string;
  quizIndex: number;
  answers: ReviewAnswer[];
  timestamp: number;
}

function saveProgress(groupKey: string, nextQuizIndex: number, currentAnswers: ReviewAnswer[]) {
  const progress: ReviewProgress = {
    groupKey,
    quizIndex: nextQuizIndex,
    answers: currentAnswers,
    timestamp: Date.now(),
  };
  localStorage.setItem('gap_review_progress', JSON.stringify(progress));
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [groups, setGroups] = useState<GroupedRecommendation[]>([]);
  const [totalConcepts, setTotalConcepts] = useState(0);

  const [selectedGroup, setSelectedGroup] = useState<GroupedRecommendation | null>(null);
  const [groupUnitId, setGroupUnitId] = useState<string>('');
  const [quizIndex, setQuizIndex] = useState(0);
  const [conceptData, setConceptData] = useState<ConceptExplanation | null>(null);
  const [answers, setAnswers] = useState<ReviewAnswer[]>([]);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [sessionResult, setSessionResult] = useState<{ updated: number; graduated: number } | null>(null);

  const [retakeQuestions, setRetakeQuestions] = useState<ReviewQuestion[]>([]);
  const [retakeIndex, setRetakeIndex] = useState(0);
  const [retakeAnswer, setRetakeAnswer] = useState<number | null>(null);
  const [retakeSubmitted, setRetakeSubmitted] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState('');
  const [genExamData, setGenExamData] = useState<ExamData | null>(null);
  const [genCurrentIndex, setGenCurrentIndex] = useState(0);
  const [genAnswers, setGenAnswers] = useState<Record<number, number>>({});
  const [genPageState, setGenPageState] = useState<'idle' | 'polling' | 'ready' | 'submitted'>('idle');

  useEffect(() => {
    fetchReviewRecommendations()
      .then((data) => {
        if (data.recommendations.length === 0) {
          setPageState('empty');
          return;
        }
        setTotalConcepts(data.totalIncorrectConcepts);
        const map = new Map<string, GroupedRecommendation>();
        for (const rec of data.recommendations) {
          const key = `${rec.subjectSlug}-${rec.unitNumber}`;
          if (!map.has(key)) {
            map.set(key, {
              subjectSlug: rec.subjectSlug,
              subjectTitle: rec.subjectTitle,
              unitNumber: rec.unitNumber,
              unitTitle: rec.unitTitle,
              items: [],
            });
          }
          map.get(key)!.items.push(rec);
        }
        setGroups([...map.values()]);
        setPageState('list');
      })
      .catch(() => setPageState('empty'));
  }, []);

  async function handleSelectGroup(group: GroupedRecommendation) {
    const groupKey = `${group.subjectSlug}-${group.unitNumber}`;

    let startIndex = 0;
    let savedAnswers: ReviewAnswer[] = [];

    const savedRaw = localStorage.getItem('gap_review_progress');
    if (savedRaw) {
      try {
        const saved: ReviewProgress = JSON.parse(savedRaw);
        if (saved.groupKey === groupKey && Date.now() - saved.timestamp < 24 * 60 * 60 * 1000) {
          startIndex = saved.quizIndex;
          savedAnswers = saved.answers;
        }
      } catch {}
    }

    setSelectedGroup(group);
    setQuizIndex(startIndex);
    setAnswers(savedAnswers);
    setConceptData(null);
    setBookmarkSaved(false);
    setRetakeQuestions([]);
    setRetakeIndex(0);
    setRetakeAnswer(null);
    setRetakeSubmitted(false);
    const unitId = await fetchUnitId(group.subjectSlug, group.unitNumber);
    setGroupUnitId(unitId ?? '');

    const currentItem = group.items[startIndex];
    if (!currentItem) {
      setQuizIndex(0);
      setAnswers([]);
      localStorage.removeItem('gap_review_progress');
      const firstItem = group.items[0];
      if (firstItem.questionIds.length > 0) {
        const questions = await fetchQuestionsByIds(firstItem.questionIds);
        setRetakeQuestions(questions);
        setPageState('retake');
      } else {
        const concept = firstItem.targetConcept;
        fetchConceptByName(group.subjectSlug, group.unitNumber, concept)
          .then(setConceptData)
          .catch(() => setConceptData({ found: false, title: concept, description: '개념 설명을 불러올 수 없습니다.', bulletPoints: [], trapPoints: [], logicFlow: '' }));
        setPageState('concept');
      }
      return;
    }

    if (currentItem.questionIds.length > 0) {
      const questions = await fetchQuestionsByIds(currentItem.questionIds);
      setRetakeQuestions(questions);
      setPageState('retake');
    } else {
      const currentConcept = currentItem.targetConcept;
      fetchConceptByName(group.subjectSlug, group.unitNumber, currentConcept)
        .then(setConceptData)
        .catch(() => setConceptData({ found: false, title: currentConcept, description: '개념 설명을 불러올 수 없습니다.', bulletPoints: [], trapPoints: [], logicFlow: '' }));
      setPageState('concept');
    }
  }

  function handleRetakeSelect(answerIndex: number) {
    if (retakeSubmitted) return;
    setRetakeAnswer(answerIndex);
  }

  function handleRetakeSubmit() {
    if (retakeAnswer === null) return;
    setRetakeSubmitted(true);
  }

  async function handleRetakeNext() {
    if (retakeIndex < retakeQuestions.length - 1) {
      setRetakeIndex((i) => i + 1);
      setRetakeAnswer(null);
      setRetakeSubmitted(false);
    } else {
      if (!selectedGroup) return;
      const currentItem = selectedGroup.items[quizIndex];

      setAnswers((prev) => [
        ...prev,
        {
          targetConcept: currentItem.targetConcept,
          unitId: groupUnitId,
          source: currentItem.source as ReviewAnswer['source'],
          isCorrect: retakeAnswer === retakeQuestions[retakeQuestions.length - 1]?.correctAnswer,
        },
      ]);

      fetchConceptByName(selectedGroup.subjectSlug, selectedGroup.unitNumber, currentItem.targetConcept)
        .then(setConceptData)
        .catch(() => setConceptData({ found: false, title: currentItem.targetConcept, description: '개념 설명을 불러올 수 없습니다.', bulletPoints: [], trapPoints: [], logicFlow: '' }));
      setPageState('concept');
    }
  }

  async function handleNext() {
    if (!selectedGroup) return;
    setBookmarkSaved(false);
    if (quizIndex < selectedGroup.items.length - 1) {
      const nextIndex = quizIndex + 1;

      const groupKey = `${selectedGroup.subjectSlug}-${selectedGroup.unitNumber}`;
      saveProgress(groupKey, nextIndex, answers);

      setQuizIndex(nextIndex);
      setConceptData(null);
      setRetakeAnswer(null);
      setRetakeSubmitted(false);
      setRetakeIndex(0);

      const nextItem = selectedGroup.items[nextIndex];
      if (nextItem.questionIds.length > 0) {
        const questions = await fetchQuestionsByIds(nextItem.questionIds);
        setRetakeQuestions(questions);
        setPageState('retake');
      } else {
        const nextConcept = nextItem.targetConcept;
        fetchConceptByName(selectedGroup.subjectSlug, selectedGroup.unitNumber, nextConcept)
          .then(setConceptData)
          .catch(() => setConceptData({ found: false, title: nextConcept, description: '개념 설명을 불러올 수 없습니다.', bulletPoints: [], trapPoints: [], logicFlow: '' }));
        setPageState('concept');
      }
    } else {
      localStorage.removeItem('gap_review_progress');
      try {
        const result = await submitReviewResult(answers);
        setSessionResult(result);
      } catch {
        setSessionResult({ updated: answers.length, graduated: 0 });
      }
      setPageState('result');
    }
  }

  async function handleGenerate() {
    if (groups.length === 0) return;
    const subjectSlug = groups[0].subjectSlug;
    setGenerating(true);
    setGenProgress(0);
    setGenMessage('AI가 문제를 생성하는 중입니다...');
    setGenPageState('polling');

    try {
      const { jobId } = await createReviewExamJob(subjectSlug);

      const poll = async (): Promise<void> => {
        const job = await pollExamJob(jobId);
        setGenProgress(job.progress);
        setGenMessage(job.message || 'AI가 문제를 생성하는 중입니다...');

        if (job.status === 'completed' && job.examId) {
          const exam = await fetchExam(job.examId);
          setGenExamData(exam);
          setGenPageState('ready');
          setGenerating(false);
        } else if (job.status === 'failed') {
          throw new Error('문제 생성에 실패했습니다.');
        } else {
          await new Promise((r) => setTimeout(r, 2000));
          return poll();
        }
      };

      await poll();
    } catch {
      setGenMessage('문제 생성에 실패했습니다.');
      setGenerating(false);
      setGenPageState('idle');
    }
  }

  const currentItem = selectedGroup?.items[quizIndex];

  return (
    <VStack gap={SPACING.s16} fullWidth className={s.pageWrapper}>
      <HStack justify="between" align="center" fullWidth>
        <VStack gap={SPACING.s6}>
          <Typo.SM size={24} color="primary">복습하기</Typo.SM>
          <Typo.MD size={12} color="secondary">틀린 개념을 다시 확인해보세요</Typo.MD>
        </VStack>
        <HeaderActions showUser />
      </HStack>

      {pageState === 'loading' && (
        <VStack align="center" justify="center" fullWidth style={{ padding: SPACING.s24 }}>
          <Typo.MD size={14} color="secondary">불러오는 중...</Typo.MD>
        </VStack>
      )}

      {pageState === 'empty' && (
        <VStack align="center" justify="center" fullWidth style={{ padding: SPACING.s24 }}>
          <Typo.MD size={16} color="secondary">복습할 오답이 없습니다!</Typo.MD>
          <button className={s.actionButton} onClick={() => navigate('/')}>
            <Typo.SM size={14} color="brand">메인으로 돌아가기</Typo.SM>
          </button>
        </VStack>
      )}

      {pageState === 'list' && genPageState === 'idle' && (() => {
        const savedRaw = typeof window !== 'undefined' ? localStorage.getItem('gap_review_progress') : null;
        const savedProgress: ReviewProgress | null = savedRaw ? (() => { try { return JSON.parse(savedRaw); } catch { return null; } })() : null;
        return (
        <VStack gap={SPACING.s16} fullWidth>
          <Typo.MD size={14} color="secondary">총 {totalConcepts}개의 취약 개념</Typo.MD>
          {groups.map((group) => (
            <VStack
              key={`${group.subjectSlug}-${group.unitNumber}`}
              gap={SPACING.s12}
              className={s.groupCard}
              fullWidth
              style={{ padding: SPACING.s16 }}
            >
              <HStack justify="between" align="center" fullWidth>
                <VStack gap={SPACING.s4}>
                  <Typo.MD size={12} color="secondary">{group.subjectTitle}</Typo.MD>
                  <Typo.SM size={16} color="primary">{group.unitNumber}단원 · {group.unitTitle}</Typo.SM>
                </VStack>
                <button className={s.actionButton} onClick={() => handleSelectGroup(group)}>
                  <Typo.SM size={14} color="brand">
                    {savedProgress?.groupKey === `${group.subjectSlug}-${group.unitNumber}` && Date.now() - savedProgress.timestamp < 24 * 60 * 60 * 1000
                      ? `이어하기 (${savedProgress.quizIndex}/${group.items.length})`
                      : '복습하기'}
                  </Typo.SM>
                </button>
              </HStack>
              <HStack gap={SPACING.s8} wrap="wrap">
                {group.items.map((item) => (
                  <span key={item.targetConcept} className={s.conceptTag}>
                    {item.targetConcept}
                  </span>
                ))}
              </HStack>
            </VStack>
          ))}

          <VStack gap={SPACING.s12} className={s.generateSection} fullWidth style={{ padding: SPACING.s16 }}>
            <Typo.MD size={14} color="primary">더 연습하고 싶다면?</Typo.MD>
            <Typo.MD size={12} color="secondary">내 오답 기반으로 AI가 새로운 문제를 만들어줍니다</Typo.MD>
            <button
              className={s.generateButton}
              onClick={handleGenerate}
              disabled={generating}
            >
              <Typo.SM size={14} color="brand">
                {generating ? '생성 중...' : '새 문제 생성하기'}
              </Typo.SM>
            </button>
          </VStack>
        </VStack>
        );
      })()}

      {pageState === 'list' && genPageState === 'polling' && (
        <VStack gap={SPACING.s16} fullWidth align="center" style={{ padding: SPACING.s24 }}>
          <div className={s.spinner} />
          <Typo.MD size={14} color="secondary">{genMessage}</Typo.MD>
          <Typo.MD size={12} color="secondary">{genProgress}%</Typo.MD>
        </VStack>
      )}

      {pageState === 'list' && genPageState === 'ready' && genExamData && (
        <VStack gap={SPACING.s16} fullWidth>
          <HStack justify="between" align="center" fullWidth>
            <Typo.SM size={16} color="primary">AI 생성 문제</Typo.SM>
            <Typo.MD size={12} color="secondary">
              {genCurrentIndex + 1} / {genExamData.items.length}
            </Typo.MD>
          </HStack>
          <VStack gap={SPACING.s12} className={s.groupCard} fullWidth style={{ padding: SPACING.s16 }}>
            <Typo.SM size={14} color="primary">
              {genExamData.items[genCurrentIndex].question.render_ready?.question_stem}
            </Typo.SM>
            <VStack gap={SPACING.s8} fullWidth>
              {(genExamData.items[genCurrentIndex].question.render_ready?.options_list ?? []).map((opt, idx) => (
                <button
                  key={idx}
                  className={
                    genAnswers[genExamData.items[genCurrentIndex].orderIndex] === idx + 1
                      ? s.correctButton
                      : s.incorrectButton
                  }
                  onClick={() => {
                    setGenAnswers((prev) => ({
                      ...prev,
                      [genExamData!.items[genCurrentIndex].orderIndex]: idx + 1,
                    }));
                  }}
                  style={{ textAlign: 'left', padding: '12px 16px' }}
                >
                  <Typo.MD size={12} color="primary">{idx + 1}. {opt}</Typo.MD>
                </button>
              ))}
            </VStack>
          </VStack>
          <HStack justify="center" fullWidth>
            <button className={s.actionButton} onClick={() => {
              if (genCurrentIndex < genExamData!.items.length - 1) {
                setGenCurrentIndex((i) => i + 1);
              } else {
                setGenPageState('submitted');
              }
            }}>
              <Typo.SM size={14} color="brand">
                {genCurrentIndex < genExamData!.items.length - 1 ? '다음 →' : '완료'}
              </Typo.SM>
            </button>
          </HStack>
        </VStack>
      )}

      {pageState === 'list' && genPageState === 'submitted' && (
        <VStack gap={SPACING.s16} fullWidth align="center" style={{ padding: SPACING.s24 }}>
          <Typo.SM size={20} color="primary">문제 풀이 완료!</Typo.SM>
          <button className={s.actionButton} onClick={() => {
            setGenPageState('idle');
            setGenExamData(null);
            setGenCurrentIndex(0);
            setGenAnswers({});
          }}>
            <Typo.SM size={14} color="brand">목록으로 돌아가기</Typo.SM>
          </button>
        </VStack>
      )}

      {pageState === 'retake' && retakeQuestions.length > 0 && (
        <VStack gap={SPACING.s24} fullWidth>
          <HStack justify="between" align="center" fullWidth>
            <VStack gap={SPACING.s4}>
              <Typo.MD size={12} color="secondary">
                {selectedGroup?.items[quizIndex].targetConcept}
              </Typo.MD>
              <Typo.MD size={12} color="secondary">
                문제 {retakeIndex + 1} / {retakeQuestions.length}
              </Typo.MD>
            </VStack>
            <button className={s.backButton} onClick={() => setPageState('list')}>
              <Typo.MD size={12} color="secondary">목록으로</Typo.MD>
            </button>
          </HStack>

          <QuestionRenderer
            question={{
              metadata: retakeQuestions[retakeIndex].metadata,
              render_ready: retakeQuestions[retakeIndex].render_ready,
            }}
            questionNumber={retakeIndex + 1}
            onSelect={retakeSubmitted ? undefined : (num) => handleRetakeSelect(num)}
            selectedOption={retakeAnswer}
            correctAnswer={retakeSubmitted ? retakeQuestions[retakeIndex].correctAnswer : null}
            showExplanation={retakeSubmitted}
          />

          <HStack justify="center" fullWidth>
            {!retakeSubmitted ? (
              <button className={s.actionButton} onClick={handleRetakeSubmit} disabled={retakeAnswer === null}>
                <Typo.SM size={14} color="brand">정답 확인</Typo.SM>
              </button>
            ) : (
              <button className={s.actionButton} onClick={handleRetakeNext}>
                <Typo.SM size={14} color="brand">
                  {retakeIndex < retakeQuestions.length - 1 ? '다음 문제 →' : '개념 설명 보기 →'}
                </Typo.SM>
              </button>
            )}
          </HStack>
        </VStack>
      )}

      {pageState === 'concept' && conceptData && (
        <VStack gap={SPACING.s16} fullWidth>
          <HStack justify="between" align="center" fullWidth>
            <Typo.SM size={16} color="primary">{conceptData.title}</Typo.SM>
            <Typo.MD size={12} color="secondary">
              {quizIndex + 1} / {selectedGroup?.items.length}
            </Typo.MD>
          </HStack>
          <VStack className={s.conceptMd} fullWidth style={{ padding: SPACING.s16 }} gap={SPACING.s12}>
            <Typo.MD size={14} color="primary" style={{ lineHeight: 1.7 }}>
              {conceptData.description}
            </Typo.MD>
            {conceptData.bulletPoints.length > 0 && (
              <VStack gap={SPACING.s6} fullWidth>
                <Typo.SM size={12} color="secondary">핵심 포인트</Typo.SM>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {conceptData.bulletPoints.map((bp, i) => (
                    <li key={i} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>{bp}</li>
                  ))}
                </ul>
              </VStack>
            )}
            {conceptData.trapPoints.length > 0 && (
              <VStack gap={SPACING.s6} fullWidth>
                <Typo.SM size={12} color="wrong">주의할 점</Typo.SM>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {conceptData.trapPoints.map((tp, i) => (
                    <li key={i} style={{ fontSize: 14, color: 'var(--text-wrong)', lineHeight: 1.7 }}>{tp}</li>
                  ))}
                </ul>
              </VStack>
            )}
            {conceptData.logicFlow && (
              <VStack gap={SPACING.s6} fullWidth>
                <Typo.SM size={12} color="secondary">논리 흐름</Typo.SM>
                <Typo.MD size={14} color="primary" style={{ lineHeight: 1.7 }}>
                  {conceptData.logicFlow}
                </Typo.MD>
              </VStack>
            )}
            {!conceptData.found && (
              <Typo.MD size={14} color="secondary">해당 개념에 대한 상세 설명을 찾을 수 없습니다.</Typo.MD>
            )}
          </VStack>
          <HStack justify="center" gap={SPACING.s12} fullWidth>
            <button
              className={s.actionButton}
              onClick={async () => {
                if (!selectedGroup || !conceptData) return;
                try {
                  await addConceptBookmark({
                    subjectSlug: selectedGroup.subjectSlug,
                    unitNumber: selectedGroup.unitNumber,
                    conceptName: conceptData.title,
                    description: conceptData.description,
                  });
                  setBookmarkSaved(true);
                } catch {}
              }}
              disabled={bookmarkSaved}
            >
              <Typo.SM size={14} color="brand">
                {bookmarkSaved ? '저장됨 ✓' : '개념리스트에 저장'}
              </Typo.SM>
            </button>
            <button className={s.actionButton} onClick={handleNext}>
              <Typo.SM size={14} color="brand">
                {quizIndex < (selectedGroup?.items.length ?? 1) - 1 ? '다음 →' : '결과 보기'}
              </Typo.SM>
            </button>
          </HStack>
        </VStack>
      )}

      {pageState === 'result' && (
        <VStack gap={SPACING.s16} fullWidth align="center" style={{ padding: SPACING.s24 }}>
          <Typo.SM size={20} color="primary">복습 완료!</Typo.SM>
          <VStack gap={SPACING.s8} className={s.resultCard} fullWidth style={{ padding: SPACING.s16 }}>
            <HStack justify="between" fullWidth>
              <Typo.MD size={14} color="secondary">복습한 개념</Typo.MD>
              <Typo.SM size={14} color="primary">{answers.length}개</Typo.SM>
            </HStack>
            <HStack justify="between" fullWidth>
              <Typo.MD size={14} color="secondary">알고 있는 개념</Typo.MD>
              <Typo.SM size={14} color="primary">{answers.filter(a => a.isCorrect).length}개</Typo.SM>
            </HStack>
            {sessionResult && sessionResult.graduated > 0 && (
              <HStack justify="between" fullWidth>
                <Typo.MD size={14} color="secondary">졸업한 개념</Typo.MD>
                <Typo.SM size={14} color="brand">{sessionResult.graduated}개 🎉</Typo.SM>
              </HStack>
            )}
          </VStack>
          <button className={s.actionButton} onClick={() => navigate('/')}>
            <Typo.SM size={14} color="brand">메인으로 돌아가기</Typo.SM>
          </button>
        </VStack>
      )}
    </VStack>
  );
}
