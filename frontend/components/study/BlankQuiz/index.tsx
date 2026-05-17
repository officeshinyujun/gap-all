'use client';

import React, { useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import type { BlankQuestion } from '@/types/studyQuiz';
import { QuestionCard } from './QuestionCard';
import { OptionChip } from './OptionChip';
import s from './style.module.scss';

interface BlankQuizProps {
  questions: BlankQuestion[];
  onComplete: (correctCount: number) => void;
}

type ChipState = 'default' | 'correct' | 'wrong' | 'disabled';

export function BlankQuiz({ questions, onComplete }: BlankQuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const current = questions[currentIndex];
  const isAnswered = selectedOption !== null;
  const isLast = currentIndex === questions.length - 1;

  function getChipState(option: string): ChipState {
    if (!isAnswered) return 'default';
    if (option === current.correct_answer) return 'correct';
    if (option === selectedOption) return 'wrong';
    return 'disabled';
  }

  function handleSelect(option: string) {
    if (isAnswered) return;
    setSelectedOption(option);
    if (option === current.correct_answer) {
      setCorrectCount((c) => c + 1);
    }
  }

  function handleNext() {
    if (isLast) {
      onComplete(correctCount);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
    }
  }

  return (
    <VStack gap={SPACING.s24} fullWidth>
      <QuestionCard
        index={currentIndex}
        total={questions.length}
        sentenceTemplate={current.sentence_template}
        correctAnswer={current.correct_answer}
        explanation={current.explanation}
        showExplanation={isAnswered}
      />

      {/* 선택지 칩 */}
      <HStack gap={SPACING.s8} wrap="wrap" justify="center" fullWidth>
        {current.options.map((option) => (
          <OptionChip
            key={option}
            label={option}
            state={getChipState(option)}
            onClick={() => handleSelect(option)}
          />
        ))}
      </HStack>

      {/* 다음 버튼 */}
      {isAnswered && (
        <button className={s.nextButton} onClick={handleNext}>
          <Typo.MD size={16} color="inverse" style={{ fontWeight: 600 }}>
            {isLast ? '완료' : '다음 문제'}
          </Typo.MD>
        </button>
      )}
    </VStack>
  );
}
