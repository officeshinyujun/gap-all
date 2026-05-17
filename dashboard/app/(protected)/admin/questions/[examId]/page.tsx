'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import { getTemplateLabel } from '@/utils/examParser';
import { useAuth } from '@/contexts/AuthContext';
import type { ExamQuestion } from '@/types/examQuestion';
import s from './page.module.scss';

const API_BASE = 'http://localhost:3001';

const DIFF_LABEL: Record<string, string> = {
  LOW: '하', MIDDLE: '중', HIGH: '상', INTERGRATE: '통합',
};

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
  };
}

function toExamQuestion(item: ApiExamItem): ExamQuestion {
  const q = item.question;
  return {
    metadata: {
      unit_name: '',
      target_concept: q.targetConcept,
      item_type: q.itemType,
      difficulty: q.difficulty,
      recommended_template: q.recommendedTemplate,
    },
    render_ready: {
      question_stem: q.questionStem,
      stimulus_data: q.stimulusData,
      options_list: q.optionsList,
    },
    explanation: q.explanation as any,
  };
}

export default function AdminQuestionDetailPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [examTitle, setExamTitle] = useState('');
  const [examDifficulty, setExamDifficulty] = useState('');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/exams/${examId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`시험 조회 실패 (${res.status})`);
      const data = await res.json();
      const items: ApiExamItem[] = data.items ?? [];
      setExamTitle(data.title ?? '');
      setExamDifficulty(data.difficulty ?? '');
      setQuestions(items.map(toExamQuestion));
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role !== 'admin') { router.replace('/'); return; }
      void fetchExam();
    }
  }, [isLoading, user, router, fetchExam]);

  const goTo = (index: number) => {
    if (index >= 0 && index < questions.length) setCurrentIndex(index);
  };

  if (isLoading || loading) return (
    <VStack gap={16} align="center" justify="center" fullWidth fullHeight>
      <div className={s.spinner} />
    </VStack>
  );

  if (error) return (
    <VStack gap={8} align="center" justify="center" fullWidth fullHeight>
      <Typo.MD size={14} color="wrong">{error}</Typo.MD>
      <button className={s.backBtn} onClick={() => router.back()}>← 목록으로</button>
    </VStack>
  );

  return (
    <VStack gap={0} fullWidth fullHeight className={s.page}>
      {/* 헤더 */}
      <div className={s.header}>
        <HStack gap={0} align="center" justify="between" fullWidth>
          <HStack gap={12} align="center">
            <button className={s.backBtn} onClick={() => router.push('/admin/questions')}>
              ← 목록으로
            </button>
            <VStack gap={4}>
              <HStack gap={8} align="center">
                <Typo.BD size={16} color="primary">{examTitle}</Typo.BD>
                {examDifficulty && (
                  <span className={s.diffBadge} data-level={examDifficulty}>
                    {DIFF_LABEL[examDifficulty] ?? examDifficulty}
                  </span>
                )}
              </HStack>
              <Typo.TH size={12} color="secondary">총 {questions.length}문항</Typo.TH>
            </VStack>
          </HStack>
          <HStack gap={8} align="center">
            <button className={s.navBtn} onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>← 이전</button>
            <span className={s.pageIndicator}>{currentIndex + 1} / {questions.length}</span>
            <button className={s.navBtn} onClick={() => goTo(currentIndex + 1)} disabled={currentIndex === questions.length - 1}>다음 →</button>
          </HStack>
        </HStack>
      </div>

      {/* 본문 */}
      <div className={s.body}>
        <HStack gap={20} align="start" fullWidth fullHeight>
          {/* 문항 목록 사이드바 */}
          <div className={s.sidebar}>
            <VStack gap={4} fullWidth>
              <Typo.SM size={12} color="secondary" className={s.sidebarTitle}>문항 목록</Typo.SM>
              {questions.map((q, index) => (
                <button
                  key={index}
                  className={`${s.sidebarItem} ${currentIndex === index ? s.sidebarItemActive : ''}`}
                  onClick={() => goTo(index)}
                >
                  <HStack gap={8} align="center" fullWidth>
                    <span className={s.sidebarNum}>{index + 1}</span>
                    <VStack gap={2}>
                      <span className={s.sidebarConcept}>{q.metadata.target_concept}</span>
                      <HStack gap={6} align="center">
                        <span className={s.sidebarTemplate}>
                          {getTemplateLabel(q.metadata.recommended_template ?? '')}
                        </span>
                        {q.metadata.difficulty && (
                          <span className={s.sidebarDiff} data-level={q.metadata.difficulty}>
                            {DIFF_LABEL[q.metadata.difficulty] ?? q.metadata.difficulty}
                          </span>
                        )}
                      </HStack>
                    </VStack>
                  </HStack>
                </button>
              ))}
            </VStack>
          </div>

          {/* 문항 렌더러 */}
          <div className={s.main}>
            {questions.length > 0 && (
              <>
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
                  >← 이전 문항</button>
                  <Typo.TH size={12} color="secondary">{currentIndex + 1} / {questions.length}</Typo.TH>
                  <button
                    className={`${s.bottomNavBtn} ${currentIndex === questions.length - 1 ? s.bottomNavBtnDisabled : ''}`}
                    onClick={() => goTo(currentIndex + 1)}
                    disabled={currentIndex === questions.length - 1}
                  >다음 문항 →</button>
                </HStack>
              </>
            )}
          </div>
        </HStack>
      </div>
    </VStack>
  );
}
