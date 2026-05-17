'use client';

import React, { useState } from 'react';
import { VStack } from '@/components/general/VStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import type { ConceptPair } from '@/types/studyQuiz';
import { ConceptCard } from './ConceptCard';
import { RevealPanel } from './RevealPanel';
import s from '../BlankQuiz/style.module.scss';

interface ConceptQuizProps {
  pairs: ConceptPair[];
  onComplete: (correctCount: number) => void;
}

export function ConceptQuiz({ pairs, onComplete }: ConceptQuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const current = pairs[currentIndex];
  const isLast = currentIndex === pairs.length - 1;

  function handleJudge(isCorrect: boolean) {
    const newCorrect = isCorrect ? correctCount + 1 : correctCount;
    if (isLast) {
      onComplete(newCorrect);
    } else {
      setCorrectCount(newCorrect);
      setCurrentIndex((i) => i + 1);
      setRevealed(false);
    }
  }

  return (
    <VStack gap={SPACING.s24} fullWidth>
      <ConceptCard
        item={current}
        index={currentIndex}
        total={pairs.length}
        revealed={revealed}
      />

      {!revealed && (
        <button className={s.revealButton} onClick={() => setRevealed(true)}>
          <Typo.MD size={16} color="inverse" style={{ fontWeight: 600 }}>
            정답 보기
          </Typo.MD>
        </button>
      )}

      {revealed && (
        <RevealPanel
          explanation={current.explanation}
          onCorrect={() => handleJudge(true)}
          onWrong={() => handleJudge(false)}
        />
      )}
    </VStack>
  );
}
