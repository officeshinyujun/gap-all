'use client';

import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
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
  // [blank]: 정의 패턴 — 개념을 맞추는 형태
  const isDefinitionPattern = sentenceTemplate.startsWith('[blank]:') || sentenceTemplate.startsWith('[blank] :');

  // 일반 패턴 — 문장 중간에 [blank]
  const parts = sentenceTemplate.split('[blank]');
  const before = parts[0] ?? '';
  const after = parts[1] ?? '';

  // 정의 텍스트 추출 (": " 이후)
  const definitionText = isDefinitionPattern
    ? sentenceTemplate.replace(/^\[blank\]\s*:\s*/, '').trim()
    : '';

  return (
    <VStack gap={SPACING.s16} fullWidth>
      {/* 진행 표시 */}
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

      {/* 문장 카드 */}
      <div className={s.sentenceCard}>
        {isDefinitionPattern ? (
          <VStack gap={SPACING.s8} fullWidth>
            <Typo.SM size={12} color="secondary">다음 정의에 해당하는 개념은?</Typo.SM>
            <Typo.MD size={16} color="primary" style={{ lineHeight: 1.8 }}>
              {definitionText}
            </Typo.MD>
            {showExplanation && (
              <HStack gap={SPACING.s8} align="center">
                <Typo.SM size={12} color="secondary">정답:</Typo.SM>
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
              <span style={{ color: 'var(--text-correct, #89DA7F)', fontWeight: 700 }}>
                {correctAnswer}
              </span>
            ) : (
              <span className={s.blankBox} />
            )}
            {after}
          </Typo.MD>
        )}
      </div>

      {/* 해설 */}
      {showExplanation && (
        <div className={s.explanationBox}>
          <Typo.SM size={12} color="secondary" style={{ lineHeight: 1.7 }}>
            {explanation}
          </Typo.SM>
        </div>
      )}
    </VStack>
  );
}
