'use client';

import React from 'react';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import s from './style.module.scss';

interface OptionChipProps {
  label: string;
  state: 'default' | 'correct' | 'wrong' | 'disabled';
  onClick: () => void;
}

export function OptionChip({ label, state, onClick }: OptionChipProps) {
  return (
    <button
      className={`${s.chip} ${s[state]}`}
      onClick={onClick}
      disabled={state === 'disabled' || state === 'correct' || state === 'wrong'}
    >
      <HStack align="center" justify="center" gap={SPACING.s4}>
        <Typo.MD
          size={14}
          color={
            state === 'correct' ? 'correct' :
            state === 'wrong' ? 'wrong' :
            state === 'disabled' ? 'secondary' :
            'primary'
          }
          style={{ fontWeight: state === 'correct' || state === 'wrong' ? 600 : 500 }}
        >
          {label}
        </Typo.MD>
      </HStack>
    </button>
  );
}
