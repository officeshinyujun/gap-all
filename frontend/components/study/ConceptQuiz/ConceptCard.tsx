'use client';

import React from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import type { ConceptPair } from '@/types/studyQuiz';
import s from './style.module.scss';

interface ConceptCardProps {
  item: ConceptPair;
  index: number;
  total: number;
  revealed: boolean;
}

export function ConceptCard({ item, index, total, revealed }: ConceptCardProps) {
  const isConceptHidden = item.hidden_field === 'concept';
  const visibleLabel = isConceptHidden ? '정의' : '개념';
  const visibleValue = isConceptHidden ? item.definition : item.concept;
  const hiddenLabel = isConceptHidden ? '개념' : '정의';
  const hiddenValue = item.correct_value;

  return (
    <VStack gap={SPACING.s16} fullWidth>
      <HStack justify="between" align="center" fullWidth>
        <Typo.SM size={12} color="secondary">
          {index + 1} / {total}
        </Typo.SM>
        <div className={s.progressBar}>
          <div
            className={s.progressFill}
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </HStack>

      <div className={s.hintCard}>
        <Typo.MD size={12} color="secondary" style={{ marginBottom: SPACING.s6 }}>
          {visibleLabel}
        </Typo.MD>
        <Typo.MD size={16} color="primary" style={{ lineHeight: 1.7 }}>
          {visibleValue}
        </Typo.MD>
      </div>

      <div className={`${s.answerCard} ${revealed ? s.revealed : ''}`}>
        <Typo.MD size={12} color="secondary" style={{ marginBottom: SPACING.s6 }}>
          {hiddenLabel}
        </Typo.MD>
        {revealed ? (
          <Typo.MD size={16} color="primary" style={{ lineHeight: 1.7, fontWeight: 600 }}>
            {hiddenValue}
          </Typo.MD>
        ) : (
          <div className={s.blankArea}>
            <Typo.MD size={14} color="secondary">
              정답을 생각해보세요...
            </Typo.MD>
          </div>
        )}
      </div>
    </VStack>
  );
}
