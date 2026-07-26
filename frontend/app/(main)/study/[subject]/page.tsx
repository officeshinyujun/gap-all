'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { X } from 'lucide-react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { Tag } from '@shared/ui/Tag';
import { SPACING } from '@shared/constants/spacing';
import { UnitCard } from '@/components/study/UnitCard';
import { HeaderActions } from '@shared/ui/HeaderActions';
import { StudyMode } from '@shared/types/study';
import { getSubjectName } from '@shared/utils/subject';
import { formatDaysAgo, getLatestDate } from '@shared/utils/date';
import { fetchUnitsWithProgress, fetchUnitConcepts, type ApiUnit } from '@/lib/studyApi';
import s from './page.module.scss';

const STUDY_MODE_DEFS = [
  { mode: StudyMode.BASIC_CONCEPT, title: '기초 개념' },
  { mode: StudyMode.BLANK_FILL, title: '빈칸 문제 풀기' },
  { mode: StudyMode.INTERACTIVE_QUIZ, title: '양방향 개념 문제 풀이' },
  { mode: StudyMode.PRACTICE_EXAM, title: '실전 문제 풀이' },
  { mode: StudyMode.REVIEW_INCORRECT, title: '오답 재풀이' },
];

function buildSubUnits(unit: ApiUnit) {
  return STUDY_MODE_DEFS.map((def, idx) => {
    const sub = unit.subUnits.find((s) => s.studyMode === def.mode);
    const percent = sub?.progressPercent ?? 0;
    return {
      id: idx + 1,
      title: def.title,
      isActive: false,
      status: (percent === 100 ? 'completed' : percent > 0 ? 'in_progress' : 'not_started') as 'completed' | 'in_progress' | 'not_started',
      progress: percent,
      lastStudiedAt: sub?.lastStudiedAt,
    };
  });
}

export default function StudyPage() {
  const { subject = '' } = useParams();
  const subjectName = getSubjectName(subject);
  const navigate = useNavigate();

  const [units, setUnits] = useState<ApiUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleCloseMobileDetail = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowMobileDetail(false);
      setIsClosing(false);
    }, 240);
  };

  useEffect(() => {
    fetchUnitsWithProgress(subject)
      .then((data) => {
        setUnits(data.units);
        if (data.units.length > 0) {
          setSelectedUnitId(data.units[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subject]);

  const handleUnitClick = (unitId: string) => {
    setSelectedUnitId(unitId);
    if (isMobile) setShowMobileDetail(true);
  };

  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? units[0];
  const subUnits = useMemo(() => selectedUnit ? buildSubUnits(selectedUnit) : [], [selectedUnit]);
  const lastStudied = getLatestDate(subUnits.map((su) => su.lastStudiedAt));
  const unitNumber = selectedUnit?.unitNumber ?? 1;

  useEffect(() => {
    if (!selectedUnit) return;
    fetchUnitConcepts(subject, selectedUnit.unitNumber)
      .then((concepts) => setTags(concepts.slice(0, 7)))
      .catch(() => setTags([]));
  }, [subject, selectedUnit?.unitNumber]);

  function getSubUnitHref(subId: number): string {
    switch (subId) {
      case 1: return `/study/${subject}/${unitNumber}/concept`;
      case 2: return `/study/${subject}/${unitNumber}/q1?count=10`;
      case 3: return `/study/${subject}/${unitNumber}/q2?count=10`;
      case 4: return `/study/${subject}/${unitNumber}/q3`;
      default: return '#';
    }
  }

  function handleExamCTA() {
    const learnedUnits = units
      .filter((u) => u.progress > 0)
      .map((u) => u.unitNumber)
      .join(',');
    navigate(`/exam/${subject}${learnedUnits ? `?learnedUnits=${learnedUnits}` : ''}`);
  }

  function renderSubUnitList() {
    return subUnits.map((sub) => {
      const href = getSubUnitHref(sub.id);
      const isClickable = href !== '#';
      return (
        <div
          key={sub.id}
          className={`${s.subUnitDetailItem} ${sub.status === 'completed' ? s.completed : ''} ${isClickable ? s.clickable : ''}`}
          onClick={() => isClickable && navigate(href)}
        >
          <Typo.MD size={16} color="primary" style={{ fontWeight: 500 }}>
            {sub.id}. {sub.title}
          </Typo.MD>
          {sub.status === 'completed' && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3E78F7">
              <path d="M5 13L9 17L19 7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {sub.status === 'in_progress' && (
            <Typo.MD size={14} color="brand">{sub.progress}% 진행 중</Typo.MD>
          )}
        </div>
      );
    });
  }

  return (
    <>
      <VStack fullWidth fullHeight className={s.container} gap={SPACING.s20}>
        <div className={s.header}>
          <VStack gap={SPACING.s6}>
            <Typo.SM size={24} color="primary">{subjectName}</Typo.SM>
            <Typo.MD size={12} color="secondary">{subjectName}에 오신 것을 환영합니다</Typo.MD>
          </VStack>
          <HeaderActions />
        </div>

        <div className={s.contentArea}>
          <VStack gap={SPACING.s16} className={s.listContainer}>
            {loading ? (
              <div className={s.loadingSpinner} />
            ) : units.length === 0 ? (
              <Typo.MD size={14} color="secondary">단원 정보를 불러올 수 없습니다.</Typo.MD>
            ) : (
              units.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unitNumber={unit.unitNumber}
                  progress={unit.progress}
                  subUnits={buildSubUnits(unit)}
                  isExpanded={isMobile ? false : selectedUnitId === unit.id}
                  onClick={() => handleUnitClick(unit.id)}
                />
              ))
            )}
          </VStack>

          {selectedUnit && !isMobile && (
            <VStack className={s.detailContainer} gap={SPACING.s24}>
              <VStack fullWidth gap={SPACING.s16}>
                <HStack justify="between" align="center" fullWidth>
                  <VStack gap={SPACING.s12}>
                    <Typo.SM size={24} color="primary">{unitNumber}단원</Typo.SM>
                    <Typo.MD size={14} color="secondary">{selectedUnit.title}</Typo.MD>
                  </VStack>
                  <Typo.MD size={12} color="secondary">최근 학습 기록 : {formatDaysAgo(lastStudied)}</Typo.MD>
                </HStack>

                <div className={s.divider} />

                <VStack gap={SPACING.s10}>
                  <Typo.MD size={12} color="secondary">대표 태그</Typo.MD>
                  <HStack gap={SPACING.s8} style={{ flexWrap: 'wrap' }}>
                    {tags.length > 0 ? tags.map((tag, idx) => (
                      <Tag key={idx}>{tag}</Tag>
                    )) : (
                      <Typo.MD size={12} color="secondary">태그 없음</Typo.MD>
                    )}
                  </HStack>
                </VStack>
              </VStack>

              <VStack fullWidth gap={SPACING.s12}>
                {renderSubUnitList()}
              </VStack>

              <div className={s.divider} />
              <button className={s.examCTAButton} onClick={handleExamCTA}>
                실전 모의 문제 풀러가기 →
              </button>
            </VStack>
          )}
        </div>
      </VStack>

      {isMobile && showMobileDetail && selectedUnit && (
        <div className={`${s.mobileOverlay} ${isClosing ? s.closing : ''}`}>
          <button className={s.mobileOverlayClose} onClick={handleCloseMobileDetail}>
            <X size={24} />
          </button>
          <VStack fullWidth gap={SPACING.s24}>
            <VStack fullWidth gap={SPACING.s16}>
              <HStack justify="between" align="center" fullWidth>
                <VStack gap={SPACING.s12}>
                  <Typo.SM size={24} color="primary">{unitNumber}단원</Typo.SM>
                  <Typo.MD size={14} color="secondary">{selectedUnit.title}</Typo.MD>
                </VStack>
                <Typo.MD size={12} color="secondary">최근 학습 기록 : {formatDaysAgo(lastStudied)}</Typo.MD>
              </HStack>

              <div className={s.divider} />

              <VStack gap={SPACING.s10}>
                <Typo.MD size={12} color="secondary">대표 태그</Typo.MD>
                <HStack gap={SPACING.s8} style={{ flexWrap: 'wrap' }}>
                  {tags.length > 0 ? tags.map((tag, idx) => (
                    <Tag key={idx}>{tag}</Tag>
                  )) : (
                    <Typo.MD size={12} color="secondary">태그 없음</Typo.MD>
                  )}
                </HStack>
              </VStack>
            </VStack>

            <VStack fullWidth gap={SPACING.s12}>
              {renderSubUnitList()}
            </VStack>

            <div className={s.divider} />
            <button className={s.examCTAButton} onClick={handleExamCTA}>
              실전 모의 문제 풀러가기 →
            </button>
          </VStack>
        </div>
      )}
    </>
  );
}
