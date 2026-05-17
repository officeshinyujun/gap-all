'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from "@/components/general/VStack";
import { HStack } from "@/components/general/HStack";
import Typo from "@/components/general/Typo";
import { SPACING } from "@/constants/spacing";
import s from "./page.module.scss";
import { HeaderActions } from "@/components/general/HeaderActions";
import { fetchReviewRecommendations, type ReviewRecommendationsResponse } from '@/lib/studyQuizApi';
import { fetchStreak, fetchUnitsWithProgress, type ApiUnit } from '@/lib/studyApi';
import { useAuth } from '@/contexts/AuthContext';

const SUBJECTS = [
  { slug: 'success', name: '성직 스터디' },
  { slug: 'industry', name: '공일 스터디' },
] as const;

const STUDY_ORDER = ['BASIC_CONCEPT', 'BLANK_FILL', 'INTERACTIVE_QUIZ', 'PRACTICE_EXAM'] as const;

const STUDY_MODE_TEXT: Record<(typeof STUDY_ORDER)[number], string> = {
  BASIC_CONCEPT: '개념 학습하러 가기',
  BLANK_FILL: '빈칸 문제 풀러가기',
  INTERACTIVE_QUIZ: '개념 매칭 풀러가기',
  PRACTICE_EXAM: '연습 시험 보러가기',
};

const STUDY_MODE_ROUTE: Record<(typeof STUDY_ORDER)[number], string> = {
  BASIC_CONCEPT: 'concept',
  BLANK_FILL: 'q1',
  INTERACTIVE_QUIZ: 'q2',
  PRACTICE_EXAM: 'q3',
};

type InProgressStudy = {
  id: string;
  category: string;
  title: string;
  progress: number;
  actionText: string;
  actionRoute: string;
  subjectSlug: string;
};

function buildStudyTitle(unit: ApiUnit) {
  return `${unit.unitNumber}단원 : ${unit.title}`;
}

function getNextStudyMode(unit: ApiUnit) {
  for (const studyMode of STUDY_ORDER) {
    const subUnit = unit.subUnits.find((item) => item.studyMode === studyMode);
    if (subUnit?.status !== 'completed') {
      return studyMode;
    }
  }

  return null;
}

function getStudyAction(unit: ApiUnit, subjectSlug: string) {
  const nextMode = getNextStudyMode(unit);

  if (!nextMode) {
    return {
      actionText: '복습하러 가기',
      actionRoute: '/review',
    };
  }

  return {
    actionText: STUDY_MODE_TEXT[nextMode],
    actionRoute: `/study/${subjectSlug}/unit-${unit.unitNumber}/${STUDY_MODE_ROUTE[nextMode]}`,
  };
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [reviewData, setReviewData] = useState<ReviewRecommendationsResponse | null>(null);
  const [streak, setStreak] = useState(0);
  const [inProgressStudies, setInProgressStudies] = useState<InProgressStudy[]>([]);
  const [isStudyLoading, setIsStudyLoading] = useState(true);
  const [reviewEnabled, setReviewEnabled] = useState(true);

  useEffect(() => {
    fetchReviewRecommendations()
      .then(setReviewData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('gap_review_enabled');
    if (stored !== null) {
      setReviewEnabled(stored === 'true');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (isAuthLoading) return;

    if (!user) {
      setStreak(0);
      setInProgressStudies([]);
      setIsStudyLoading(false);
      return;
    }

    setIsStudyLoading(true);

    Promise.allSettled([
      fetchStreak(),
        Promise.all(SUBJECTS.map(async ({ slug, name }) => {
        try {
          const data = await fetchUnitsWithProgress(slug);
          return data.units
            .filter((unit) => unit.progress > 0)
            .map((unit) => {
              const action = getStudyAction(unit, slug);

              return {
              id: `${slug}-${unit.id}`,
              category: name,
              title: buildStudyTitle(unit),
              progress: unit.progress,
              actionText: action.actionText,
              actionRoute: action.actionRoute,
              subjectSlug: slug,
            };
            });
        } catch {
          return [] as InProgressStudy[];
        }
      })),
    ]).then(([streakResult, studiesResult]) => {
      if (!isMounted) return;

      if (streakResult.status === 'fulfilled') {
        setStreak(streakResult.value.studyStreakDays);
      } else {
        setStreak(user.studyStreakDays ?? 0);
      }

      if (studiesResult.status === 'fulfilled') {
        setInProgressStudies(studiesResult.value.flat());
      } else {
        setInProgressStudies([]);
      }

      setIsStudyLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, user]);

  return (
    <>
      {/* Header */}
      <HStack justify="between" align="center" fullWidth>
        <VStack gap={SPACING.s6}>
          <Typo.SM size={24} color="primary">메인페이지</Typo.SM>
          <Typo.MD size={12} color="secondary">얼마나 공부하셨나요?</Typo.MD>
        </VStack>
        <HeaderActions showUser />
      </HStack>

      {/* Study Streak */}
      <HStack className={s.streakCard} fullWidth style={{ padding: SPACING.s16 }}>
        <VStack gap={SPACING.s12}>
          <Typo.MD size={12} color="secondary">study streak</Typo.MD>
          <Typo.SM size={24} color="brand">
            {isStudyLoading ? '로딩 중...' : `${streak}일째`}
          </Typo.SM>
        </VStack>
      </HStack>

      {/* Review Recommendations */}
      {reviewEnabled && reviewData && reviewData.recommendations.length > 0 && (
        <VStack gap={SPACING.s12} className={s.reviewCard} fullWidth style={{ padding: SPACING.s16 }}>
          <HStack justify="between" align="center" fullWidth>
            <VStack gap={SPACING.s6}>
              <Typo.MD size={12} color="secondary">복습이 필요해요</Typo.MD>
              <Typo.SM size={16} color="primary">
                취약 개념 {reviewData.totalIncorrectConcepts}개
              </Typo.SM>
            </VStack>
            <button className={s.reviewButton} onClick={() => router.push('/review')}>
              <Typo.SM size={14} color="brand">복습하러 가기 →</Typo.SM>
            </button>
          </HStack>
          <HStack gap={SPACING.s8} wrap="wrap">
            {reviewData.recommendations.slice(0, 3).map((rec) => (
              <span key={`${rec.unitNumber}-${rec.targetConcept}`} className={s.conceptTag}>
                {rec.targetConcept}
              </span>
            ))}
            {reviewData.totalIncorrectConcepts > 3 && (
              <span className={s.conceptTag}>+{reviewData.totalIncorrectConcepts - 3}개</span>
            )}
          </HStack>
        </VStack>
      )}

      {/* Studies in progress */}
      {isStudyLoading ? (
        <VStack gap={SPACING.s12} fullWidth>
          <VStack gap={SPACING.s8} className={s.studyCard} fullWidth style={{ padding: SPACING.s16 }}>
            <Typo.MD size={12} color="secondary">현재 진행중인 스터디</Typo.MD>
            <Typo.MD size={16} color="primary">로딩 중...</Typo.MD>
          </VStack>
        </VStack>
      ) : inProgressStudies.length > 0 ? (
        <HStack gap={SPACING.s16} fullWidth>
          {inProgressStudies.map((study) => (
            <VStack
              key={study.id}
              gap={SPACING.s12}
              className={s.studyCard}
              fullWidth
              style={{ padding: SPACING.s16, cursor: 'pointer' }}
              onClick={() => router.push(study.actionRoute)}
            >
              <Typo.MD size={12} color="secondary">현재 진행중인 {study.category}</Typo.MD>
              <HStack justify="between" align="center" fullWidth style={{ padding: SPACING.s12 }}>
                <VStack gap={SPACING.s12}>
                  <Typo.MD size={16} color="primary">{study.title}</Typo.MD>
                  <Typo.MD size={14} color="secondary">{study.progress}% 진행중</Typo.MD>
                </VStack>
                <Typo.SM
                  size={14}
                  color="brand"
                  style={{ cursor: 'pointer' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    router.push(study.actionRoute);
                  }}
                >
                  {study.actionText}
                </Typo.SM>
              </HStack>
            </VStack>
          ))}
        </HStack>
      ) : (
        <VStack gap={SPACING.s12} fullWidth>
          <VStack gap={SPACING.s8} className={s.studyCard} fullWidth style={{ padding: SPACING.s16 }}>
            <Typo.MD size={12} color="secondary">현재 진행중인 스터디</Typo.MD>
            <Typo.MD size={16} color="primary">진행중인 스터디가 없어요.</Typo.MD>
          </VStack>
        </VStack>
      )}
    </>
  );
}
