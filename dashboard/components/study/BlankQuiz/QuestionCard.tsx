'use client';

import React from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import s from './style.module.scss';

interface QuestionCardProps {
  index: number;
  total: number;
  sentenceTemplate: string;
  correctAnswer: string;
  explanation: string;
  showExplanation: boolean;
}

export function QuestionCard({
  index,
  total,
  sentenceTemplate,
  correctAnswer,
  explanation,
  showExplanation,
}: QuestionCardProps) {
  const isDefinitionPattern = sentenceTemplate.startsWith('[blank]:') || sentenceTemplate.startsWith('[blank] :');

  const parts = sentenceTemplate.split('[blank]');
  const before = parts[0] ?? '';
  const after = parts[1] ?? '';

  const definitionText = isDefinitionPattern
    ? sentenceTemplate.replace(/^\[blank\]\s*:\s*/, '').trim()
    : '';

  return (
    <VStack gap={SPACING.s16} fullWidth>
      <HStack justify="between" align="center" fullWidth>
        <Typo.MD size={12} color="secondary">
          {index + 1} / {total}
        </Typo.MD>
        <div className={s.progressBar}>
          <div
            className={s.progressFill}
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </HStack>

      <div className={s.sentenceCard}>
        {isDefinitionPattern ? (
          <VStack gap={SPACING.s8} fullWidth>
            <Typo.MD size={12} color="secondary">다음 정의에 해당하는 개념은?</Typo.MD>
            <Typo.MD size={16} color="primary" style={{ lineHeight: 1.8 }}>
              {definitionText}
            </Typo.MD>
            {showExplanation && (
              <HStack gap={SPACING.s8} align="center">
                <Typo.MD size={12} color="secondary">정답:</Typo.MD>
                <Typo.MD size={16} color="correct" style={{ fontWeight: 700 }}>
                  {correctAnswer}
                </Typo.MD>
              </HStack>
            )}
          </VStack>
        ) : (
          <Typo.MD size={16} color="primary" style={{ lineHeight: 1.8 }}>
            {before}
            {showExplanation ? (
              <span style={{ color: '#89DA7F', fontWeight: 700 }}>
                {correctAnswer}
              </span>
            ) : (
              <span className={s.blankBox} />
            )}
            {after}
          </Typo.MD>
        )}
      </div>

      {showExplanation && (
        <div className={s.explanationBox}>
          <Typo.MD size={12} color="secondary" style={{ lineHeight: 1.7 }}>
            {explanation}
          </Typo.MD>
        </div>
      )}
    </VStack>
  );
}
