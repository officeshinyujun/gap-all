'use client';

import React from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import s from './style.module.scss';

interface RevealPanelProps {
  explanation: string;
  onCorrect: () => void;
  onWrong: () => void;
}

export function RevealPanel({ explanation, onCorrect, onWrong }: RevealPanelProps) {
  return (
    <VStack gap={SPACING.s12} fullWidth>
      {/* 해설 */}
      <div className={s.explanationBox}>
        <Typo.SM size={12} color="secondary" style={{ lineHeight: 1.7 }}>
          {explanation}
        </Typo.SM>
      </div>

      {/* 자가 채점 버튼 */}
      <HStack gap={SPACING.s10} fullWidth>
        <button className={`${s.judgeButton} ${s.wrong}`} onClick={onWrong}>
          <Typo.MD size={14} color="wrong" style={{ fontWeight: 600 }}>
            틀렸어요
          </Typo.MD>
        </button>
        <button className={`${s.judgeButton} ${s.correct}`} onClick={onCorrect}>
          <Typo.MD size={14} color="correct" style={{ fontWeight: 600 }}>
            맞았어요
          </Typo.MD>
        </button>
      </HStack>
    </VStack>
  );
}
