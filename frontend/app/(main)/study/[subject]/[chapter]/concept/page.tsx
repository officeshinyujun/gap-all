'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  fetchFrequencyConcept,
  updateStudyProgress,
} from '@/lib/studyQuizApi';
import type { FrequencyConcept, FrequencyConceptItem } from '@/lib/studyQuizApi';
import { fetchUnitId } from '@/lib/studyApi';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import s from './page.module.scss';

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

export default function ConceptPage({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  const { subject, chapter } = use(params);
  const unitNumber = parseUnitNumber(chapter);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<FrequencyConcept | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchFrequencyConcept(subject, unitNumber)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [subject, unitNumber]);

  const concepts = data?.concepts ?? [];
  const current: FrequencyConceptItem | null = concepts[currentIndex] ?? null;
  const total = concepts.length;

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
  };

  const handleComplete = async () => {
    try {
      const unitId = await fetchUnitId(subject, unitNumber);
      if (unitId) await updateStudyProgress(unitId, 'BASIC_CONCEPT', 100);
    } catch { /* ignore */ }
    router.push(`/study/${subject}/${chapter}/q1?count=10`);
  };

  if (loading) {
    return (
      <div className={s.container}>
        <div className={s.center}><div className={s.spinner} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.container}>
        <div className={s.center}><span className={s.errorText}>{error}</span></div>
      </div>
    );
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <button className={s.backButton} onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>
          {unitNumber}단원 · 빈출 개념
        </span>
        <span className={s.headerCount}>
          {currentIndex + 1} / {total}
        </span>
      </div>

      <div className={s.slideArea}>
        {current && (
          <>
            <div className={s.conceptColumn}>
              <div className={s.conceptCard}>
                <HStack gap={10} align="center">
                  <span className={s.rankBadge}>{current.rank}</span>
                  <Typo.BD size={16}>{current.name}</Typo.BD>
                  <span className={s.frequencyLabel}>{current.frequency}회 출제</span>
                </HStack>

                {current.conceptContent && (
                  <div className={s.markdownContent}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {current.conceptContent}
                    </ReactMarkdown>
                  </div>
                )}

                {current.keyPoints.length > 0 && (
                  <VStack gap={6} fullWidth>
                    <span className={s.sectionTitle}>핵심 포인트</span>
                    <ul className={s.bulletList}>
                      {current.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </VStack>
                )}

                {current.examTips.length > 0 && (
                  <VStack gap={6} fullWidth>
                    <span className={s.sectionTitle}>시험 출제 팁</span>
                    <VStack gap={6} fullWidth>
                      {current.examTips.map((tip, i) => (
                        <div key={i} className={s.tipBox}>{tip}</div>
                      ))}
                    </VStack>
                  </VStack>
                )}

                {current.sources.length > 0 && (
                  <div className={s.tagsRow}>
                    {current.sources.map((src, i) => (
                      <span key={i} className={s.examTag}>{src}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={s.questionColumn}>
              <div className={s.questionWrapper}>
                <span className={s.questionSource}>
                  유사 출제 문제
                </span>
                <QuestionRenderer
                  question={current.sampleQuestion}
                  questionNumber={currentIndex + 1}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className={s.footer}>
        <button
          className={s.navButton}
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          ← 이전
        </button>
        {currentIndex < total - 1 ? (
          <button
            className={`${s.navButton} ${s.navButtonPrimary}`}
            onClick={handleNext}
          >
            다음 →
          </button>
        ) : (
          <button
            className={`${s.navButton} ${s.navButtonNext}`}
            onClick={handleComplete}
          >
            빈칸 문제 풀기 →
          </button>
        )}
      </div>
    </div>
  );
}
